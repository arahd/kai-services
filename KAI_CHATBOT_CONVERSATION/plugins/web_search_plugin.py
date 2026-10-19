from agent_framework import Message,Content,tool
from conversationalservice.service_route_utils import fetch_from_crawl
from logger import logger,get_caller_frame,extras
import os
from agent_pool_context_helper import current_aug_source, current_aug_content, current_aug_tables

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

CONTENT_SEARCH_ENDPOINT = os.getenv("CONTENT_SEARCH_URL")

class WebSearchPlugin:
    last_search = None
    def __init__(self, max_results: int = 5):
        """
        Initialize the plugin with optional max_results for search results.
        """
        self.max_results = max_results

    @tool(approval_mode="never_require",
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
    async def search_web(self, queries: list[str], region: str = "wt-wt") -> Message:
        """
        Perform a web search using DuckDuckGo and return summarized results.

        Args:
            queries (list[str]): List of user's search queries.
            region (str): Optional region code (default = 'wt-wt' = worldwide).
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        try:
            queries = queries[:5]
            logger.info(f'web search initiated searching for queries:{queries}',extra=extras)
            search_result = fetch_from_crawl(queries=queries)
            response = search_result.get('augContent','unable to fetch web content')
            
            existing_src = current_aug_source.get()
            existing_src.extend(search_result.get("augSrc",[]))
            
            existing_content = current_aug_content.get()
            new_content = search_result.get('augContent','')
            if new_content:
                existing_content.append(new_content)

            existing_tables = current_aug_tables.get()
            existing_tables.extend(search_result.get('augTables', []))
            
            return Message(  role="tool", contents=[
                Content.from_text(text=str(response))])
        except Exception as e:
            logger.exception(f'exception occured in fetching web search result.',extra=extras)
            return Message(  role="tool", contents=[
                Content.from_text(f"unable to fetch web content")])
        