import os
import json
from conversationalservice.chat import ConversationPipelineOnMessage
from conversationalservice.gettoken import get_token_info
from logger import logger,get_caller_frame,extras, time_sync_func
from datetime import datetime,timezone
from http_client import http_client
from redis_service.redis_config import RedisClass

TRANSCRIPT_URL = os.getenv("TRANSCRIPT_URL")

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

redis_obj = RedisClass()

class GetConversationCache():
    def __init__(self, conv_id,procedural_resp, userID):
        self.conv_id = conv_id
        self.procedural_resp=procedural_resp
        self.userID = userID
    @time_sync_func('getdatafromredis')
    def getdatafromredis(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        onmessage = ConversationPipelineOnMessage(self.conv_id, self.procedural_resp)
        cache_check = onmessage.checkCache()
        cache_check = cache_check if isinstance(cache_check,str) else json.loads(cache_check.decode("utf-8"))

        if cache_check != "Data Not Available":
            return cache_check
        if not self.getdatafromdb():
            return "Data Not Available"
        cache_check = onmessage.checkCache()
        cache_check = cache_check if isinstance(cache_check,str) else json.loads(cache_check.decode("utf-8"))
        return cache_check
    @time_sync_func('getdatafromdb')
    def getdatafromdb(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

        token_info = get_token_info()
        headers = {"Authorization": "Bearer "+token_info} 
        url = TRANSCRIPT_URL+"chat/history"
        try:         
            params_list={"user_string":self.userID, "conversationID": self.conv_id, "bot_type":"kumaran"}    
            response=http_client.post(url=url,headers=headers,json=params_list)  
            if not response:
                return False
            transcript_response = response.json()
            first_item = transcript_response[0]

            first_item_json = json.dumps(first_item, indent=4)
            
            logger.info(f"GetConversationCache: inserting to redis key:{self.conv_id}", extra=extras)
            redis_obj.insert_keys_to_redis(self.conv_id, first_item_json)
            return True
            
        except Exception as e:
            logger.exception(f"Conversational Sevrice : exception occured in get data from db: {e}", extra=extras)