# from keyvault import setallenv_variables  
from dotenv import load_dotenv
load_dotenv()
from flask import Flask,request,jsonify, send_file,make_response
import os
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
# from base_logger import logger
from logger import logger,get_caller_frame,extras
from keyvault import setallenv_variables
from functools import wraps
from ods import resp_to_ods
import requests
from apscheduler.schedulers.background import BackgroundScheduler
import atexit
from datetime import datetime,timezone
from azure.storage.filedatalake import DataLakeServiceClient
from azure.core.exceptions import ResourceNotFoundError
import json
from azure_blob_service import Azure_blob

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
# ENV_NAME = 'DEV'

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
# HOST_NAME_ENV = "AZURE"
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

from chat import ChatTranscriptStorage, ChatTranscriptEndBlob, Client, BlobChatTranscipt
from flags import *
from mainqueries import *
from utils import *

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



BUILD_VERSION = os.getenv("BUILD_VERSION", 1)
Auth_API_URl = os.getenv("AUTH_URL")
storage_type = os.getenv("storage_type")
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')
chat_threshold = int(os.getenv("chat_threshold",0))
logger.info(f"transcript service endpoints :'AUTH_URL'-'{Auth_API_URl}'",extra=extras)

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_TRANSCRIPT_SERVICE'
PROJECT_NAME='CHATBOT'
VERSION = 'Version 0.1.0'



blob_factory: ChatTranscriptStorage = ChatTranscriptEndBlob()



REDIS_HOST = os.getenv("REDIS_HOST")
REDIS_PORT = os.getenv("REDIS_PORT")
REDIS_DB_LIMIT	= int(os.getenv("REDIS_RATE_LIMIT_DB_NAME"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")

REDIS_URL = f"rediss://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB_LIMIT}"


limiter = Limiter(
    key_func=get_remote_address,  # use IP address as key
    storage_uri=REDIS_URL,  # Redis connection
    app=app,
    default_limits=["40 per minute"],  # global default
)

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
    print(response.text)
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
          #  if not bearer_token or not validate_bearer_token(bearer_token):
                return make_response(jsonify(error= "Unauthorized access"), 401)
            else:
                # You can use custom_param here
                # For example: print(f"Custom param: {custom_param}")
                response_content = json.loads(result.content)
                auth_info = {'current_user':response_content.get('current_user','')}
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
    logger.info(f"Entering {VERSION} {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    logger.info(f"Chat transcript service working for Build Version {BUILD_VERSION}.",extra=extras)
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return f"it is transcript working {ENV_NAME}_{VERSION}_BuildVersion_{BUILD_VERSION}"

@app.route('/user',methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def user(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ['timezone_offset','language_type','bot_type','user_string','start_date','end_date','start_hour','end_hour']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        logger.info(f'date received from user query:{data}',extra=extras)
        bearer_token = request.headers.get('Authorization')
        return conversationRetrival(data,bearer_token)
    except Exception as e:
        #  print(str(e))
         logger.exception(f"Chat transcript Service : error in end point {e}",extra=extras)
         return make_response(jsonify(error='Internal Server Error'),500)
    

@app.route('/chat/history', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def chat_history(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = request.json
        required_fields = ["user_string", "bot_type"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}),422)
        logger.info(f'data received from user query:{data}', extra=extras)
        current_user = auth_info.get('current_user')
        return chatRetrival(data, current_user)

    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)

@app.route('/chat/history/list', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def chat_history_list(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        data = request.json
        required_fields = ["user_string", "bot_type"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}),422)
        current_user = auth_info.get('current_user')
        response = chatRetrival(data, current_user)
        conversations = response.get_json()
        for conv in conversations:
            if not conv.get("conversationName"):
                conversation_list = conv.get("conversation", [])
                if conversation_list:
                    conv["conversationName"] = conversation_list[0].get(
                        "question",
                        "Untitled Conversation"
                    )
            conv.pop("conversation", None)
        return make_response(jsonify(conversations), 200)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in endpoint {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"),500)
        
@app.route('/chat/history/conversation', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def chat_history_conversation(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        data = request.json
        required_fields = ["user_string", "bot_type", "conversation_id"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}),422)
        current_user = auth_info.get('current_user')
        response = chatRetrival(data, current_user)
        conversations = response.get_json()
        conversation_id = data.get("conversation_id")
        selected_conversation = next(
            (
                conv
                for conv in conversations
                if conv.get("conversationID") == conversation_id
            ),
            None
        )
        if not selected_conversation:
            return make_response(jsonify({"error": "Conversation not found"}),404)

        conversation = selected_conversation.get("conversation", [])
        message_ids = [q.get("message_id") for q in conversation if q.get("message_id")]
        likes = getLikesByMessageIds(message_ids)
        for q in conversation:
            q["is_like"] = likes.get(q.get("message_id"))

        return make_response(
            jsonify({
                "conversationID": selected_conversation.get("conversationID"),
                "conversationName": selected_conversation.get("conversationName"),
                "conversation": conversation
            }),200)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in endpoint {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"),500)

@app.route('/chat/history/project/conversations', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def chat_history_project_conversation(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ["user_string", "bot_type", "project_id"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}),422)
        current_user = auth_info.get('current_user')
        page_number = int(request.args.get("page_number", 1))
        page_size = int(request.args.get("page_size", 20))
        current_user = auth_info.get("current_user")
        logger.info(f"username={data.get('user_string')}, project_id={data.get('project_id')}, current_user={current_user}",extra=extras)
        response = chatRetrival(data, current_user)
        # If chatRetrival returns flask response
        conversations = response.get_json()
        # Filter by project_id
        filtered_conversations = [conv for conv in conversations if str(conv.get("project_id")) == str(data.get('project_id'))]
        start_index = (page_number - 1) * page_size
        end_index = start_index + page_size
        paginated_conversations = filtered_conversations[start_index:end_index]
        for conv in paginated_conversations:
            # If conversationName is null, use first question
            if not conv.get("conversationName"):
                conversation_list = conv.get("conversation", [])
                if conversation_list:
                    conv["conversationName"] = conversation_list[0].get(
                        "question",
                        "Untitled Conversation"
                    )
            # Remove conversation array completely
            conv.pop("conversation", None)
        logger.info(f"Found {len(filtered_conversations)} conversations for project_id={data.get('project_id')}",extra=extras)
        return make_response(
            jsonify({
                "project_id": data.get('project_id'),
                "username": data.get('user_string'),
                "total_conversations": len(filtered_conversations),
                "page_number": page_number,
                "page_size": page_size,
                "conversations": paginated_conversations
            }),200)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in endpoint {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"),500)

@app.route('/chat/history/project/conversation', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_project_conversation(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ["user_string", "bot_type", "project_id", "conversation_id"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}),422)
        current_user = auth_info.get('current_user')
        response = chatRetrival(data, current_user)
        conversations = response.get_json()
        conversation = next(
            (
                conv for conv in conversations
                if str(conv.get("project_id")) == str(data.get('project_id'))
                and conv.get("conversationID") == data.get('conversation_id')
            ),
            None
        )
        if not conversation:
            return make_response(jsonify({"error": "Conversation not found"}),404)
        return make_response(jsonify(conversation),200)

    except Exception as e:
        logger.exception(f"Chat transcript service: error in endpoint {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"),500)


@app.route('/transcript/chat/page-by-conversation/<conversation_id>', methods=['GET'])
def find_page_by_conversation(conversation_id):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'find_page_by_conversation',
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
 
    logger.info(
        f"Entering find_page_by_conversation at {datetime.now(timezone.utc)} for ID: {conversation_id}",
        extra=extras
    )
 
    try:
        # Calculate page from database
        sql_factory = SQLFactory()
        page, status = sql_factory.get_conversation_page(conversation_id)
       
        if status == 200:
            return make_response(jsonify({
                "conversationID": conversation_id,
                "page": page
            }), 200)
        elif status == 404:
            return make_response(jsonify({
                "error": f"Conversation ID {conversation_id} not found"
            }), 404)
        else:
            return make_response(jsonify({"error": "Internal Server Error"}), 500)
 
    except Exception as e:
        logger.exception(
            f"Error in find_page_by_conversation: {e}",
            extra=extras
        )
        return make_response(
            jsonify({"error": "Internal Server Error"}),
            500
        )
 

@app.route('/chat/search', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def chat_search(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = request.json
        required_fields = ["user_string", "query"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}),422)
        logger.info(f'data received from user query:{data}', extra=extras)
        current_user = auth_info.get('current_user')
        return chatSearch(data, current_user)

    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)
    

@app.route('/chat/search/result', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def chat_search_result(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = request.json
        required_fields = ["user_string", "conversationID", "date_info", "bot_type"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}),422)
        logger.info(f'data received from user query:{data}', extra=extras)
        current_user = auth_info.get('current_user')
        return chatSearchResult(data, current_user)
    
    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)

@app.route('/user/ods',methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def user_ods():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    data = request.json
    # if 'timezone_offset' not in data:
    #     return jsonify({"error": "Missing timezone_offset in request data"}), 400

    # if 'start_date' not in data or 'end_date' not in data:
    #     return jsonify({"error": "Missing start_date or end_date in request data"}), 400
    required_fields = ['timezone_offset','language_type','bot_type','user_string','start_date','end_date','start_hour','end_hour']
    missing_fields = [field for field in required_fields if field not in data]
    if missing_fields:
        logger.info(f'all the keys are not available missing_fields:{missing_fields}',extra=extras)
        return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)

    timezone_offset = data['timezone_offset']
    start_date = data['start_date']
    end_date = data['end_date']
    language_type=data['language_type']

    bearer_token = request.headers.get('Authorization')
    if "bot_type" in data:
        bot_type = data.get('bot_type')
    else:
        bot_type = 'kumaran'
    response=conversationRetrival(data,bearer_token)
    if response.status_code ==403 or response.status_code == 400:
        # return jsonify(response), status_code
        return response
    # response=response[0]
    print(response)
    data = response.json
    resp_to_ods(data,bot_type,timezone_offset,start_date,end_date,language_type)
    response_file = send_file("chat_transcript.csv", as_attachment=True)
    response_file.headers["Content-Disposition"] = f"attachment; filename=chat_transcript.csv"
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    return response_file


@app.route('/retrieve_conversation',methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def retrieve_conversation(auth_info):
    try:
        data = request.json
        if not all(key in data for key in ["username", "conv_id", "date"]):
            return make_response(jsonify(message="Input missing: username, conv_id, or date"), 412)
        username = data["username"]
        date=  data["date"],
        conv_id= data["conv_id"]
        conv_path = f"{username}/{date[0]}/{conv_id}"
        AZURE_STORAGE_CONNECTION_STRING_CHATBOT = os.getenv("DATA_LAKE_CONNECTION_STRING")
        CONTAINER_NAME = os.getenv("conv_cont_name")
        service_client = DataLakeServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING_CHATBOT)
        file_system_client = service_client.get_file_system_client(file_system=CONTAINER_NAME)
        directory_name = os.getenv("conv_directory_name")
        file_client = file_system_client.get_file_client(f'{directory_name}/{conv_path}')
        file_contents = file_client.download_file().readall()
        file_contents_str = file_contents.decode("utf-8")
        file_contents_dict = json.loads(file_contents_str)
        return make_response(jsonify(file_contents_dict),200)
    except ResourceNotFoundError:
        return make_response(jsonify(error="The requested resource was not found."),500)
    except Exception as e:
        # Catch other exceptions that may occur
        print(f"An error occurred: {e}")
        return make_response(jsonify(error="An unexpected error occurred."),500)

@app.route('/retriveConversation',methods = ['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def retriveConversation(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = request.json
        conversation_id=data["conversation_id"]
        bot_type=data["bot_type"]
        blobChatTranscipt=BlobChatTranscipt()
        response=blobChatTranscipt.retriveConversationFromBlob(bot_type,conversation_id)
        return response
    except Exception as e:
        logger.exception(f'exception occured in retreived conversation',extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)


@app.route('/chat/pinned', methods=['PATCH'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def pinned(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ["conversationID"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}), 422)
        current_user = auth_info.get('current_user')
        return chatPin(data, current_user)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)

@app.route('/chat/delete', methods = ['DELETE'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def delete_conversation(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ["conversationID"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}), 422)
        current_user = auth_info.get('current_user')
        return chatDelete(data, current_user)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)

@app.route('/chat/rename', methods=['PUT'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def rename_conversation_endpoint(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = request.json
        required_fields = ["conversationID", "conversationName"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        current_user = auth_info.get('current_user')
        return chatRename(data, current_user)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)
 

@app.route('/chat/restore', methods=['PATCH'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def restore_conversation(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ["conversationID"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}), 422)
        current_user = auth_info.get('current_user')
        return chatRestore(data, current_user)
    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)

@app.route('/chat/get_image', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_image(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = json.loads(request.data)
        required_fields = [
            'conversation_id','image_id'
        ]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the fields are not available ,missing fields{missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}),422)
        else:
            image_id = data.get("image_id",None)
            conversation_id = data.get("conversation_id",None)
            if image_id and conversation_id:
                blob_object = Azure_blob()
                image_response = blob_object.get_first_image_by_id(conversation_id=conversation_id,image_id=image_id)
                logger.info(f"Image Extracted from blob and Returned", extra=extras)
                if not image_response:
                    return make_response(jsonify(error="Document Not Found"),404)
                return make_response(jsonify(image_response))
            else:
                logger.info(f"Either image_id or conversation_id are None, image_id :{image_id} Conversation ID: {conversation_id}", extra=extras)
                return make_response(jsonify({"error":"One or both of the fields are None"}),422)

    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)
    


@app.route('/chat/get_generated_document', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_generated_document(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = json.loads(request.data)
        required_fields = [
            'conversation_id','generated_document_id'
        ]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the fields are not available ,missing fields{missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}),422)
        else:
            generated_document_id = data.get("generated_document_id",None)
            conversation_id = data.get("conversation_id",None)
            if generated_document_id and conversation_id:
                blob_object = Azure_blob()
                generated_document_response = blob_object.get_first_generated_document_by_id(conversation_id=conversation_id,generated_document_id=generated_document_id)
                logger.info(f"Image Extracted from blob and Returned", extra=extras)
                if not generated_document_response:
                    return make_response(jsonify(error="Document Not Found"),404)
                return make_response(jsonify(generated_document_response))
            else:
                logger.info(f"Either generated_document_id or conversation_id are None, generated_document_id :{generated_document_id} Conversation ID: {conversation_id}", extra=extras)
                return make_response(jsonify({"error":"One or both of the fields are None"}),422)

    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)


@app.route('/chat/get_uploaded_document', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_uploaded_document(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = json.loads(request.data)
        required_fields = ['conversation_id']
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the fields are not available, missing fields {missing_fields}", extra=extras)
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 422)
        else:
            conversation_id = data.get("conversation_id", None)
            user = auth_info.get('current_user') or data.get("user", None)
            if conversation_id:
                blob_object = Azure_blob()
                documents_list = blob_object.get_uploaded_documents(
                    conversation_id=conversation_id,
                    user=user
                )
                logger.info(f"Uploaded Document(s) Extracted from blob and Returned", extra=extras)
                if not documents_list:
                    return make_response(jsonify(error="Document Not Found"), 404)
                return make_response(jsonify({
                    "conversation_id": conversation_id,
                    "total_documents": len(documents_list),
                    "documents": documents_list
                }))
            else:
                logger.info(f"conversation_id is None", extra=extras)
                return make_response(jsonify({"error": "conversation_id is None"}), 422)

    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'), 500)

@app.route('/chat/share', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def create_share_link(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    try:
        data = request.json
        required_fields = ["user_string", "conversationID", "date_info", "bot_type"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            logger.info(f"all the keys are not available missing {missing_fields}", extra=extras)
            return make_response(jsonify({'error':f'Missing required fiels: {", ".join(missing_fields)}'}),422)
        logger.info(f'data received from user query:{data}', extra=extras)
        current_user = auth_info.get('current_user')
        token = create_share_token(
            username=data["user_string"], 
            conversation_id=data["conversationID"], 
            date=data["date_info"],
            bot_type=data["bot_type"]
        )
        share_url = f"/s/{token}"
        return jsonify({
            'success': True,
            'share_url': share_url
        }),200

    except Exception as e:
        logger.exception(f"Chat transcript service: error in end point {e}", extra=extras)
        return make_response(jsonify(error='Internal Server Error'),500)


@app.route('/s/<token>', methods=['GET'])
def get_shared_conversation(token: str):
    try:
        # Decrypt token
        data = decode_share_token(token)
        return chatSearchResult(data)
        
    except Exception as e:
        return jsonify({'error': 'Invalid or expired link'}), 404
    
@app.route('/get_log_file')
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_log_file(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        relative_path = 'transcript.log'
        file_path = os.path.join(*relative_path.split('/'))
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        logger.error(f"Conversation-Service: Exception Occured in get_log_files: {str(e)}", extra=extras)
        return make_response(jsonify(error=str(e),place="get_log_files"),500)

@app.errorhandler(429)
def ratelimit_error(e):
    return jsonify(error="Too many requests", details=str(e.description)), 429


def conversationRetrival(data,bearer_token):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    user_string = data.get("user_string",'').lower()
    start_date =  data.get("start_date")
    end_date = data.get("end_date")
    language_type=data.get("language_type")
    page_number = int(request.args.get("page_number",1))
    page_size = int(request.args.get("page_size",chat_threshold))
    start_hour = data.get("start_hour")
    end_hour = data.get("end_hour")
    if "bot_type" in data:
            bot_type = data.get('bot_type')
    else:
        bot_type = 'kumaran'
    result =  validate_bearer_token(bearer_token)
    print("result", result.text)
    result_json= result.json()
    

    roles = result_json.get('roles')
    
    # print("Roles:", roles)

    if "chatanalyst" not in roles:
        user_string = result_json.get('current_user').lower()
    
    client = Client(blob_factory, user_string, start_date, end_date,page_number,page_size,bot_type,start_hour,end_hour)
    logger.info(f"from user_ods :user_string:{user_string},start_date:{start_date},end_date:{end_date},page_number:{page_number},page_size:{page_size}",extra=extras)
    if storage_type.lower() == "blob":
        logger.info(f"Chat transcript Service : Inside the Blob function, blob storage type - {storage_type}",extra=extras)
        response = client.use_blob(language_type,data,bot_type)
    return response

def chatRetrival(data, current_user):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    user_string = current_user.lower() if current_user else data.get("user_string").lower()
    data['user_string'] = user_string
    bot_type = data.get("bot_type")
    page_number = int(request.args.get("page_number",1))
    page_size = int(request.args.get("page_size", 20))
    client = Client(blob_factory, user_string, page_number, page_size, bot_type)
    logger.info(f"from user_ods: user_string:{user_string}", extra=extras)
    logger.info(f"Chat transcript Service: Inside the Blob function, blob storagte type - {storage_type}", extra=extras)
    response = client.use_blob(data, bot_type)
    return response

scheduler = BackgroundScheduler()
scheduler.add_job(func=setallenv_variables, trigger="interval", args=[ENV_NAME], seconds=300)
scheduler.start()
# Shut down the scheduler when exiting the app
atexit.register(lambda: scheduler.shutdown())

@app.route("/project/list", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def list_conversation_projects(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        data = request.get_json()
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        required_fields = ["bot_type"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(
                jsonify({"error": f'Missing required fields: {", ".join(missing_fields)}'}),422)
        username = data.get("username") or auth_info.get("current_user")
        page = int(data.get("page", 1))
        limit = int(data.get("limit", 10))
        is_pinned = data.get("is_pinned")
        created_at = data.get("created_at")
        updated_at = data.get("updated_at")
        return listConversationProjects(username,page,limit,is_pinned,created_at,updated_at)
    except Exception as e:
        logger.exception(
            f"CONVERSATIONAL-AI-REPORT: Error occurred {e}",extra=extras)
        return make_response(jsonify(error="Unable to fetch projects"),500)
    
@app.route("/project/delete", methods=["DELETE"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def delete_project(auth_info):
    data = request.get_json()

    return deleteProject(
        data,
        auth_info.get("current_user")
    )
@app.route("/project/pin", methods=["PUT"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def pin_project(auth_info):
    data = request.get_json()
    return pinProject(data,auth_info.get("current_user"))

@app.route('/project/share', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def create_project_share_link(auth_info):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        data = request.json
        required_fields = ["project_id"]
        missing_fields = [field for field in required_fields if field not in data]
        if missing_fields:
            return make_response(jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}),422)
        token = create_project_share_token(project_id=data["project_id"],username=auth_info.get("current_user"))
        share_url = f"/project/s/{token}"

        return jsonify({
            "success": True,
            "share_url": share_url
        }), 200

    except Exception as e:
        logger.exception(f"Project share service: error in endpoint {e}",extra=extras)
        return make_response(jsonify(error="Internal Server Error"),500)

@app.route('/project/s/<token>', methods=['GET'])
def get_shared_project(token):
    try:
        data = decode_project_share_token(token)
        return projectSearchResult(data)

    except Exception as e:
        logger.exception(f"Error decoding project token: {e}")
        return make_response(
            jsonify(error="Invalid share link"),400)



@app.route('/project/conversation/move', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def share_conversation_project(auth_info):
    try:
        data = request.get_json()
        return shareConversationProject(data, auth_info.get("current_user"))
    except Exception as e:
        logger.exception(f"Error moving conversation to project: {e}")
        return make_response(jsonify(error="Internal Server Error"), 500)
    
@app.route('/chat/like',methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def question_like(auth_info):
    try:
        data=request.json
        if not all(k in data for k in ["message_id","is_like"]):return make_response(jsonify({"error":"message_id,is_like required"}),422)
        if not isinstance(data.get("is_like"),bool):return make_response(jsonify({"error":"is_like must be true or false"}),422)
        return questionLike(data,auth_info.get("current_user"))
    except Exception as e:
        logger.exception(f"Question Like Error:{e}")
        return make_response(jsonify(error="Internal Server Error"),500)
      
        
if __name__ == '__main__':
    app.run(debug=True, port=4000)