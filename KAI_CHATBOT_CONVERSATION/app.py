import os
import json
import asyncio
import atexit
import uuid
from dotenv import load_dotenv
load_dotenv()
from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from datetime import datetime,timezone
from functools import wraps
from keyvault import setallenv_variables
from pii_masker import mask_pii, unmask_pii
from http_client import http_client
from profiler import FlaskProfilerMiddleware

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'
VERSION='v0.0.64'
from logger import logger,get_caller_frame,extras, track_time, time_async_func, time_sync_func,start_request_timing, log_request_summary
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

from conversationalservice.chat import ConversationPipelineStart, ConversationPipelineOnMessage, AzureBlobStorageFactory, ConversationPipelineEndFactory, Client
from conversationalservice.transcript import ChatTranscript
from custom_utils.async_utils import shutdown_async_executor
from conversation_flow import image_conversation
from conversationalservice.getcache import GetConversationCache
from custom_utils.azure_blob_service import Azure_blob
from azure_service_bus_adapter import AzureServiceBusAdapter
from tableModels import Session, UserTokens, ConfigData, ChatProject,UserGroup

# creates Flask object
app = Flask(__name__)
CORS(app)

# ─── Enable OpenTelemetry Flask HTTP Request Tracking ───
try:
    from opentelemetry.instrumentation.flask import FlaskInstrumentor
    FlaskInstrumentor().instrument_app(app)
except Exception as exc:
    pass

# Enable profiling only in dev (not production)
PROFILING_ENABLED = os.getenv("ENABLE_PROFILING", False)
if PROFILING_ENABLED:
    app.wsgi_app = FlaskProfilerMiddleware(app.wsgi_app, enabled=True)

# your allowed origin
ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS")
ALLOWED_ORIGINS = ALLOWED_ORIGINS.split(",")
CORS(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}})

#       Kernel Pooling Part
#############################################################################
from agent_framework.exceptions import ChatClientException

from agent_pool_context_helper import current_conv_id,current_model_name,current_generated_image_ids,current_generated_document_ids,current_uploaded_filenames,current_aug_source,current_aug_content,current_aug_tables,current_domain_filters,current_user_id

from simple_agent_pool import SimpleAgentPool
from agent_pooling import AgentPool

from chat_summarization import run_summarization_workflow
from suggest_follow_up import suggested_follow_ups_new


STAGE3_RECENT_TURNS = int(os.getenv("STAGE3_RECENT_TURNS"))
STAGE2_MAX_TURNS    = int(os.getenv("STAGE2_MAX_TURNS"))
PII_ALLOWED_ENV = os.getenv("PII_ALLOWED_ENV")



gpt_4_series_model = os.getenv("GPT_4_SERIES_MODEL","gpt-4o-mini")
gpt_5_series_model = os.getenv("GPT_5_SERIES_MODEL","")
claude_sonnet_series_model = os.getenv("CLAUDE_SONNET_SERIES_MODEL","")
claude_opus_series_model = os.getenv("CLAUDE_OPUS_SERIES_MODEL","")
kimi_2_series_model = os.getenv("KIMI_2_MODEL_NAME","")
kimi_3_series_model = os.getenv("KIMI_3_MODEL_NAME","")

model_list:list[str] = [gpt_4_series_model,gpt_5_series_model,claude_sonnet_series_model,claude_opus_series_model,kimi_2_series_model,kimi_3_series_model]
simple_agent_pool = SimpleAgentPool(model_list=model_list)
agent_pool = AgentPool(model_list=model_list,blob_object=Azure_blob(),simple_agent_pool=simple_agent_pool)
service_bus = AzureServiceBusAdapter()

@app.before_request
def check_origin():
    # ─── RESET timing at the very start of each request ───
    start_request_timing()
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
@app.after_request
def log_timing_tree(response):
    log_request_summary()
    return response

#Config for redis to blob
storage_type = os.getenv("storage_type")
REDIS_HOST = os.getenv("REDIS_HOST")
REDIS_PORT = os.getenv("REDIS_PORT")
REDIS_DB_LIMIT	= int(os.getenv("REDIS_RATE_LIMIT_DB_NAME"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
REDIS_URL = f"rediss://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_LIMIT}"

limiter = Limiter(
                    key_func=get_remote_address,
                    storage_uri=REDIS_URL,
                    app=app,
                    default_limits=["30 per minute"],
                )

Auth_API_URl = os.getenv("AUTH_URL")
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')
KAI_CHATBOT_DEV_ADMIN = os.getenv('KAI_CHATBOT_DEV_ADMIN','')

@app.route('/', methods = ['GET'])
def hello():
   extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
   logger.info(f"Entering Ver {extras['functionname']} at {datetime.now(timezone.utc)}, Version: {VERSION} running",extra=extras)
   return jsonify(status=f"Conversational Service {VERSION} running",ENV=ENV_NAME,Storage=storage_type,BUILD_VERSION=BUILD_VERSION,APP_VERSION=APP_VERSION)

@time_sync_func('validate_bearer_token')
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
    response = http_client.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok, 'X-Auth-Type': auth_type },data={'roles_required':roles_required})
    logger.info(f'Extractor_Token : response received from validate_bearer_token : {response.status_code}',extra=extras)
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
                response_content = json.loads(result.content)
                #checking if any of the user's groups match the required roles
                user_groups = response_content.get("groups", [])
                if roles_required:
                    if not any(role in user_groups for role in roles_required):
                        return make_response(jsonify(error="Unauthorized access"),
                            401
                        )
                auth_info = {'current_user':response_content.get('current_user',''),'user_roles':response_content.get('roles',None)}
                return func(auth_info,*args,**kwargs)
        return wrapper
    return decorator

@app.route('/chatservice', methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="chatservice")
@time_sync_func('image_chatservice')
def image_chatservice(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    global agent_pool

    word_list = list()
    try:
        start_time = datetime.now(timezone.utc)
        params = json.loads(request.data)
        query = params["query"]  
        if isinstance(query,str):
            query = query.strip()
        model = params.get('model')
        available_models_max_token_limit = {"claude-opus-4.5":200000,"claude-opus-4.6":1000000,"claude-sonnet-4.5":200000,"claude-sonnet-4.6":1000000,"gpt-4o-mini":128000,"gpt-5-mini":400000,"GPT-5":400000,"GPT-5.1":400000}
        model_max_token = available_models_max_token_limit.get(model,100000)
        model_max_token = model_max_token if model_max_token<= 300000 else 300000
        world_list = [x for x in query.split(" ") if x != ""]
        try:
            if (model_max_token*0.60)<(len(world_list)*1.75):
                logger.info("User Query exceeded Input limit", extra=extras)
                return make_response(jsonify(error="Query Exceeds input limit for the current model"),413) 
        except Exception as e:
            logger.info("Unexpected Error when calculating tokens", extra=extras)   

        userId = auth_info.get('current_user') if auth_info.get('current_user') else params["userId"]
        user_id_set_token = current_user_id.set(userId)

        user_roles = auth_info.get("user_roles",None)
        allow_sensitive = auth_info.get("allow_sensitive",False)
        bot_type = params.get("bot_type", "kumaran")
        language_type = params.get("language_type","en")
        procedural_resp = params.get("procedural_resp",False)
        is_stream = params.get('is_stream',False)
        is_from_upload = params.get('is_from_upload',False)
        uploaded_document_ids = params.get('uploaded_doc_ids',list())
        uploaded_filenames = params.get('uploaded_file_names',list())
        uploaded_docs = params.get('uploaded_docs', list())
        exceeds_threshold = params.get('exceeds_threshold', None)

        existing_document_ids = params.get('existing_doc_ids', list())
        existing_filenames = params.get('existing_filenames',list())
        existing_docs = params.get('existing_docs', list())
        existing_threshold = params.get('existing_threshold',list())
        project_id = params.get('project_id', None)
        implement_diagram = params.get('implement_diagram', False)
        if not isinstance(implement_diagram, bool):
            implement_diagram = False
        if not isinstance(is_stream,bool):
            is_stream = False
        augSrc = []  
        response = None
        augContent = ''
        
        if "conversationID" in params:
            mapping={}
            type_counts={}
            if ENV_NAME in PII_ALLOWED_ENV :
                            query, mapping, type_counts = mask_pii(query, prefix="QUERY")
                            logger.info(f"masked query : {query}",extra=extras)
            conv_id = params["conversationID"]
            cache_obj = GetConversationCache(conv_id, procedural_resp, userId)
            cache_check = cache_obj.getdatafromredis()
            if cache_check != "Data Not Available" and isinstance(cache_check,dict):
                logger.info("Conv Id is available in redis cache", extra=extras)
                existing_summary = cache_check.get("summary")
                conversation_turns = cache_check.get("conversation", [])
                if existing_summary:
                    logger.info(f"Stage-3 Active: Truncating history context to last {STAGE3_RECENT_TURNS} turns.", extra=extras)
                    cache_check["conversation"] = conversation_turns[-STAGE3_RECENT_TURNS:]
                else:
                    if len(conversation_turns) > STAGE2_MAX_TURNS:
                        logger.warning(
                            f"No summary available. Truncating history to fallback limit of "
                            f"last {STAGE2_MAX_TURNS} turns to control latency and costs.", 
                            extra=extras
                        )
                        cache_check["conversation"] = conversation_turns[-STAGE2_MAX_TURNS:]
                    else:
                        logger.info("No summary available, but history length is within safety limits. No truncation required.", extra=extras)
                                
                conv_id_set_token=current_conv_id.set(conv_id)
                model_name_set_token = current_model_name.set(model)
                generated_image_ids_set_token = current_generated_image_ids.set(list())
                generated_document_ids_set_token = current_generated_document_ids.set(list())
                aug_source_set_token = current_aug_source.set(list())
                aug_content_set_token = current_aug_content.set(list())
                aug_tables_set_token = current_aug_tables.set(list())
                domain_filters_set_token = current_domain_filters.set(dict())
                all_filenames_list = []
                for fn in list(uploaded_filenames or []) + list(existing_filenames or []):
                    if fn and fn not in all_filenames_list:
                        all_filenames_list.append(fn)
                uploaded_filenames_set_token=current_uploaded_filenames.set(all_filenames_list)
                response, augSrc, augContent, tokens_consumed, responseType, image_ids, image_responses, images_metadata, generated_document_ids, generated_document_response, generated_document_metadata, doc_pii_mapping = image_conversation(
                    query=query,
                    conv_id=conv_id, 
                    bot_type=bot_type, 
                    is_from_upload=is_from_upload, 
                    cache_check=cache_check, 
                    model=model,
                    uploaded_document_ids=uploaded_document_ids, 
                    allow_sensitive=allow_sensitive, 
                    uploaded_filenames=uploaded_filenames, 
                    uploaded_docs=uploaded_docs,
                    exceeds_threshold=exceeds_threshold,
                    existing_docs=existing_docs,
                    existing_doc_ids=existing_document_ids,
                    existing_filenames=existing_filenames,
                    existing_threshold=existing_threshold,
                    agent_pool=agent_pool,
                    stage_summary=existing_summary,
                    implement_diagram=implement_diagram
                )

                conv_obj = ConversationPipelineOnMessage(conv_id, procedural_resp)
                with track_time('ChatTranscript_init'):
                    transcript = ChatTranscript(
                        conv_id=conv_id, query=query, bot_type=bot_type, 
                        procedural_resp=procedural_resp, stream=is_stream, 
                        user_role=user_roles, language_type=language_type, 
                        generated_image_ids=image_ids, 
                        image_consumed_tokens=images_metadata.get("image_tokens_usuage", None), 
                        image_prompt=images_metadata.get("image_prompt", None)
                    )
                message_id = str(uuid.uuid4())
                logger.info(f"message_id generated: {message_id}", extra=extras)
                save_result = transcript.updateTranscript(
                    start_time, response, model, response_type=responseType, 
                    augContent=augContent, augSrc=augSrc, tokens_consumed=tokens_consumed, 
                    generated_image_ids=image_ids, image_tokes_used=images_metadata.get("image_tokens_usuage", None), 
                    image_prompt=images_metadata.get("image_prompt", None), user_role=user_roles, 
                    uploaded_files=uploaded_filenames, generated_document_ids=generated_document_ids, 
                    generated_document_prompt=generated_document_metadata.get("generated_document_prompt", ""), 
                    generated_documents_tokens_consumed=generated_document_metadata.get("generated_document_prompt", ""),
                    project_id = project_id,
                    masked_query=query,
                    query_pii_mapping=mapping,
                    pii_type_counts=type_counts,
                    message_id=message_id
                ) 
                
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                if ENV_NAME in PII_ALLOWED_ENV:
                    combined_mapping = {**mapping, **doc_pii_mapping}
                    response = unmask_pii(response, combined_mapping)

                if is_stream and response:
                    return jsonify(response=response, responseType=responseType, conversationID=conv_id, message_id=message_id, augContent=augContent, augSrc=augSrc, image_responses=image_responses, generated_document_response=generated_document_response)
                else:
                    return jsonify(response=response, responseType=responseType, conversationID=conv_id, message_id=message_id, augContent=augContent, augSrc=augSrc, image_responses=image_responses, generated_document_response=generated_document_response) 
            else: 
                return jsonify({"error":"Your conversation session has been expired. Please start a new one"}),419 
        else:
            with track_time('ConversationPipelineStart_init'):
                convstart = ConversationPipelineStart(query=query, userId=userId, procedural_resp=procedural_resp, bot_type=bot_type, language_type=language_type, model = model)
            conv_id_set_token=current_conv_id.set("TEMP_KAI_CONVID")
            model_name_set_token = current_model_name.set("TEMP_KAI_MODEL")
            generated_image_ids_set_token = current_generated_image_ids.set(list())
            generated_document_ids_set_token = current_generated_document_ids.set(list())
            uploaded_filenames_set_token = current_uploaded_filenames.set(list())
            aug_source_set_token = current_aug_source.set(list())
            aug_content_set_token = current_aug_content.set(list())
            aug_tables_set_token = current_aug_tables.set(list())
            domain_filters_set_token = current_domain_filters.set(dict())
            response = convstart.initiateChatSession() 
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras) 
            return response
    
    except ChatClientException as ce:
        ce = ce.__cause__
        error_type = ce.code
        error_message = ce.message
        error_status_code=500
        if 'connection error' in error_message.lower():
            error_status_code=503
        else:
            error_status_code = ce.status_code
        logger.exception(f"Root Cause: {error_type}, error status code:{error_status_code},{error_message}",extra=extras)
        return make_response(jsonify(error=error_type,message=error_message),error_status_code)

    except Exception as e:
        logger.exception(f"Error occured at chatservice: {e}", extra=extras)
        root_cause = str(e)
        root_cause_status_code = 500
        try:
            try:
                if e.__context__:
                    root_cause = str(e.__context__.body.get("message",root_cause))
                    root_cause_status_code  = e.__context__.status_code
                    if not root_cause:
                        root_cause = str(e.__context__.message)
            except Exception as exception_parsing_exception_level_1:
                logger.exception(f"Exception when trying to find root cause of another exception, new exception : {exception_parsing_exception_level_1}", extra=extras)
                try:
                    if e.__context__:
                        root_cause = str(e.__context__.message)
                except Exception as exception_parsing_exception_level_2:
                    logger.exception(f"Exception when trying to find root cause of another exception, new exception : {exception_parsing_exception_level_2}", extra=extras)
        except Exception as e3:
            root_cause = str(e)
            root_cause_status_code = root_cause_status_code if root_cause_status_code else 500
        return make_response(jsonify(error="internal server error",root_cause=root_cause),root_cause_status_code)
    finally:
        agent_pool.reset_plugin_token_consumption()
        current_conv_id.reset(conv_id_set_token)
        current_model_name.reset(model_name_set_token)
        current_generated_image_ids.reset(generated_image_ids_set_token)
        current_generated_document_ids.reset(generated_document_ids_set_token)
        current_uploaded_filenames.reset(uploaded_filenames_set_token)
        current_aug_source.reset(aug_source_set_token)
        current_aug_content.reset(aug_content_set_token)
        current_aug_tables.reset(aug_tables_set_token)
        current_domain_filters.reset(domain_filters_set_token)
        current_user_id.reset(user_id_set_token)
        del word_list
    
@app.route('/suggested-follow-ups', methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="sso")
def followUpQuestions(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    
    global simple_agent_pool

    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        raw_data = request.data
        logger.info(f"Received /suggested-follow-ups request. Raw payload size: {len(raw_data) if raw_data else 0} bytes", extra=extras)

        try:
            params = json.loads(raw_data) if raw_data else {}
        except Exception as json_err:
            logger.error(f"Failed to parse request JSON payload: {json_err}. Raw payload snippet: {raw_data[:200] if raw_data else None}", extra=extras)
            return jsonify({"error": "Invalid JSON body"}), 400

        bot_type = params.get("bot_type", "kumaran")
        procedural_resp = False

        if "conversationID" in params:
            conv_id = params["conversationID"]
            extras['conv_id'] = conv_id
            logger.info(f"Processing follow-up questions for conversationID: {conv_id}, bot_type: {bot_type}", extra=extras)

            with track_time("check cache"):
                onmessage = ConversationPipelineOnMessage(conv_id, procedural_resp)
                cache_check = onmessage.checkCache()

            logger.info(f"Cache check completed for conv_id: {conv_id}. Raw cache data type: {type(cache_check).__name__}", extra=extras)

            if cache_check is None or cache_check == "Data Not Available":
                logger.warning(f"Cache miss or session expired for conv_id: {conv_id}. Cache output: {cache_check}", extra=extras)
                return jsonify({"error": "Your conversation session has been expired. Please start a new one"}), 419

            # Safely handle cache_check output across different return types (str, bytes, dict)
            if isinstance(cache_check, bytes):
                try:
                    cache_check = json.loads(cache_check.decode("utf-8"))
                    logger.info(f"Decoded bytes cache data to JSON dict for conv_id: {conv_id}", extra=extras)
                except Exception as cache_decode_err:
                    logger.error(f"Failed to decode bytes cache data for conv_id: {conv_id}: {cache_decode_err}", extra=extras)
            elif isinstance(cache_check, str):
                try:
                    cache_check = json.loads(cache_check)
                    logger.info(f"Parsed string cache data to JSON dict for conv_id: {conv_id}", extra=extras)
                except Exception:
                    logger.info(f"Cache data for conv_id: {conv_id} is a plain string", extra=extras)

            if isinstance(cache_check, dict):
                conversation_data = cache_check.get("conversation", [])
                logger.info(f"Retrieved conversation_data for conv_id: {conv_id}. Message count: {len(conversation_data) if isinstance(conversation_data, list) else 'invalid_type'}", extra=extras)
            else:
                conversation_data = []
                logger.warning(f"cache_check is not a dictionary after parsing for conv_id: {conv_id}. Value type: {type(cache_check).__name__}", extra=extras)

            if simple_agent_pool is None:
                logger.error(f"simple_agent_pool is None/uninitialized in followUpQuestions for conv_id: {conv_id}!", extra=extras)

            logger.info(f"Invoking suggested_follow_ups_new for conv_id: {conv_id}", extra=extras)
            response = asyncio.run(suggested_follow_ups_new(
                conversation_data=conversation_data,
                agent_pool=simple_agent_pool,
                model_name="gpt-4o-mini"
            ))
            logger.info(f"Successfully generated follow-up questions for conv_id: {conv_id}. Response: {response}", extra=extras)
            return jsonify(response) 
        else:
            logger.warning(f"Missing conversationID in request params: {list(params.keys())}", extra=extras)
            return jsonify({"error": "Missing conversationID."}), 400 

    except Exception as e:
        logger.exception(f"Error occurred in followUpQuestions for conv_id: {extras.get('conv_id', 'unknown')}: {str(e)}", extra=extras)
        return make_response(jsonify(error="internal server error"), 500)

@app.route('/endchat', methods =['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="sso")
def endchat(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        params = json.loads(request.data)
        if "conversationID" in params:
            conv_id = params["conversationID"]
            bot_type = conv_id.split("_")[1]
            blob_storage_factory = AzureBlobStorageFactory()
            conversation_pipeline_factory = ConversationPipelineEndFactory()
            client = Client(blob_storage_factory, conversation_pipeline_factory,conv_id,bot_type)
            if storage_type.lower() == "blob":
                logger.info(f"Conversational-service : blob storage type - {storage_type}", extra=extras)
                result = client.use_blob_storage()
            if result:
                response = {"message": "Conversation Ended"}
                return jsonify(response)
            else:
                response = {"message": "Key not available in cache"}
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return jsonify(response)
        else:
            response = {"message": "No Conversation Found"}
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return jsonify(response)
    except Exception as e:
        logger.exception(f"Conversational-service : Error occured at endchat {e}", extra=extras)

@app.route('/inactiveendchat', methods =['GET'])
@requires_authorization(roles_required=[], auth_type="sso")
def inactiveendchat(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        blob_storage_factory = AzureBlobStorageFactory()
        conversation_pipeline_factory = ConversationPipelineEndFactory()
        client = Client(blob_storage_factory, conversation_pipeline_factory,conv_id=None,bot_Type=None)
        if storage_type.lower() == "blob":
            logger.info(f"Conversational-service : blob storage type - {storage_type}", extra=extras)
            response = client.use_blob_inactive()
        if response:
                response = {"message": "Conversation Ended"}
                return jsonify(response)
        else:
            response = {"message": "Key not available in cache"}
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return jsonify(response)
    except Exception as e:
        logger.exception(f"Conversational-service : Error occured at endchat {e}", extra=extras)

@app.route('/fetch-prompt', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def get_general_chat_prompt(auth_info):
    try:
        db = Session()
        data = request.get_json()
        prompt_key = data.get("prompt_name")
        record = db.query(ConfigData).filter(
            ConfigData.key == prompt_key
        ).first()
        if not record:
            return jsonify({"error": "Prompt not found"}), 404
        return jsonify({
            "message": "Prompt Fetched successfully",
            "prompt_name": record.key,
            "content": record.value
        })
    except Exception as e:
        logger.exception(f"Error in get_general_chat_prompt: {str(e)}")
        return jsonify({"error": "internal server error"}), 500
    finally:
            db.close()

@app.route('/update-prompt', methods=['PUT'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def update_general_chat_prompt(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    try:
        db = Session()
        data = request.get_json()
        prompt_key = data.get("prompt_name")
        content = data.get("content")
        if not prompt_key:
            return jsonify({"error": "prompt_name is required"}), 400
        if content is None:
            return jsonify({"error": "content is required"}), 400
        prompt_record = db.query(ConfigData).filter(
            ConfigData.key == prompt_key
        ).first()
        if not prompt_record:
            return jsonify({"error": "Prompt not found"}), 404
        prompt_record.value = content
        db.commit()
        logger.info(f"{prompt_key} prompt updated successfully",extra=extras)
        return jsonify({"message": "Prompt updated successfully","prompt_name": prompt_key})
    except Exception as e:
        db.rollback()
        logger.exception(f"Error in update_general_chat_prompt: {str(e)}",extra=extras)
        return jsonify({"error": "internal server error"}), 500
    finally:
        db.close()

@app.route('/summarization', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="chatservice")
def summarization_api(auth_info):  
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'summarization_api',
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    global simple_agent_pool

    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        params = json.loads(request.data)
    except Exception as e:
        logger.error(f"Failed to parse request JSON: {e}", extra=extras)
        return make_response(jsonify(error="Invalid JSON payload"), 400)

    conv_id = params.get("conversationID")
    if not conv_id:
        return make_response(jsonify(error="Missing parameter: conversationID"), 400)

    userID = auth_info.get('current_user') or params.get("userId") or params.get("userID")
    if not userID:
        return make_response(jsonify(error="Missing parameter: userId"), 400)

    bot_type = params.get("bot_type", "kumaran")
    procedural_resp = params.get("procedural_resp", False)
    extras['bot_name'] = bot_type
    cache_manager = GetConversationCache(conv_id, procedural_resp, userID)
    master_document = cache_manager.getdatafromredis()
    try:
        result = asyncio.run(run_summarization_workflow(conv_id, bot_type, master_document,agent_pool=simple_agent_pool,model_name="gpt-4o-mini"))
        
        if result.get("status") == "failed":
            return jsonify(result), 500
            
        return jsonify(result), 200
        
    except Exception as e:
        logger.exception(f"Error executing summarization workflow: {e}", extra=extras)
        return make_response(jsonify(error="internal server error"), 500)

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
def force_run_garbage_collector(exception=None):
    import gc
    gc.collect()

logger.info('action', extra=extras)
scheduler = BackgroundScheduler()
scheduler.add_job(func=setallenv_variables, trigger="interval", args=[ENV_NAME], minutes=5)
scheduler.start()
# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())
atexit.register(shutdown_async_executor)

@app.route('/project/create', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="sso")
def create_chat_project(auth_info):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
    db = Session()
    try:
        params = json.loads(request.data)
        project_name = (params.get("project_name") or "").strip()
        if not project_name:
            return make_response(jsonify(error="project_name is required"), 422)
        username = auth_info.get('current_user')
        existing = db.query(ChatProject).filter(
            ChatProject.username == username,
            ChatProject.project_name == project_name
        ).first()
        if existing:
            return make_response(jsonify(error="Project name already exists"), 409)
        new_project = ChatProject(project_name=project_name, username=username)
        db.add(new_project)
        db.commit()
        logger.info(f"Created project {project_name} for {username}", extra=extras)
        return jsonify({"message": "Project created", "project": new_project.to_dict()}), 201
    except Exception as e:
        db.rollback()
        logger.exception(f"Error creating project: {e}", extra=extras)
        return make_response(jsonify(error="internal server error"), 500)
    finally:
        db.close()

@app.route('/project/rename', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER], auth_type="sso")
def rename_chat_project(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    db = Session()
    try:
        params = json.loads(request.data)
        project_id = params.get("project_id")
        new_project_name = (params.get("project_name") or "").strip()
        if not project_id:
            return make_response(jsonify(error="project_id is required"),422)
        if not new_project_name:
            return make_response(jsonify(error="project_name is required"),422)
        username = auth_info.get('current_user')
        project = db.query(ChatProject).filter(
            ChatProject.id == project_id,
            ChatProject.username == username
        ).first()

        if not project:
            return make_response(jsonify(error="Project not found"),404)
        existing_project = db.query(ChatProject).filter(
            ChatProject.username == username,
            ChatProject.project_name == new_project_name,
            ChatProject.id != project_id
        ).first()
        if existing_project:
            return make_response(jsonify(error="Project name already exists"),409)
        old_project_name = project.project_name
        project.project_name = new_project_name
        project.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(project)
        logger.info(f"Project renamed from {old_project_name} to {new_project_name} for {username}",extra=extras)
        return make_response(
            jsonify({
                "message": "Project renamed successfully",
                "project": project.to_dict()
            }),200)
    except Exception as e:
        db.rollback()
        logger.exception( f"Error renaming project: {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"), 500)
    finally:
        db.close()
 
@app.route('/admin/group/create', methods=['POST'])
@requires_authorization(
    roles_required=[KAI_CHATBOT_DEV_USER],
    auth_type="sso"
)
def create_user_group(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    db = Session()

    try:
        params = json.loads(request.data)

        group_name = (params.get("group_name") or "").strip()
        input_token_limit = params.get("input_token_limit", 0)
        output_token_limit = params.get("output_token_limit", 0)

        if not group_name:
            return make_response(
                jsonify(error="group_name is required"),
                422
            )

        existing_group = db.query(UserGroup).filter(
            UserGroup.group_name == group_name
        ).first()

        if existing_group:
            return make_response(
                jsonify(error="Group already exists"),
                409
            )

        group = UserGroup(
            group_name=group_name,
            input_token_limit=input_token_limit,
            output_token_limit=output_token_limit
        )

        db.add(group)
        db.commit()
        db.refresh(group)

        return make_response(
            jsonify({
                "message": "User group created successfully",
                "group": {
                "group_id": group.group_id,
                "group_name": group.group_name,
                "input_token_limit": group.input_token_limit,
                "output_token_limit": group.output_token_limit
            }
            }),
            201
        )

    except Exception as e:
        db.rollback()
        logger.exception(
            f"Error creating user group: {e}",
            extra=extras
        )
        return make_response(
            jsonify(error="Internal Server Error"),
            500
        )

    finally:
        db.close()
        
        
@app.route('/admin/group/update', methods=['POST'])
@requires_authorization(
    roles_required=[KAI_CHATBOT_DEV_USER],
    auth_type="sso"
)
def update_user_group(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    db = Session()

    try:
        params = json.loads(request.data)

        group_id = params.get("group_id")

        if not group_id:
            return make_response(
                jsonify(error="group_id is required"),
                422
            )

        group = db.query(UserGroup).filter(
            UserGroup.group_id == group_id
        ).first()

        if not group:
            return make_response(
                jsonify(error="Group not found"),
                404
            )

        if "input_token_limit" in params:
            group.input_token_limit = params["input_token_limit"]

        if "output_token_limit" in params:
            group.output_token_limit = params["output_token_limit"]

        group.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(group)

        return make_response(
            jsonify({
                "message": "Group limits updated successfully",
                "group": {
                "group_id": group.group_id,
                "group_name": group.group_name,
                "input_token_limit": group.input_token_limit,
                "output_token_limit": group.output_token_limit
            }
            }),
            200
        )

    except Exception as e:
        db.rollback()
        logger.exception(f"Error updating user group: {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"),500)

    finally:
        db.close()


if __name__ == '__main__':
    app.run()
