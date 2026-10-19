import json
import os
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone
from bson.binary import Binary
from sys import getsizeof

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'
TOKEN = os.getenv("VALIDATOR_TOKKEN_ROLE")

def estimate_document_size(document):
    """Estimate the size of a document in bytes."""
    return getsizeof(Binary(json.dumps(document).encode('utf-8')))

def checkSizeToUpdateInDB(json_data):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    max_bytes = os.getenv("max_bytes")
    max_bytes = int(eval(max_bytes))
    if estimate_document_size(json_data) > max_bytes:
        document = json_data
        conversation_array = document.get('conversation', [])
        current_document = {
        'conversationID': document['conversationID'],
        'greetings': document['greetings'],
        'userID': document['userID'],
        'startTime': document['startTime'],
        'part': 1,
        'conversation': []  # Start with an empty 'conversation' array  
        }
        new_documents = []
        for item in conversation_array:
            item_size = estimate_document_size(item)

            # Check if adding the item would exceed the size limit
            if estimate_document_size(current_document) + item_size > max_bytes:
                # Push the current document to the list
                new_documents.append(current_document.copy())

                # Start a new document with an empty 'conversation' array
                current_document = {
                    'conversationID': document['conversationID'],
                    'greetings': document['greetings'],
                    'userID': document['userID'],
                    'startTime': document['startTime'],
                    'part': len(new_documents) + 1,
                    'conversation': []
                }

            # Add the item to the current document
            current_document['conversation'].append(item)

        if current_document['conversation']:
            new_documents.append(current_document) 
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return new_documents
    else:
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return [json_data]

def extract_date(timestamp_str):
    """
    Return YYYY-MM-DD from input like "2025-07-24 15:38:53.062859".
    Falls back to simple split if parsing fails.
    """
    try:
        return datetime.fromisoformat(timestamp_str).date().isoformat()
    except ValueError:
        return timestamp_str.split()[0]
