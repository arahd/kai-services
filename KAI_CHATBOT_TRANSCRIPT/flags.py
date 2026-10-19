from logger import logger,get_caller_frame,extras
import os
from datetime import datetime,timezone
from dateutil.parser import parse
from utils import *  
from mainqueries import *
from chat import BlobChatTranscipt


SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_TRANSCRIPT_SERVICE'
PROJECT_NAME='CHATBOT'

# Single shared SQLFactory — reuses the engine pool across all flag functions.
# Each underlying method in SQLFactory opens and closes its own session safely.
_db = SQLFactory()

def chatDelete(data, bearer_token):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    conversation_id = data.get("conversationID")
    return _db.delete_conversation(conversation_id)


def chatRename(data, bearer_token):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    conversation_id = data.get("conversationID")
    conversation_name = data.get("conversationName")
    return _db.rename_conversation(conversation_id, conversation_name)
 
def chatRestore(data, bearer_token):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    conversation_id = data.get("conversationID")
    return _db.restore_conversation(conversation_id)

def chatPin(data, bearer_token):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    conversation_id = data.get("conversationID")
    return _db.toggle_pin_conversation(conversation_id)

def chatSearch(data, current_user):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    user_string = current_user.lower() if current_user else data.get("user_string")
    query = data.get("query").lower()
    return _db.search_questions_by_user(user_string, query)

def chatSearchResult(data, current_user=None):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    user_string = current_user.lower() if current_user else data.get("user_string").lower()
    date = parse(data.get("date_info")).strftime("%Y-%m-%d")
    conversationID = data.get("conversationID")
    conv_path = f"{user_string}/{date}/{conversationID}.json"
    obj_blob = BlobChatTranscipt()
    return obj_blob.get_sinle_conv_from_blob(conv_path, data.get("bot_type"))

def listConversationProjects(username=None, page=1, limit=10,is_pinned=None,created_at=None,updated_at=None):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return _db.list_conversation_projects(username=username,page=page,limit=limit,is_pinned=is_pinned,created_at=created_at,updated_at=updated_at)

def deleteProject(data, current_user):
    return _db.delete_project(data.get("project_id"),current_user)

def pinProject(data, username):
    return _db.pin_project(data.get("project_id"),username)

def projectSearchResult(data):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    project_id = data.get("project_id")
    obj_blob = BlobChatTranscipt()
    return obj_blob.get_project_conversations(project_id)


    obj_blob = BlobChatTranscipt()
    return obj_blob.get_project_conversations(
        data.get("project_id")
    )


def shareConversationProject(data, current_user):
    return _db.share_conversation_project(data.get("conversation_ids"),data.get("project_id"))


def questionLike(data,bearer_token):
    extras={'servicename':SERVICE_NAME,'functionname':get_caller_frame().f_code.co_name,'projectname':PROJECT_NAME,'bot_name':'kumaran'}
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return _db.update_chat_like(data.get("message_id"),bearer_token,data.get("is_like"))

def getLikesByMessageIds(message_ids):
    return _db.get_likes_by_message_ids(message_ids)
