import redis
import os
import json
import redis.exceptions
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone
from tenacity import retry, stop_after_attempt, wait_fixed 

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

class RedisClass():
    redis_client = None
    _instance = None  

    def __new__(cls, *args, **kwargs):  
        if not cls._instance:  
            cls._instance = super(RedisClass, cls).__new__(cls)  
            # Initialize your database connection here  
            cls._instance.initialize(*args, **kwargs)  
        return cls._instance


    def initialize(self):
        self.REDIS_HOST = os.getenv("REDIS_HOST")
        self.REDIS_PORT = os.getenv("REDIS_PORT")
        self.REDIS_DB_CONV	= int(os.getenv("REDIS_DB_CONV"))
        self.REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
        self.report_conv_prefix = os.getenv('REDIS_REPORT_PREFIX')
        self.connect()


    def connect(self):
        print(self.REDIS_HOST, self.REDIS_PORT,self.REDIS_DB_CONV, self.REDIS_PASSWORD,self.report_conv_prefix)
        RedisClass.redis_client = redis.Redis(host=self.REDIS_HOST,
                                port=self.REDIS_PORT, db=self.REDIS_DB_CONV, password=self.REDIS_PASSWORD, ssl=True)
        return RedisClass.redis_client


    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    def redis_ping(self):  
        try:  
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
            redis_ping_response = RedisClass.redis_client.ping()  
            logger.info(f'redis_ping_response details:{redis_ping_response}',extra=extras)   
        except redis.exceptions.ConnectionError as e:  
            logger.error(f"Error connecting to Redis: {e}",extra=extras) 
            self.connect()
            raise


    def insert_keys_to_redis(self,key,data):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.redis_ping()
        json_payload = json.loads(data)
        user_id = json_payload.get("userID")
        if not user_id:
            logger.error(f"Skipping redis insert because userID missing/empty for key:{key}",extra=extras)
            return False
        response = RedisClass.redis_client.set(key,data)
        logger.info(f'key:{key} inserted into redis',extra=extras)
        return True

    def fetch_key_data(self,key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.redis_ping()
        response = RedisClass.redis_client.get(key)
        logger.info(f'key:{key} fetched for data',extra=extras)
        return response


    def delete_key(self,key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.redis_ping()
        response = RedisClass.redis_client.delete(key)
        logger.info(f'key:{key} deleted from redis',extra=extras)
        return response


    def fetch_keys(self,key_prefix):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.redis_ping()
        response = RedisClass.redis_client.scan_iter(key_prefix)
        logger.info(f'key:{key_prefix} fetched.',extra=extras)
        return response


    def idle_check(self,idle_timeout,key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.redis_ping()
        idle_time = RedisClass.redis_client.object("idletime", key)
        if idle_time > int(idle_timeout):
            response = True
        else:
            response = False
        logger.info(f'key:{key} idle fetched',extra=extras)
        return response


    def key_exists_check(self,key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.redis_ping()
        response = RedisClass.redis_client.exists(key)
        logger.info(f'key:{key} exits fetched',extra=extras)
        return response   


    def is_redis_empty(self,prefix):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        try:
            self.redis_ping() 
            logger.debug(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            if any(RedisClass.redis_client.scan_iter(f"{prefix}*")):
                logger.info("Synonyms Redis database is not empty.",extra=extras)
                logger.debug(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return -1
            else:
                logger.info("Synonyms: Redis database is empty.",extra=extras)
                logger.debug(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return 0
        except Exception as e:
            logger.debug(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.error(f"Exception occures at is_redis_empty{e}",extra=extras)