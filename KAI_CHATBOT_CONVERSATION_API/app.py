import gc
import os
import json
import requests
from dotenv import load_dotenv

load_dotenv()

import atexit
import jellyfish
import traceback
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from datetime import datetime,timezone
from functools import wraps
from keyvault import setallenv_variables
from logger import logger,get_caller_frame,extras
from custom_utils.http_client import get_http_session, auth_cache


ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'
VERSION='v0.0.62'

logger.info(f"Environment:{ENV_NAME}", extra=extras)
properties = {'custom_dimensions': {'ENV': ENV_NAME}}

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
BUILD_VERSION = os.getenv('BUILD_VERSION',1)
APP_VERSION = os.getenv('APP_VERSION',1)

if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

logger.info(f"Env variables are env:{ENV_NAME} set:HOST_NAME_ENV - {HOST_NAME_ENV}", extra=extras)

from tableModels import Session, Projects
from conversation_flow import image_conversation
from custom_utils.async_utils import shutdown_async_executor
from custom_utils.azure_blob_service import Azure_blob
from azure_service_bus_adapter import AzureServiceBusAdapter
from kernel_pooling import KernelPool

gpt_4_series_model = os.getenv("GPT_4_SERIES_MODEL","gpt-4o-mini")
gpt_5_series_model = os.getenv("GPT_5_SERIES_MODEL","")
claude_sonnet_series_model = os.getenv("CLAUDE_SONNET_SERIES_MODEL","")
claude_opus_series_model = os.getenv("CLAUDE_OPUS_SERIES_MODEL","")

model_list:list[str] = [gpt_4_series_model,gpt_5_series_model,claude_sonnet_series_model,claude_opus_series_model]
kernel_pool = KernelPool(model_list=model_list,blob_object=Azure_blob())

def jaro_winkler_score(a, b):
    return jellyfish.jaro_winkler_similarity(a, b) 

def best_candidate(query, candidates, threshold=0.):
    q = query.strip().lower()
    scored = [(cand, jaro_winkler_score(q, cand.lower())) for cand in candidates]
    scored = sorted(scored, key=lambda x: x[1], reverse=True)
    if scored and scored[0][1] >= threshold:
        return scored[0][0]  
    return None

app = Flask(__name__)
CORS(app)

ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS")
ALLOWED_ORIGINS = ALLOWED_ORIGINS.split(",")

logger.info(f'received allowed_origins:{ALLOWED_ORIGINS}',extra=extras)
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


#Config for redis to blob
storage_type = os.getenv("storage_type")
dbtype = os.getenv('DB_TYPE',"mongo")
Auth_API_URl = os.getenv("AUTH_URL")
logger.info(f"conversation service endpoints: ENV_NAME:{ENV_NAME},HOST_NAME_ENV:{HOST_NAME_ENV},'AUTH_URL':'{Auth_API_URl}',dbtype:{dbtype}",extra=extras)
TOKEN_TEXT = os.getenv("TOKEN_TEXT")
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')


@app.route('/', methods = ['GET'])
def hello():
   extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
   logger.info(f"Entering Ver {extras['functionname']} at {datetime.now(timezone.utc)}, Version: {VERSION} running",extra=extras)
   logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
   return jsonify(status=f"Conversational Service {VERSION} running",ENV=ENV_NAME,Storage=storage_type,BUILD_VERSION=BUILD_VERSION,APP_VERSION=APP_VERSION)

def validate_bearer_token(bearer_token,roles_required,auth_type):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    if not bearer_token:
        return make_response(jsonify(error="Token Missing"),401)
    Tok   = bearer_token.split()[1]
    logger.info(f'received token:{Tok},roles_required:{roles_required}',extra=extras)

    cached_response = auth_cache.get(Tok, auth_type, roles_required)
    if cached_response is not None:
        logger.info(f'Extractor_Token : returning cached validate_bearer_token response', extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        return cached_response

    session = get_http_session()
    response = session.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok, 'X-Auth-Type': auth_type },data={'roles_required':roles_required}, timeout=10.0)
    logger.info(f'Extractor_Token : response received from validate_bearer_token : {response.status_code},{response.text}',extra=extras)

    if response.status_code == 200:
        auth_cache.set(Tok, auth_type, roles_required, response.status_code, response.content)

    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return response

def requires_authorization(roles_required=[], auth_type=None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            bearer_token = request.headers.get('Authorization')
            result =  validate_bearer_token(bearer_token,roles_required,auth_type)
            if result.status_code == 429:
                return jsonify({'error':"rate limit reached"}),519
            if result.status_code == 409:
                    return jsonify({"error": "Session Expired"}), 409
            if result.status_code != 200:
                return make_response(jsonify(error= "Unauthorized access"), 401)

            else:
                # You can use custom_param here
                # For example: print(f"Custom param: {custom_param}")
                response_content = json.loads(result.content)
                auth_info = {'current_user':response_content.get('current_user',''),'user_roles':response_content.get('roles',None),'project_id':response_content.get('project_id',None)}
                return func(auth_info,*args,**kwargs)
        return wrapper
    return decorator

    
@app.route('/api/chatservice', methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="custom_jwt")
def apichatservice(auth_info):

    global model_list
    global kernel_pool

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    
    try:
        start_time = datetime.now(timezone.utc)
        params = json.loads(request.data)
        query = params["query"]  
        if isinstance(query,str):
            query = query.strip()
        userId =auth_info.get('current_user') if auth_info.get('current_user') else params["userId"]
        project_id = auth_info.get('project_id',None)
        bot_type = params.get("bot_type", "kumaran")
        system_prompt = params.get("system_prompt",None)
        model = params.get('model','gpt-4o-mini')
        llm_temprature = params.get("temprature",None)
        max_tokens = params.get("max_tokens",None)
        image_responses=None
        response = None 
        db = None 
        PII_digit_count = int(os.getenv("PII_digit_count",7))
        augSrc = list()
     
        if not system_prompt:
            try:
                db = Session()
                project_record  = db.query(Projects.system_prompt).filter(Projects.project_id == project_id, Projects.username == userId).first()
                system_prompt = str(project_record) if project_record else ""
            except Exception as e:
                db.rollback()
                system_prompt=""
                logger.exception(f"DB ERROR in api/chatservice:{ str(e)}",extra=extras)
            finally:
                del project_record
                if db:
                    db.close()

        if model in model_list:
            pass
        else:
            best_match_model = best_candidate(model, model_list, threshold=0.60) 
            model = best_match_model if best_match_model else 'gpt-4o-mini'

        is_claude = "claude" in model.lower()
        if llm_temprature is not None:
            try:
                llm_temprature = float(llm_temprature)
            except (TypeError, ValueError):
                return make_response(jsonify(error="temprature must be a number"), 400)
            if is_claude:
                if llm_temprature>1 or llm_temprature<0:
                    llm_temprature=0.5
            elif "gpt" in model.lower():
                if "gpt-4o-mini" in model.lower():
                    if (llm_temprature>2 or llm_temprature<0):
                        llm_temprature=1
                else:
                    llm_temprature=1
                    pass
        else:
            if  is_claude:
                llm_temprature = 0.5
            elif "gpt" in model.lower():
                llm_temprature = 1 

        if max_tokens is not None:
            if 'gpt' in model.lower():
                return make_response(jsonify(error="GPT family of models no longer support max tokens",model=model), 400)
            try:
                max_tokens = int(max_tokens)
            except (TypeError, ValueError):
                return make_response(jsonify(error="max_token must be a number",model=model), 400)
            
            if max_tokens > 16384:
                max_tokens=4096  
            elif max_tokens < 100:
                max_tokens=4096  
        else:
             max_tokens=4096  


        conv_id = f"{ENV_NAME}_{userId}_{project_id}_CALLS"
        kernel_pool.update_conversation_id_in_plugins(new_conv_id=conv_id)
        logger.info(f"STARTING CONVERSATION IN CONV_ID{conv_id}", extra=extras)
        response, augSrc,tokens_consumed,responseType,image_ids,image_responses = image_conversation(query=query,conv_id=conv_id,bot_type=bot_type,PII_digit_count=PII_digit_count,model=model,prompt = system_prompt,temprature=llm_temprature,max_tokens=max_tokens,kernel_pool=kernel_pool)
        logger.info("Chat successfully saved to Redis", extra=extras) 
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras) 

        if tokens_consumed:
            response_time = (datetime.now(timezone.utc) - start_time).total_seconds()
            response_time = int(response_time)
            start_time_string = str(start_time)
                
            message = {'tokens_consumed': tokens_consumed,'username': userId,'model':model,'project_id':project_id,
                       'user_query':query,'conv_id':conv_id,'start_time':start_time_string,
                       'response_time':response_time,
                       'image_ids':image_ids}
            service_bus = AzureServiceBusAdapter()
            service_bus.send_token_count_to_queue(message)
        return jsonify(response=response,responseType=responseType,augSrc=augSrc,image_responses=image_responses,token_usage=tokens_consumed,model=model,max_tokens=max_tokens,llm_temprature=llm_temprature)  
    except Exception as e:
        logger.exception(f'error occured in chatservice',extra=extras)
        print(traceback.print_exc()) 
        logger.exception(f"Error occured at chatservice: {e}", extra=extras) 
        return make_response(jsonify(error="internal server error",model=model),500)
    finally:
        if db:
            db.close()
        del image_responses
        del response
        kernel_pool.update_conversation_id_in_plugins(new_conv_id='KUMARAN_TEMP_CONV')
        gc.collect()

def format_aug_src_content(aug_src:list):
    for idx, d in enumerate(aug_src,1):
        if isinstance(d,dict):
            for key in list(d.keys()):
                if key.startswith("context"):
                    d[f"context_{idx}"] = d.pop(key)
                    break

@app.errorhandler(429)
def ratelimit_error(e):
    return jsonify(error="Too many requests", details=str(e.description)), 429

@app.teardown_request
def cleanup(exception=None):
    gc.collect()

logger.info('action', extra=extras)
scheduler = BackgroundScheduler()
scheduler.add_job(func=setallenv_variables, trigger="interval", args=[ENV_NAME], minutes=5)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())
atexit.register(shutdown_async_executor)

if __name__ == '__main__':
    app.run()
