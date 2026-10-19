import os
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone

import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import zlib


SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_TRANSCRIPT_SERVICE'
PROJECT_NAME='CHATBOT'

def string_to_fernet_key(password: str, salt: bytes = b'static_salt_12345678') -> bytes:
    """
    Derive a valid Fernet key from any string.
    
    WARNING: Using a static salt is less secure. For production,
    store a randomly generated salt securely.
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,  # Fernet needs exactly 32 bytes
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return key

ENCRYPTION_KEY = os.getenv("ENCRYPTION_CODE")
fernet_key = string_to_fernet_key(ENCRYPTION_KEY)
cipher = Fernet(fernet_key)

def combine_inputs(sorted_documents):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    output_data = {}
    for index, document in enumerate(sorted_documents):
        conversation = document.get("conversation", None)
        if conversation is not None:
            if index == 0:
                try:
                    raw_start_time = (
                        document.get("startTime")
                        or document.get("created_at")
                        or document.get("date_timestamp")
                    )
                except Exception as e:
                    logger.error(
                        f"Error fetching time variables: {str(e)}",
                        extra=extras
                    )
                    raw_start_time = None

                output_data = {
                    "conversationID": document.get("conversationID") or document.get("conversation_id"),
                    "greetings": document.get("greetings"),
                    "userID": document.get("userID") or document.get("username_id"),
                    "startTime": raw_start_time,
                    "created_at": raw_start_time,
                    "date_timestamp": raw_start_time,
                    "conversation": []
                }
                output_data["conversation"].extend(conversation)
            else:
                output_data["conversation"].extend(document["conversation"])
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return output_data


# output_result = combine_inputs(chunks)

# print(output_result)

def create_share_token(username: str, date: str, conversation_id: str, bot_type:str) -> str:
    """
    Encrypt data into URL token - no storage needed.
    """
    data = f"{username}|{date}|{conversation_id}|{bot_type}"
    compressed = zlib.compress(data.encode(), level=9)
    encrypted = cipher.encrypt(compressed)
    return encrypted.decode().rstrip('=')
    # encrypted = cipher.encrypt(data.encode())
    
    # # Compact URL-safe encoding
    # token = base64.urlsafe_b64encode(encrypted).decode().rstrip('=')
    # return token


def decode_share_token(token: str) -> dict:
    """
    Decrypt token directly - no lookup.
    """
    # Restore padding
    padding = 4 - len(token) % 4
    if padding != 4:
        token += '=' * padding
    
    # encrypted = base64.urlsafe_b64decode(token.encode())
    # decrypted = cipher.decrypt(encrypted).decode()
    compressed = cipher.decrypt(token.encode())
    decrypted = zlib.decompress(compressed).decode()
    
    username, date, conversation_id, bot_type = decrypted.split('|')
    return {
        'user_string': username,
        'date_info': date,
        'conversationID': conversation_id,
        'bot_type': bot_type
    }
    
    
def create_project_share_token(project_id: str, username: str) -> str:
    """
    Encrypt project share data into URL token.
    """
    data = f"{project_id}|{username}"
    compressed = zlib.compress(data.encode(), level=9)
    encrypted = cipher.encrypt(compressed)
    return encrypted.decode().rstrip('=')
    
def decode_project_share_token(token: str) -> dict:
    padding = 4 - len(token) % 4
    if padding != 4:
        token += '=' * padding
    compressed = cipher.decrypt(token.encode())
    decrypted = zlib.decompress(compressed).decode()
    project_id, username = decrypted.split('|')
    return {
        "project_id": project_id,
        "username": username
    }
