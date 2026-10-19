from semantic_kernel.functions import kernel_function
from conversationalservice.service_route_utils import fetch_from_crawl
from logger import logger,get_caller_frame
import os

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

CONTENT_SEARCH_ENDPOINT = os.getenv("CONTENT_SEARCH_URL")
class WebSearchPlugin:
    last_search = None
    def __init__(self, max_results: int = 5):
        """
        Initialize the plugin with optional max_results for search results.
        """
        self.max_results = max_results
        self.aug_source = []
        self.aug_content = ''

    @kernel_function(
            name="search_web",
        description="""Searches the internet for current, real-time information.
        
        **ONLY use this function when the user's query requires:**
        - Recent news, events, or developments (especially after October 2023)
        - Current data: stock prices, weather, sports scores, exchange rates
        - Latest updates on technology, products, companies, or industry news
        - Breaking news or "what's happening now" queries
        - Information explicitly requested to be searched on the web
        - Current status of services, websites, or online resources
        
        **DO NOT use this function for:**
        - General programming concepts, algorithms, or coding help
        - Explanations of technologies, frameworks, or languages
        - Historical facts or established knowledge
        - Definitions, tutorials, or how-to questions
        - Code debugging or review
        - Writing emails, documents, or professional communication
        - Mathematical or logical problems
        - Theoretical or conceptual questions
        
        When in doubt: if the information is stable and unlikely to change frequently, 
        answer from existing knowledge without searching."""
    )
    async def search_web(self, query: str, region: str = "wt-wt") -> str:
        """
        Perform a web search using DuckDuckGo and return summarized results.

        Args:
            query (str): The user's search query.
            region (str): Optional region code (default = 'wt-wt' = worldwide).
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        try:
            logger.info(f'web search initiated searching for query:{query}',extra=extras)
            search_result = fetch_from_crawl(query=query)
            response = search_result.get('augContent','unable to fetch web content')
            self.aug_source = search_result.get("augSrc",[])
            self.aug_content = search_result.get('augContent','')
            return response
        except Exception as e:
            logger.exception(f'exception occured in fetching web search result.',extra=extras)
            return f"unable to fetch web content"
        