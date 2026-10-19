from azure.storage.filedatalake import DataLakeServiceClient    
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



SERVICE_NAME='CONVERSATIONAL_AI_REPORT'
PROJECT_NAME='CHATBOT'


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
        logger.info(f'inside access conversation: connection string:{self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT},container name:{self.CONTAINER_NAME},db_type:{self.db_type}',extra=extras)
        if self.db_type in ["sql","pg"]:
            self.db = SQLConnection()
            self.cache = CacheStorage(self.bot_type)

    def _is_date_valid(self, file_path):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            date_part = file_path.split('/')[-2]
            file_date = datetime.strptime(date_part, '%Y-%m-%d')
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return file_date >= self.start_date
        except ValueError:
            return False
    
    def date_splitter(self,timestamp):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            converted_timestamp = datetime.strptime(timestamp, '%Y:%m:%d:%H:%M:%S')
            date = converted_timestamp.date().strftime('%Y-%m-%d')
            time = converted_timestamp.time().strftime('%H:%M:%S')
            logger.info(f"CONVERSATIONAL-AI-REPORT: date from conversation {date}, time {time}", extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return date,time
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Unable to insert data"), 500)
        
    def get_conversations(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            service_client = DataLakeServiceClient.from_connection_string(self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT)
            file_system_client = service_client.get_file_system_client(file_system=self.CONTAINER_NAME)
            helper = Helpers(bot_type=self.bot_type, db_type=self.db_type)
            directory_name = helper._select_directory_name()
            bot_type = self.bot_type
            logger.info(f"CONVERSATIONAL-AI-REPORT: Initializing Helper function with bot type {bot_type}, db type {self.db_type} from directory {directory_name}", extra=extras)
            file_path = f"{directory_name}/"
            directory_client = file_system_client.get_paths(file_path)
            logger.info(f"CONVERSATIONAL-AI-REPORT: File path - {file_path}", extra=extras)
            initializing_cache = self.cache.get_report_cached_data()
            if not isinstance(initializing_cache, dict):
                logger.info(f"CONVERSATIONAL-AI-REPORT: Error in Initializing cache",extra=extras)
                return initializing_cache
            conv = []
            username_get = []
            for path in directory_client:
                file_path = path['name']
                logger.info(f"CONVERSATIONAL-AI-REPORT: File path {file_path}", extra=extras)
                user_name = file_path.split('/')[1]
                logger.info(f"CONVERSATIONAL-AI-REPORT: file path of containers{file_path} for username {user_name}", extra=extras)
                help = Helpers(bot_type=bot_type,db_type=self.db_type)
                if user_name not in username_get:
                    user_id = help.get_user_id(username=user_name, cached_data=initializing_cache)
                    if user_id:
                        username = user_id[0]['_id']
                    elif not user_id:
                        user_id = help.username(user_name=user_name)
                        username = user_id['_id']
                    username_get.append(user_name)              
                    logger.info(f"CONVERSATIONAL-AI-REPORT: username check in list {user_name} and id {username}", extra=extras)
                if self._is_date_valid(file_path):
                    logger.info(f"CONVERSATIONAL-AI-REPORT: started for file path {file_path}", extra=extras)
                    file_client = file_system_client.get_file_client(file_path=file_path)
                    file_contents = file_client.download_file().readall()
                    file_contents_str = file_contents.decode("utf-8")
                    file_contents_dict = json.loads(file_contents_str)
                    conversation = file_contents_dict.get('conversation')
                    if conversation:
                        conv_id = file_contents_dict['conversationID']
                        timestamp = file_contents_dict['startTime']
                        date = datetime.strptime(timestamp.split(' ')[0], "%Y-%m-%d").date()
                        date_id = help.get_date(date=date,cached_data=initializing_cache)
                        if not date_id:
                            logger.info(f"CONVERSATIONAL-AI-REPORT: Error in getting date id",extra=extras)
                            return date_id
                        start_time = datetime.strptime(timestamp.split(" ")[1].split("+")[0], "%H:%M:%S.%f").strftime("%H:%M:%S")
                        start_hour = start_time.split(':')[0]
                        start_minute = start_time.split(':')[1]
                        hour_id = help.get_hour(hour=start_hour,cached_data=initializing_cache)
                        minute_id = help.get_minute(minute=start_minute,cached_data=initializing_cache)
                        if not hour_id:
                            logger.info(f"CONVERSATIONAL-AI-REPORT: Error in getting hour_id",extra=extras)
                            return hour_id
                        end_time_date = conversation[-1]['timestamp']
                        _,end_time = self.date_splitter(end_time_date)
                        language_type = file_contents_dict['language_type']
                        gpt_model = file_contents_dict.get('gpt_model_name', 'gpt-35-turbo-0125')
                        logger.info(f"CONVERSATIONAL-AI-REPORT: started for conversation id {conv_id}", extra=extras)
                        bot_type_id = help.get_bot_type(bot_type=bot_type,cached_data=initializing_cache)
                        language_type_id = help.get_language_type(language_type=language_type,cached_data=initializing_cache)
                        gpt_model_id = help.gpt_model_name(gpt_model=gpt_model,cached_data=initializing_cache)
                        if not bot_type_id:
                            logger.info(f"CONVERSATIONAL-AI-REPORT: Bot type fetching failed for {bot_type}", extra=extras)
                            return bot_type_id
                        data={
                            "conversation_id":conv_id,
                            "date_id":date_id[0]['_id'],
                            "start_time":start_time,
                            "end_time":end_time,
                            "username_id":username,
                            "no_of_questions":len(conversation),
                            "language_type_id":language_type_id[0]['_id'],
                            "gpt_model_id":gpt_model_id[0]['_id'],
                            "bot_type_id": bot_type_id[0]['_id'],
                            "hours_info":hour_id[0]['_id'],
                            "minutes_info":minute_id[0]['_id']
                            }
                        conversation_insert = self.db.insert_one(tableName=Conversation, data=data)
                        if conversation_insert:
                            logger.info(f"CONVERSATIONAL-AI-REPORT: conversation insertion succeeded in table Conversation for {conv_id} and data {data}", extra=extras)
                            for question_number,questions in enumerate(conversation,start=1):
                                logger.info(f"CONVERSATIONAL-AI-REPORT: started fetching in the question level {questions['question']}, question number {question_number} for conversation {conv_id}", extra=extras)
                                if 'tokens_consumed' in questions:
                                    input_token = (questions['tokens_consumed'].get('cumulative_input_token', 0) + questions['tokens_consumed'].get('chat_completion_input_token', 0))
                                    output_token = (questions['tokens_consumed'].get('cumulative_output_token', 0) + questions['tokens_consumed'].get('chat_completion_output_token', 0))
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
                                # response_type_pk_id = help.get_response_type(response_type=response_type, cached_data=initializing_cache)
                                logger.info(f"CONVERSATIONAL-AI-REPORT: Data to be inserted in question table with input token {input_token},output token {output_token},total token {total_token},time difference {time_difference},feedback value {feedback_value},response type {response_type}, for conversation {conv_id}",extra=extras)
                                
                                feedback_rating_PK_id = help.get_rating(rating=int(feedback_value),cached_data=initializing_cache)
                                logger.info(f"CONVERSATIONAL-AI-REPORT: feched rating id from cache storage {feedback_value} and its primary key {feedback_rating_PK_id[0]['_id']}",extra=extras)
                                if not feedback_rating_PK_id: return feedback_rating_PK_id

                                response_time_PK_id = help.get_response_time(response_time=time_difference, cached_data=initializing_cache)
                                logger.info(f"CONVERSATIONAL-AI-REPORT: feched response_time id from cache storage {time_difference} and its primary key {response_time_PK_id[0]['_id']}",extra=extras)
                                if not response_time_PK_id: return response_time_PK_id
                                response_type_pk_id = help.get_response_type(response_type=response_type, cached_data=initializing_cache)
                                if not response_type_pk_id: 
                                    response_type_pk_id = [SimpleNamespace(_id=6)]
                                logger.info(f"CONVERSATIONAL-AI-REPORT: feched response_type from cache storage {response_type} and its primary key {response_type_pk_id[0]['_id']}",extra=extras)

                                logger.info(f"CONVERSATIONAL-AI-REPORT: fetching data from cache completed for conversation {conv_id}",extra=extras)
                                conversation_id_fk = self.db.find_one(tableName=Conversation, conditions={"conversation_id":conv_id, "bot_type_id":bot_type_id[0]['_id']})
                                if isinstance(conversation_id_fk, dict):
                                    conversation_id_fk_id = conversation_id_fk['_id']
                                else:
                                    return conversation_id_fk
                                conv.append({
                                "username_id": username,
                                "conversation_id": conversation_id_fk_id,
                                "question_number" : question_number,
                                "question": f"{questions.get('question', 'NQ')}",
                                "response" : f"{questions.get('response', 'NA')}",
                                "rating_id" : feedback_rating_PK_id[0]['_id'],
                                "response_type_id" : response_type_pk_id[0]['_id'],
                                "response_time_id": response_time_PK_id[0]['_id'],
                                "response_time": time_difference,
                                "input_token": input_token,
                                "output_token": output_token,
                                "total_token": total_token
                                })  
                            conversation_insert = self.db.insert_bulk(tableName=Questions, data=conv)
                            if conversation_insert:
                                data_entry = help.conversation_tracking(conv_id=conv_id,status="Completed")
                                if data_entry:
                                    logger.info(f"conversation id entried in the file {datetime.now()}", extra=extras)
                                logger.info(f"Bulk conversation inserted for conversation id {conv_id} with {question_number} questions", extra=extras)
                            else:
                                data_entry = help.conversation_tracking(conv_id=conv_id,status="Failed")
                                if data_entry:
                                    logger.info(f"conversation id entried in the file {datetime.now()}", extra=extras)
                                logger.info(f"Bulk insert failed for conversation id {conv_id} with {question_number} questions", extra=extras)
                        else:
                            logger.info(f"Conversation insert failed for conversation id {conv_id}", extra=extras)    
            return True
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred for conversation id {conv_id} for date {date}- {e}", extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Unable to Perform Operation"), 500)


    def get_conversations1(self,file_contents_dict):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            bot_type = self.bot_type
            logger.info(f"CONVERSATIONAL-AI-REPORT: Initializing Helper function with bot type {bot_type}, db type {self.db_type}", extra=extras)
            initializing_cache = self.cache.get_report_cached_data()
            if not isinstance(initializing_cache, dict):
                logger.info(f"CONVERSATIONAL-AI-REPORT: Error in Initializing cache",extra=extras)
                return initializing_cache
            conv = []
            username_get = []
            user_name = file_contents_dict.get('userID')
            help = Helpers(bot_type=bot_type,db_type=self.db_type)
            if user_name not in username_get:
                user_id = help.get_user_id(username=user_name, cached_data=initializing_cache)
                if user_id:
                    username = user_id[0]['_id']
                elif not user_id:
                    user_id = help.username(user_name=user_name)
                    username = user_id['_id']
                username_get.append(user_name)              
                logger.info(f"CONVERSATIONAL-AI-REPORT: username check in list {user_name} and id {username}", extra=extras)
            conversation = file_contents_dict.get('conversation')
            if conversation:
                conv_id = file_contents_dict['conversationID']
                timestamp = file_contents_dict['startTime']
                date = datetime.strptime(timestamp.split(' ')[0], "%Y-%m-%d").date()
                date_timestamp = datetime.strptime(timestamp.split(" ")[0] + " " + timestamp.split(" ")[1].split("+")[0], "%Y-%m-%d %H:%M:%S.%f").strftime("%Y-%m-%d %H:%M:%S")+ ".000"
                date_id = help.get_date(date=date,cached_data=initializing_cache)
                if not date_id:
                    logger.info(f"CONVERSATIONAL-AI-REPORT: Error in getting date id",extra=extras)
                    return date_id
                start_time = datetime.strptime(timestamp.split(" ")[1].split("+")[0], "%H:%M:%S.%f").strftime("%H:%M:%S")
                start_hour = int(start_time.split(':')[0])
                hour_id = help.get_hour(hour=start_hour,cached_data=initializing_cache)
                if not hour_id:
                    logger.error(f"CONVERSATIONAL-AI-REPORT: Error in getting hour_id",extra=extras)
                    return hour_id
                start_minute = int(start_time.split(':')[1])
                minute_id = help.get_minute(minute=start_minute,cached_data=initializing_cache)
                if not minute_id:
                    logger.error(f"CONVERSATIONAL-AI-REPORT: Error in getting start_minute",extra=extras)
                    return start_minute
                end_time_date = conversation[-1]['timestamp']
                _,end_time = self.date_splitter(end_time_date)
                language_type = file_contents_dict['language_type']
                gpt_model = file_contents_dict.get('gpt_model_name', 'gpt-35-turbo-0125')
                logger.info(f"CONVERSATIONAL-AI-REPORT: started for conversation id {conv_id}", extra=extras)
                bot_type_id = help.get_bot_type(bot_type=bot_type,cached_data=initializing_cache)
                language_type_id = help.get_language_type(language_type=language_type,cached_data=initializing_cache)
                gpt_model_id = help.gpt_model_name(gpt_model=gpt_model,cached_data=initializing_cache)
                if not bot_type_id:
                    logger.info(f"CONVERSATIONAL-AI-REPORT: Bot type fetching failed for {bot_type}", extra=extras)
                    return bot_type_id
                file_contents_dict={
                    "conversation_id":conv_id,
                    "date_id":date_id[0]['_id'],
                    "start_time":start_time,
                    "end_time":end_time,
                    "username_id":username,
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
                    logger.info(f"CONVERSATIONAL-AI-REPORT: conversation insertion succeeded in table Conversation for {conv_id} and data {file_contents_dict}", extra=extras)
                    for question_number,questions in enumerate(conversation,start=1):
                        logger.info(f"CONVERSATIONAL-AI-REPORT: started fetching in the question level {questions['question']}, question number {question_number} for conversation {conv_id}", extra=extras)
                        if 'tokens_consumed' in questions:
                            input_token = (questions['tokens_consumed'].get('cumulative_input_token', 0) + questions['tokens_consumed'].get('chat_completion_input_token', 0))
                            output_token = (questions['tokens_consumed'].get('cumulative_output_token', 0) + questions['tokens_consumed'].get('chat_completion_output_token', 0))
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
                        logger.info(f"CONVERSATIONAL-AI-REPORT: Data to be inserted in question table with input token {input_token},output token {output_token},total token {total_token},time difference {time_difference},feedback value {feedback_value},response type {response_type}, for conversation {conv_id}",extra=extras)
                        
                        feedback_rating_PK_id = help.get_rating(rating=int(feedback_value),cached_data=initializing_cache)
                        logger.info(f"CONVERSATIONAL-AI-REPORT: feched rating id from cache storage {feedback_value} and its primary key {feedback_rating_PK_id[0]['_id']}",extra=extras)
                        if not feedback_rating_PK_id: return feedback_rating_PK_id

                        response_time_PK_id = help.get_response_time(response_time=time_difference, cached_data=initializing_cache)
                        logger.info(f"CONVERSATIONAL-AI-REPORT: feched response_time id from cache storage {time_difference} and its primary key {response_time_PK_id[0]['_id']}",extra=extras)
                        if not response_time_PK_id: return response_time_PK_id
                        response_type_pk_id = help.get_response_type(response_type=response_type, cached_data=initializing_cache)
                        if not response_type_pk_id: 
                            response_type_pk_id = [SimpleNamespace(_id=6)]
                        logger.info(f"CONVERSATIONAL-AI-REPORT: feched response_type from cache storage {response_type} and its primary key {response_type_pk_id[0]['_id']}",extra=extras)

                        logger.info(f"CONVERSATIONAL-AI-REPORT: fetching data from cache completed for conversation {conv_id}",extra=extras)
                        conversation_id_fk = self.db.find_one(tableName=Conversation, conditions={"conversation_id":conv_id, "bot_type_id":bot_type_id[0]['_id']})
                        if isinstance(conversation_id_fk, dict):
                            conversation_id_fk_id = conversation_id_fk['_id']
                        else:
                            return conversation_id_fk
                        conv.append({
                        "username_id": username,
                        "conversation_id": conversation_id_fk_id,
                        "question_number" : question_number,
                        "question": f"{questions.get('question', 'NQ')}",
                        "response" : f"{questions.get('response', 'NA')}",
                        "rating_id" : feedback_rating_PK_id[0]['_id'],
                        "response_type_id" : response_type_pk_id[0]['_id'],
                        "response_time_id": response_time_PK_id[0]['_id'],
                        "response_time": time_difference,
                        "input_token": input_token,
                        "output_token": output_token,
                        "total_token": total_token
                        })  
                    conversation_insert = self.db.insert_bulk(tableName=Questions, data=conv)
                    if conversation_insert:
                        data_entry = help.conversation_tracking(conv_id=conv_id,status="Completed")
                        if data_entry:
                            logger.info(f"conversation id entried in the file {datetime.now()}", extra=extras)
                        logger.info(f"Bulk conversation inserted for conversation id {conv_id} with {question_number} questions", extra=extras)
                    else:
                        data_entry = help.conversation_tracking(conv_id=conv_id,status="Failed")
                        if data_entry:
                            logger.info(f"conversation id entried in the file {datetime.now()}", extra=extras)
                        logger.info(f"Bulk insert failed for conversation id {conv_id} with {question_number} questions", extra=extras)
                else:
                    logger.info(f"Conversation insert failed for conversation id {conv_id}", extra=extras)    
            return True
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred for conversation id {conv_id} for date {date}- {e}", extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Unable to Perform Operation"), 500)
    
    def cache_flush_report(self):
        self.cache.clear_report_cache_data(self.bot_type)
