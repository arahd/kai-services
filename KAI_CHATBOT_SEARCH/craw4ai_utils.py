from crawl4ai import RateLimiter,BrowserConfig,AsyncWebCrawler,CrawlerRunConfig,CacheMode
from crawl4ai.async_dispatcher import MemoryAdaptiveDispatcher

async def crawl_website(urls):   
    browser_config = BrowserConfig(headless=True, verbose=False)
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.ENABLED,
        stream=False  # Default: get all results at once
    )      

    dispatcher = MemoryAdaptiveDispatcher(
    memory_threshold_percent=80.0,  # Pause if memory exceeds this
    check_interval=1.0,             # How often to check memory
    max_session_permit=10,          # Maximum concurrent tasks
    rate_limiter=RateLimiter(       # Optional rate limiting
        base_delay=(1.0, 2.0),
        max_delay=5.0,
        max_retries=2
    )
) 
    async with AsyncWebCrawler(config=browser_config) as crawler:
        # Get all results at once
        results = await crawler.arun_many(
            urls=urls,
            config=run_config,
            dispatcher=dispatcher
        )
        final_result_html = []

        # Process all results after completion
        for result in results:
            if result.success:
                final_result_html.append({"url":result.url,"html_content":result.html})
            else:
                print(f"Failed to crawl {result.url}: {result.error_message}")
        return final_result_html
