import re
import fitz
from http_client import http_client
from tidylib import tidy_document
from bs4 import BeautifulSoup
from logger import logger,get_caller_frame,extras
from html_custom_parser import CustomHtmlParser
from azure.identity import DefaultAzureCredential
import os
from exceptions import DocumentLimitException
credential = DefaultAzureCredential()
ACCOUNT_URL = os.getenv("BLOB_BASE_URL")

SERVICE_NAME='KAI_AI_CHATBOT_INDEXER_SERVICE'
PROJECT_NAME='KAI'

class ParserChunk:

    def __init__(self,content_name,container_name):
        self.content_name = content_name
        self.CONTAINER_NAME=container_name
        self.pdf_chunk = []
        self.html_chunk = []
        self.customHtmlParser = CustomHtmlParser()

    def parse_and_chunk(self, response_text, filename):
        try:
            html_content = response_text
            heading_tags = ["h1", "h2"]
            soup = BeautifulSoup(html_content, 'lxml')
            title_tag = soup.find('title')
            page_title = title_tag.text.strip() if title_tag else ""
            excluded_tags = ['script', 'noscript', 'button', 'svg', 'style', 'picture',
                             'figure', 'figcaption', 'header', 'footer', 'link', 'input', 'form', 'head', 'nav']

            # Remove excluded tags
            for tag in excluded_tags:
                for elem in soup.find_all(tag):
                    elem.decompose()

            # Remove class attributes
            for elem in soup.find_all(attrs={'class': True}):
                    del elem['class']

            # Remove comments
            from bs4 import Comment
            comments = soup.find_all(string=lambda text: isinstance(text, Comment))
            for comment in comments:
                comment.extract()

            body = soup.find('body')
            data = []
            current_chunk = None
            max_chunk_size = int(os.getenv('max_chunk', 256))
            overlap = 30

            def create_new_chunk(heading="", content="", content_type="paragraph", image_urls=[], image_names=[]):
                return {
                    "doc_id": filename,
                    "url": filename,
                    "sec_title": f"{page_title} | {heading}" if page_title and heading else heading or page_title,
                    "content": content.strip(),
                    "content_type": content_type,
                    "image_urls": image_urls,
                    "image": bool(image_urls),
                    "image_names": image_names
                }

            def add_content_to_chunk(content, content_type="paragraph", is_heading=False):
                nonlocal current_chunk
                if not content.strip():
                    return
                # Initialize chunk if none exists
                if current_chunk is None:
                    current_chunk = create_new_chunk(content if is_heading else "", content if not is_heading else "")
                    return
                # For headings, update the current heading but don't count it towards chunk size
                if is_heading:
                    current_heading = current_chunk['sec_title'].split('|')[-1].strip()
                    new_heading = f"{current_heading} {content}" if current_heading else content
                    current_chunk['sec_title'] = f"{page_title} | {new_heading}" if page_title else new_heading
                    current_chunk['content'] = f"{current_chunk['content']}, {content}:".strip()
                    return
                # Calculate new content size
                combined_content = f"{current_chunk['content']} {content}".strip()
                word_count = len(combined_content.split())
                # If within limit, just add the content
                if word_count <= max_chunk_size:
                    current_chunk['content'] = combined_content
                    return
                # Need to split the content
                remaining_content = content
                while remaining_content:
                    available_space = max_chunk_size - len(current_chunk['content'].split())
                    if available_space <= 0:
                        # Current chunk is full, finalize it
                        data.append(current_chunk)
                        # Start new chunk with overlap from previous
                        overlap_content = ' '.join(current_chunk['content'].split()[-overlap:])
                        current_chunk = create_new_chunk(current_chunk['sec_title'].split('|')[-1].strip(), overlap_content)
                        available_space = max_chunk_size - len(overlap_content.split())
                    # Take as much as we can from remaining content
                    words = remaining_content.split()
                    take_words = min(available_space, len(words))
                    chunk_part = ' '.join(words[:take_words])
                    current_chunk['content'] = f"{current_chunk['content']} {chunk_part}".strip()
                    remaining_content = ' '.join(words[take_words:])
                    # If we've filled the chunk, finalize it
                    if len(current_chunk['content'].split()) >= max_chunk_size:
                        data.append(current_chunk)
                        overlap_content = ' '.join(current_chunk['content'].split()[-overlap:])
                        current_chunk = create_new_chunk(current_chunk['sec_title'].split('|')[-1].strip(), overlap_content)

            # Process all elements in the body
            for element in body.find_all(True):  # True means all tags
                if element.name in heading_tags:
                    # Handle headings - update current heading but don't add to content size
                    heading_text = element.get_text(separator=' ', strip=True)
                    heading_text = re.sub(r'\s+', ' ', heading_text)  # Normalize whitespace
                    heading_text = heading_text.encode("ascii", "ignore").decode()
                    if heading_text:
                        add_content_to_chunk(heading_text, is_heading=True)
                elif element.name == 'table':
                    # Convert table to text representation
                    table_content = self.parse_table_to_markdown(element)
                    if table_content.strip():
                        add_content_to_chunk(table_content, "table")
                elif self.customHtmlParser.is_inside_element_identifier(element,self.customHtmlParser.table_filter_criteria):
                    continue
                elif element.name in {'h3','h4','h5','h6','p', 'ul', 'ol'}:
                    # Regular content
                    content = element.get_text(separator=' ', strip=True)
                    content = re.sub(r'\s+', ' ', content)  # Normalize whitespace
                    content = content.encode("ascii", "ignore").decode()
                    if content:
                        add_content_to_chunk(content)
                elif element.name == 'img':
                    # Handle images (if needed)
                    pass

            # Add the final chunk if it has content
            if current_chunk and current_chunk['content'].strip():
                data.append(current_chunk)
                logger.info(f"{SERVICE_NAME} {filename} html parsed successfully.",extra=extras)
            return data
        except Exception as e:
            logger.exception(f"{SERVICE_NAME} An error occurred in {filename} html parsing: {str(e)}",extra=extras)
            return []

    def parse_and_chunk_pdf(self, filestream,filename):
        extras['functionname'] = get_caller_frame().f_code.co_name
        MAX_PDF_PAGES = 2500
        try:
            doc = fitz.open(stream=filestream, filetype="pdf")
            total_pages = len(doc)
            if total_pages > MAX_PDF_PAGES:
                doc.close()
                logger.error(
                f"{SERVICE_NAME} PDF page limit exceeded for {filename}. "
                f"Pages: {total_pages}, Allowed: {MAX_PDF_PAGES}",
                extra=extras
            )

                raise DocumentLimitException(
                message=f"PDF has {total_pages} pages. Maximum allowed is {MAX_PDF_PAGES}."
            )
            html_content = ""
            logger.info(f"{SERVICE_NAME} Extracting content from PDF {self.content_name}",extra=extras)
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                xhtml_text = page.get_text("xhtml")
                html_content += xhtml_text
                logger.debug(f"{SERVICE_NAME} Extracted content {self.content_name} from page {page_num + 1}", extra=extras)
            doc.close()
        except DocumentLimitException:
            raise
        except Exception as e:
            logger.exception(f"{SERVICE_NAME} Failed to read PDF {filename}: {str(e)}", extra=extras)
        page_tidy_html, errors = tidy_document(html_content, options={'numeric-entities': 1})

        return self.parse_and_chunk(page_tidy_html,filename)

    def parse(self,response,url):    
        extras['functionname'] = get_caller_frame().f_code.co_name     
        try:
            status = 0
            if ".pdf" in url:
                response_direct = http_client.get(url,timeout=60,raise_on_error=False)
                if response_direct.status_code ==200:
                    response = response_direct
                    data = self.parse_and_chunk_pdf(response,url)
                    if data is not None:
                        self.pdf_chunk.extend(data)
                        status = 1    
                else:
                    logger.error(f'pdf url:{url} not fetched properly status code:{response_direct.status_code}',extra=extras)
            else:
                data = self.parse_and_chunk(response,url)
                if data is not None:
                    self.html_chunk.extend(data)
                    status =1
            return status
        except Exception as e:
            logger.exception(f'error occured during parsing html content, {url}',extra=extras)
            return 0

    def get_headers(self, html_content):
        extras['functionname'] = get_caller_frame().f_code.co_name
        heading_tags = ["h1", "h2", "h3", "h4", "h5","h6"]     
        Soup = BeautifulSoup(html_content, 'lxml')
        headset = set()
        for tags in Soup.find_all(heading_tags):
            headset.add(tags.name)
        logger.debug(f"{SERVICE_NAME} Extracted headers: {headset}", extra=extras)
        return headset

    def chunk_data(self, data, maxtoken, overlap):
        extras['functionname'] = get_caller_frame().f_code.co_name
        final_data = []
        for d in data:
            doc_id = d.get("doc_id")
            url = d.get("url")
            sec_title = d.get("sec_title")
            content = d.get("content")
            content_type = d.get("content_type")
            image = d.get("image")
            image_url = d.get("image_urls")
            image_name=d.get("image_names")
            chunks = self.split_text(content,  maxtoken, overlap)

            for chunk in chunks:
                content_chunk = " ".join(chunk)
                final_data.append( {
                            "doc_id": doc_id,
                            "url": url,
                            "sec_title": sec_title,
                            "content": content_chunk,
                            "content_type": content_type,
                            "image" : image,
                            "image_url":image_url,
                            "image_name":image_name
                        })
        
        return final_data

    def split_text(self, text, maxtoken, overlap):
        extras['functionname'] = get_caller_frame().f_code.co_name
        start = 0
        end = maxtoken
        chunks = []
        tokens = text.split()
        logger.info(f"{SERVICE_NAME} Splitting text into chunks of {maxtoken} tokens with overlap {overlap}", extra=extras)

        for i in range(int(len(tokens)/maxtoken)+1):
            chunk = tokens[start:end]
            if chunks and len(chunk)<250:
                chunks[-1].extend(chunk)
            else:
                chunks.append(chunk)
            start = end - overlap
            end = start+maxtoken
        return chunks

    def close_parser(self):
        try:
            self.html_chunk.extend(self.pdf_chunk)
            logger.info(f'content to be uploaded is length:{len(self.html_chunk) if self.html_chunk else "html chunk is none"} for content_name:{self.content_name}',extra=extras)
            self.upload_blob(self.html_chunk)
            logger.info(f'{SERVICE_NAME} Blob upload and parsing run completed for {self.content_name}',extra=extras)
        except Exception as e:
            logger.exception(f'{SERVICE_NAME} {self.content_name} error in closing the spider',extra=extras)

    def parse_table_to_markdown(self, element):
        """
        Parse a BeautifulSoup table element to markdown format
        Args:
            element: BeautifulSoup table element
        Returns:
            str: Markdown formatted table content
        """
        rows = element.find_all('tr')
        if not rows:
            return ""
        markdown_content = ""
        for row in rows:
            cells = row.find_all(['td', 'th'])
            if not cells:
                continue
            # Extract cell content
            row_content = []
            # is_header_row = False
            for cell in cells:
                cell_text = cell.get_text(separator=' ').replace('\n', ' ').replace('\r', ' ').replace('\t', ' ').strip()
                cell_text = cell_text.encode("ascii", "ignore").decode()
                # Handle empty cells
                if not cell_text:
                    cell_text = " "
                row_content.append(cell_text)
            markdown_content += "| " + " | ".join(row_content) + " |\n"
        return markdown_content




