from sqlalchemy.orm import sessionmaker
import time
from sqlalchemy import create_engine
from models.tablemodels import DateInfo,BotType,Rating,ResponseTime,ResponseType,UserDetails,LanguageType,GPT_Model
from common_utils.mainqueries import SQLConnection
from dogpile.cache import make_region
from logger import logger,get_caller_frame
from datetime import datetime,timezone
from flask import make_response,jsonify

SERVICE_NAME='CONVERSATIONAL_AI_REPORT'
PROJECT_NAME='CHATBOT'

cache_region = make_region().configure(
    'dogpile.cache.memory'
)

class CacheStorage:

    def __init__(self) -> None:
        session = SQLConnection()
        self.session = session.create_connection()


    def construct_cache_key(self,bot_name):
        return f"{bot_name}_data_{datetime.today().strftime('%Y-%m-%d_%H:%M:%S')}"

    # Caching function
    @cache_region.cache_on_arguments()
    def get_cached_data(self, key = "Custom_key"):
        try:
            extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
                }
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Cache funtion triggered and stored rating, response_time, response_type, date_info, bot_type in storage", extra=extras)
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

            cached_data = cache_region.get(key=key)
            if cached_data is not None:
                cached_data = {
                    "bot_type":bot_type_data,
                    "rating": rating_data,
                    "response_time": response_time_data,
                    "response_type": response_type_data,
                    "dateinfo":dateinfo,
                    "bot_type":bot_type_data,
                    "user_name":username_data,
                    "language_type":language_type,
                    "gpt_model_name":gpt_model_name
                }

                cache_region.set(key, cached_data)
                
                logger.info(f"CONVERSATIONAL-AI-REPORT: Cache fetching successfull in key {key}", extra=extras)
                return cached_data
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred in cache function {e}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Unable to perform cache operation"), 500)
    
    def clear_cache(self, key="Custom_key"):
        try:
            extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
            }
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            cache_region.invalidate(key)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Cleared cache for the key {key}",extra=extras)
            return True
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred in clear_cache {e}", extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return False