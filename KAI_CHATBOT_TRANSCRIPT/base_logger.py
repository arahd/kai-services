import logging
from opencensus.ext.azure.log_exporter import AzureLogHandler
import os

logger = logging.getLogger(__name__)

LOG_INSTRUMENTATION_KEY = os.getenv("CUSTOMCONNSTR_LOG_INSTRUMENTATION_KEY")
ING_ENDPOINT = os.getenv("CUSTOMCONNSTR_ING_ENDPOINT")
LIVE_ENDPOINT = os.getenv("CUSTOMCONNSTR_LIVE_ENDPOINT")

# LOG_INSTRUMENTATION_KEY = os.getenv("LOG_INSTRUMENTATION_KEY")
# ING_ENDPOINT = "https://eastus-8.in.applicationinsights.azure.com/"
# LIVE_ENDPOINT = "https://eastus.livediagnostics.monitor.azure.com/"



#logger.addHandler(AzureLogHandler())
logging.basicConfig(filename="chat_transcript_service.log",
                    format='%(asctime)s %(message)s',
                    filemode='w')
# Alternatively manually pass in the connection_string
logger.addHandler(AzureLogHandler(connection_string=f"InstrumentationKey={LOG_INSTRUMENTATION_KEY};IngestionEndpoint={ING_ENDPOINT};LiveEndpoint={LIVE_ENDPOINT}"))
logger.setLevel(logging.INFO)
# properties = {'custom_dimensions': {'Nmae': 'Sangeetha', 'FileName' : name}}
# logger.warning('action', extra=properties)

