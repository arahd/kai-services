from dotenv import load_dotenv
load_dotenv()

import os
from logger import logger,get_caller_frame,extras
import requests
from datetime import datetime,timezone
from conversationalservice.gettoken import get_token_info
from custom_utils.http_client import get_http_session

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

SENSITIVE_FILTER_URL = os.getenv("SENSITIVE_FILTER_URL","")
CONTENT_SEARCH_URL = os.getenv("CONTENT_SEARCH_URL","")
RESTRICTED_CONTENT_SEARCH_URL = os.getenv("RESTRICTED_SEARCH_URL")

def issensitive(question,bot_type):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    token_info = get_token_info()
    headers = {"Authorization": "Bearer "+token_info} 
    url = SENSITIVE_FILTER_URL+"searchsensitivepostgres"    
    try:         
        params_list={"userquery":question,"bot_type":bot_type}    
        print(params_list)
        session = get_http_session()
        response=session.post(url=url,headers=headers,json=params_list,timeout=5.0)  
        sensitive_response = response.json().get('issensitive',None)  
        logger.info(f" {SERVICE_NAME} : Input {question} Sensitive response :{sensitive_response}",extra=extras)    
        if sensitive_response:
            return True
        else:
            return False
    except Exception as e:
        logger.exception(f"Conversational Sevrice : exception occured in issensitive: {e}", extra=extras)
    return False

def restricted_fetch_augcontent(query, conversation_id,uploaded_document_ids):
    url = RESTRICTED_CONTENT_SEARCH_URL

    token_info = get_token_info()
    headers = {
        "Authorization": f"Bearer {token_info}",
        "Content-Type": "application/json"
    }
    payload = {
        "userquery":query,
        "conversation_id":conversation_id,
        "uploaded_document_ids":uploaded_document_ids
    }

    session = get_http_session()
    response = session.post(url, json=payload, headers=headers, timeout=5.0)

    if response.status_code == 200:
        data = response.json()
        augContent = data.get("augContent",'')
        augSrc = data.get("augSrc",[])
        imgSrc = data.get("imageSrc",[])
        return augContent, augSrc,imgSrc
    else:
        print("Request to search content service failed:", response.status_code, response.text)
        return '',[],[]
    
def fetch_from_crawl(query):
    try:
        logger.info(f'web search initiated searching for query:{query}',extra=extras)
        token_info = get_token_info()
        headers={'Authorization': f"Bearer {token_info}"}
        session = get_http_session()
        response = session.get(f'{CONTENT_SEARCH_URL}/crawl/{query}',headers=headers, timeout=5.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.exception(f'exception occured in fetching web search result.',extra=extras)
        return {
            "augcontent":f"unable to fetch web content",
            "augurls":[]
        }

def fetch_augcontent(query, conversation_id):
    url = CONTENT_SEARCH_URL + "search"

    token_info = get_token_info()
    headers = {
        "Authorization": f"Bearer {token_info}",
        "Content-Type": "application/json"
    }
    payload = {
        "userquery":query,
        "conversation_id":conversation_id
    }

    session = get_http_session()
    response = session.post(url, json=payload, headers=headers, timeout=5.0)

    if response.status_code == 200:
        data = response.json()
        augContent = data.get("augContent",'')
        augSrc = data.get("augSrc",[])
        return augContent, augSrc
    else:
        print("Request to search content service failed:", response.status_code, response.text)
        return '',[]