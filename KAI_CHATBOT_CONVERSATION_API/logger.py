import logging
import logstash
import inspect
import os

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

extras = {
        'servicename': SERVICE_NAME,
        'functionname': '',
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

class LoggerFactory:
    @staticmethod
    def get_logger(logger_type, logger_name):
        if logger_type == 'ELK':
            elk=ELKLogger(logger_name)
            return elk.get()
        elif logger_type == 'AppInsights':
            app_insights_logger=AppInsightsLogger(logger_name)
            return app_insights_logger.get()
        else:
            raise NotImplementedError("Logger type {} not implemented".format(logger_type))


class ELKLogger():
    def __init__(self, logger_name):
        self.logger_name=logger_name
        self.log_stash_host = '23.98.158.192'
        self.log_stash_udp_port = 5960

    def get(self):
        logging.basicConfig(
            filename="conversational_sevice.log",
            filemode="a",
            format="%(asctime)s,%(msecs)d %(name)s %(levelname)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            level=logging.INFO,
        )
        self.stderrLogger = logging.StreamHandler()
        logging.getLogger().addHandler(self.stderrLogger)
        self.logger = logging.getLogger(self.logger_name)
        self.logger.addHandler(logstash.UDPLogstashHandler(
            self.log_stash_host,
            self.log_stash_udp_port,
            version=1
        ))
        return self.logger

class AppInsightsLogger():
    def __init__(self, logger_name):
        self.logger_name=logger_name
        self.logger = self.setup_logger()
        
    def setup_logger(self):
        logger = logging.getLogger(self.logger_name)
        logger.setLevel(logging.INFO)

        file_handler = logging.FileHandler("conversational_sevice.log")
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(servicename)s - %(functionname)s", "%Y-%m-%d %H:%M:%S")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        return logger

    def get(self):
        return self.logger
            
logger_type=os.getenv('LOGGER_TYPE','AppInsights')
logger_env_name=os.getenv('CUSTOMCONNSTR_ENV','DEV')

logger = LoggerFactory.get_logger(logger_type=logger_type, logger_name=logger_env_name)


def get_caller_frame():
    frame = inspect.currentframe()
    caller_frame = frame.f_back
    del frame
    return caller_frame

