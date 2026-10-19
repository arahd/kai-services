from dotenv import load_dotenv
load_dotenv()
import os
from logger import logger,get_caller_frame,extras,time_async_func,time_sync_func
from http_client import http_client
from datetime import datetime,timezone
from conversationalservice.gettoken import get_token_info
from agent_pool_context_helper import current_user_id, current_domain_filters
from tableModels import Session, UserTokens
SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

SENSITIVE_FILTER_URL = os.getenv("SENSITIVE_FILTER_URL")
CONTENT_SEARCH_URL = os.getenv("CONTENT_SEARCH_URL")
IMAGE_FETCH_URL = os.getenv("IMAGE_SEARCH_URL")
RESTRICTED_CONTENT_SEARCH_URL = os.getenv("RESTRICTED_SEARCH_URL")
DOCUMENT_GENERATION_BASE_URL = os.getenv("DOCUMENT_GENERATION_BASE_URL")

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
        response=http_client.post(url=url,headers=headers,json=params_list)  
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

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

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
    try:
        response = http_client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            augContent = data.get("augContent",'')
            augSrc = data.get("augSrc",[])
            imgContent=data.get("imageContent",[])
            imgSrc=data.get("imageSrc",[])
            return augContent, augSrc,imgSrc,imgContent
        else:
            return '',[],[],[]
    except Exception as e:
        logger.exception(f"Unknown Exception in restricted_fetch_augcontent, exception : {e}",extra=extras)    
        return '',[],[],[]
    
@time_sync_func('fetch_from_crawl')
def fetch_from_crawl(queries):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        logger.info(f'web search initiated searching for queries:{queries}',extra=extras)
        token_info = get_token_info()
        headers={'Authorization': f"Bearer {token_info}", 'Content-Type': 'application/json'}
        payload = {"queries": queries}
        
        try:
            userId = current_user_id.get()
            if userId:
                filters = current_domain_filters.get()
                if not filters.get("loaded"):
                    session = Session()
                    try:
                        user_tokens = session.query(UserTokens).filter_by(user_id=userId).first()
                        if user_tokens:
                            if user_tokens.allowed_domains:
                                filters["allowed_domains"] = user_tokens.allowed_domains
                            if user_tokens.restricted_domains:
                                filters["restricted_domains"] = user_tokens.restricted_domains
                    finally:
                        session.close()
                    filters["loaded"] = True
                
                if filters.get("allowed_domains"):
                    payload["allowed_domains"] = filters["allowed_domains"]
                if filters.get("restricted_domains"):
                    payload["restricted_domains"] = filters["restricted_domains"]
        except LookupError:
            pass

        response = http_client.post(f'{CONTENT_SEARCH_URL}crawl', json=payload, headers=headers, timeout=120.0)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.exception(f'exception occured in fetching web search result.',extra=extras)
        return {
            "augcontent":f"unable to fetch web content",
            "augurls":[]
        }

def fetch_augcontent(query:str, conversation_id:str,document_name:str):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    url = CONTENT_SEARCH_URL + "search"

    token_info = get_token_info()
    headers = {
        "Authorization": f"Bearer {token_info}",
        "Content-Type": "application/json"
    }
    payload = {
        "userquery":query,
        "conversation_id":conversation_id,
        "document_name":document_name
    }
    try:
        response = http_client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            augContent = data.get("augContent",'')
            augSrc = data.get("augSrc",[])
            return augContent, augSrc
        else:
            return '',[]
    except Exception as e:
        logger.exception(f"Unknown Exception in fetch_augcontent, exception : {e}",extra=extras)    
        return '',[]

def fetch_image_bytes(image_filename, conversation_id):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    url = IMAGE_FETCH_URL

    token_info = get_token_info()
    headers = {
        "Authorization": f"Bearer {token_info}",
        "Content-Type": "application/json"
    }
    payload = {
        "image_name":image_filename,
        "conversation_id":conversation_id
    }
    try:
        response = http_client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            image_content = data.get("imageSrc",'')
            image_name = data.get("image_name",[])
            return image_content, image_name
        else:
            return None,None
    except Exception as e:
        logger.exception(f"Unknown Exception in fetch_image_bytes, exception : {e}",extra=extras)    
        return None,None

def generate_document_pptx(user_query,model_name,conv_id):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    url = f"{DOCUMENT_GENERATION_BASE_URL}/generate_pptx"

    token_info = get_token_info()
    headers = {
        "Authorization": f"Bearer {token_info}",
        "Content-Type": "application/json"
    }
    payload = {
        "query":user_query,
        "model":model_name,
        "conversation_id":conv_id
    }
    try:
        response = http_client.post(url, json=payload, headers=headers)

        if response.status_code == 200:
            data = response.json()
            return data
        else:
            return None
    except Exception as e:
        logger.exception(f"Unknown Exception in fetch_image_bytes, exception : {e}",extra=extras)    
        return None

