# import logging
# from opencensus.ext.azure.log_exporter import AzureLogHandler

# appinsight_connectio_string = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")


# logger = logging.getLogger(__name__)
# logger.addHandler(AzureLogHandler(connection_string=appinsight_connectio_string))
# logger.setLevel(logging.INFO)
# # logger.info('Hello, Appinsight from indexer service')

import logging
from opencensus.ext.azure.log_exporter import AzureLogHandler
import os

# logger = logging.getLogger("ContentSearch Service")
logger = logging.getLogger(__name__)
LOG_INSTRUMENTATION_KEY = os.getenv("CUSTOMCONNSTR_LOG_INSTRUMENTATION_KEY")
ING_ENDPOINT = os.getenv("CUSTOMCONNSTR_ING_ENDPOINT")
LIVE_ENDPOINT = os.getenv("CUSTOMCONNSTR_LIVE_ENDPOINT")

# LOG_INSTRUMENTATION_KEY = os.getenv("LOG_INSTRUMENTATION_KEY")
# ING_ENDPOINT = "https://eastus-8.in.applicationinsights.azure.com/"
# LIVE_ENDPOINT = "https://eastus.livediagnostics.monitor.azure.com/"
#logger.addHandler(AzureLogHandler())

logging.basicConfig(filename="sensitivesearch_service.log",
                    format='%(asctime)s %(message)s',
                    filemode='w')
print(fos.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"))
# Alternatively manually pass in the connection_string
logger.addHandler(AzureLogHandler(connection_string=fos.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING")))
logger.setLevel(logging.INFO)

# handler = graypy.GELFTCPHandler('172.172.174.251', 12201)
# logger.addHandler(handler)

# extra_data = {'service_tag': 'ContentSearch Service'}
# logger.info('This is a log message with a tag', extra=extra_data)