import os
import json
import requests
# sys.path.append(os.path.dirname(__file__))

from send_mail import send_approval_email

#from dotenv import load_dotenv
#load_dotenv()

import atexit
from db import get_db
from db_functions import *
from apscheduler.schedulers.background import BackgroundScheduler

from flask import Flask, request, jsonify, make_response, current_app,g
from flask_cors import CORS

from  werkzeug.security import generate_password_hash, check_password_hash
# imports for PyJWT authentication

from datetime import datetime,timezone, timedelta
from functools import wraps

from flask import request

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
BUILD_VERSION = os.getenv('BUILD_VERSION',1)
 
properties = {'custom_dimensions': {'ENV': ENV_NAME}}

SERVICE_NAME='CONVERSATIONAL AI CHATBOT ADMIN SERVICE'
PROJECT_NAME='CHATBOT'

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
# HOST_NAME_ENV = "AZURE"
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

Auth_Url = os.getenv('AUTH_URL')
dbtype = os.getenv('DB_TYPE',"mongo")
print(f'ENV_NAME:{ENV_NAME},HOST_NAME_ENV:{HOST_NAME_ENV},Auth_Url:{Auth_Url},dbtype:{dbtype}')

# dbtype = "sql"

from authservice.auth import *
from authservice.token_decode import token_required

from authservice.password import PasswordReset
from logger import logger,get_caller_frame,extras



# creates Flask object
app = Flask(__name__)
ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS")
ALLOWED_ORIGINS = ALLOWED_ORIGINS.split(",")
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})
 

# TOKEN_TEXT = os.getenv("TOKEN_TEXT")
TOKEN_TEXT = os.getenv("TOKEN_TEXT")
USERNAME = "SSdtIHVzZXJuYW1l"
APP_VERSION = os.getenv('APP_VERSION',1)
# HOST_NAME_ENV='AZURE'


@app.route('/', methods = ['GET'])
def hello():
   extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
   logger.info("auth service",extra=extras)
   return f"ADMIN Service is working ENV_NAME:{ENV_NAME}, DB_TYPE {dbtype}, v0.0.6 {BUILD_VERSION}"



Auth_API_URl = os.getenv("AUTH_URL")

ADMIN_ROLE = os.getenv("ADMIN_ROLE")
# ADMIN_ROLE = "useradmin"
USER_ROLE = os.getenv("USER_ROLE")
# USER_ROLE = "user"

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
        'bot_name':'CIBC'
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
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
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

@app.route('/get-pending-user-details', methods=['GET'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def fetchuserdetails(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info("Entering /get-pending-user-details", extra=extras)
    try:
        with get_db() as db:
            details = getpendinguserdetails(db)
            logger.info("Fetched the user details successfully", extra=extras)
            return details

    except Exception as e:
        logger.exception(f"Unable to fetch user details: {e}", extra=extras)
        return make_response(jsonify({"message": f"Error: {e}"}), 401)


@app.route('/approve-access', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def approveaccess(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info("Entering /approve-access", extra=extras)

    try:
        params = json.loads(request.data)
        email = params.get("email")
        approved = params.get("approved")
        models = params.get("models")

        email_status = "Didn't inform user"
        with get_db() as db:
            approve_access(email, approved, db)
            approved_models = approve_models(email, models, db)
            if email.endswith(".com"):
                email_status=send_approval_email(email)       

            return jsonify({
                    "email": email,
                    "models": approved_models,
                    "email_sent": email_status
                }), 200

    except Exception as e:
        logger.exception(f"Error in approve-access: {e}", extra=extras)
        return make_response(jsonify({"message": f"Error: {e}"}), 401)
    

@app.route('/approve-users-bulk', methods=['POST'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def approve_users_bulk(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    try:
        data = json.loads(request.data)
        users = data.get("users", [])   # List of emails
        
        with get_db() as db:
            bulk_approval_list = bulk_approval(users, db)
            return bulk_approval_list, 200

    except Exception as e:
        logger.exception(f"Error in approve-users-bulk: {e}", extra=extras)
        return make_response(jsonify({"message": f"Error: {e}"}), 500)


@app.route('/get-registered-user-details', methods=['GET'])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def registereduserdetails(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info("Entering /get-registered-user-details", extra=extras)
    try:
        with get_db() as db:
            details = getregisteresuserdetails(db)
            logger.info("Fetched the user details successfully", extra=extras)
            return details

    except Exception as e:
        logger.exception(f"Unable to fetch user details: {e}", extra=extras)
        return make_response(jsonify({"message": f"Error: {e}"}), 401)

@app.route("/privacy-policy", methods=["GET"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def fetch_privacy_policy(auth):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info("Entering /privacy-policy", extra=extras)
    try:
        with get_db() as db:
            content = get_privacy_policy_content()
            configurations = get_grouped_privacy_policy(db)
            return jsonify({
                "success": True,
                "policy_content": content,
                "configurations": configurations
            }), 200
    except Exception as e:
        logger.exception(f"Unable to fetch privacy policy: {e}", extra=extras)
        return make_response(jsonify({
            "success": False,
            "message": str(e)
        }), 500)


logger.info('action',extra=extras)
scheduler = BackgroundScheduler()
#scheduler.add_job(func=endconv.redisToMongoInactiveID, trigger="interval", seconds=600)
scheduler.add_job(func=setallenv_variables, trigger="interval", args=[ENV_NAME], seconds=300)
scheduler.start()
# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())

@app.route("/user-management/users", methods=["GET"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def user_management_users(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran",
    }

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 10))
        search = request.args.get("search")
        access = request.args.get("access")
        sort_by = request.args.get("sort_by")
        sort_order = request.args.get("sort_order", "asc")
        group_id = request.args.get("group_id")
        group_name = request.args.get("group_name")

        with get_db() as db:
            result = get_user_management_users(
                db=db,
                page=page,
                page_size=page_size,
                search=search,
                access=access,
                sort_by=sort_by,
                sort_order=sort_order,
                group_id=group_id,
                group_name=group_name
            )

        return jsonify(result), 200

    except Exception as exc:
        logger.exception(f"User management error: {exc}", extra=extras)
        return jsonify({"message": "Unable to fetch users"}), 500

@app.route("/user-management/update-user", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def update_user_management(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        payload = json.loads(request.data)

        with get_db() as db:
            result = update_user_management_details(
                db=db,
                email=payload.get("email"),
                allow_sensitive_search=payload.get("allow_sensitive_search"),
                input_token_limit=payload.get("input_token_limit"),
                output_token_limit=payload.get("output_token_limit")
            )

        return jsonify(result), 200

    except Exception as exc:
        logger.exception(f"Update user management failed: {exc}", extra=extras)
        return jsonify({"message": "Unable to update user"}), 500

@app.route("/user-management/reset-tokens", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def reset_tokens(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }
    try:
        payload = json.loads(request.data)
        with get_db() as db:
            result = reset_user_tokens(db=db, email=payload.get("email"))

        return jsonify(result), 200

    except Exception as exc:
        logger.exception(f"Token reset failed: {exc}", extra=extras)
        return jsonify({"message": "Unable to reset tokens"}), 500

@app.route("/user-management/teams", methods=["GET"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def get_user_management_teams(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }
    try:
        sort_by = request.args.get("sort_by")
        sort_order = request.args.get("sort_order", "asc")
        with get_db() as db:
            result = get_teams(db=db,sort_by=sort_by,sort_order=sort_order)
        return jsonify(result), 200
    except Exception as exc:
        logger.exception(f"Get teams failed: {exc}",extra=extras)
        return jsonify({"message": "Unable to fetch teams"}), 500

@app.route("/user-management/team-members", methods=["GET"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def user_management_team_members(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        group_id = request.args.get("group_id")
        with get_db() as db:
            result = get_team_members(db=db, group_id=group_id)
        return jsonify(result), 200
    except Exception as exc:
        logger.exception(f"Get team members failed: {exc}", extra=extras)
        return jsonify({"message": "Unable to fetch team members"}), 500

@app.route("/user-management/team/create", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def create_user_management_team(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        payload = json.loads(request.data)
        with get_db() as db:
            result = create_team(
                db=db,
                group_name=payload.get("group_name"),
                input_token_limit=payload.get("input_token_limit", 0),
                output_token_limit=payload.get("output_token_limit", 0)
            )
        return jsonify(result), 201
    except Exception as exc:
        logger.exception(f"Create team failed: {exc}", extra=extras)
        return jsonify({"message": str(exc)}), 500

@app.route("/user-management/team/update", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def update_user_management_team(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        payload = json.loads(request.data)
        with get_db() as db:
            result = update_team(
                db=db,
                group_id=payload.get("group_id"),
                input_token_limit=payload.get("input_token_limit"),
                output_token_limit=payload.get("output_token_limit")
            )
        return jsonify(result), 200
    except Exception as exc:
        logger.exception(f"Update team failed: {exc}", extra=extras)
        return jsonify({"message": str(exc)}), 500

@app.route("/user-management/team/delete", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def delete_user_management_team(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        payload = json.loads(request.data)
        with get_db() as db:
            result = delete_team(db=db, group_id=payload.get("group_id"))
        return jsonify(result), 200
    except Exception as exc:
        logger.exception(f"Delete team failed: {exc}", extra=extras)
        return jsonify({"message": str(exc)}), 500

@app.route("/user-management/team/add-members", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def add_members_to_team(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        payload = json.loads(request.data)
        with get_db() as db:
            result = add_team_members(
                db=db,
                group_id=payload.get("group_id"),
                members=payload.get("members", [])
            )
        return jsonify(result), 200
    except Exception as exc:
        logger.exception(f"Add team members failed: {exc}", extra=extras)
        return jsonify({"message": str(exc)}), 500

@app.route("/user-management/team/remove-members", methods=["POST"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def remove_members_from_team(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }

    try:
        payload = json.loads(request.data)
        with get_db() as db:
            result = remove_team_members(
                db=db,
                group_id=payload.get("group_id"),
                members=payload.get("members", [])
            )
        return jsonify(result), 200
    except Exception as exc:
        logger.exception(f"Remove team members failed: {exc}", extra=extras)
        return jsonify({"message": str(exc)}), 500

@app.route("/user-management/summary", methods=["GET"])
@token_required(required_groups=[KAI_CHATBOT_DEV_ADMIN])
def user_management_summary(auth):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran",
    }

    try:
        with get_db() as db:
            result = get_user_management_summary(db)
        return jsonify(result), 200

    except Exception as exc:
        logger.exception(f"User management summary failed: {exc}", extra=extras)
        return jsonify({"message": "Unable to fetch summary"}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0',debug=True, use_reloader=True)
