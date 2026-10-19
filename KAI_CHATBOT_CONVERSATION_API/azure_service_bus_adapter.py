from azure.servicebus import ServiceBusClient, ServiceBusMessage
from messaging_interface import MessagingInterface
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from logger import logger,get_caller_frame
import json
import os

AZURE_SERVICE_BUS_CONNECTION_STRING = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING")
queue_name = os.getenv("CONVERSATION_CRON_QUEUE")
token_queue = os.getenv("API_TOKEN_UPDATE_QUEUE")
service_bus_connection_str = AZURE_SERVICE_BUS_CONNECTION_STRING

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

class RateLimitError(Exception):
    pass

class AzureServiceBusAdapter(MessagingInterface): 
     
    def __init__(self):
        extras = {
                    'servicename': SERVICE_NAME,
                    'functionname': get_caller_frame().f_code.co_name,
                    'projectname': PROJECT_NAME,
                    'bot_name':'kumaran'
                }
        logger.info(f'AzureServiceBusAdapter Initialised.',extra=extras)

    @retry(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type((RateLimitError, Exception))
        )
    def send_message(self,message):
        extras = {
                    'servicename': SERVICE_NAME,
                    'functionname': get_caller_frame().f_code.co_name,
                    'projectname': PROJECT_NAME,
                    'bot_name':'kumaran'
                }
        try:
            with ServiceBusClient.from_connection_string(conn_str=service_bus_connection_str) as servicebus_client:
                sender = servicebus_client.get_queue_sender(queue_name=queue_name)
                with sender:
                    # Clear response from all conversation items
                    for item in message.get("conversation", []):
                        item["response"] = " "
                    message = json.dumps(message)
                    message = ServiceBusMessage(body=message, content_type="application/json")
                    sender.send_messages(message)
                    logger.info(f'CNT-MGMT-Service: send_message_to_service_bus upload completed : queue_name {queue_name},payload:{message}',extra=extras)
                    return "message sent"
        except Exception as e:
            logger.exception(f'exception occured in azure service bus adapter',extra=extras)
            raise RateLimitError
    
    def receive_message(self):
        with ServiceBusClient.from_connection_string(conn_str=service_bus_connection_str,logging_enable=True) as servicebus_client:
            with servicebus_client:
                receiver = servicebus_client.get_queue_receiver(queue_name=queue_name)
                with receiver:
                    received_msgs = receiver.receive_messages(max_message_count=1)
                    for msg in received_msgs:
                        receiver.complete_message(msg)
                        
    @retry(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            retry=retry_if_exception_type((RateLimitError, Exception))
        )
    
    def send_token_count_to_queue(self,message):
        extras = {
                    'servicename': SERVICE_NAME,
                    'functionname': get_caller_frame().f_code.co_name,
                    'projectname': PROJECT_NAME,
                    'bot_name':'kumaran'
                }
        try:
            with ServiceBusClient.from_connection_string(conn_str=service_bus_connection_str) as servicebus_client:
                sender = servicebus_client.get_queue_sender(queue_name=token_queue)
                with sender:
                    message = json.dumps(message)
                    message = ServiceBusMessage(body=message, content_type="application/json")
                    sender.send_messages(message)
                    logger.info(f'CNT-MGMT-Service: send_message_to_service_bus upload completed : queue_name {queue_name},payload:{message}',extra=extras)
                    return "message sent"
        except Exception as e:
            logger.exception(f'exception occured in azure service bus adapter',extra=extras)
            raise RateLimitError

