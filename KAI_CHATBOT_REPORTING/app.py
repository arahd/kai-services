from flask import Flask, request, make_response, jsonify,send_file
import requests
from functools import wraps
from flask_cors import CORS
import os
import random
import string
from datetime import datetime,timezone,timedelta
from flask_apscheduler import APScheduler

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")

if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

SERVICE_NAME='CONVERSATIONAL_AI_REPORT'
PROJECT_NAME='CHATBOT'

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
BUILD_VERSION = os.environ.get('BUILD_VERSION')
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')
KAI_CHATBOT_DEV_ADMIN = os.getenv('KAI_CHATBOT_DEV_ADMIN', '')



app = Flask(__name__)

ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS")
ALLOWED_ORIGINS = ALLOWED_ORIGINS.split(",")
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})

@app.before_request
def check_origin():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    origin = request.headers.get("Origin")
    if origin and origin not in ALLOWED_ORIGINS:
        logger.error(f" Unauthorized CORS attempt from {origin}", extra=extras)
        return jsonify({"error": "Unauthorized origin"}), 403
    

from logger import logger,get_caller_frame,extras
from common_utils.datalake import *


Auth_API_URl = os.getenv("AUTH_URL")
CONTENT_MANAGER_ROLE = os.getenv("CONTENT_MANAGER")
db_type = os.getenv('DB_TYPE','sql')

class Config:
    SCHEDULER_API_ENABLED = True

app.config.from_object(Config())

# Initialize APScheduler
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()
task_store = {}

# Ensure DB tables exist once at application startup to avoid per-request overhead
try:
    from common_utils.mainqueries import SQLConnection
    from models.tablemodels import Base
    sql_conn_startup = SQLConnection()
    Base.metadata.create_all(sql_conn_startup.engine)
    sql_conn_startup.session.close()
except Exception as e:
    logger.exception(f"Error creating tables at startup: {e}", extra={
        'servicename': SERVICE_NAME,
        'functionname': 'startup_table_create',
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    })

        
def validate_bearer_token(bearer_token,roles_required):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    Tok   = bearer_token.split()[1]
    logger.info(f'received token:{Tok},roles_required:{roles_required}',extra=extras)
    response = requests.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok},data={'roles_required':roles_required})
    logger.info("response for roles",extra=extras)
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return response

def requires_authorization(roles_required=[]):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            bearer_token = request.headers.get('Authorization')
            result =  validate_bearer_token(bearer_token,roles_required)
            if result.status_code == 409:
                    return jsonify({"error": "Session Expired"}), 409
            if result.status_code != 200:
                return make_response(jsonify(error= "Unauthorized access"), 401)
            else:
                response_content = json.loads(result.content)
                #checking if any of the user's groups match the required roles
                user_groups = response_content.get("groups", [])
                if roles_required:
                    if not any(role in user_groups for role in roles_required):
                        return make_response(
                            jsonify(error="Unauthorized access"),
                            401
                        )
                auth_info = {'current_user':response_content.get('current_user',''),'user_roles':response_content.get('roles',None)}
                return func(*args, auth_info,**kwargs)
        return wrapper
    return decorator



@app.route('/', methods=['GET'])
def home():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    logger.info("CONVERSATIONAL-AI-REPORT: Reporting service working.",extra=extras)
    logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return f"CONVERSATIONAL-AI-REPORT: {db_type}_{ENV_NAME}_v1.0.1_BuildVersion_{BUILD_VERSION}"

@app.route('/get_log_file')
def get_log_file():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        relative_path = 'reporting.log'
        file_path = os.path.join(*relative_path.split('/'))
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        logger.error(f"Conversation-Service: Exception Occured in get_log_files: {str(e)}", extra=extras)
        return make_response(jsonify(error=str(e),place="get_log_files"),500)



@app.route('/search_user', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def searchUser(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.get_json()
        query_text = data.get("query", "").strip()
        if not query_text:
            return jsonify([])
        get_details = details.search(query=query_text)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch User details"), 500)
    finally :
        details.db.session.close()
    
    
@app.route('/GetAllDetails', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetAllDetails(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        logger.info("CONVERSATIONAL-AI-REPORT: Get Details Working.",extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.get_details()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Details for tablename fetched {get_details}.",extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()


@app.route('/analytics', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetAnalytics(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getAllData()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route('/get/user/reg', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetUserReg(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 10))
        get_details = details.getUserReg(page, limit)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    
@app.route('/get/models', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN,KAI_CHATBOT_DEV_USER])
def GetModels(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getdetails(tablename= [GPT_Model])
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    
@app.route('/get/model/usage', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetModelUsage(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type', 'start_date', 'end_date']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getModelUsage(data=data)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()


@app.route('/GetDetails', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetDetails(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        logger.info("CONVERSATIONAL-AI-REPORT: Get Details Working.",extra=extras)
        data = request.json
        table_name = data.get("tablename")
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename {table_name} for bot type {bot_type}.",extra=extras)
        tablename = [Rating,ResponseType,ResponseTime,Year,Week,Month,LanguageType,GPT_Model]
        table_strings = ['rating',"response_type","response_time","year","week","month","language_type","gpt_model"] 
        table_map = dict(zip(table_strings, tablename))
        selected_table = [table_map.get(table_name, None)]
        if None in selected_table:
            return make_response(jsonify(error = "table not found"), 404)
        get_details = details.getdetails(selected_table)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Details for tablename {table_name} fetched {get_details}.",extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()


@app.route('/get/user', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetUser(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    user = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.get_json()
        required_fields = ['bot_type', "username"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        username = data.get('username')
        name = user.get_username(username)
        if not name:
            return make_response(jsonify(error = "data not found"), 404)
        if isinstance(name, dict):
            return name
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to Get Users"), 500)
    finally :
        user.db.session.close()
    
@app.route('/get/user/all', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetUserAll(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    user = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['timezone_offset', "bot_type"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        timezone_offset = data.get("timezone_offset")
        user_details = user.get_all_username(timezone_offset)
        return user_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to Get Users"), 500)
    finally :
        user.db.session.close()

@app.route('/get/user/analytics', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetUserAnalytics(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['start_date', 'end_date', 'bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)

        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getUserData(data=data)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    

@app.route('/get/questions', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetQuestions(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.get_json()
        required_fields = ['start_date', 'end_date', 'timezone_offset', 'bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        validate_single_day_limit(start_date, end_date)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        timezone_offset = data.get("timezone_offset")
        get_details = details.getQuestions(data=data, timezone_offset=timezone_offset)
        return get_details
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()



@app.route('/GetConversationFromBlob', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetConversationFromBlob(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    try:
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.json
        if "bot_type" not in data:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "bot_type is missing"),400)
        start_date = (datetime.now(timezone.utc) - timedelta(1)).strftime('%Y-%m-%d')
        if start_date==None:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "Input Data is Empty"),400)
        bot_type = data.get('bot_type', 'kumaran')
        task_id = f"{start_date}_{bot_type}"  # Unique identifier for the task
        logger.info(f"CONVERSATIONAL-AI-REPORT: Background process Trigger started for task id {task_id} and date {start_date}",extra=extras)
        task_store[task_id] = {'bot_type': bot_type, 'start_date': start_date, 'extras': extras}
        scheduler.add_job(func=background_conv_blob_task, trigger='date',id=task_id, args=[task_id])
        logger.info(f"CONVERSATIONAL-AI-REPORT: Async call completed for fetching conversation",extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(message="Conversation processing triggered"), 202)
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Error in Getting conversation from blob"), 500)
    
def background_conv_blob_task(task_id):
        try:
                extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
                task_data = task_store.pop(task_id, None)
                if task_data is None:
                    logger.error(f"Background task with ID {task_id} not found", extra=extras)
                    return
                bot_type = task_data['bot_type']
                start_date = task_data['start_date']
                extras = task_data['extras']
                # Simulate conversation fetching and processing
                logger.info(f"Background task running: bot_type={bot_type}, start_date={start_date}",extra=extras)
                # Here, you would call your actual AccessConversation logic
                conversation = AccessConversation(bot_type=bot_type, start_date=start_date, db_type=db_type)
                response_data = conversation.get_conversations()
                if response_data:
                    logger.info(f"CONVERSATIONAL-AI-REPORT: Data inserted successfully. Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                    return True
                else:
                    logger.error(f"CONVERSATIONAL-AI-REPORT: Error inserting data. Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

        except Exception as e:
            logger.exception(f"Error in background task: {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        finally :
            conversation.db.session.close()

@app.route('/QueryingData', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def querying_data(auth_info):
    bot_type = 'kumaran'
    conversation = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.json
        logger.info(f"Query endpoint triggered for bot type {bot_type}",extra=extras)
        fetch = conversation.fetch_data(data=data)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return fetch
    except Exception as e:
            logger.exception(f"Error in querying_data: {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        conversation.db.session.close()

@app.route('/QueryingTranscriptData', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def querying_blob_data(auth_info):
    bot_type = 'kumaran'
    conversation = Helpers(bot_type=bot_type, db_type=db_type)
    try: 
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.json
        logger.info(f"Query endpoint triggered for bot type {bot_type}",extra=extras)
        fetch = conversation.fetch_transcript_data(data=data)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        if not fetch:
            return fetch, 404
        return fetch
    except Exception as e:
            logger.exception(f"Error in querying_blob_data: {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        conversation.db.session.close()
    

@app.route('/PreparingDateTable', methods=['POST'])
def check():
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.json
        if "year" not in data:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "year is missing"), 400)
        year = data.get('year')
        conversation = SQLConnection()
        res = conversation.DateTableCreation(year)
        return "Success"
    except Exception as e:
            logger.exception(f"Error in check: {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        conversation.session.close()


@app.route("/flush_report_cache",methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def flush_report_cache(auth_info):
    try:
        logger.info(f"Request JSON: {request.get_json()}")
        json_data = request.json
        bot_type = json_data.get('bot_type')
        conversation_obj = AccessConversation(bot_type=bot_type, db_type=db_type)
        conversation_obj.cache_flush_report()
        return jsonify('report cache clear successfull')
    except Exception as e:
            logger.exception(f"Error in flush_report_cache: {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        conversation_obj.db.session.close()

def validate_single_day_limit(start_date_str, end_date_str):
    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()

    max_range = timedelta(days=90)
    
    if end_date < start_date or (end_date - start_date) > max_range:
        raise ValueError("Download allowed only for a maximum range of 90 days.")
    
#############-------API User's Report-------#############
@app.route("/apiuser/report/summary", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_report_summary(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getApiUserSummary()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/apiuser/report/projects", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def report_projects(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getApiUserProjectReport()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    
@app.route("/apiuser/report/max_tokens_used", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_max_tokens_used(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getMaxTokensUsedUser()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/apiuser/report/min_tokens_used", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_min_tokens_used(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getMinTokensUsedUser()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    
@app.route("/apiuser/report/overall_max_tokens", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_max_tokens_overall(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getOverallMaxTokensUsedUser()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/apiuser/report/overall_min_tokens", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_min_tokens_overall(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getOverallMinTokensUsedUser()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/apiuser/report/projectlist", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_list_projects(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.listProjects()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/apiuser/report/usernames", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_list_usernames(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        username = data.get('username')
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.listUsernames(username)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()


@app.route("/apiuser/report/revoked", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_list_revoked_users(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        page = data.get('page')
        limit = data.get('limit')
        get_details = details.listRevokedUsers(page,limit)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()



@app.route("/apiuser/report/user_details", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_user_details(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        username = data.get("username")
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getUserDetailsByUsername(username)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/apiuser/report/users_by_project", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_users_by_project(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        project_id = data.get("project_id")
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.listUsersByProject(project_id)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

#####################################################################################################################
# API - SERVICE RELATED ENDPOINTS
####################################################################################################################3

   
#############-------API User's Report-------#############
@app.route("/api/report/summary", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_report_summary_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getUserSummary_apiService()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/projects", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def report_projects_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        page = int(data.get("page", 1))
        limit = int(data.get("limit", 10))
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getUserProjectReport_apiService(page, limit)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    
@app.route("/api/report/max_tokens_used", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_max_tokens_used_apiService(auth_info):
    extras = { 
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname':                           PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getMaxTokensUsedUser_apiService()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/min_tokens_used", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_min_tokens_used_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getMinTokensUsedUser_apiService()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()
    
@app.route("/api/report/overall_max_tokens", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_max_tokens_overall_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getOverallMaxTokensUsedUser_apiService()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/overall_min_tokens", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_min_tokens_overall_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getOverallMinTokensUsedUser_apiService()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/projectlist", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_list_projects_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.listProjects()
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/usernames", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_list_usernames_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        username = data.get('username')
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.SearchUsernames(username)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/revoked", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_list_revoked_users_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        page = int(data.get("page", 1))
        limit = int(data.get("limit", 10))
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.listRevokedUsers(page, limit)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/user_details", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_user_details_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        usernames = data.get("usernames")
        project_id = data.get("project_id")
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        model_name = data.get("model_names")
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.getUserDetailsByUsername_apiService(usernames, project_id, start_date, end_date,model_name)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/users_by_project", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_users_by_project_apiService(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        project_id = data.get("project_id")
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Get Details for tablename for bot type {bot_type}.",extra=extras)
        get_details = details.listUsersByProject(project_id)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally :
        details.db.session.close()

@app.route("/api/report/question", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_question_report(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        usernames = data.get("usernames")
        project_id = data.get("project_id")
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        model_name = data.get("model_names")
        timezone_offset = data.get("timezone_offset")
        logger.info(
            f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
            extra=extras
        )
        required_fields = ['bot_type','start_date', 'end_date', 'timezone_offset']
        missing_fields = [
            field for field in required_fields
            if field not in data
        ]
        if missing_fields:
            logger.info(
                f'all the keys are not available missing_fields:{missing_fields}',
                extra=extras
            )
            return make_response(
                jsonify({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                }),
                422
            )
        validate_single_day_limit(start_date, end_date)
        logger.info(
            f"CONVERSATIONAL-AI-REPORT: Fetching question report for bot type {bot_type}.",
            extra=extras
        )
        get_details = details.getQuestionReport_apiService(
            usernames,
            project_id,
            start_date,
            end_date,
            model_name,
            timezone_offset
        )
        return get_details

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception(
            f"CONVERSATIONAL-AI-REPORT: Error occurred {e}",
            extra=extras
        )
        logger.info(
            f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",
            extra=extras
        )

        return make_response(
            jsonify(error="Unable to fetch question details"),
            500
        )

    finally:
        details.db.session.close()

@app.route("/api/report/overall_tokens_usage", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def apiuser_overall_tokens_usage(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        required_fields = ['bot_type']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(jsonify({
                'error': f'Missing required fields: {", ".join(missing_fields)}'
            }), 422)
        result = details.getOverallTokensUsage()
        return result
    except Exception as e:
        logger.exception("Error occurred", extra=extras)
        return make_response(jsonify(error="Unable to fetch details"), 500)
    finally:
        details.db.session.close()

################################################################################3####################################
    
@app.route("/get_conversation_documents", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def get_conv_docs(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    bot_type = 'kumaran'
    details = Helpers(bot_type=bot_type, db_type=db_type)
    try:
        data = request.get_json()
        conv_id = data.get("conversation_id")
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ['bot_type','conversation_id']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        get_details = details.listDocsByConv(conv_id)
        return get_details
    except Exception as e:
        logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred on fetching documents {e}", extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify(error="Unable to fetch document details"), 500)
    finally :
        details.db.session.close()

@app.route("/create_bug_sheet", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def create_bug_report(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        logger.info(f"BUG-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        bot_type = "kumaran"
        bug_name = request.form.get('bug_name')
        description = request.form.get('description')
        request_type = request.form.get('request_type', 'BUG_REPORT')

        allowed_request_types = {'BUG_REPORT', 'FEATURE_REQUEST'}
        if request_type not in allowed_request_types:
            return make_response(jsonify({'error': 'Invalid request_type'}), 422)

        details = Helpers(bot_type=bot_type, db_type=db_type)
        MAX_FILES = int(details.get_config_value("BUG_UPLOAD_MAX_FILES"))
        MAX_FILE_SIZE = int(details.get_config_value("BUG_UPLOAD_MAX_FILE_SIZE")) * 1024 * 1024

        ALLOWED_EXTENSIONS = {
            ext.strip().lower()
            for ext in details.get_config_value("BUG_UPLOAD_ALLOWED_EXTENSIONS", "").split(",")
        }

        def is_allowed_file(filename):
            return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

        related_files = request.files.getlist('related_files')
        for file in related_files:
            if not file.filename:
                continue
            if not is_allowed_file(file.filename):
                logger.warning(f'Invalid file type detected: {file.filename}', extra=extras)
                return make_response(
                    jsonify({
                        'error': f'Invalid file format: {file.filename}. Only JPG, JPEG, and PNG files are allowed.'
                    }),
                    422
                )
        if len(related_files) > MAX_FILES:
            logger.warning(f'More than {MAX_FILES} files uploaded', extra=extras)
            return make_response(jsonify({'error': f'Maximum {MAX_FILES} files are allowed'}), 422)

        for file in related_files:
            if not file.filename:
                continue
            file.seek(0, 2)
            file_length = file.tell()
            file.seek(0)
            if file_length > MAX_FILE_SIZE:
                logger.warning(f'File {file.filename} exceeds {MAX_FILE_SIZE / (1024 * 1024)} MB', extra=extras)
                return make_response(
                    jsonify({'error': f'File "{file.filename}" exceeds {MAX_FILE_SIZE / (1024 * 1024)} MB limit'}),
                    422
                )
        related_files = [f for f in related_files if f.filename]
        required_fields = ['bug_name', 'description']
        missing_fields = [field for field in required_fields if not request.form.get(field)]
        if missing_fields:
            logger.warning(f'Missing required fields: {missing_fields}', extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)

        alpha_part = ''.join(random.choices(string.ascii_uppercase, k=3))
        numeric_part = ''.join(random.choices(string.digits, k=5))
        ticket_num = f"{alpha_part}-{numeric_part}"

        bug_data = {
            'ticket_number': ticket_num,
            'request_type': request_type,
            'bug_name': bug_name,
            'description': description,
            'created_by': auth_info.get('current_user'),
            'created_at': datetime.now(timezone.utc),
            'state': 'open'
        }

        details.create_bug_record(bug_data=bug_data, related_files=related_files)
        logger.info(f"BUG-REPORT: Bug report created successfully: {ticket_num}", extra=extras)

        return make_response(
            jsonify({
                'message': 'Bug report created successfully',
                'ticket_number': ticket_num,
                'request_type': request_type,
                'status': 'open'
            }),
            201
        )

    except Exception as e:
        logger.exception(f"BUG-REPORT: Error creating bug report: {e}", extra=extras)
        return make_response(jsonify({'error': 'Unable to create bug report'}), 500)

    finally:
        if 'details' in locals():
            details.db.session.close()




@app.route('/get_bug_reports', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def GetBugReports(auth_info):

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

    try:
        logger.info(
            f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
            extra=extras
        )
        data = request.get_json()
        filters = data.get("filter", {})
        state = filters.get("status")
        search = filters.get("search")
        required_fields = ['bot_type']
        missing_fields = [
            field for field in required_fields
            if field not in data
        ]
        if missing_fields:
            return make_response(
                jsonify({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                }),
                422
            )
        bot_type = data.get('bot_type', 'kumaran')
        details = Helpers(
            bot_type=bot_type,
            db_type=db_type
        )
        page = int(data.get("page", 1))
        limit = int(data.get("limit", 10))
        return details.getBugReports(page=page,limit=limit,state=state,search=search)

    except Exception as e:
        logger.exception(
            f"CONVERSATIONAL-AI-REPORT: Error occurred {e}",
            extra=extras
        )
        return make_response(
            jsonify(error="Unable to fetch bug reports"),
            500
        )
    finally:
        if 'details' in locals():
            details.db.session.close()
@app.route(
    '/get_bug_attachment',
    methods=['POST']
)
def get_bug_attachment():
    try:
        data = request.get_json()

        if not data:
            return make_response(
                jsonify({"error": "Request body is required"}),
                400
            )

        attachment_id = data.get("attachment_id")

        if not attachment_id:
            return make_response(
                jsonify({"error": "attachment_id is required"}),
                400
            )

        details = Helpers(
            bot_type="kumaran",
            db_type=db_type
        )

        attachment = details.db.get_bug_attachment(
            attachment_id=attachment_id
        )

        if not attachment:
            return make_response(
                jsonify({"error": "Attachment not found"}),
                404
            )

        return make_response(
            jsonify({
                "id": attachment.id,
                "file_name": attachment.file_name,
                "file_type": attachment.file_type,
                "file_size": attachment.file_size,
                "file_data": attachment.file_data
            }),
            200
        )

    except Exception as e:
        logger.exception(
            f"Error fetching bug attachment: {e}"
        )

        return make_response(
            jsonify({"error": "Unable to fetch attachment"}),
            500
        )
@app.route('/update_bug_status', methods=['PUT'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def UpdateBugStatus(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        logger.info(
            f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
            extra=extras
        )
        data = request.get_json()
        required_fields = [
            'ticket_number',
            'state'
        ]
        missing_fields = [
            field for field in required_fields
            if field not in data
        ]
        if missing_fields:
            return make_response(
                jsonify({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                }),
                422
            )
        details = Helpers(
            bot_type='kumaran',
            db_type=db_type
        )
        return details.updateBugStatus(data)

    except Exception as e:
        logger.exception(
            f"CONVERSATIONAL-AI-REPORT: Error occurred {e}",
            extra=extras
        )
        return make_response(
            jsonify(error="Unable to update bug status"),
            500
        )
    finally:
        if 'details' in locals():
            details.db.session.close()

@app.route('/api/audit/pii', methods=['POST', 'GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def get_pii_audit_report(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']}", extra=extras)
    db_type = request.headers.get("db_type", "pg")
    details = Helpers(bot_type='kumaran', db_type=db_type)
    session = details.db.session
    try:
        from models.tablemodels import QueryPIIAudit, DocumentPIIAudit
        
        username = request.form.get('username') or request.args.get('username')
        mode = request.form.get('mode') or request.args.get('mode', 'both')
        start_date_str = request.form.get('start_date') or request.args.get('start_date')
        end_date_str = request.form.get('end_date') or request.args.get('end_date')

        query_audit_db = session.query(QueryPIIAudit)
        doc_audit_db = session.query(DocumentPIIAudit)

        if username:
            query_audit_db = query_audit_db.filter(QueryPIIAudit.username == username)
            doc_audit_db = doc_audit_db.filter(DocumentPIIAudit.username == username)
            
        if start_date_str and end_date_str:
            try:
                start_date = datetime.strptime(start_date_str, "%Y-%m-%d")
                end_date = datetime.strptime(end_date_str, "%Y-%m-%d") + timedelta(days=1)
                query_audit_db = query_audit_db.filter(QueryPIIAudit.created_at >= start_date, QueryPIIAudit.created_at < end_date)
                doc_audit_db = doc_audit_db.filter(DocumentPIIAudit.created_at >= start_date, DocumentPIIAudit.created_at < end_date)
            except Exception as e:
                logger.error(f"Date format error: {e}", extra=extras)
                
        total_query_masked = 0
        query_type_counts = {}
        recent_queries = []
        
        if mode in ['query', 'both']:
            for row in query_audit_db.all():
                total_query_masked += row.total_masked
                for p_type, count in (row.pii_type_counts or {}).items():
                    query_type_counts[p_type] = query_type_counts.get(p_type, 0) + count
            
            recent_queries = [
                {"id": r.id, "type": "query", "timestamp": r.created_at, "masked_query": r.masked_query, "mapping": r.query_pii_mapping}
                for r in query_audit_db.order_by(QueryPIIAudit.created_at.desc()).limit(20).all()
            ]

        total_doc_masked = 0
        doc_type_counts = {}
        recent_docs = []
        
        if mode in ['document', 'both']:
            for row in doc_audit_db.all():
                total_doc_masked += row.total_masked
                for p_type, count in (row.pii_type_counts or {}).items():
                    doc_type_counts[p_type] = doc_type_counts.get(p_type, 0) + count
                    
            recent_docs = [
                {"id": r.id, "type": "document", "doc_id": r.doc_id, "timestamp": r.created_at, "filename": r.filename, "mapping": r.doc_pii_mapping}
                for r in doc_audit_db.order_by(DocumentPIIAudit.created_at.desc()).limit(20).all()
            ]

        overall_type_counts = {**query_type_counts}
        for p_type, count in doc_type_counts.items():
             overall_type_counts[p_type] = overall_type_counts.get(p_type, 0) + count
             
        all_recent = sorted(recent_queries + recent_docs, key=lambda x: x['timestamp'], reverse=True)[:20]

        return jsonify({
            "totals": {
                "overall": total_query_masked + total_doc_masked,
                "queries": total_query_masked,
                "documents": total_doc_masked
            },
            "pii_type_breakdown": {
                "overall": overall_type_counts,
                "queries": query_type_counts,
                "documents": doc_type_counts
            },
            "latest_records": all_recent
        }), 200

    except Exception as e:
        logger.exception(f"Error fetching PII audit report: {e}", extra=extras)
        return jsonify(error="Unable to fetch PII audit report"), 500
    finally:
        session.close()

@app.route('/api/audit/pii/clear', methods=['DELETE'])
def clear_pii_audit_records():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']}", extra=extras)
    db_type = request.headers.get("db_type", "pg")
    details = Helpers(bot_type='kumaran', db_type=db_type)
    session = details.db.session
    try:
        from models.tablemodels import QueryPIIAudit, DocumentPIIAudit
        
        days = request.args.get('days', type=int)
        if not days:
            return jsonify(error="Please provide 'days' parameter"), 400
            
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        deleted_query = session.query(QueryPIIAudit).filter(QueryPIIAudit.created_at < cutoff_date).delete(synchronize_session=False)
        deleted_doc = session.query(DocumentPIIAudit).filter(DocumentPIIAudit.created_at < cutoff_date).delete(synchronize_session=False)
            
        session.commit()
        
        return jsonify({
            "status": "success",
            "message": f"Deleted records older than {days} days.",
            "deleted_query_count": deleted_query,
            "deleted_document_count": deleted_doc
        }), 200

    except Exception as e:
        session.rollback()
        logger.exception(f"Error clearing PII audit report: {e}", extra=extras)
        return jsonify(error="Unable to clear PII audit report"), 500
    finally:
        session.close()

@app.route("/user_usage_report", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def user_usage_report(auth_info):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran",
    }
    details = None
    try:
        logger.info(
            f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
            extra=extras,
        )
        if not (data := request.get_json(silent=True)):
            return make_response(jsonify(error="Invalid or empty JSON payload"), 400)

        if not (bot_type := data.get("bot_type")):
            return make_response(jsonify(error="bot_type is required"), 422)

        details = Helpers(bot_type=bot_type, db_type=db_type)
        return details.getUserUsageReport(
            report_type=data.get("report_type", "weekly"),
            report_period=data.get("report_period", "current"),
        )
    except Exception as e:
        logger.exception(f"Error occurred: {e}", extra=extras)
        return make_response(jsonify(error="Unable to fetch user usage report"), 500)
    finally:
        if details:
            try:
                details.db.session.close()
            except Exception:
                pass

if __name__ == '__main__':
    app.run(debug=True, port=5000)