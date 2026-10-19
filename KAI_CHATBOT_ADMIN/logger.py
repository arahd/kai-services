import logging
import logstash
import time
import inspect
import os
from opencensus.ext.azure.log_exporter import AzureLogHandler

SERVICE_NAME='CONVERSATIONAL AI CHATBOT ADMIN SERVICE'
PROJECT_NAME='CHATBOT'

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
            filename="authservice.log",
            filemode="a",
            format="%(asctime)s,%(msecs)d %(name)s %(levelname)s %(message)s",
            datefmt="%H:%M:%S",
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

        file_handler = logging.FileHandler("authservice.log")
        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s - %(servicename)s - %(functionname)s", "%Y-%m-%d %H:%M:%S")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        
        # APPLICATIONINSIGHTS_CONNECTION_STRING = os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING') 
        # console_handler = logging.StreamHandler()
        # console_handler.setLevel(logging.INFO)
        # console_handler.setFormatter(formatter)
        # logger.addHandler(console_handler)
        
        # # LOG_INSTRUMENTATION_KEY = os.getenv("LOG_INSTRUMENTATION_KEY")
        # # ING_ENDPOINT = "https://eastus-8.in.applicationinsights.azure.com/"
        # # LIVE_ENDPOINT = "https://eastus.livediagnostics.monitor.azure.com/"
        # # APPLICATIONINSIGHTS_CONNECTION_STRING = f"InstrumentationKey={LOG_INSTRUMENTATION_KEY};IngestionEndpoint={ING_ENDPOINT};LiveEndpoint={LIVE_ENDPOINT}"

        # azure_handler = AzureLogHandler(connection_string=APPLICATIONINSIGHTS_CONNECTION_STRING)
        # azure_handler.setFormatter(formatter)

        # logger.addHandler(azure_handler)

        APPLICATIONINSIGHTS_CONNECTION_STRING = os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING')

        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        if APPLICATIONINSIGHTS_CONNECTION_STRING:
            try:
                azure_handler = AzureLogHandler(connection_string=APPLICATIONINSIGHTS_CONNECTION_STRING)
                azure_handler.setFormatter(formatter)
                logger.addHandler(azure_handler)
            except Exception as e:
                print(f"⚠️ Failed to initialize AzureLogHandler: {e}")
        else:
            print("⚠️ App Insights logging disabled: no connection string found.")


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