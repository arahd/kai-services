import os
import time
import json
import requests
import pytz
import secrets
import hashlib
import time
import atexit
from datetime import date
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import jwt
from datetime import datetime,timezone
from functools import wraps
from logger import logger,get_caller_frame,extras

# from dotenv import load_dotenv
# load_dotenv()

from db_functions import fetch_models, store_user, upsert_user_latest_model, fetch_user_latest_model


ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
BUILD_VERSION = os.getenv('BUILD_VERSION',1)

properties = {'custom_dimensions': {'ENV': ENV_NAME}}

SERVICE_NAME='CONVERSATIONAL AI CHATBOT AUTH SERVICE'
PROJECT_NAME='CHATBOT'

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
AZURE_TENANT_ID = os.getenv('AZURE_TENANT_ID')
AZURE_CLIENT_ID = os.getenv('AZURE_CLIENT_ID')
logger.info(f'host_name_env:{HOST_NAME_ENV},ENV_NAME:{ENV_NAME}',extra=extras)
# HOST_NAME_ENV = "AZURE"
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

Auth_Url = os.getenv('AUTH_URL')
dbtype = os.getenv('DB_TYPE',"pg")
print(f'ENV_NAME:{ENV_NAME},HOST_NAME_ENV:{HOST_NAME_ENV},Auth_Url:{Auth_Url},dbtype:{dbtype}')

from authservice.auth import *
from authservice.token_decode import token_required

# creates Flask object
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


TOKEN_TEXT = os.getenv("TOKEN_TEXT")
HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
BUILD_VERSION = os.getenv('BUILD_VERSION',1)
APP_VERSION = os.getenv('APP_VERSION',1)

@app.route('/', methods = ['GET'])
def hello():
   extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
   logger.info("auth service",extra=extras)
   return f"AUTH Service working ENV_NAME:{ENV_NAME}, DB_TYPE {dbtype}, v0.0.13 {BUILD_VERSION}"



Auth_API_URl = os.getenv("AUTH_URL")

ADMIN_ROLE = os.getenv("ADMIN_ROLE")
USER_ROLE = os.getenv("USER_ROLE")

ENCRYPTION_CODE = os.getenv("ENCRYPTION_CODE")
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')
KAI_CHATBOT_DEV_ADMIN = os.getenv('KAI_CHATBOT_DEV_ADMIN', '')

def requires_authorization(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        bearer_token = None
        if 'Authorization' in request.headers:
            bearer_token = request.headers.get('Authorization')
            if not bearer_token:
                logger.warning("Token is missing",extra=extras)
                return jsonify({'message' : 'Token is missing !!'}), 401
            response =  validate_bearer_token(bearer_token)
            if response.status_code == 409:
                logger.error(f"Session expired {response}",extra=extras)
        #  if not bearer_token or not validate_bearer_token(bearer_token):
                return jsonify({"error": "Session expired"}), 409
            if response.status_code != 200:
                logger.error("Unauthorized access",extra=extras)
                return jsonify({'message' : 'Unauthorized access'}), 401
            else:
                return func(response.text,*args, **kwargs)
    return wrapper

def validate_bearer_token(bearer_token):
    Tok   = bearer_token.split()[1]
    response = requests.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok})
    return response

def role_required(required_role):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            bearer_token = request.headers.get('Authorization')
            response = validate_bearer_token(bearer_token)
            if response.status_code != 200:
                logger.error("Unauthorized access",extra=extras)
                return jsonify({'message' : 'Unauthorized access'}), 401
            else:
                user_role = response.text
                userdata = json.loads(user_role)
                logger.debug(f"User role: {userdata.get('roles')}",extra=extras)
                print("userrole")
                print(userdata.get("roles"))
                if required_role in userdata.get("roles"):
                    return func(*args, **kwargs)
                else:
                    logger.warning("Access denied. User doesn't have required role.",extra=extras)
                    return json.dumps({"error": "Access denied. You don't have the required role."}), 403
        return wrapper
    return decorator

@app.route('/auth', methods = ['GET'])
@token_required(required_groups=[])
def auth(auth):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            username = auth.get("current_user",None)
            product_roles = []
            if username:
                bot_type = "kumaran"
                details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
                condition = {'username':username}
                user = details.fetch_product_user(condition)
                if not isinstance(user, dict):
                    logger.info(f"User '{username}' not found in product_users. Creating entry.", extra=extras)
                    details.add_product_user(condition)
                    user = details.fetch_product_user(condition)
                condition = {"user_id": username}
                record = details.getUser(condition)
                if not isinstance(record, dict):
                    logger.info(f"User '{username}' not found in user_tokens. Creating entry.", extra=extras)
                    details.add_user(condition)
                # Extract only the roles that are True
                role_fields = [
                    "is_product_admin",
                    "is_k_agent_user",
                    "is_k_agent_simple",
                    "is_k_agent_admin",
                    "is_kaf_user",
                    "is_kaf_dev",
                    "is_kaf_admin",
                    "is_docspec_user",
                    "is_docspec_admin",
                    "is_k_spec_admin",
                ]
                product_roles = [role for role in role_fields if user.get(role, False)]
            return make_response(jsonify(message='token authentication successfull.',current_user=auth.get('current_user','admin@kumaran.com'),roles=auth.get('roles',[]), product_roles=product_roles ,project_id=auth.get('project_id',None),groups=auth.get('groups',[]), allow_sensitive=auth.get('allow_sensitive',False)),200)
        except Exception as e:
            logger.exception(f"Token decoding failed: {str(e)}",extra=extras)
            return make_response(jsonify({'message' : 'Token is invalid !!'}), 401)


@app.route('/login', methods = ['GET'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER,KAI_CHATBOT_DEV_ADMIN])
def login(auth):
    extras = {
    'servicename': SERVICE_NAME,
    'functionname': get_caller_frame().f_code.co_name,
    'projectname': PROJECT_NAME,
    'bot_name':'kumaran'
}
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    try:
        logger.info("Token authentication successful", extra=extras)
        username = auth.get("current_user",None) or auth.get("username",None) or auth.get("upn",None) or auth.get("preferred_username",None)
        user_roles = auth.get("roles",None)
        auth_logger = Auth(username=username, password=None, roles=None, db_type="sql")
        if username and user_roles:
            result = auth_logger.add_user_roles(username=username,user_roles=user_roles)
        # --- Product Roles check ---#
        product_roles = []
        if username:
            bot_type = "kumaran"
            details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
            condition = {'username':username}
            user = details.fetch_product_user(condition)
            if not isinstance(user, dict):
                logger.info(f"User '{username}' not found in product_users. Creating entry.", extra=extras)
                details.add_product_user(condition)
                user = details.fetch_product_user(condition)
            condition = {"user_id": username}
            record = details.getUser(condition)
            if not isinstance(record, dict):
                logger.info(f"User '{username}' not found in user_tokens. Creating entry.", extra=extras)
                details.add_user(condition)
            # Extract only the roles that are True
            role_fields = [
                "is_product_admin",
                "is_k_agent_user",
                "is_k_agent_simple",
                "is_k_agent_admin",
                "is_kaf_user",
                "is_kaf_dev",
                "is_kaf_admin",
                "is_docspec_user",
                "is_docspec_admin",
                "is_k_spec_admin",
            ]
            product_roles = [role for role in role_fields if user.get(role, False)]
        response = dict(auth)
        response["product_roles"] = product_roles
        auth_logger.log_action(username=username, action="login", status="success")
        return jsonify(response), 200

    except Exception as e:
        logger.exception(f"Token decoding failed: {str(e)}", extra=extras)
        return make_response(jsonify({'message': 'Token is invalid !!'}), 401)

@app.route("/get_product_users_details", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def get_product_user_details(auth=None, **kwargs):
    """
    Fetch all rows from ProductUsers
    """
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

    try:
        bot_type = "kumaran"
        data = request.get_json()
        required_fields = ["roles"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        condition = {}
        roles = data.get('roles', [])
        if len(roles) > 0:
            for role in roles:
                condition[role] = True
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        page = int(data.get("page", 1))
        limit = int(data.get("limit", 20))
        result = details.fetch_all_product_users(condition, page, limit)
        return result
    except Exception as e:
        logger.exception(f"Error fetching product users: {e}", extra=extras)
        return make_response(jsonify({'message' : 'Error fetching product users'}), 500)

@app.route('/product-users/search', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def search_product_user(auth):
    extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
    try:
        search_term = request.args.get('query', '').strip()
        try:
            limit = int(request.args.get('limit', 10))
        except ValueError:
            limit = 10
        if not search_term:
            return jsonify([])
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
        result = details.search_prodcut_user(search_term, limit=limit)
        if isinstance(result, Response):
            return result
        return jsonify(result)
    except Exception as e:
        logger.exception(f"Error fetching product user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'Error fetching product user'}), 500)

@app.route('/get_product_user', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def get_product_user(auth):
    extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.get_json()
        required_fields = ['bot_type', "username"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
        username = data.get('username')
        condition = {'username':username}
        user = details.fetch_product_user(condition)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        if not isinstance(user, dict):
            return make_response(jsonify(error = "data not found"), 404)
        if isinstance(user, dict):
            return user
    except Exception as e:
        logger.exception(f"Error fetching product user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'Error fetching product user'}), 500)

@app.route('/update-user-domains', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def update_user_domains(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        userId = auth_info.get('current_user')
        if not userId:
            return jsonify({"error": "Unauthorized"}), 401
 
        data = request.get_json()
        allowed_domains = data.get("allowed_domains", [])
        restricted_domains = data.get("restricted_domains", [])
 
        bot_type = "kumaran"
        auth_logger = Auth(username=userId, password=None, roles=None, db_type=dbtype, bot_type=bot_type)
        return auth_logger.updateUserDomains(user_id=userId, allowed_domains=allowed_domains, restricted_domains=restricted_domains)
        
    except Exception as e:
        logger.exception(f"Error in update_user_domains: {str(e)}", extra=extras)
        return jsonify({"error": "internal server error"}), 500

@app.route('/update_product_user', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def update_product_user(auth):
    extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.get_json()
        required_fields = ['bot_type', "username", "column_name", "column_value"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        column_name = data.get("column_name")
        column_value = data.get("column_value")
        if isinstance(column_value, bool):
            new_value = column_value
        elif isinstance(column_value, str):
            new_value = column_value.strip().lower() in ('true', '1')
        else:
            return jsonify({"error": "column value must be a boolean or a valid boolean string"}), 400
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
        username = data.get('username')
        condition = {'username':username}
        user = details.fetch_product_user(condition)
        if not isinstance(user, dict):
            return jsonify({"error": "User not found"}), 404
        value = {column_name: new_value}
        details.productUserUpdate(condition,value)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return jsonify({
            "message": "Update successful",
            "username": username,
            column_name: new_value
        }), 200
    except KeyError as ke:
        logger.error(f"Missing required parameter: {str(ke)}", extra=extras)
        return jsonify({"error": f"Missing required parameter: {str(ke)}"}), 400
    except Exception as e:
        logger.error(f"Error in {extras['functionname']}: {str(e)}", extra=extras)
        return jsonify({"error": "Update failed", "details": str(e)}), 500

@app.route('/product-users/sorted', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def get_sorted_product_users(auth):
    extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
    try:
        sort_column = request.args.get('sort_by', 'id').strip().lower()
        direction = request.args.get('order', 'asc').strip().lower()
        page = int(request.args.get('page', 1))
        try:
            limit = int(request.args.get('limit', 20))
        except ValueError:
            limit = 20
        allowed_columns = ["username"]
        if sort_column not in allowed_columns:
            return jsonify(
                error=f"Invalid sort column. Allowed columns: {', '.join(allowed_columns)}"
            ), 400

        if direction not in ["asc", "desc"]:
            return jsonify(error="Invalid order. Allowed values: 'asc', 'desc'"), 400

        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
        result = details.get_sorted_product_users(sort_column=sort_column, direction=direction,page=page, limit=limit)
        
        if isinstance(result, Response):
            return result
        
        return jsonify(result)
    except Exception as e:
            logger.exception(f"Error sorting product users: {e}", extra=extras)
            return make_response(jsonify({'message' : 'Error sorting product users'}), 500)

# for viewing the roles specifically
@app.route('/role', methods = ['GET'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def role(auth):
    extras = {
    'servicename': SERVICE_NAME,
    'functionname': get_caller_frame().f_code.co_name,
    'projectname': PROJECT_NAME,
    'bot_name':'kumaran'
}
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        logger.info(f"Token authentication successful",extra=extras)
        return jsonify(auth), 200
    except Exception as e:
        logger.exception(f"Token decoding failed: {str(e)}",extra=extras)
        return make_response(jsonify({'message' : 'Token is invalid !!'}), 401)


@app.route('/request-access-old', methods=['POST'])
def requestaccessold():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info("Entering /request-access", extra=extras)

    try:
        params = json.loads(request.data)
        user_email = params.get("email")
        roles = params.get("role")        # can be str or list
        models = params.get("model")      # can be str or list

        if not user_email.endswith("@kumaran.world"):
            logger.warning("Unauthorized email domain", extra=extras)
            return make_response(
                jsonify(message="Unauthorized domain - mail ID not from @kumaran.world"), 401 )

        logger.info(f"Processing access request for {user_email}", extra=extras)
        store_user(user_email, roles, models)

        return make_response(jsonify(message="Request raised for Azure AD access token"), 200)

    except Exception as e:
        logger.exception("Error in /request-access", extra=extras)
        return make_response(jsonify({"message": "Error in raising request for access"}), 401)
    
@app.route('/get-models', methods=['GET'])
def getmodels():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info("Entering /get-models", extra=extras)

    try:    
        model_list = fetch_models()
        
        return {
            "models": model_list
        }

    except Exception as e:
        logger.exception(f"Error in /get-models; unable to get models: {e}", extra=extras)
        return make_response(jsonify({"message": f"Unable to retrieve models"}), 401)



@app.route('/request-access', methods=['POST'])
def requestaccess():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info("Entering /request-access", extra=extras)

    try:
        params = json.loads(request.data)
        user_email = params.get("email")
        models = params.get("models")      # can be str or list

        if (not user_email.endswith("@kumaran.world")) and (not user_email.endswith("@kumaran.com")):
            logger.error(f"Unauthorized email domain:{user_email}", extra=extras)
            return make_response(
                jsonify(message="Unauthorized domain - invalid email id"), 401 )

        logger.info(f"Processing access request for {user_email}", extra=extras)
        store_user(user_email, models)

        return make_response(jsonify(message="Request raised for Azure AD access token"), 200)

    except Exception as e:
        logger.exception("Error in /request-access", extra=extras)
        return make_response(jsonify({"message": "Error in raising request for access"}), 401)

@app.route("/api-secret", methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def create_user_secret(auth):
    try:
        data = request.json
        username = data["username"]
        project_id = data["project_id"]
        bot_type = "kumaran"

        # Ensure unique
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        condition = {"username": username, "project_id": project_id}
        existing = details.getExistingUser(condition)
        if isinstance(existing, dict):
            return jsonify({"error": "User already exists for this project"}), 400
        
        client_secret = secrets.token_urlsafe(64)
        jwt_secret = secrets.token_hex(64)
        kid = secrets.token_hex(8)
        user = {
                "username":username,
                "project_id":project_id,
                "tenant_id":AZURE_TENANT_ID,
                "client_id":AZURE_CLIENT_ID,
                "client_secret":client_secret,
                "jwt_secret":jwt_secret,
                "jwt_kid":kid,
                "requests_per_day":500,
                "tokens_per_day":50000,
                "requests_used":0,
                "tokens_used":0,
                "reset_at":datetime.utcnow()
            }
        details.addApiUser(user)

        return jsonify({
            "username": username,
            "project_id": project_id,
            "client_secret": client_secret
        })
    except Exception as e:
        logger.exception(f"Error api-secret creation: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)
    

@app.route("/api-token", methods=['POST'])
def create_user_token():
    try:
        data = request.json
        username = data["username"]
        project_id = data["project_id"]
        client_secret = data["client_secret"]
        bot_type = "kumaran"

        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        condition = {"username": username, "project_id": project_id}
        user = details.getExistingUser(condition)
        if not isinstance(user, dict):
            return jsonify({"error": "User not found"}), 404
        
        # Validate client secret
        if user.get('client_secret') != client_secret:
            return jsonify({"error": "Invalid client_secret"}), 401

        payload = {
            "sub": username,
            "project_id": project_id,
            "client_id": user.get('client_id'),
            "tenant_id": user.get('tenant_id'),
            "kid": user.get('jwt_kid'),
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600*24*30  # 60 minute expiry X 24 X 30 = 30days expiry
        }

        # Create JWT using user-level secret
        token = jwt.encode(
            payload,
            user.get('jwt_secret'),
            algorithm="HS256",
            headers={"kid": user.get('jwt_kid')}
        )

        if isinstance(token, bytes):
            token = token.decode()

        token_hash = hashlib.sha256(token.encode()).hexdigest()

        details.userTokenUpdate(username,project_id,token_hash)

        return jsonify({
            "username": username,
            "project_id": project_id,
            "api_token": token
        })
    except Exception as e:
        logger.exception(f"Error create user token: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)

@app.route("/reset-tokens", methods=['GET'])
@token_required(required_groups=[])
def reset_used_tokens(auth, *args, **kwargs):
    try:
        bot_type = "kumaran"
        now_utc = datetime.utcnow()
        values = {
                "requests_used": 0,
                "tokens_used": 0,
                "reset_at": now_utc
            }
        
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        details.updateAllApiUsers(values)

        ist = pytz.timezone("Asia/Kolkata")
        now_ist = now_utc.replace(tzinfo=pytz.utc).astimezone(ist)
        return jsonify({
            "status": "success",
            "message": "All user rate limits reset successfully",
            "reset_timestamp": now_ist.strftime("%Y-%m-%d %H:%M:%S %Z")
        }), 200
    except Exception as e:
        logger.exception(f"Error reset tokens: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)

@app.route("/revoke_user", methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def revoke_api_user(auth, *args, **kwargs):
    try:
        data = request.json
        username = data["username"]
        project_id = data["project_id"]
        bot_type = "kumaran"
        now_utc = datetime.utcnow()

        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        condition = {"username": username, "project_id": project_id}
        user = details.getExistingUser(condition)
        if not isinstance(user, dict):
            return jsonify({"error": "User not found"}), 404
        
        if user.get('is_revoked'):
            return jsonify({"error": "User is in revoke already!"}), 400
        
        # Revoke User
        details.userRevokeUpdate(username,project_id,now_utc)

        ist = pytz.timezone("Asia/Kolkata")
        now_ist = now_utc.replace(tzinfo=pytz.utc).astimezone(ist)

        return jsonify({
            "status": "success",
            "message": f"{username} - revoked successfully.",
            "user revoked at": now_ist.strftime("%Y-%m-%d %H:%M:%S %Z")
        }), 200
    except Exception as e:
        logger.exception(f"Error revoke user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)

@app.route("/activate_user", methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def activate_api_user(auth, *args, **kwargs):
    try:
        data = request.json
        username = data["username"]
        project_id = data["project_id"]
        bot_type = "kumaran"
        now_utc = datetime.utcnow()

        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        condition = {"username": username, "project_id": project_id}
        user = details.getExistingUser(condition)
        if not isinstance(user, dict):
            return jsonify({"error": "User not found"}), 404
        
        if not user.get('is_revoked'):
            return jsonify({"error": "User is in active already!"}), 404
        
        # Activate User
        details.userActivateUpdate(username,project_id)

        ist = pytz.timezone("Asia/Kolkata")
        now_ist = now_utc.replace(tzinfo=pytz.utc).astimezone(ist)

        return jsonify({
            "status": "success",
            "message": f"{username} - activated successfully.",
            "user activated at": now_ist.strftime("%Y-%m-%d %H:%M:%S %Z")
        }), 200
    except Exception as e:
        logger.exception(f"Error activate user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)

@app.route("/reset-user-tokens", methods=["GET"])
@token_required(required_groups=[])
def reset_user_token_tracker(auth, *args, **kwargs):
    try:
        bot_type = "kumaran"
        now_utc = datetime.utcnow()
        # Reset user_tokens table
        user_values = {
            "day": date.today(),
            "is_blocked": False,
            "tokens_used": 0,
            "input_tokens_used": 0,
            "output_tokens_used": 0
        }
        details = Auth(username=None,password=None,roles=None,db_type=dbtype,bot_type=bot_type)
        details.updateAllUsers(user_values)
        # Reset user_groups daily token usage
        group_values = {
            "daily_input_token_usage": 0,
            "daily_output_token_usage": 0
        }
        details.updateAllGroups(group_values)
        ist = pytz.timezone("Asia/Kolkata")
        now_ist = now_utc.replace(tzinfo=pytz.utc).astimezone(ist)

        return jsonify({
            "status": "success",
            "message": "User and Group token usage reset successfully",
            "reset_timestamp": now_ist.strftime("%Y-%m-%d %H:%M:%S %Z")
        }), 200

    except Exception as e:
        logger.exception(f"Error reset-user-tokens: {e}",extra=extras)
        return make_response(
            jsonify({"message": "something went wrong oops.."}),500)
            
@app.route("/get-user-tokens-details", methods=["GET"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def get_user_tokens_details(auth=None, **kwargs):
    """
    Fetch all rows from UserTokens where is_blocked = True
    Uses ORM + self.db.select_all
    """
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

    try:
        bot_type = "kumaran"
        condition = {}
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        page = int(request.args.get("page", 1))
        limit = 20
        result = details.fetched_blocked_users(condition, page, limit)
        return result
    except Exception as e:
        logger.exception(f"Error fetching blocked users: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)

@app.route("/unblock-user", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def unblock_user(auth):
    """
    Unblock a user and reset tokens_used to 0.
    Uses ORM + self.db.update_one
    """
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

    try:
        data = request.json
        bot_type = 'kumaran'
        if data and "user_id" not in data:
            return make_response({"error":"missing required field user_id"},400)
        else:
            filters = {
                "user_id": data['user_id']
            }

            update_data = {
                "is_blocked": False,
                "tokens_used": 0,
                "input_tokens_used":0,
                "output_tokens_used":0
            }
            details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
            result = details.unblock_specific_users(filters,update_data)
            return result

    except Exception as e:
        logger.exception(f"Error unblocking user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)
    
@app.route("/block-user", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def block_user(auth):
    """
    Unblock a user and reset tokens_used to 0.
    Uses ORM + self.db.update_one
    """
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

    try:
        data = request.json
        bot_type = 'kumaran'
        if data and "user_id" not in data:
            return make_response({"error":"missing required field user_id"},400)
        else:
            filters = {
                "user_id": data['user_id']
            }

            update_data = {
                "is_blocked": True
            }
            details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
            result = details.block_specific_users(filters,update_data)
            return result

    except Exception as e:
        logger.exception(f"Error blocking user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)
    
@app.route("/reset-api-user", methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def unblock_api_user(auth):
    try:
        data = request.json
        bot_type = "kumaran"
        if "username" not in data or "project_id" not in data:
            return make_response(jsonify(error='missing required fields'),400)
        now_utc = datetime.utcnow()
        filters = {
                    "username": data.get('username'),
                    "project_id":data.get('project_id')
                }
        values = {
                "requests_used": 0,
                "tokens_used": 0,
                "reset_at": now_utc
            }
        
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= bot_type)
        result = details.unblock_api_users(filters,values)
        return result
    except Exception as e:
        logger.exception(f"Error unblocking user: {e}", extra=extras)
        return make_response(jsonify({'message' : 'something went wrong oops..'}), 500)
    
@app.route('/user-latest-model', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def update_user_model(auth):
    try:
        data = request.json or {}
        username = data.get("userId")
        latest_model = data.get("latest_model")
        default_model = data.get("default_model")

        if not username:
            return make_response(jsonify({"error": "Missing userId / username in request body"}), 400)
        if not latest_model:
            return make_response(jsonify({"error": "Missing latest_model / model value"}), 400)
        if not default_model:
            return make_response(jsonify({"error": "Missing default_model value"}), 400)
        result = upsert_user_latest_model(username, latest_model, default_model)
        return jsonify(result), 200


    except Exception as e:
        logger.exception(f"Error updating user latest model: {e}", extra=extras)
        return jsonify({"error": str(e)}), 500


@app.route('/fetch-latest-model', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_USER])
def get_user_latest_model(auth):
    try:
        query_data = request.args.to_dict(flat=True)
        json_data = request.get_json(silent=True) or {}
        username = query_data.get("userId") or json_data.get("userId")

        if not username:
            return make_response(jsonify({"error": "Missing username/userId"}), 400)

        result = fetch_user_latest_model(username)
        if result is None:
            return make_response(jsonify({"error": "User latest model not found"}), 404)

        return jsonify(result), 200

    except Exception as e:
        logger.exception(f"Error fetching user latest model: {e}", extra=extras)
        return jsonify({"error": str(e)}), 500

@app.route('/allow-sensitive', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def get_allow_sensitive(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

    try:
        start_time = datetime.now(timezone.utc)
        params = json.loads(request.data) if request.data else {}
        userId = params.get("userId")
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= "kumaran")
        condition = {"user_id": userId}
        result = details.getUser(condition=condition)
        if isinstance(result, dict):
            allow_sensitive = result.get("allow_sensitive_search")

        if allow_sensitive is None:
            return jsonify({"error": "User record not found"}), 404
            
        return jsonify({
            "userId": userId,
            "allow_sensitive_search": allow_sensitive
        }), 200

    except KeyError as ke:
        logger.error(f"Missing required parameter: {str(ke)}", extra=extras)
        return jsonify({"error": f"Missing required parameter: {str(ke)}"}), 400
    except Exception as e:
        logger.error(f"Error in {extras['functionname']}: {str(e)}", extra=extras)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/update-allow-sensitive', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def update_allow_sensitive(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        start_time = datetime.now(timezone.utc)
        params = json.loads(request.data) if request.data else {}
        userId = params.get("userId")
        if 'allow_sensitive_search' not in params:
            return jsonify({"error": "Missing 'allow_sensitive_search' in body"}), 400
        raw_value = params.get("allow_sensitive_search")
        if isinstance(raw_value, bool):
            new_value = raw_value
        elif isinstance(raw_value, str):
            new_value = raw_value.strip().lower() in ('true', '1')
        else:
            return jsonify({"error": "'allow_sensitive_search' must be a boolean or a valid boolean string"}), 400
        updateValues = {"allow_sensitive_search": new_value}
        condition = {"user_id": userId}
        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type= "kumaran")
        details.tokenUserUpdate(condition,updateValues)
        return jsonify({
            "message": "Update successful",
            "userId": userId,
            "allow_sensitive_search": new_value
        }), 200

    except KeyError as ke:
        logger.error(f"Missing required parameter: {str(ke)}", extra=extras)
        return jsonify({"error": f"Missing required parameter: {str(ke)}"}), 400
    except Exception as e:
        logger.error(f"Error in {extras['functionname']}: {str(e)}", extra=extras)
        return jsonify({"error": "Update failed", "details": str(e)}), 500

@app.route('/users/search', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def search_users_api(auth):
    search_term = request.args.get('query', '').strip()
    try:
        limit = int(request.args.get('limit', 10))
    except ValueError:
        limit = 10
    if not search_term:
        return jsonify([])
    details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
    result = details.search_user_tokens(search_term, limit=limit)
    if isinstance(result, Response):
        return result
    return jsonify(result)

@app.route('/users/sorted', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def get_sorted_users_api(auth):

    sort_column = request.args.get('sort_by', 'id').strip().lower()
    direction = request.args.get('order', 'asc').strip().lower()
    page = int(request.args.get('page', 1))
    try:
        limit = int(request.args.get('limit', 20))
    except ValueError:
        limit = 20

    allowed_columns = ["id", "user_id", "day", "tokens_used", "is_blocked", "allow_sensitive_search"]
    if sort_column not in allowed_columns:
        return jsonify(
            error=f"Invalid sort column. Allowed columns: {', '.join(allowed_columns)}"
        ), 400

    if direction not in ["asc", "desc"]:
        return jsonify(error="Invalid order. Allowed values: 'asc', 'desc'"), 400

    details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
    result = details.get_sorted_user_tokens(sort_column=sort_column, direction=direction,page=page, limit=limit)
    
    if isinstance(result, Response):
        return result
    
    return jsonify(result)
    
logger.info('action',extra=extras)
scheduler = BackgroundScheduler()
scheduler.add_job(func=setallenv_variables, trigger="interval", args=[ENV_NAME], seconds=300)
scheduler.start()
# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())

#Token rate limiting on input tokens, tokens limit control by users
@app.route("/update-user-token-limit", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def update_user_token_limit(auth=None, **kwargs):
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")
        input_token_limit = data.get("input_token_limit")
        output_token_limit = data.get("output_token_limit")

        if not user_id:
            return make_response(jsonify({"message": "user_id is required"}), 400)

        details = Auth(username=None, password=None, roles=None, db_type=dbtype, bot_type="kumaran")
        details.tokenUserUpdate({"user_id": user_id}, {"input_token_limit": input_token_limit, "output_token_limit": output_token_limit})

        return make_response(jsonify({"message": "Token limits updated successfully"}), 200)

    except Exception as e:
        logger.exception(f"Error updating token limits: {str(e)}", extra=extras)
        return make_response(jsonify({"message": "Failed to update token limits"}), 500)

if __name__ == '__main__':
    app.run(host='0.0.0.0',debug=True, use_reloader=True,port=5000)
