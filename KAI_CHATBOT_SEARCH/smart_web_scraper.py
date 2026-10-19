import requests
from bs4 import BeautifulSoup
from datetime import datetime
import os
from urllib.parse import urlparse
from logger import get_caller_frame,extras,logger
from web_crawler import WebCrawler
from ddgs import DDGS

# Global persistent DDGS client
_ddgs_client = DDGS()

SERVICE_NAME='KAI_AI_CHATBOT_SEARCH_SERVICE'
PROJECT_NAME='KAI'
class SmartWebScraper:
    def __init__(self, search_api_key=None):
        """
        Initialize scraper with optional search API key.
        You can use Google Custom Search API, SerpAPI, or DuckDuckGo
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        self.search_api_key = search_api_key
        self.crawler_api_endpoint = os.getenv('WEB_CRAWLER_URL','')+"crawl"
        self.crawler = WebCrawler(timeout=40, retry_attempts=3)
        logger.info(f'web_crawler_url to be used:{self.crawler_api_endpoint}',extra=extras)

    def clean_href_url(self,url:str):
        """
        Clean and validate href URLs specifically
        """
        if not url:
            return None
        
        # Remove any leading/trailing whitespace and quotes
        url = url.strip().strip('\'"')
        
        # Handle relative URLs or URLs missing scheme
        if url.startswith('//'):
            url = 'https:' + url
        elif not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Basic validation
        try:
            parsed = urlparse(url)
            response = requests.get(url, allow_redirects=True, timeout=10)
            return response.url
            return url if parsed.netloc else None
        except:
            return None
    
    def search_web(self, query, num_results=3, allowed_domains=None, restricted_domains=None):
        try:
            results = []
            search_query = query
            if allowed_domains and len(allowed_domains) > 0:
                domain_str = " OR ".join([f"site:{d}" for d in allowed_domains])
                search_query += f" {domain_str}"
            if restricted_domains and len(restricted_domains) > 0:
                restricted_str = " ".join([f"-site:{d}" for d in restricted_domains])
                search_query += f" {restricted_str}"
                
            search_results = list(_ddgs_client.text(
                search_query,
                max_results=num_results
            ))
            for r in search_results:
                url = r.get("href") or r.get("url")
                title = r.get("title", "")

                if url:
                    results.append({"url": url,"title": title})
                    
            return results
        except Exception as e:
            print(f"Search error: {e}")
            return []


    def scrape_html_data(self, url,html_data):
        """Fetch and parse content from a URL with better content extraction"""
        try:            
            soup = BeautifulSoup(html_data, 'html.parser')
            
            # Get title
            title = soup.find('title')
            title = title.text.strip() if title else "No title"
            
            # Remove unwanted elements
            for element in soup(["script", "style", "nav", "footer", "ipipframe", "aside", "header", "noscript"]):
                element.decompose()
            
            # Try to find main content area first
            main_content = None
            for selector in ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content']:
                main_content = soup.select_one(selector)
                if main_content:
                    break
            
            # If no main content found, use body
            if not main_content:
                main_content = soup.find('body')
            
            if not main_content:
                main_content = soup
            
            # Get main headings from main content
            headings = []
            for h in main_content.find_all(['h1', 'h2', 'h3']):
                text = h.text.strip()
                if text and len(text) > 3:  # Skip very short headings
                    headings.append(text)
                if len(headings) >= 5:
                    break
            
            # Extract paragraphs for better content
            paragraphs = []
            for p in main_content.find_all('p'):
                text = p.get_text(strip=True)
                if len(text) > 50:  # Only include substantial paragraphs
                    paragraphs.append(text)
            
            # If no good paragraphs, fall back to all text
            if paragraphs:
                content = ' '.join(paragraphs)
            else:
                content = main_content.get_text(separator=' ', strip=True)
            
            # Clean up extra whitespace
            content = ' '.join(content.split())
            
            # Check if we got meaningful content
            if len(content) < 100:
                return {
                    'url': url,
                    'error': 'Insufficient content extracted',
                    'status': 'failed',
                    'scraped_at': datetime.now().isoformat()
                }
            
            # Extract tables as CSV strings
            tables = []
            for table in main_content.find_all('table'):
                csv_rows = []
                for row in table.find_all('tr'):
                    cells = [cell.get_text(strip=True).replace('"', '""') for cell in row.find_all(['th', 'td'])]
                    if cells:
                        csv_rows.append(','.join([f'"{c}"' if ',' in c or '"' in c else c for c in cells]))
                if csv_rows:
                    tables.append('\n'.join(csv_rows))

            return {
                'url': url,  # Use final URL after redirects
                'title': title,
                'headings': headings,
                'content': content[:4000],  # Limit to avoid token overload
                'tables': tables,
                'content_length': len(content),
                'scraped_at': datetime.now().isoformat(),
                'status': 'success'
            }
            
        except Exception as e:
            print(e)
            return {
                'url': url,
                'error': str(e),
                'status': 'failed',
                'scraped_at': datetime.now().isoformat()
            }
    def get_urls(self,list_of_urls_dict):
        return [item["url"] for item in list_of_urls_dict]
    
    def fetch_context(self, question, num_sources=3, allowed_domains=None, restricted_domains=None):
        """
        Complete pipeline: search, scrape, and prepare context for LLM
        """
        print(f"\n🔍 Searching for: {question}")
        
        # Search for relevant URLs
        search_results = self.search_web(question, num_sources, allowed_domains, restricted_domains)
        
        if not search_results:
            return {
                    "augContent": "No search results found. Please try a different question.",
                    "augSrc": []
                }        
        print(f"✓ Found {len(search_results)} results\n")
        
        # Scrape each URL
        scraped_data = []
        html_content = self.crawler.crawl_urls_batch(self.crawler_api_endpoint,self.get_urls(search_results))
    

        for i, result in enumerate(html_content, 1):
            data = self.scrape_html_data(result.get("url"),result.get("html_content"))
            scraped_data.append(data)
            
            if data['status'] == 'success':
                print(f"    ✓ Success ({data['content_length']} chars total, using {len(data['content'])} chars)")
            else:
                print(f"    ✗ Failed: {data['error']}")
        
        # Format for LLM
        context = self._build_context(scraped_data)
        
        augurls = []
        aug_tables = []
        success_data = [d for d in scraped_data if d['status'] == 'success']
        for i, data in enumerate(success_data, 1):
            augurls.append({
                f"context_{i}": data.get("content", ""),  # limit to first 500 chars
                "source": data.get("url", "unknown"),
                "type": "web_search"
            })
            if data.get('tables'):
                for t_idx, table_csv in enumerate(data['tables'], 1):
                    aug_tables.append({
                        "csv_content": table_csv,
                        "source_url": data.get("url", "unknown"),
                        "table_id": f"table_{i}_{t_idx}"
                    })

        return {
            "augContent": context,
            "augSrc": augurls,
            "augTables": aug_tables
        }
    
    def _build_context(self, scraped_data):
        """Build context from multiple scraped sources"""
        context_parts = ["Here is information gathered from the web:\n"]
        
        successful = [d for d in scraped_data if d['status'] == 'success']
        
        for i, data in enumerate(successful, 1):
            context_parts.append(f"\n[{i}] Title: {data['title']} URL: {data['url']}")
            
            if data['headings']:
                context_parts.append(f"Key Topics: " + ", ".join(data['headings'][:3]))
            
            context_parts.append(f"Content:\n{data['content']}")
        
        return '\n'.join(context_parts)