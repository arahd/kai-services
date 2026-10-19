import requests
import json
from logger import logger,get_caller_frame,extras
from typing import List, Dict, Any, Optional
import time

SERVICE_NAME='KAI_AI_CHATBOT_SEARCH_SERVICE'
PROJECT_NAME='KAI'

class WebCrawler:
    """
    Base web crawler class with methods for making POST requests with URL arrays
    """
    
    def __init__(self, timeout: int = 40, retry_attempts: int = 1, delay_between_retries: float = 1.0):
        """
        Initialize the WebCrawler
        
        Args:
            timeout: Request timeout in seconds
            retry_attempts: Number of retry attempts for failed requests
            delay_between_retries: Delay between retry attempts in seconds
        """
        self.timeout = timeout
        self.retry_attempts = retry_attempts
        self.delay_between_retries = delay_between_retries
        self.session = requests.Session()
    
    def post_urls_batch(self, api_url: str, urls: List[str], headers: Optional[Dict[str, str]] = None):
        """
        Base method that makes a POST request with a JSON payload containing an array of URLs
        
        Args:
            api_url: The API endpoint URL to send the POST request to
            urls: List of URLs to be sent in the payload
            headers: Optional headers to include in the request
            
        Returns:
            Dictionary containing the response data with success status and results
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        payload = {"urls": urls}
        
        default_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        if headers:
            default_headers.update(headers)
        final_processed_result = []
        for attempt in range(self.retry_attempts):
            try:
                logger.info(f"Sending POST request to {api_url} with {len(urls)} URLs (attempt {attempt + 1})",extra=extras)
                
                response = self.session.post(
                    api_url,
                    json=payload,
                    headers=default_headers,
                    timeout=self.timeout
                )
                
                response.raise_for_status()  # Raise an exception for bad status codes
                
                result = response.json()
                
                # Check if the response indicates success
                if result.get("success", False):
                    logger.info(f"Request successful. Processing {len(result.get('results', []))} results",extra=extras)
                    
                    # Iterate through results if they exist
                    if "results" in result:
                        final_processed_result = self._process_results(result["results"])
                else:
                    logger.warning(f"API returned success=False: {result}",extra=extras)
                    return  {
                        "success": False,
                        "error": f"Request failed after {self.retry_attempts}"
                    }
                return {
                        "success": True,
                        "results": final_processed_result
                    }
                    
            except requests.exceptions.RequestException as e:
                logger.error(f"Request failed (attempt {attempt + 1}): {str(e)}",extra=extras)
                
                if attempt < self.retry_attempts - 1:
                    logger.info(f"Retrying in {self.delay_between_retries} seconds...",extra=extras)
                    time.sleep(self.delay_between_retries)
                else:
                    logger.error("All retry attempts failed",extra=extras)
                    return {
                        "success": False,
                        "error": f"Request failed after {self.retry_attempts} attempts: {str(e)}"
                    }
            
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {str(e)}",extra=extras)
                return {
                    "success": False,
                    "error": f"Invalid JSON response: {str(e)}"
                }
            
            except Exception as e:
                logger.error(f"Unexpected error: {str(e)}",extra=extras)
                return {
                    "success": False,
                    "error": f"Unexpected error: {str(e)}"
                }
        
        # Fallback return (should not be reached)
        return {
            "success": False,
            "error": "Request failed after all attempts"
        }
    
    def _process_results(self, results: List[Dict[str, Any]]):
        """
        Process the results returned from the API
        Override this method in subclasses for custom processing
        
        Args:
            results: List of result dictionaries from the API response
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        final_result_html = []

        for i, result in enumerate(results):
            if result.get('success',False):
                final_result_html.append({"url":result.get('url'),"html_content":result.get('html')})
            else:
                logger.error(f"Failed to crawl {result.get('url')}: {result.get('error_message')}",extra=extras)
        return final_result_html
    
    def crawl_urls_batch(self, api_url: str, urls: List[str], batch_size: int = 10, headers: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
        """
        Crawl multiple URLs by sending them in batches to an API endpoint
        
        Args:
            api_url: The API endpoint URL
            urls: List of URLs to crawl
            batch_size: Number of URLs to send in each batch
            headers: Optional headers to include in requests
            
        Returns:
            List of all results from all batches
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        all_results = []
        
        # Process URLs in batches
        for i in range(0, len(urls), batch_size):
            batch_urls = urls[i:i + batch_size]
            logger.info(f"Processing batch {i // batch_size + 1}: URLs {i + 1} to {min(i + batch_size, len(urls))}",extra=extras)
            
            response = self.post_urls_batch(api_url, batch_urls, headers)
            
            if response.get("success", False):
                batch_results = response.get("results", [])
                all_results.extend(batch_results)
            else:
                logger.error(f"Batch failed: {response.get('error', 'Unknown error')}",extra=extras)
        
        return all_results
    
    def close(self):
        """Close the session"""
        self.session.close()