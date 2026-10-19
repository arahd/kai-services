import redis
import os
import json
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone
SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_REPORTING_SERVICE'
PROJECT_NAME='CHATBOT'
class Redis():
    def __init__(self):
        """initialize  connection """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.REDIS_HOST = os.getenv("REDIS_HOST")
        self.REDIS_PORT = os.getenv("REDIS_PORT")     
        self.REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
        self.cache_report_prefix = os.getenv('REDIS_REPORT_PREFIX')
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    def connect(self):    
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.redisJson = redis.Redis(host=self.REDIS_HOST,port=self.REDIS_PORT, db=int(os.getenv("REDIS_DB_NAME")), password=self.REDIS_PASSWORD, ssl=True)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return self.redisJson

    def insert_report_cache_data_to_redis(self,data,r_client,bot_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:           
           
            prefixed_data = {self.cache_report_prefix+':'+bot_type+'_' + key: json.dumps(value) for key, value in data.items()}
          
            result=r_client.mset(prefixed_data)
            if result == True:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return 0
            else:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return -1   
        except Exception:
            logger.exception("Content Search Service:Error in connecting to redis",extra=extras)
            return -1            
 
    def retrieve_all_report_cache_key_values(self,r_client,bot_type):
        """
        Retrieve all key-value pairs from Redis.

        Parameters:
        - redis_client: Redis client returned by the connect_to_redis function
        - bot_type : 

        Returns:
        - Dictionary containing all key-value pairs
        """
    
        all_keys = r_client.keys(self.cache_report_prefix+':'+bot_type+'_'+'*') 
        logger.info(f"Content Search service: keys obtained from redis {all_keys}",extra=extras)
        modified_keys=[element.decode('utf-8').replace(self.cache_report_prefix+':'+bot_type+'_','',1) for element in all_keys]
        all_key_values = {}
        try:
            all_key_values = {modified_keys[i]: json.loads(r_client.get(key).decode('utf-8')) for i, key in enumerate(all_keys)}


        except Exception as e:
            logger.exception(f"Error in content search service {e}.",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return all_key_values


    # Check if the Redis database is empty
    def is_report_cache_redis_empty(self,r_client,bot_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        if any(r_client.scan_iter(self.cache_report_prefix+':'+bot_type+'_'+'*')):
            logger.info("Content Search service:Redis database is not empty.",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return -1
        else:
            logger.info("Content Search service: Redis database is empty.",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return 0

    
    def redis_report_cache_flushDB(self,r_client,bot_type):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            r_client.select(int(os.getenv("REDIS_DB_NAME")))
            keys_to_delete = list(r_client.scan_iter(self.cache_report_prefix+':'+bot_type+'_'+'*'))
            # Use a pipeline to batch delete keys
            with r_client.pipeline() as pipe:
                for key in keys_to_delete:
                    pipe.delete(key)
                pipe.execute()
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return True
        except Exception as e:
            logger.exception("exception occured in redis_flushDB.",extra=extras) 
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)  
            return False
    
    def deleteInRedis(self,r_client, key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        # Check if the key exists
        key_exists = r_client.exists(key)

        if key_exists:
            r_client.delete(key)
            logger.info(f'The key "{key}" exists in Redis.', extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return True
        else:
            logger.info(f'The key "{key}" does not exist in Redis.', extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return False


