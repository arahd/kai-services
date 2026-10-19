import json
import os
from http_client import http_client
from redis_service.redis_config import RedisClass
from logger import logger,get_caller_frame,extras, time_sync_func
from flask import jsonify,make_response
from datetime import datetime,timezone
from contextservice.token_tracker import TokenTracker
from typing import TypeAlias

Vector: TypeAlias = list[float]

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

token_tracker = TokenTracker()

redis_obj = RedisClass()

redis = RedisClass()
json_client = redis.connect()
CACHE_ENDPOINT = os.getenv("CACHE_ENDPOINT")
CNT_MGMT_SERVICE_ENDPOINT=os.getenv('CNT_MGMT_SERVICE_ENDPOINT')
CNT_MGMT_COMM_TOKKEN = os.getenv("CNT-MGMT-COMM-TOKKEN")
CHIT_CHAT_URL = os.getenv("Chit_Chat_URL")
SENSITIVE_FILTER_URL = os.getenv("SENSITIVE_FILTER_URL")
ADDUSERFEEDBACK=os.getenv("ADDUSERFEEDBACK")

logger.info(f"conversation service endpoints: 'CACHE_ENDPOINT':'{CACHE_ENDPOINT}','CNT_MGMT_SERVICE_ENDPOINT':'{CNT_MGMT_SERVICE_ENDPOINT}','CHIT_CHAT_URL':'{CHIT_CHAT_URL}','SENSITIVE_FILTER_URL':'{SENSITIVE_FILTER_URL}'",extra=extras)

class ChatTranscript():
        
    def __init__(self, conv_id, query,stream=False,procedural_resp=False,bot_type=None,db_type=None,user_role=None,language_type='en',generated_image_ids=None,image_prompt=None,image_consumed_tokens=None):
        self.conv_id = conv_id
        self.question = query
        self.procedural_resp = procedural_resp
        self.bot_type = bot_type
        self.db_type=db_type
        self.user_role=user_role
        self.stream=stream
        self.language_type = language_type
        self.topic_name = None
        self.generated_image_ids = generated_image_ids
        self.image_model_tokens = image_consumed_tokens
        self.image_prompt =image_prompt
            
    def updateStreamResponse(self,start_time,buffer_response):
        history = self.get_chat_history(self.conv_id)
        history = json.loads(history)
        history['conversation'][-1]['response']=buffer_response
        key = str(self.conv_id)
        data = json.dumps(history)
        redis_obj.insert_keys_to_redis(key,data)
        return history   

    @time_sync_func('updateTranscript')
    def updateTranscript(self, start_time, response, model, response_type,augContent,augSrc, tokens_consumed,generated_image_ids,image_tokes_used=None,image_prompt=None,user_role=None,uploaded_files=None,
                         generated_document_prompt=None,generated_documents_tokens_consumed=None,generated_document_ids=None, project_id = None, masked_query=None, query_pii_mapping=None, pii_type_counts=None,message_id = None):
        try:
            extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name': 'kumaran'
            }
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

            if not self.question.strip():
                return json.dumps({"response": "Enter a valid query", "responseType": "invalid-input"})

            # Get previous conversation
            history = self.get_chat_history(self.conv_id)
            history = json.loads(history) if history and not isinstance(history,str) else {"conversation": []}
            data = self.updateConversation(response=response, responseType=response_type,augContent=augContent,augSrc= augSrc, tokens_consumed= tokens_consumed,model=model,generated_image_ids=generated_image_ids,image_tokes_used=image_tokes_used,image_prompt=image_prompt,user_role=user_role,uploaded_files=uploaded_files,generated_document_ids=generated_document_ids,generated_document_prompt=generated_document_prompt,generated_documents_tokens_consumed=generated_documents_tokens_consumed, masked_query=masked_query, query_pii_mapping=query_pii_mapping, pii_type_counts=pii_type_counts,message_id=message_id)
            end_time = datetime.now(timezone.utc)
            time_difference = self.time_difference(start_time,end_time)
            data['time_difference'] = time_difference
            chat_session={}
            # ---- Append current turn to conversation ----
            if "conversation" in history:
                history['conversation'].append(data)
            else:
                chat_session = {"conversation" : [data]}
                
            merged_dict = {**history, **chat_session,'language_type':self.language_type}
            sorted_dict = sorted(merged_dict['conversation'], key=lambda d: d['timestamp']) 
            del merged_dict['conversation']
            sorted_ = {'conversation':sorted_dict}
            merge_sorted = {**merged_dict, **sorted_}
            key = str(self.conv_id)
            merge_sorted['gpt_model_name']=model
            merge_sorted['project_id'] = project_id
            data = json.dumps(merge_sorted)
            logger.info(f"updateTranscript: inserting to redis key:{key} payload_snippet:{data[:200]}", extra=extras)
            redis_obj.insert_keys_to_redis(key,data)
            return json.dumps(data)
        except Exception as e:
            logger.exception(f"Error in updateTranscript: {str(e)}", extra=extras)
            return json.dumps({"Message": f"Error occurred: {str(e)}"})
    @time_sync_func('updateConversation')
    def updateConversation(self,response, responseType,augContent,augSrc, tokens_consumed, model,generated_image_ids,image_tokes_used=None,image_prompt=None,user_role=None,uploaded_files=None, generated_document_prompt=None,generated_documents_tokens_consumed=None,generated_document_ids=None, masked_query=None, query_pii_mapping=None, pii_type_counts=None,message_id = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        current_time = datetime.now(timezone.utc)
        data  = {
            "message_id": message_id,
            "timestamp" : current_time.strftime("%Y:%m:%d:%H:%M:%S"),
            "question":self.question,
            "model":model,
            "augContent" : augContent, 
            "augSrc" : augSrc,
            "response" : response,
            "user_role":user_role,
            "responseType" : responseType,
            "tokens_consumed":tokens_consumed,
            "generated_image_ids":generated_image_ids,
            "image_prompt":image_prompt,
            "image_tokens_used":image_tokes_used,
            "uploaded_files":uploaded_files,
            "generated_document_prompt":generated_document_prompt,
            "generated_documents_tokens_consumed":generated_documents_tokens_consumed,
            "generated_document_ids":generated_document_ids,
            "masked_query": masked_query,
            "query_pii_mapping": query_pii_mapping,
            "pii_type_counts": pii_type_counts
        }
        return data

    def updateFeedback(self, rating, comment, additionalComment):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        history = self.get_chat_history(self.conv_id)
        history = json.loads(history)
        
        if "conversation" in history:
            prevconversations = history["conversation"]
            feedbacklastrecord = prevconversations.pop(-1)
            feedbacklastrecord.pop('feedback')
            feedbacklastrecord.pop('feedbackComment')
            feedbacklastrecord.pop('additionalComment')
            feedbacklastrecord.update(feedback = rating, feedbackComment = comment, additionalComment = additionalComment)
            history['conversation'].append(feedbacklastrecord)
            key = str(self.conv_id)
            data = json.dumps(history)
            logger.info(f"updateFeedback: inserting feedback to redis key:{key}", extra=extras)
            redis_obj.insert_keys_to_redis(key,data)
            
    def conversationFeedback(self, rating, feedback_comment, additional_comment,feedback_type,response_type,feedback_flag,feedback_options_id,language_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        with self.db as db_obj:
            history = self.get_chat_history(self.conv_id)
            history = json.loads(history) 
        
            givenBy=history["userID"]
            if "conversation" in history:
                prevconversations = history["conversation"]
                feedbacklastrecord = prevconversations[-1]
                question=feedbacklastrecord["question"]
                response=feedbacklastrecord["response"]
                if self.db_type in ["sql","pg"]:
                    given_by_username=db_obj.find_one(self.user,{"username":givenBy},self.bot_type).get("_id")
                conditions={
                    "conversation_id":self.conv_id,
                    "rating":rating,
                    "additional_comment":additional_comment,
                    "feedback_comment":feedback_comment,
                    "given_by":given_by_username,
                    "question":question,
                    "response":response,
                    "feedback_type":feedback_type,
                    "response_type":response_type,
                    "feedback_flag":feedback_flag,
                    "feedback_options_id":feedback_options_id,
                    "language_type":language_type,
                    "bot_type":self.bot_type
                }
                token=os.getenv("CNT-MGMT-COMM-TOKKEN")
                headers = {
                            "Authorization":"Bearer "+ token,  
                            "Content-Type": "application/json"
                           }
                response = http_client.post(ADDUSERFEEDBACK, json=conditions, headers=headers)
                logger.info(f"Response from User Feedback : {response}",extra=extras)
                self.updateFeedback(rating,feedback_comment,additional_comment)
                if response.status_code==200:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message":"Thanks for your valuable feedback"}),200)
                else:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error":"Failed to add feedback"}),500)

    @time_sync_func('createChatSession')
    def createChatSession(self, conv_id, chat_session):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        createdTime = {"startTime": str(datetime.now(timezone.utc))}
        chat_session.update(createdTime)
        key = str(self.conv_id)
        data = json.dumps(chat_session)
        logger.info(f"createChatSession: inserting to redis key:{key} payload_snippet:{data[:200]}", extra=extras)
        redis_obj.insert_keys_to_redis(key, data)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return chat_session

    @time_sync_func('getChatHistory')
    def get_chat_history(self, conv_id):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        data = redis_obj.fetch_key_data(conv_id)
        if data == None:
            data = "Data Not Available"
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return data

    def get_idle_keys(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        batch_size = 100
        keys_batch = []
        idlekeyslist = []
        idletime = os.getenv("IDLE_TIME")
        conv_prefix = os.getenv('REDIS_CONV_PREFIX')
        conv_prefix_search = f"{conv_prefix}*"
        keys_fetched = redis_obj.fetch_keys(conv_prefix_search)
        for key in keys_fetched:
            keys_batch.append(key)
            if len(keys_batch) >= batch_size:
                for k in keys_batch:
                    response = redis_obj.idle_check(idletime,k)
                    # idle time is in seconds
                    if response:
                        idlekeyslist.append(k)
                keys_batch = []
        if keys_batch:
            for k in keys_batch:
                response = redis_obj.idle_check(idletime,k)
                # idle time is in seconds
                if response:
                    idlekeyslist.append(k)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return idlekeyslist    

    def checkKeyExists(self,key):
        key_exists = redis_obj.key_exists_check(key)
        if key_exists:
             return True
        else:
             return False

    def deleteInRedis(self, key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        # Check if the key exists
        key_exists = redis_obj.key_exists_check(key)

        if key_exists:
            redis_obj.delete_key(key)
            logger.info(f'The key "{key}" exists in Redis.', extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return True
        else:
            logger.info(f'The key "{key}" does not exist in Redis.', extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return False

    def time_difference(self,start_time,end_time):
        diff = end_time - start_time

        hours = diff.seconds // 3600
        minutes = (diff.seconds // 60) % 60
        seconds = diff.seconds % 60
        time_difference = f"{hours:02}:{minutes:02}:{seconds:02}"
        return time_difference
    
    def add_log_token(self,ques,prompt_type,response,ConversationID,token_tracker:TokenTracker,call_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        try:
            x = response.value[0]
            output_token_count=x.inner_content.usage.completion_tokens
            input_token_count=x.inner_content.usage.prompt_tokens
            token_tracker.update_tokens(input_tokens=input_token_count,output_tokens=output_token_count,call_type=call_type)
            logger.info(f'{prompt_type}: token management: output_token:{output_token_count}, input_output_token:{input_token_count}, unique_id:{ConversationID} ',extra=extras)
            return "ok"
        except Exception as e:
            logger.exception(f'exception occured in token logging try1',extra=extras)
        try:
            x = json.loads(response.content)
            output_token_count=x.inner_content.usage.completion_tokens
            input_token_count=x.inner_content.usage.prompt_tokens
            token_tracker.update_tokens(input_tokens=input_token_count,output_tokens=output_token_count,call_type=call_type)
            logger.info(f'{prompt_type}: token management: output_token:{output_token_count}, input_output_token:{input_token_count}, unique_id:{ConversationID} ',extra=extras)
            return "ok"
        except Exception as e:
            logger.exception(f'exception occured in token logging try2',extra=extras)

    def check_is_digit(self,text=''):
        if text and text.isdigit():
            return True
        else:
            return False



