import time
from http_client import http_client
from typing import Union, List 
import os  
import time  
from azure.identity import DefaultAzureCredential  
from logger import logger,get_caller_frame,extras
SERVICE_NAME='KAI_AI_CHATBOT_INDEXER_SERVICE'
PROJECT_NAME='KAI'

credential = DefaultAzureCredential()
azure_openai_auth = os.getenv("AZURE_OPENAI_AUTH_ENDPOINT")

def check_token_validity():
    extras['functionname'] = get_caller_frame().f_code.co_name
    global credential
    tokenResponse = credential.get_token(azure_openai_auth)
    if tokenResponse.expires_on - time.time()<=600:
        credential=DefaultAzureCredential()
        tokenResponse = credential.get_token(azure_openai_auth)
        tok = tokenResponse.token
        return tok
    else:
        tok = tokenResponse.token
        return tok

class embed_openai:  
    def __init__(self,api_type,api_base,api_version,model):  
        self.api_type = api_type   
        self.api_base = api_base  
        self.api_version = api_version  
        self.max_retries = 5  
        self.retry_interval = 10  
        self.model = model   

    def embed_text(self, text: Union[str, List[str]]) -> Union[List[float], List[List[float]], None]:
        extras['functionname'] = get_caller_frame().f_code.co_name

        # Determine if we are processing a single string or a batch
        is_single_input = isinstance(text, str)
        text_list = [text] if is_single_input else text

        # Azure OpenAI supports up to 2,048 inputs per API call
        if len(text_list) > 2048:
            logger.error(f"{SERVICE_NAME} Batch size {len(text_list)} exceeds maximum allowed limit of 2048.", extra=extras)
            return None

        for retry_count in range(self.max_retries):
            try:
                self.api_key = check_token_validity()
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
                data = {
                    "input": text_list,
                    "model": self.model
                }
                url = f"{self.api_base}/openai/deployments/{self.model}/embeddings?api-version={self.api_version}"
                
                response = http_client.post(url, headers=headers, json=data, raise_on_error=False)
                
                if response.status_code == 200:
                    logger.debug(f'{SERVICE_NAME} embedding generated successfully for given text/batch', extra=extras)
                    
                    # Sort the response by 'index' to ensure it aligns with the input list order
                    raw_data = response.json().get('data', [])
                    sorted_data = sorted(raw_data, key=lambda x: x['index'])
                    embeddings = [item['embedding'] for item in sorted_data]
                    
                    # Return list[float] for a single string, or list[list[float]] for a batch
                    return embeddings[0] if is_single_input else embeddings
                    
                else:
                    logger.error(f'{SERVICE_NAME} error in embedding text. status code: {response.status_code}, response text: {response.text}', extra=extras)
                    
                    if response.status_code in [429, 500, 502, 503, 504]:
                        logger.warning(f'Retrying due to status code: {response.status_code}, retry count:{retry_count}', extra=extras)
                        
                        # Parse the exact wait time if Azure returned a "Retry-After" header
                        if response.status_code == 429:
                            retry_after = response.headers.get("Retry-After")
                            if retry_after:
                                try:
                                    # Add 1 second extra buffer
                                    wait_time = int(retry_after) + 1
                                    logger.info(f"Rate limited. Sleeping for {wait_time}s as requested by Azure.", extra=extras)
                                    time.sleep(wait_time)
                                    continue  # Go directly to next retry iteration without waiting twice
                                except ValueError:
                                    pass
                    else:
                        logger.error(f'Retry not possible for status code: {response.status_code}', extra=extras)
                        return None  # Non-retryable error

            except Exception as e:
                logger.exception(f'{SERVICE_NAME} Error in Text Embedding: {e}.', extra=extras)

            # Fallback to exponential backoff if "Retry-After" header was missing/unparseable
            wait_time = self.retry_interval * (2 ** retry_count)
            time.sleep(wait_time)

        return None