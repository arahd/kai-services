import time
from models.tablemodels import DateInfo,BotType,Rating,ResponseTime,ResponseType,UserDetails,LanguageType,GPT_Model,Hours,Minutes
from common_utils.mainqueries import SQLConnection
from logger import logger,get_caller_frame
from datetime import datetime,timezone
from flask import make_response,jsonify
from redis_service.redis_config import Redis


SERVICE_NAME='CONVERSATIONAL_AI_REPORT'
PROJECT_NAME='CHATBOT'


class CacheStorage:

    def __init__(self,bot_type) -> None:
        session = SQLConnection()
        self.session = session.session
        self.bot_type = bot_type
        self.r_obj = Redis()
        self.r_client = self.r_obj.connect()

    def get_report_cached_data(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Cache funtion triggered and stored rating, response_time, response_type, date_info, bot_type in storage", extra=extras)
            cached_data={}
            cached_data_availability = self.r_obj.is_report_cache_redis_empty(self.r_client,self.bot_type)
            if cached_data_availability==0:
                rating_data = self.session.query(Rating).all()
                response_time_data = self.session.query(ResponseTime).all()
                response_type_data = self.session.query(ResponseType).all()
                time.sleep(1)
                dateinfo = self.session.query(DateInfo).all()
                bot_type_data = self.session.query(BotType).all()
                username_data = self.session.query(UserDetails).all()
                time.sleep(1)
                language_type = self.session.query(LanguageType).all()
                gpt_model_name = self.session.query(GPT_Model).all()
                hours_info = self.session.query(Hours).all()
                minutes_info = self.session.query(Minutes).all()
                cached_data = {
                    "bot_type":[row.to_dict() for row in bot_type_data],
                    "rating": [row.to_dict() for row in rating_data],
                    "response_time": [row.to_dict() for row in response_time_data],
                    "response_type": [row.to_dict() for row in response_type_data],
                    "dateinfo":[row.to_dict() for row in dateinfo],
                    "bot_type":[row.to_dict() for row in bot_type_data],
                    "user_name":[row.to_dict() for row in username_data],
                    "language_type":[row.to_dict() for row in language_type],
                    "gpt_model_name":[row.to_dict() for row in gpt_model_name],
                    "hours_info":[row.to_dict() for row in hours_info],
                    "minutes_info":[row.to_dict() for row in minutes_info]
                }
                self.r_obj.redis_report_cache_flushDB(self.r_client,self.bot_type)
                self.r_obj.insert_report_cache_data_to_redis(cached_data,self.r_client,bot_type=self.bot_type)
            else:
                cached_data = self.r_obj.retrieve_all_report_cache_key_values(self.r_client,bot_type=self.bot_type)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Cache fetching successfull", extra=extras)
            return cached_data
                
                
            
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred in cache function {e}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Unable to perform cache operation"), 500)
        

    
    def clear_report_cache_data(self,bot_type):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
                }
        result = self.r_obj.redis_report_cache_flushDB(r_client=self.r_client,bot_type=bot_type)
        logger.info(f'cache report cleared status :{result}',extra=extras)
