
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, HTTPException, status, Security
import os
import requests
# from app.applogging import logger
from app.logger import logger,get_caller_frame,extras
from datetime import datetime,timezone

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_SENSITIVE_SEARCH_SERVICE'
PROJECT_NAME='CHATBOT'

security = HTTPBearer()

# def validate_bearer_token(bearer_token):
#     logger.info(bearer_token)
#     Tok   = bearer_token.split()[1]
#     response = requests.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok})
#     print("response for rolse")


async def get_api_key(auth: HTTPAuthorizationCredentials = Security(security)):
    # logger.info(auth.bearer_token)
    # Tok   = auth.bearer_token.split()[1]

    # if auth.credentials == os.getenv("FASTAPI_APIKEY"):
    # if auth.credentials == "poc@cibcjuly2023":

    #     return auth.credentials 
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    Auth_API_URl = os.getenv('AUTH_URL')
    logger.info(f"sensitive filter endpoints: 'AUTH_URL':{Auth_API_URl}",extra=extras)
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    response = requests.get(Auth_API_URl,headers={'Authorization':"Bearer " + auth.credentials})

    
    if response.status_code == 200:
        logger.info("user validated successfully",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return auth.credentials  
    else:
        logger.exception('Error while Sensitive Search..',extra=extras) 
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        raise HTTPException(    
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate API KEY"
        )
    