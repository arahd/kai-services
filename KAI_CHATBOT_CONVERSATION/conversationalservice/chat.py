import json
import time
import uuid
import os
from azure.storage.blob import BlobServiceClient
import json
from datetime import datetime,timezone
from flask import make_response,jsonify
from abc import ABC, abstractmethod
from flask import jsonify
from .transcript import ChatTranscript
from logger import logger,get_caller_frame,extras, time_sync_func
from .utils import checkSizeToUpdateInDB, extract_date
from azure_service_bus_adapter import AzureServiceBusAdapter
from azure.identity import DefaultAzureCredential

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

ACCOUNT_URL = os.getenv('BLOB_BASE_URL')
credential = DefaultAzureCredential()

class ConversationPipelineStart():
    
    def __init__(self, query, userId, procedural_resp, bot_type, model = 'gpt-4o-mini', language_type='en'):
        self.query = query
        self.userId = userId
        self.procedural_resp=procedural_resp
        self.bot_type = bot_type
        self.language_type = language_type
        self.model = model

    @time_sync_func('initiateChatSession')
    def initiateChatSession(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        conv_id = str(uuid.uuid4())
        conv_prefix = os.getenv('REDIS_CONV_PREFIX')
        if self.model:
            gpt_model_name = self.model
        else:
            gpt_model_name = os.getenv(f"ChatCompletion_GPTModel_{self.bot_type}")
        update_conv_id = f"{conv_prefix}:{conv_id}_{self.bot_type}"
        bot = self.bot_type
        greet = f'Hi, I am {bot.lower()} AI Assistant. How I can help you today?'
        if self.query == "":
            return make_response(jsonify(error="Enter a valid query"),400)
        transcript = ChatTranscript(update_conv_id, self.query,stream=False)
        # Create new chat session
        chat_session = {
            "conversationID":update_conv_id,
            "greetings":greet,
            "userID": self.userId,
            "language_type":self.language_type,
            "bot_type":self.bot_type,
            "gpt_model_name":gpt_model_name
        }
        logger.info(f"initiateChatSession created for: {chat_session}", extra=extras)
        # Store chat session in redis JSON with the token as key
        transcript.createChatSession(update_conv_id,chat_session)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return chat_session

class ConversationPipelineOnMessage():
       
    def __init__(self, conv_id,procedural_resp):
        self.conv_id = conv_id
        self.procedural_resp=procedural_resp

    @time_sync_func('checkCache')
    def checkCache(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        transcript = ChatTranscript(self.conv_id, "",False)
        data = transcript.get_chat_history(self.conv_id)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return data

#------------------Abstract Factory Method---------------
class BlobStorageFactory(ABC):
    @abstractmethod
    def create_blob_storage(self):
        pass

# Concrete factory implementing BlobStorageFactory
class AzureBlobStorageFactory(BlobStorageFactory):
    def create_blob_storage(self):
        return blob_storage()

# Abstract factory interface for ConversationPipelineEnd
class ConversationPipelineFactory(ABC):
    @abstractmethod
    def create_conversation_pipeline(self):
        pass

# Concrete factory implementing ConversationPipelineFactory
class ConversationPipelineEndFactory(ConversationPipelineFactory):
    def create_conversation_pipeline(self):
        return ConversationPipelineEnd()

# Abstract class representing BlobStorage
class BlobStorage(ABC):
    @abstractmethod
    def conversation_to_blob(self, file_name, json_data, username, current_date):
        pass

    @abstractmethod
    def redis_to_blob(self, conv_id):
        pass

#To store in blob
class blob_storage:
    def __init__(self):
        self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT = os.getenv("DATA_LAKE_CONNECTION_STRING")
        self.CONTAINER_NAME = os.getenv("conv_cont_name")

    def _select_directory_name(self,bot_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        directory_map = {
            'kai':os.getenv("conv_directory_name"),
            'kumaran':os.getenv("CONV_DIRECTORY_KUMARAN"),
            'scotia': os.getenv("CONV_DIRECTORY_SCOTIA")
        }
        logger.info(f'directory available:{directory_map},bot_type:{bot_type}',extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return directory_map.get(bot_type,os.getenv("conv_directory_name"))

    #Function to upload conversation to blob
    @time_sync_func('conversation_to_blob')
    def conversation_to_blob(self,file_name,json_data,username,current_date,bot_type,message_adapter):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            retry_count = 0
            max_retries = 3
            while retry_count < max_retries:
                try:
                    logger.info(f'blob storage url:{ACCOUNT_URL}',extra=extras)
                    blob_service_client = BlobServiceClient(account_url = ACCOUNT_URL,credential=credential)
                    service_client = blob_service_client.get_container_client(self.CONTAINER_NAME)
                    directory_name = self._select_directory_name(bot_type)
                    username = username.lower()
                    file_path = f"{directory_name}/{username}/{current_date}/{file_name}.json"
                    logger.info(f'conversation_to_blob file_path:{file_path},directory_name:{directory_name}',extra=extras)
                    file_system_client = service_client.get_blob_client(file_path)
                    logger.info(f'blob client for path {file_path} fetched successfully.',extra=extras)
                    json_string = json.dumps(json_data)
                    pre_processed_data = self.pre_process_message_data(json_data)
                    # Upload the JSON data to the file
                    if pre_processed_data:
                        status = message_adapter.send_message(pre_processed_data)
                        logger.info(f'conversation messsage sent to the service bus queue:{file_path}, status:{status}',extra=extras)
                    else:
                        logger.info(f'conversation is empty:{file_path}',extra=extras)
                    file_system_client.upload_blob(json_string,overwrite=True)
                    blob_client = service_client.get_blob_client(file_path)
                    blob_properties = blob_client.get_blob_properties()

                    logger.info(f"JSON file uploaded successfully. File Path: {file_path}", extra=extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return file_path
                except Exception as e:
                    retry_count+=1
                    time.sleep(1)
                    logger.exception(f'error occured in file upload retry_count: {retry_count} for user : {username}, date:{current_date}, file name:{file_name}',extra=extras)
        except Exception as e:
            logger.exception(f"Conversation_Service: Error in adding conversation from redis to Blob {e} ", extra=extras)
            return False
    @time_sync_func('redisToBlob')   
    def redisToBlob(self, conv_id, bot_type,message_adapter):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            transcript = ChatTranscript(conv_id, "",False)
            data = transcript.get_chat_history(conv_id)
            if data != "Data Not Available":
                json_string = data.decode('utf-8')
                my_dict = json.loads(json_string)
                file_name = my_dict['userID']
                startTime = my_dict.get('startTime')
                current_date = extract_date(timestamp_str=startTime)
                result_path = self.conversation_to_blob(file_name=conv_id,json_data=my_dict,username=file_name,current_date=current_date,bot_type=bot_type,message_adapter=message_adapter)
                if result_path:
                    result = transcript.deleteInRedis(conv_id)
                    return result
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return False
            else:
                 logger.error(f"Conversation_Service: redis to blob Data Not Available for key : {conv_id}", extra=extras)
                 logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                 return result
        except Exception as e:
            logger.error(f"Conversation_Service: Error in adding data from redis to blob : {e}", extra=extras)
    
    def redisToBlobInactiveID(self, bot_type,message_adapter):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        transcript = ChatTranscript("","",False)
        try:
            keyslist = transcript.get_idle_keys()
            if len(keyslist) > 0:
                for key in keyslist:
                        key = key.decode("utf-8")
                        if "_" in key:
                            bot_type = key.split("_")[1]
                        else:
                            bot_type = 'kumaran'
                        data = transcript.get_chat_history(key)
                        result  = False
                        if data != "Data Not Available":
                            json_string = data.decode('utf-8')
                            json_dat = json.loads(json_string)
                            conv_id = json_dat.get("conversationID")
                            file_name = json_dat['userID']
                            startTime = json_dat['startTime']
                            current_date = extract_date(timestamp_str=startTime)
                            result_path = self.conversation_to_blob(file_name=conv_id,json_data=json_dat,username=file_name,current_date=current_date,bot_type=bot_type,message_adapter=message_adapter)
                            if result_path:
                                result = transcript.deleteInRedis(conv_id)
                                logger.info(f"Conversation_Service: redis to blob completed for key :{conv_id}", extra=extras)
                        else:
                            logger.error(f"Conversation_Service: redis to blob Data Not Available for key : {conv_id}", extra=extras)                
                return jsonify(message="Added all idle conversation to Blob")
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return jsonify(message="None of the user conversation are idle for the last 10 minutes")            
        except Exception as e:
            logger.exception("Conversation_Service:Error in adding conversation from redis to blob ", extra=extras)
            error_response = {
                "error": str(e),
                "place": "inactiveendchat"
            }
            response_json = json.dumps(error_response)
            return response_json, 500, {'Content-Type': 'application/json'}
    
    def pre_process_message_data(self,payload):
        conversation_data = payload.get('conversation')
        keys_to_remove = {'semanticVec', 'augSrc', 'augContent'}
        if conversation_data:
            cleaned_conversation_array = [
                    {k: v for k, v in d.items() if k not in keys_to_remove}
                    for d in conversation_data
                ]
            payload['conversation'] = cleaned_conversation_array
            return payload
        else:
            return {}

class ConversationPipelineEnd():
    pass

class Client:
    def __init__(self, blob_storage_factory, conversation_pipeline_factory,conv_id,bot_Type):
        self.blob_storage_factory = blob_storage_factory
        self.conversation_pipeline_factory = conversation_pipeline_factory
        self.conv_id = conv_id
        self.bot_type = bot_Type

    def use_blob_storage(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        blob_storage = self.blob_storage_factory.create_blob_storage()
        message_adapter = self.fetch_message_adapter()
        # Use blob_storage methods as needed
        result = blob_storage.redisToBlob(self.conv_id,self.bot_type,message_adapter)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return result
    
    def use_blob_inactive(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        blob_storage = self.blob_storage_factory.create_blob_storage()
        message_adapter = self.fetch_message_adapter()
        # Use blob_storage methods as needed
        result = blob_storage.redisToBlobInactiveID(self.bot_type,message_adapter)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return result


    def fetch_message_adapter(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        messaging_service = None
        MSG_STACK = os.getenv("MSG_STACK")
        logger.info(f'message adapter provided : {MSG_STACK}',extra=extras)
        if MSG_STACK and MSG_STACK.upper() == "AZURE":
            messaging_service = AzureServiceBusAdapter()
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return messaging_service
    