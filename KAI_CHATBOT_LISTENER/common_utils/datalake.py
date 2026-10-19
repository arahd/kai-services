import os
from common_utils.helpers import *
import json
from common_utils.mainqueries import *
from models.tablemodels import *
from cache_storage.redis_storage import *
from logger import logger,get_caller_frame
import json
import os
from types import SimpleNamespace
from sqlalchemy import func
from models.tablemodels import UserGroup

SERVICE_NAME='KAI_CHATBOT_LISTENER_SERVICE'
PROJECT_NAME='KAI'

class AccessConversation:
    def __init__(self,bot_type, db_type, start_date=None) -> None:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
            }
        self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT = os.getenv("DATA_LAKE_CONNECTION_STRING")
        self.CONTAINER_NAME = os.getenv("conv_cont_name")
        self.bot_type = bot_type
        self.db_type = db_type
        logger.info(f'KAI_CHATBOT_LISTENER_SERVICE: container name:{self.CONTAINER_NAME},db_type:{self.db_type}',extra=extras)
        if self.db_type in ["sql","pg"]:
            self.db = SQLConnection()
            self.cache = CacheStorage(self.bot_type)

    def parse_timestamp(self, timestamp):
        formats = [
            "%Y-%m-%d %H:%M:%S.%f+00:00",
            "%Y-%m-%d %H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y:%m:%d:%H:%M:%S",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(timestamp, fmt)
            except ValueError:
                continue
        raise ValueError(f"Unknown timestamp format: {timestamp}")

    def _is_date_valid(self, file_path):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            date_part = file_path.split('/')[-2]
            file_date = datetime.strptime(date_part, '%Y-%m-%d')
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return file_date >= self.start_date
        except ValueError:
            return False
    
    def date_splitter(self,timestamp):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            converted_timestamp = self.parse_timestamp(timestamp)
            date = converted_timestamp.date().strftime('%Y-%m-%d')
            time = converted_timestamp.time().strftime('%H:%M:%S')
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return date,time
        except Exception as e:
            logger.exception(f"KAI_CHATBOT_LISTENER_SERVICE: Error occurred {e}", extra=extras)
            return make_response(jsonify(error="Unable to insert data"), 500)

    def get_conversations(self,file_contents_dict):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            bot_type = self.bot_type
            initializing_cache = self.cache.get_report_cached_data()
            if not isinstance(initializing_cache, dict):
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Error in Initializing cache",extra=extras)
                return initializing_cache
            conv = []
            username_get = []
            user_name = file_contents_dict.get('userID', '').lower()
            help = Helpers(bot_type=bot_type,db_type=self.db_type)
            if user_name not in username_get:
                user_id = help.get_user_id(username=user_name, cached_data=initializing_cache)
                if user_id:
                    username = user_id[0]['_id']
                elif not user_id:
                    user_id = help.username(user_name=user_name)
                    username = user_id['_id']
                username_get.append(user_name)              
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: username check in list {user_name} and id {username}", extra=extras)
            conversation = file_contents_dict.get('conversation')
            logger.info(f"conversation data fetched from the file {conversation}", extra=extras)
            for q in conversation:
                logger.info(f"QUESTION OBJECT={q}", extra=extras)
            if conversation:
                ###-------------------------- updating output token -----------------------------------###
                token_value = 0
                if conversation[-1].get('tokens_consumed').get('total_output_tokens'):
                    token_value = int(conversation[-1].get('tokens_consumed').get('total_output_tokens'))
                    logger.info(f"token value fetched from the file {token_value}", extra=extras)
                condition = {'user_id': user_name}
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: condition for user token update {condition}", extra=extras)
                user = self.db.find_one(tableName=UserTokens, conditions=condition)
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: user token fetched from the table {user}", extra=extras)
                
                if isinstance(user, dict):
                    logger.info("enter isinstanse", extra=extras)
                    input_token_value = int(conversation[-1].get("tokens_consumed", {}).get("total_input_tokens", 0))
                    output_token_value = int(conversation[-1].get("tokens_consumed", {}).get("total_output_tokens", 0))
                    new_input_tokens_used = (user.get("input_tokens_used", 0)+ input_token_value)
                    new_output_tokens_used = (user.get("output_tokens_used", 0)+ output_token_value)
                    new_overall_input_token_usage = user.get("overall_input_token_usage", 0) + input_token_value
                    new_overall_output_token_usage = user.get("overall_output_token_usage", 0) + output_token_value

                    value = {
                        "input_tokens_used": new_input_tokens_used,
                        "output_tokens_used": new_output_tokens_used,
                        "tokens_used": new_input_tokens_used + new_output_tokens_used,
                        "overall_input_token_usage": new_overall_input_token_usage,
                        "overall_output_token_usage": new_overall_output_token_usage
                    }

                    logger.info(f"user token update values --> {value}",extra=extras)
                    self.db.update_one(tableName=UserTokens,updateValues=value,conditions=condition)
                    updated_user = self.db.find_one(tableName=UserTokens,conditions=condition)
                    logger.info(f"UPDATED USER ---> {updated_user}",extra=extras)
                    group_id = user.get("group_id")
                    logger.info(f"grpid:{group_id}",extra=extras)
                    if group_id:
                        logger.info(f"calling update_group_token_usage for group_id={group_id}",extra=extras)
                        self.update_group_token_usage(group_id)

                logger.info("KAI_CHATBOT_LISTENER_SERVICE: output token is updated for the recent response",extra=extras)
                conv_id = file_contents_dict['conversationID']
                timestamp = file_contents_dict['startTime']
                project_id = file_contents_dict['project_id']
                date_str = self.parse_timestamp(timestamp)
                date = date_str.date()
                date_timestamp = date.strftime("%Y-%m-%d %H:%M:%S") + ".000"
                date_id = help.get_date(date=date,cached_data=initializing_cache)
                if not date_id:
                    logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Error in getting date id",extra=extras)
                    raise Exception("Error in getting date id")
                start_time = date_str.strftime("%H:%M:%S")
                start_hour = date_str.hour
                hour_id = help.get_hour(hour=start_hour,cached_data=initializing_cache)
                if not hour_id:
                    logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Error in getting hour_id",extra=extras)
                    raise Exception("Error in getting hour_id")
                start_minute = date_str.minute
                minute_id = help.get_minute(minute=start_minute,cached_data=initializing_cache)
                if not minute_id:
                    logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Error in getting start_minute",extra=extras)
                    raise Exception("Error in getting start_minute")
                end_time_date = conversation[-1]['timestamp']
                _,end_time = self.date_splitter(end_time_date)
                language_type = file_contents_dict.get('language_type','en')
                gpt_model = file_contents_dict.get('gpt_model_name', 'gpt-35-turbo-0125')
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: started for conversation id {conv_id}", extra=extras)
                bot_type_id = help.get_bot_type(bot_type=bot_type,cached_data=initializing_cache)
                language_type_id = help.get_language_type(language_type=language_type,cached_data=initializing_cache)
                gpt_model_id = help.gpt_model_name(gpt_model=gpt_model,cached_data=initializing_cache)
                if not bot_type_id:
                    logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Bot type fetching failed for {bot_type}", extra=extras)
                    raise Exception("Bot type fetching failed")
                file_contents_dict={
                    "conversation_id":conv_id,
                    "date_id":date_id[0]['_id'],
                    "start_time":start_time,
                    "end_time":end_time,
                    "username_id":username,
                    "project_id":project_id,
                    "no_of_questions":len(conversation),
                    "language_type_id":language_type_id[0]['_id'],
                    "gpt_model_id":gpt_model_id[0]['_id'],
                    "bot_type_id": bot_type_id[0]['_id'],
                    "hour_id":hour_id[0]['_id'],
                    "minute_id":minute_id[0]['_id'],
                    "date_timestamp":date_timestamp
                    }
                conversation_insert = self.db.insert_one(tableName=Conversation, data=file_contents_dict)
                if conversation_insert:
                    logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: conversation insertion succeeded in table Conversation for {conv_id} and data {file_contents_dict}", extra=extras)
                    start_index = 0
                    if not isinstance(conversation_insert, bool):
                        start_index = conversation_insert
                    pii_audit_records = []
                    for question_number, questions in enumerate(conversation[start_index:], start = start_index + 1):
                        logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: started fetching in the question level {questions['question']}, question number {question_number} for conversation {conv_id}", extra=extras)
                        if questions.get('tokens_consumed') is not None:
                            input_token = int(questions['tokens_consumed'].get('total_input_tokens', 0))
                            output_token = int(questions['tokens_consumed'].get('total_output_tokens', 0))
                            total_token = input_token + output_token
                        else:
                            input_token = int(questions.get('input_token_count', '0') or '0')
                            output_token = int(questions.get('output_token_count', '0') or '0')
                            total_token = input_token + output_token
                        time_difference = help.convert_time_to_seconds(questions.get('time_difference',"00:00:00"))
                        feedback_value = questions.get('feedback') or '5'
                        response_type = questions.get('responseType', 'normal')
                        reponse_type_check = ["normal","no-content","sensitive","cache"]
                        if response_type == f'{self.bot_type}-questions':
                            response_type = 'normal'
                        elif response_type == 'sensitive-question':
                            response_type = 'sensitive'
                        elif response_type not in reponse_type_check:
                            continue

                        feedback_rating_PK_id = help.get_rating(rating=int(feedback_value),cached_data=initializing_cache)
                        if not feedback_rating_PK_id:
                            logger.error(f'KAI_CHATBOT_LISTENER_SERVICE: Error in getting feedback_rating_PK_id',extra=extras) 
                            raise Exception("Error in getting feedback_rating_PK_id")
                        response_time_PK_id = help.get_response_time(response_time=time_difference, cached_data=initializing_cache)
                        logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: feched response_time id from cache storage {time_difference} and its primary key {response_time_PK_id[0]['_id']}",extra=extras)
                        if not response_time_PK_id:
                            logger.error(f'KAI_CHATBOT_LISTENER_SERVICE: Error in getting response_time_PK_id',extra=extras) 
                            raise Exception("Error in getting response_time_PK_id")
                        response_type_pk_id = help.get_response_type(response_type=response_type, cached_data=initializing_cache)
                        if not response_type_pk_id:
                            response_type_pk_id = [SimpleNamespace(_id=6)]
                        logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: fetching data from cache completed for conversation {conv_id}",extra=extras)
                        conversation_id_fk = self.db.find_one(tableName=Conversation, conditions={"conversation_id":conv_id, "bot_type_id":bot_type_id[0]['_id']})
                        if isinstance(conversation_id_fk, dict):
                            conversation_id_fk_id = conversation_id_fk['_id']
                        else:
                            logger.error(f'KAI_CHATBOT_LISTENER_SERVICE: Error in getting conversation_id_fk',extra=extras)
                            raise Exception("Error in getting conversation_id_fk")
                        question_model_id = help.gpt_model_name(gpt_model=questions.get('model','gpt-4o-mini'),cached_data=initializing_cache)
                        ques_date_timestamp = questions.get('timestamp')
                        ques_date = self.parse_timestamp(ques_date_timestamp).date()
                        ques_date_id = help.get_date(date=ques_date,cached_data=initializing_cache)
                        if not ques_date_id:
                            logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: Error in getting ques_date_id",extra=extras)
                            raise Exception("Error in getting question date id")
                        message_id = questions.get("message_id")
                        message_id = str(message_id).strip()[:100] if message_id else None
                        logger.info(f"question={questions.get('question')} message_id={message_id}",extra=extras)
                        conv.append({
                        "username_id": username,
                        "conversation_id": conversation_id_fk_id,
                        "message_id": message_id,
                        "question_number" : question_number,
                        "date_id": ques_date_id[0]['_id'],
                        "question": f"{questions.get('question', 'NQ')}",
                        "response" : " ",
                        "model_id" : question_model_id[0]['_id'],
                        "rating_id" : feedback_rating_PK_id[0]['_id'],
                        "response_type_id" : response_type_pk_id[0]['_id'],
                        "response_time_id": response_time_PK_id[0]['_id'],
                        "response_time": time_difference,
                        "input_token": input_token,
                        "output_token": output_token,
                        "total_token": total_token
                        })  
                        
                        if questions.get('query_pii_mapping'):
                            pii_audit_records.append({
                                "username": user_name,
                                "conv_id": conv_id,
                                "masked_query": questions.get('masked_query'),
                                "query_pii_mapping": questions.get('query_pii_mapping'),
                                "pii_type_counts": questions.get('pii_type_counts'),
                                "total_masked": len(questions.get('query_pii_mapping', {}))
                            })
                            
                    conversation_insert = self.db.insert_bulk(tableName=Questions, data=conv)
                    
                    if pii_audit_records:
                        self.db.insert_bulk(tableName=QueryPIIAudit, data=pii_audit_records)
                        
                    if conversation_insert:
                        data_entry = help.conversation_tracking(conv_id=conv_id,status="Completed")
                        if data_entry:
                            logger.info(f"conversation id entried in the file {datetime.now()}", extra=extras)
                    else:
                        data_entry = help.conversation_tracking(conv_id=conv_id,status="Failed")
                        if data_entry:
                            logger.info(f"conversation id entried in the file {datetime.now()}", extra=extras)
                        logger.info(f"Bulk insert failed for conversation id {conv_id} with {question_number} questions", extra=extras)
                else:
                    logger.error(f"Conversation insert failed for conversation id {conv_id}", extra=extras)
                    raise Exception("Conversation insert failed")    
            return True
        except Exception as e:
            logger.exception(f"KAI_CHATBOT_LISTENER_SERVICE: Error occurred for conversation id - {e}", extra=extras)
            raise e
        finally:
            if 'help' in locals():
                help.db.session.close()
                help.cache.session.close()
    
    def update_api_service_token_usuage(self,data):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI-CHATBOT-LISTENER-SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            username = data.get('username', '').lower()
            model_name = data.get('model','').lower()
            project_id = data.get('project_id','')
            user_query = data.get('user_query','').lower()
            conv_id = data.get('conv_id','').lower()
            start_time = data.get('start_time','').lower()
            response_time = data.get('response_time',0)
            image_ids = data.get('image_ids','')
            tokens_consumed = data.get('tokens_consumed',dict())
            help = Helpers(bot_type="kumaran",db_type=self.db_type)
            api_user_condition = {'username': username}
            token_update_condition = {'username':username,'project_id':project_id,'model_name':model_name}

            api_user = help.db.find_one(tableName=Projects,conditions=api_user_condition)
            if isinstance(api_user,dict):
                token_count = int(tokens_consumed.get("chat_completion_output_token", 0))
                api_user.update({"tokens_used":api_user.get("tokens_used",0)+token_count})
                api_user.update({"total_tokens_used":api_user.get("total_tokens_used",0)+token_count})
                api_user.update({"requests_used":api_user.get("requests_used",0)+1})
                api_user.update({"total_requests_used":api_user.get("total_requests_used",0)+1})
                help.db.update_one(tableName=Projects,conditions=api_user_condition,updateValues=api_user)
            
            record = help.db.find_one(tableName=ProjectApiTokenUsuage,conditions=token_update_condition)
            if isinstance(record,dict):
                record.update({"total_output_tokens":record.get("total_output_tokens",0)+int(tokens_consumed.get("chat_completion_output_token", 0))})
                record.update({"total_input_tokens":record.get("total_input_tokens",0)+int(tokens_consumed.get("chat_completion_input_token", 0))})
                help.db.update_one(tableName=ProjectApiTokenUsuage,conditions=token_update_condition,updateValues=record)
            else:
                new_record = {
                    'username':username,'project_id':project_id,'model_name':model_name,
                    'total_input_tokens':int(tokens_consumed.get("chat_completion_input_token", 0)),
                    'total_output_tokens':int(tokens_consumed.get("chat_completion_output_token", 0))
                }
                saved_api_usuage_record = help.db.insert_one(tableName=ProjectApiTokenUsuage,data=new_record)
                if not saved_api_usuage_record:
                    raise Exception("ProjectApiTokenUsuage record could not be saved")
            api_call_info ={'conv_id':conv_id,'username':username,'project_id':project_id,
                                                'model_name':model_name,'date_and_time':start_time,
                                                'user_query':user_query,'response':"",
                                                'generated_images':image_ids,'response_time':int(response_time),
                                                'input_tokens':int(tokens_consumed.get("chat_completion_input_token", 0)),
                                                'output_tokens':int(tokens_consumed.get("chat_completion_output_token", 0))}
            saved_api_call =help.db.insert_one(tableName=ProjectAPiCalls,data=api_call_info)
            if not saved_api_call:
                raise Exception("ProjectAPiCalls object could not be saved")
            return True
        except Exception as e:
            help.db.session.rollback()
            logger.exception(f"KAI-CHATBOT-LISTENER-SERVICE: Error occurred for toke update - {e}", extra=extras)
            raise e
        finally:
            help.db.session.close()
            help.cache.session.close()
        
    
    def cache_flush_report(self):
        self.cache.clear_report_cache_data(self.bot_type)
            
    def update_group_token_usage(self, group_id):
        logger.info(f"enter into update_group_token_usage function...",extra=extras)
        totals = (self.db.session.query(func.sum(UserTokens.input_tokens_used).label("total_input"),func.sum(UserTokens.output_tokens_used).label("total_output")).filter(UserTokens.group_id == group_id).first())
        logger.info(f"totals->{totals}",extra=extras)
        group = (self.db.session.query(UserGroup).filter(UserGroup.id == group_id).first())
        logger.info(f"group->{group}",extra=extras)
        logger.info(f"group_id={group_id} total_input={totals.total_input} total_output={totals.total_output}",extra=extras)
        if group:
            total_input = totals[0] or 0
            total_output = totals[1] or 0
            group.daily_input_token_usage = total_input
            group.daily_output_token_usage = total_output
            self.db.session.commit()
        
