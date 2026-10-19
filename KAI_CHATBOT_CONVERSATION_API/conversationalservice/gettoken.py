from flask import request
from logger import logger,extras
from datetime import datetime,timezone

def get_token_info():
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    headers = request.headers
    if 'Authorization' in request.headers:
        bearer = headers.get('Authorization')    # Bearer YourTokenHere
        token_info = bearer.split()[1] 
        logger.info("Token has been authorized", extra=extras)
        return token_info
    else:
        logger.info("Token is missing", extra=extras)
        return None