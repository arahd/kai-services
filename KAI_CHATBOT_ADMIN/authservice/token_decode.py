import os
import json
import requests
from functools import wraps
from flask import request, jsonify, g
import jwt

AZURE_TENANT_ID = os.environ.get("AZURE_TENANT_ID")
AD_TOKEN_AUDIENCE =  os.environ.get('AD_TOKEN_AUDIENCE')
AD_TOKEN_ISSUER = os.environ.get('AD_TOKEN_ISSUER')
JWKS_URI = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/discovery/v2.0/keys"



# --- JWKS CACHING ---
# Cache the signing keys to avoid fetching them on every request
jwks_cache = {}

def get_signing_key(kid):
    """
    Fetches the public key from the JWKS endpoint and caches it.
    """
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
    except requests.exceptions.RequestException as e:
        print(f"Error fetching JWKS: {e}")
        return None

# --- DECORATOR ---
def token_required(required_groups=None):
    """
    Decorator to validate the JWT and check for security group membership.
    
    :param required_groups: A list of security group Object IDs required to access the endpoint.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return jsonify({"error": "Authorization header is missing or invalid"}), 401

            token = auth_header.split(" ")[1]

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
                # print(decoded_token)
                # Use a local variable so we don't shadow the outer `required_groups`
                effective_required_groups = required_groups
                if request.content_type and request.content_type == 'application/json':
                    json_data = request.get_json(silent=True) or {}
                    # If the request supplies required_groups explicitly, override the decorator argument
                    rg = json_data.get('required_groups')
                    if rg is not None:
                        effective_required_groups = rg
                current_user = decoded_token.get('upn','admin@kumaran.com')
                user_groups = decoded_token.get("groups", [])
                g.current_user = current_user
                auth_info = {"current_user": current_user,"roles":user_groups}
                # 4. (Optional) Check for required security groups
                if effective_required_groups:
                    if not any(group_id in user_groups for group_id in effective_required_groups):
                        return jsonify({"error": "User does not have required group permissions"}), 403 # 403 Forbidden

                # Add the decoded token to the Flask global context 'g' for use in the route
                
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Token has expired"}), 401
            except jwt.InvalidAudienceError:
                return jsonify({"error": "Invalid token audience"}), 401
            except jwt.InvalidIssuerError:
                return jsonify({"error": "Invalid token issuer"}), 401
            except Exception as e:
                print(e)
                return jsonify({"error": "Failed to decode token", "details": str(e)}), 401

            return f(*args,auth=auth_info, **kwargs)
        return decorated_function
    return decorator