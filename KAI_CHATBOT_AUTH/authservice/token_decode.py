import os
import json
import requests
from functools import wraps
from flask import request, jsonify, g
import jwt
import hashlib
from authservice.auth import *
from datetime import datetime, timezone
from azure.communication.email import EmailClient
from logger import logger, get_caller_frame, extras  

AZURE_TENANT_ID = os.environ.get("AZURE_TENANT_ID")
AD_TOKEN_AUDIENCE =  os.environ.get('AD_TOKEN_AUDIENCE')
AD_TOKEN_ISSUER = os.environ.get('AD_TOKEN_ISSUER')
JWKS_URI = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/discovery/v2.0/keys"



dbtype = os.getenv('DB_TYPE', "sql")

roles_keys = os.getenv('ROLES', '')
roles = {}
if roles_keys:
    for key in roles_keys.split(','):
        key = key.strip()
        if key:
            role_name = key.lower()
            role_value = os.getenv(key, '')
            roles[role_name] = role_value 
logger.info(f"Dynamic roles: {roles}",extra=extras)

# --- JWKS CACHING ---
# Cache the signing keys to avoid fetching them on every request
jwks_cache = {}

def get_signing_key(kid):
    """
    Fetches the public key from the JWKS endpoint and caches it.
    """
    extras['functionname'] =  get_caller_frame().f_code.co_name

    global jwks_cache
    if kid in jwks_cache:
        return jwks_cache[kid]

    try:
        response = requests.get(JWKS_URI)
        response.raise_for_status()
        jwks = response.json()
        
        for key in jwks.get("keys", []):
            # Build a public key in PEM format from the key details
            pem_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
            jwks_cache[key['kid']] = pem_key
            
        if kid in jwks_cache:
            return jwks_cache[kid]
        
        return None
    except Exception as e:
        print(f"Error fetching JWKS: {e}")
        logger.exception(f'exception occured in get_signing_key for kid:{kid}',extra=extras)
        return None
    
def verify_custom_jwt(token: str):
    extras['functionname'] =  get_caller_frame().f_code.co_name
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        if not kid:
            logger.error(f'invalid kid for verify custom jwt',extra=extras)
            return {"error": "Invalid token header"}

        # Match using hashed token
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= "kumaran")
        condition = {"token_hash": token_hash}
        user = details.getExistingUser(condition)

        if not isinstance(user, dict):
            logger.error(f'unkonw or revoken token for custom jwt',extra=extras)
            return {"error": "Unknown or revoked token"}

        # Decode token
        try:
            payload = jwt.decode(
                token,
                user.get('jwt_secret'),
                algorithms=["HS256"]
            )
        except jwt.ExpiredSignatureError:
            logger.error(f'custom jwt token expired',extra=extras)
            return {"error": "Token expired"}
        except jwt.InvalidTokenError:
            logger.error(f'invalid token error',extra=extras)
            return {"error": "Invalid token signature"}

        # Check DB expiry
        if datetime.now(timezone.utc) > user.get('token_expiry').replace(tzinfo=timezone.utc):
            return {"error": "Token expired"}

        if user.get('is_revoked'):
            return {"error": "Token revoked"}

        return {
            "auth_type": "api",
            "current_user": user.get('username'),
            "roles": ["api_user"],
            "api_user": user.get('username'),
            "project_id":user.get("project_id"),
            "payload": payload
        }

    except Exception as e:
        logger.exception(f'error occured in verify_custom_jwt',extra=extras)
        return {"error": f"Custom JWT error: {str(e)}"}
    
def check_rate_limit(user):
    extras['functionname'] =  get_caller_frame().f_code.co_name
    max_requests = user.get('requests_per_day', 500)
    max_tokens   = user.get('tokens_per_day', 50000)

    if user.get('requests_used') >= max_requests:
        logger.error(f"daily request limit exceeded for user:{user},used:{user.get('requests_used')}",extra=extras)
        return False, "Daily request limit exceeded"

    if user.get('tokens_used') >= max_tokens:
        logger.error(f"daily tokens_used exceeded for user:{user},used:{user.get('tokens_used')}",extra=extras)
        return False, "Daily token usage exceeded"

    return True, "OK"

# --- DECORATOR ---
def token_required(required_groups=None):
    """
    Decorator to validate the JWT and check for security group membership.
    
    :param required_groups: A list of security group Object IDs required to access the endpoint.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            extras['functionname'] =  get_caller_frame().f_code.co_name
            auth_header = request.headers.get("Authorization")
            auth_type = request.headers.get("X-Auth-Type")
            if not auth_header or not auth_header.startswith("Bearer "):
                return jsonify({"error": "Authorization header is missing or invalid"}), 401

            token = auth_header.split(" ")[1]
            db = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= "kumaran")
            # custom JWT
            if auth_type == "custom_jwt":
                custom = verify_custom_jwt(token)
                if "error" not in custom:
                    condition = {"username": custom.get('current_user')}
                    api_user = db.getExistingUser(condition)
                    if not isinstance(api_user, dict):
                        return {"error": "User not found"}

                    # RATE LIMIT
                    ok, msg = check_rate_limit(api_user)
                    if not ok:
                        return jsonify({"error": msg}), 429

                    return f(auth=custom, *args, **kwargs)
                else:
                    logger.error(f"verify_custom_jwt error: {custom.get('error')}",extra=extras)
                    return jsonify({"error": custom.get('error')}), 401
            try:
                # 1. Get the unverified header to find the Key ID (kid)
                unverified_header = jwt.get_unverified_header(token)
                kid = unverified_header.get("kid")
                if not kid:
                    return jsonify({"error": "Token is missing 'kid' in header"}), 401
                
                # 2. Get the appropriate signing key
                signing_key = get_signing_key(kid)
                if not signing_key:
                    return jsonify({"error": "Could not find a matching signing key"}), 401

                # 3. Decode and validate the token
                decoded_token = jwt.decode(
                    token,
                    signing_key,
                    algorithms=["RS256"],
                    audience=AD_TOKEN_AUDIENCE,
                    issuer=AD_TOKEN_ISSUER,
                )
                effective_required_groups = required_groups
                if request.content_type and request.content_type == 'application/json':
                    json_data = request.json or {}
                    rg = json_data.get('roles_required')
                    if rg is not None:
                        effective_required_groups = rg
                current_user = decoded_token.get('upn','admin@kumaran.com')
                if not current_user:
                        logger.error("username not available, unable to find session details",extra=extras)
                user_groups = decoded_token.get("groups", [])
                print(f"user_groups: {user_groups}")
                resolved_roles = resolve_roles_from_groups(user_groups)
                print(f"resolved_roles: {resolved_roles}")
                g.current_user = current_user
                auth_info = {"current_user": current_user,"roles":resolved_roles,"groups": user_groups,"auth_type": "sso"}
                if effective_required_groups:
                    if not any(group_id in user_groups for group_id in effective_required_groups):
                        return {
                            "current": current_user,
                            "roles":[]
                            }, 403 # 403 Forbidden
                if auth_type == "chatservice":
                    limit_result, status_code = check_group_token_limit(db,current_user)
                    auth_info['allow_sensitive'] = limit_result.get('allow_sensitive')
                    if not limit_result["success"]:
                        return jsonify(limit_result), status_code
                    
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Token has expired"}), 401
            except jwt.InvalidAudienceError:
                return jsonify({"error": "Invalid token audience"}), 401
            except jwt.InvalidIssuerError:
                return jsonify({"error": "Invalid token issuer"}), 401
            except Exception as e:
                logger.exception(f'exception occured in token_required method',extra=extras)
                return jsonify({"error": "Failed to decode token", "details": str(e)}), 401

            return f(auth=auth_info, *args, **kwargs)
        return decorated_function
    return decorator


def resolve_roles_from_groups(user_groups):
    resolved = []
    print(f"roles....{roles}")
    for role_name, group_id in roles.items():
        if group_id and group_id in user_groups:
            resolved.append(role_name)
    return resolved


def check_token_limit(db:Auth,current_user):
    # #token limit check:
    TOKEN_LIMIT = os.getenv("CONV_TOKEN_LIMIT")
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL")
    SENDER_EMAIL = os.getenv("SENDER_EMAIL")
    ACS_CONNECTION_STRING = os.getenv("ACS_CONNECTION_STRING")
    condition = {"user_id": current_user}
    record = db.getUser(condition)

    # If record exists ----------------------------------------------------
    if isinstance(record, dict):
        # Already blocked
        if record.get('is_blocked'):
            return {"success": False, "message": "USER_BLOCKED"}, 429

        # User hits limit now
        if record.get('tokens_used') >= int(TOKEN_LIMIT):
            value = {"is_blocked": True}
            db.tokenUserUpdate(condition,value)

            try:
                client = EmailClient.from_connection_string(ACS_CONNECTION_STRING)

                message = {
                    "senderAddress": SENDER_EMAIL,
                    "recipients": {"to": [{"address": ADMIN_EMAIL}]},
                    "content": {
                        "subject": "Daily Token Limit Reached",
                        "plainText": (
                            f"User {current_user} has exceeded the daily token limit.\n\n"
                            f"Tokens Used: {record.get('tokens_used')}"
                        )
                    }
                }

                client.begin_send(message).result()
            except Exception as e:
                logger.exception(f'exception occured in email sending',extra=extras)
            return {"success": False, "message": "LIMIT_REACHED"}, 429

    return {"success": True, "allow_sensitive":record.get('allow_sensitive_search') if isinstance(record, dict) else False}, 200


def check_group_token_limit(db: Auth, current_user):
    condition = {"user_id": current_user}
    record = db.getUser(condition)
    if isinstance(record, dict):
        if record.get("is_blocked"):
            return {"success": False, "message": "USER_BLOCKED"}, 429
        group_id = record.get("group_id")
        if group_id:
            group = db.getGroup({"id": group_id})
            if isinstance(group, dict):
                input_limit = int(group.get("input_token_limit", 0))
                output_limit = int(group.get("output_token_limit", 0))
                input_used = int(record.get("input_tokens_used", 0))
                output_used = int(record.get("output_tokens_used", 0))
                logger.info(f"GROUP_USER -> group_id={group_id}, input_used={input_used}, output_used={output_used}, input_limit={input_limit}, output_limit={output_limit}",extra=extras)
                if input_limit > 0 and input_used >= input_limit:
                    db.tokenUserUpdate(condition, {"is_blocked": True})
                    logger.info(f"INPUT_TOKEN_LIMIT_REACHED -> input_used={input_used}, input_limit={input_limit}",extra=extras)
                    return {
                        "success": False,
                        "message": "INPUT_TOKEN_LIMIT_REACHED"
                    }, 429
                if output_limit > 0 and output_used >= output_limit:
                    db.tokenUserUpdate(condition, {"is_blocked": True})
                    logger.info(f"OUTPUT_TOKEN_LIMIT_REACHED -> output_used={output_used}, output_limit={output_limit}",extra=extras)
                    return {
                        "success": False,
                        "message": "OUTPUT_TOKEN_LIMIT_REACHED"
                    }, 429
        else:
            input_limit = int(record.get("input_token_limit", 0))
            output_limit = int(record.get("output_token_limit", 0))
            input_used = int(record.get("input_tokens_used", 0))
            output_used = int(record.get("output_tokens_used", 0))
            logger.info(f"NO_GROUP_USER -> input_used={input_used}, output_used={output_used}, input_limit={input_limit}, output_limit={output_limit}",extra=extras)
            if input_limit > 0 and input_used >= input_limit:
                db.tokenUserUpdate(condition, {"is_blocked": True})
                logger.info(f"INPUT_TOKEN_LIMIT_REACHED -> input_used={input_used}, input_limit={input_limit}",extra=extras)
                return {
                    "success": False,
                    "message": "INPUT_TOKEN_LIMIT_REACHED"
                }, 429
            if output_limit > 0 and output_used >= output_limit:
                db.tokenUserUpdate(condition, {"is_blocked": True})
                logger.info(f"OUTPUT_TOKEN_LIMIT_REACHED -> output_used={output_used}, output_limit={output_limit}",extra=extras)
                return {
                    "success": False,
                    "message": "OUTPUT_TOKEN_LIMIT_REACHED"
                }, 429

    return {
        "success": True,
        "allow_sensitive": record.get("allow_sensitive_search") if isinstance(record, dict) else False
    }, 200