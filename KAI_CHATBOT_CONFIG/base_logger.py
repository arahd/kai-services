import logging,graypy
from opencensus.ext.azure.log_exporter import AzureLogHandler
import os

logger = logging.getLogger("Config Service")

LOG_INSTRUMENTATION_KEY = os.getenv("CUSTOMCONNSTR_LOG_INSTRUMENTATION_KEY")
ING_ENDPOINT = os.getenv("CUSTOMCONNSTR_ING_ENDPOINT")
LIVE_ENDPOINT = os.getenv("CUSTOMCONNSTR_LIVE_ENDPOINT")

# LOG_INSTRUMENTATION_KEY = os.getenv("LOG_INSTRUMENTATION_KEY")
# ING_ENDPOINT = "https://eastus-8.in.applicationinsights.azure.com/"
# LIVE_ENDPOINT = "https://eastus.livediagnostics.monitor.azure.com/"




#logger.addHandler(AzureLogHandler())
logging.basicConfig(filename="Config_service.log",
                    format='%(asctime)s %(message)s',
                    filemode='w')
# Alternatively manually pass in the connection_string
logger.addHandler(AzureLogHandler(connection_string=f"InstrumentationKey={LOG_INSTRUMENTATION_KEY};IngestionEndpoint={ING_ENDPOINT};LiveEndpoint={LIVE_ENDPOINT}"))
logger.setLevel(logging.INFO)
# properties = {'custom_dimensions': {'Nmae': 'Sangeetha', 'FileName' : name}}
# logger.warning('action', extra=properties)

handler = graypy.GELFTCPHandler('172.172.174.251', 12201)
logger.addHandler(handler)

extra_data = {'service_tag': 'Config Service'}
logger.info('This is a log message with a tag', extra=extra_data)

