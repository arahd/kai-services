#!/usr/bin/env python3
import os
import logging
import requests
from datetime import datetime, timezone
from typing import cast
from dotenv import load_dotenv

load_dotenv()

LOG_FILE = "inactive_check.log"

# Configure root logger: write to file and stream to console immediately
logger = logging.getLogger()
logger.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")

# File handler
fh = logging.FileHandler(LOG_FILE)
fh.setLevel(logging.INFO)
fh.setFormatter(formatter)
logger.addHandler(fh)

# Console (stream) handler
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
ch.setFormatter(formatter)
logger.addHandler(ch)

def get_ad_token():
    try:
        # support possible typo and the correct env var name
        tenant_id = os.getenv("AZURE_TENENT_ID") or os.getenv("AZURE_TENANT_ID")
        client_id = os.getenv("AZURE_CLIENT_ID")
        client_secret = os.getenv("AZURE_CLIENT_SECRET")
        scope = os.getenv("AD_SCOPE")
        logging.info(f'inactive end chat tenant_id:{tenant_id},client_id:{client_id},client_secret:{client_secret},scope:{scope}')
        # import here so a missing azure.identity package doesn't fail at module import time
        try:
            from azure.identity import ClientSecretCredential
        except Exception:
            logging.exception('azure.identity import failed; obtain azure-identity package to use AD authentication')
            return None

        # Validate required values
        if not all([tenant_id, client_id, client_secret, scope]):
            logging.error('Azure AD auth environment variables missing; cannot acquire token')
            return None

        # cast to str for the credential API (we validated these are present above)
        tenant_id_s = cast(str, tenant_id)
        client_id_s = cast(str, client_id)
        client_secret_s = cast(str, client_secret)
        scope_s = cast(str, scope)

        credential = ClientSecretCredential(tenant_id_s, client_id_s, client_secret_s)
        token = credential.get_token(scope_s)
        return token.token
    except Exception as e:
        logging.exception(f'exception occured in get_ad_token')
        raise


def execute_inactive_check(trigger_name: str):
    utc_timestamp = datetime.now(timezone.utc).isoformat()
    try:
        logging.info(f'{trigger_name} function ran at {utc_timestamp}')
        INACTIVE_ENDPOINT_DEV = os.getenv("INACTIVE_ENDPOINT_DEV")
        token= get_ad_token()
        logging.info(f'inactive endpoint : {INACTIVE_ENDPOINT_DEV}, token: {token}')
        if not INACTIVE_ENDPOINT_DEV or not token:
            logging.error(f'{trigger_name} : Endpoint or token not provided')
            return

        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(INACTIVE_ENDPOINT_DEV ,headers=headers)
        logging.info(f'inactive end chat response status_code :{response.status_code}, response: {response.text}')

        
        if response.status_code == 200:
            logging.info(f"{trigger_name} : API request successful at {utc_timestamp}")
        else:
            logging.warning(f'{trigger_name} : API request failed with status code {response.status_code}')
    except Exception as e:
        logging.error(f'{trigger_name} : API request encountered an error: {str(e)}')
    
    logging.info(f'{trigger_name} function completed at {utc_timestamp}')

def main():
    execute_inactive_check("Chatbot-Inactive-Conv-Dev")
    

if __name__ == "__main__":
    main()
