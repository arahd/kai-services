import redis
import os
import json
import redis.exceptions
from logging_config.logger import logger, get_caller_frame
from datetime import datetime, timezone
from tenacity import retry, stop_after_attempt, wait_fixed 

SERVICE_NAME = 'KAI_HR_PORTAL'
PROJECT_NAME = 'CHATBOT'

class RedisClass():
    redis_client = None
    _instance = None  

    def __new__(cls, *args, **kwargs):  
        if not cls._instance:  
            cls._instance = super(RedisClass, cls).__new__(cls)  
            cls._instance.initialize(*args, **kwargs)  
        return cls._instance

    def initialize(self):
        self.REDIS_HOST = os.getenv("REDIS_HOST")
        self.REDIS_PORT = os.getenv("REDIS_PORT")
        self.TTL= os.getenv("REDIS_HR_TTL") or 2592000
        
        db_env = os.getenv("REDIS_DB_CONV_HR") or "1"
        try:
            self.REDIS_DB = int(db_env)
        except ValueError:
            self.REDIS_DB = 1
            
        self.REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
        self.jd_req_prefix = os.getenv('REDIS_JD_REQ_PREFIX', 'kai_hr:jd_req:')
        
        if self.REDIS_HOST:
            self.connect()

    def connect(self):
        try:
            ssl_val = os.getenv("REDIS_SSL", "true").lower() == "true"
            logger.info(f"Connecting to Redis at {self.REDIS_HOST}:{self.REDIS_PORT} (DB {self.REDIS_DB})")
            RedisClass.redis_client = redis.Redis(
                host=self.REDIS_HOST,
                port=self.REDIS_PORT,
                db=self.REDIS_DB,
                password=self.REDIS_PASSWORD,
                ssl=ssl_val,
                decode_responses=True
            )
            return RedisClass.redis_client
        except Exception as e:
            logger.error(f"Redis connection initialization error: {e}")
            return None

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    def redis_ping(self):  
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:  
            if not RedisClass.redis_client:
                self.connect()
            redis_ping_response = RedisClass.redis_client.ping()  
            logger.info(f'redis_ping_response details:{redis_ping_response}', extra=extras)   
        except (redis.exceptions.ConnectionError, redis.exceptions.RedisError) as e:  
            logger.error(f"Error connecting to Redis: {e}", extra=extras) 
            self.connect()
            raise

    def set_key_value(self, key: str, value: str, ttl_seconds: int = None) -> bool:
        """Stores key-value pair in Redis with TTL (default 30 days = 2592000s)."""
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            self.redis_ping()
            if ttl_seconds is None :
                ttl_seconds=self.TTL
            if ttl_seconds:
                RedisClass.redis_client.setex(key, ttl_seconds, value)
            else:
                RedisClass.redis_client.set(key, value)
            logger.info(f'key:{key} inserted into redis (ttl: {ttl_seconds}s)', extra=extras)
            return True
        except Exception as e:
            logger.error(f"Failed to insert key:{key} to redis: {e}", extra=extras)
            return False

    def fetch_key_data(self, key: str):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            self.redis_ping()
            response = RedisClass.redis_client.get(key)
            logger.info(f'key:{key} fetched for data', extra=extras)
            return response
        except Exception as e:
            logger.error(f"Failed to fetch key:{key} from redis: {e}", extra=extras)
            return None

    def delete_key(self, key: str):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            self.redis_ping()
            response = RedisClass.redis_client.delete(key)
            logger.info(f'key:{key} deleted from redis', extra=extras)
            return response
        except Exception as e:
            logger.error(f"Failed to delete key:{key} from redis: {e}", extra=extras)
            return 0

    def key_exists_check(self, key: str) -> bool:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            self.redis_ping()
            response = bool(RedisClass.redis_client.exists(key))
            logger.info(f'key:{key} exists check: {response}', extra=extras)
            return response
        except Exception as e:
            logger.error(f"Failed to check key existence:{key}: {e}", extra=extras)
            return False
