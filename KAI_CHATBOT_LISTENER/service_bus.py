from azure.servicebus.aio import ServiceBusClient
from azure.servicebus import ServiceBusReceiveMode
from logger import logger, get_caller_frame, extras
import os
import asyncio
import threading
import json
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

SERVICE_NAME = 'KAI_CHATBOT_LISTENER_SERVICE'
PROJECT_NAME = 'KAI'
MESSAGE_LOCK_DURATION = 300  # Lock duration in seconds
db_type = os.getenv('DB_TYPE')
CONV_QUEUE_NAME = os.getenv('CHABOT_REPORT_CONVERSATION_QUEUE_NAME')
API_TOKEN_QUEUE_NAME = os.getenv('API_TOKEN_UPDATE_QUEUE')

from common_utils.datalake import AccessConversation
class RateLimitError(Exception):
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((RateLimitError, Exception))
)
async def receive_messages(queue_name, connection_string):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        logger.info(f'inside receive_messages function:db_type:{db_type},queue_name{queue_name}',extra=extras)
        servicebus_client = ServiceBusClient.from_connection_string(connection_string)
        logger.info(f"servicebus_client: {servicebus_client}", extra=extras)
        async with servicebus_client:
            receiver = servicebus_client.get_queue_receiver(
                queue_name=queue_name,
                max_message_count=1,
                prefetch_count=1,
                receive_mode=ServiceBusReceiveMode.PEEK_LOCK,
                idle_timeout=MESSAGE_LOCK_DURATION
            )
            async with receiver:
                logger.info(f"receiver: {receiver}", extra=extras)
                while True:  # Keep listening for messages
                    received_msgs = await receiver.receive_messages(max_message_count=1, max_wait_time=15)
                    # logger.info(f"received_msgs: {received_msgs}", extra=extras)
                    for msg in received_msgs:
                        bot_type = "kumaran"
                        conversation = AccessConversation(bot_type=bot_type, db_type=db_type)
                        try:
                            content_type = msg.content_type
                            if content_type == 'application/json':
                                data = json.loads(str(msg))
                                logger.info(f"SERVICEBUS PAYLOAD={data}", extra=extras)
                                if queue_name == CONV_QUEUE_NAME:
                                    conv_list = data.get('conversation')
                                    if isinstance(conv_list, list):
                                        # Empty out any response values to avoid huge payloads and parsing issues
                                        for q in conv_list:
                                            q['response'] = " "
                                        logger.info(f"Cleared response field for {len(conv_list)} conversation items",extra=extras)
                                        data['conversation'] = conv_list
                                    conversation.get_conversations(data)
                                if queue_name == API_TOKEN_QUEUE_NAME:
                                    token_value = data.get('tokens_consumed')
                                    if token_value:
                                        conversation.update_api_service_token_usuage(data)
                            await receiver.complete_message(msg)
                        except Exception as e:
                            logger.exception(f'exception occured', extra=extras)
                            await receiver.dead_letter_message(msg)
                        finally:
                            conversation.db.session.close()
                            conversation.cache.session.close()
    except Exception as e:
        logger.exception(f'exception occured',extra=extras)
        raise

def start_receiver(queue_name):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    logger.info(f'inside start_receiver', extra=extras)
    connection_string = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING")
    logger.info(f'inside start_receiver:{queue_name}', extra=extras)
    asyncio.run(receive_messages(queue_name, connection_string))

def start_background_listener():
    logger.info(f"Starting background listener threads for queues: {CONV_QUEUE_NAME}, {API_TOKEN_QUEUE_NAME}", extra=extras)
    listeners = [CONV_QUEUE_NAME, API_TOKEN_QUEUE_NAME]
    for listener in listeners:
        thread = threading.Thread(
            target=start_receiver,
            args=(listener,),
            daemon=True
        )
        thread.start()