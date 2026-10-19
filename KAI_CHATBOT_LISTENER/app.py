from flask import Flask, request, make_response, jsonify, send_file
import requests
from functools import wraps
from flask_cors import CORS
import os
from datetime import datetime,timezone
from flask_apscheduler import APScheduler
from dotenv import load_dotenv,find_dotenv
load_dotenv(find_dotenv())

app = Flask(__name__)
CORS(app)

SERVICE_NAME='KAI_CHATBOT_LISTENER_SERVICE'
PROJECT_NAME='KAI'

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
BUILD_VERSION = os.environ.get('BUILD_VERSION')

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
HOST_NAME_ENV='AZURE'
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

from service_bus import start_background_listener
from logger import logger,get_caller_frame,extras
from common_utils.datalake import *

Auth_API_URl = os.getenv("AUTH_URL")
CONTENT_MANAGER_ROLE = os.getenv("CONTENT_MANAGER")
db_type = os.environ.get('DB_TYPE')

class Config:
    SCHEDULER_API_ENABLED = True

app.config.from_object(Config())

# Initialize APScheduler
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()
task_store = {}
        
def validate_bearer_token(bearer_token):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    Tok   = bearer_token.split()[1]
    response = requests.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok})
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return response

def requires_authorization(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        bearer_token = None
        if 'Authorization' in request.headers:
            bearer_token = request.headers.get('Authorization')
            result =  validate_bearer_token(bearer_token)
            if result.status_code == 409:
                return jsonify({"error": "Session Expired"}), 409
            if result.status_code != 200:
        #  if not bearer_token or not validate_bearer_token(bearer_token):
                return jsonify({"error": "Unauthorized access"}), 401
            else:
                return func(*args, **kwargs)
        if not bearer_token:
            return jsonify({'message' : 'Token is missing !!'}), 401
    return wrapper

@app.route('/', methods=['GET'])
def home():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return f"KAI_CHATBOT_LISTENER_SERVICE: {db_type}_{ENV_NAME}_v9.2_BuildVersion_{BUILD_VERSION}"

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
        relative_path = 'reporting_listener.log'
        file_path = os.path.join(*relative_path.split('/'))
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Exception Occured in get_log_files: {str(e)}", extra=extras)
        return make_response(jsonify(error=str(e),place="get_log_files"),500)

@app.route("/flush_report_cache",methods=["POST"])
@requires_authorization
def flush_report_cache():
    try:
        json_data = request.json
        bot_type = json_data.get('bot_type')
        conversation_obj = AccessConversation(bot_type=bot_type, db_type=db_type)
        conversation_obj.cache_flush_report()
        return jsonify('report cache clear successfull')
    except Exception as e:
        logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Exception Occured in flush_report_cache: {str(e)}", extra=extras)
        return make_response(jsonify(error=str(e),place="flush_report_cache"),500)

start_background_listener()
if __name__ == '__main__':
    app.run(debug=True, port=5000, use_reloader=False)