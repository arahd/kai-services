import fitz
import io
import os
import re
import csv
import string
import logging
import zipfile
import openpyxl
import pandas as pd
from lxml import html
from tika import parser
from pptx import Presentation
import xml.etree.ElementTree as ET

from utils import extract_key_values, chunk_text
from exceptions import DocumentLimitException
logger = logging.getLogger("parser")

EXCLUDED_HTML_TAGS = [
    'script', 'noscript', 'button', 'svg', 'style', 'picture',
    'figure', 'figcaption', 'header', 'footer', 'link', 'input',
    'form', 'head', 'nav'
]
CHUNK_SIZE = 300  # words per chunk

def chunk_section(section: dict) -> list:
    """Split section content into word chunks."""
    chunks = []
    for chunk in chunk_text(section['content'], words_per_chunk=CHUNK_SIZE):
        chunks.append({
            "doc_id": section["doc_id"],
            "sec_title": section["sec_title"],
            "content": chunk,
            "content_type": section["content_type"]
        })
    return chunks

def parse_pdf(pdf_bytes: bytes, filename: str):
    """
    Parse PDF and extract structured content using a 2-step global chunking process.
    """
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        logger.exception("Failed to open PDF %s: %s", filename, e)
        return []

    max_chunk_size = int(os.getenv('max_chunk', 256))
    overlap = 30
    
    # We collect logical segments first (Key-values, Paragraphs, Tables)
    logical_segments = []
    all_raw_text = []
    html_content = ""

    for page in doc:
        # Extract XHTML for structure and raw text for KV fallback
        html_content += page.get_text("xhtml") or ""
        text = page.get_text("text") or ""
        all_raw_text.extend([line.strip() for line in text.splitlines() if line.strip()])

    # 1. Key-Value Extraction (if helper exists)
    # This assumes extract_key_values is defined in your utils
    try:
        kv_lines = extract_key_values(all_raw_text)
        if kv_lines:
            logical_segments.append({
                "title": "Detected Key-Value Data",
                "content": "\n".join(kv_lines),
                "type": "key_value"
            })
    except ImportError:
        pass # Skip if utility not found

    # 2. HTML Structured Extraction
    if html_content:
        try:
            # Tidy the HTML if library is available
            try:
                from tidylib import tidy_document
                page_tidy_html, _ = tidy_document(html_content, options={"numeric-entities": 1})
            except (ImportError, Exception):
                page_tidy_html = html_content
                
            parsed_page = html.fromstring(page_tidy_html)

            # CLEANUP: Remove excluded tags
            for tag in EXCLUDED_HTML_TAGS:
                for elem in parsed_page.xpath(f'//{tag}'):
                    parent = elem.getparent()
                    if parent is not None:
                        parent.remove(elem)

            body = parsed_page.xpath('//body')[0] if parsed_page.xpath('//body') else parsed_page
            
            cur_heading = "Main Content"
            cur_para = ""

            for element in body.iter():
                tag = element.tag.split('}')[-1].lower()
                if tag == 'body': continue
                
                text_content = element.text_content().strip()
                if not text_content: continue

                # Heading detection (standard tags or short all-caps lines)
                if tag in ['h1', 'h2', 'h3'] or (len(text_content.split()) < 6 and text_content.isupper()):
                    if cur_para:
                        logical_segments.append({"title": cur_heading, "content": cur_para.strip(), "type": "paragraph"})
                    cur_heading = text_content
                    cur_para = ""
                
                elif tag in ['p', 'li', 'div', 'span']:
                    cur_para += " " + text_content
                
                elif tag == 'table':
                    rows = []
                    for row in element.xpath('.//tr'):
                        cells = [c.text_content().strip() for c in row.xpath('.//td|.//th')]
                        if cells: rows.append(" | ".join(cells))
                    if rows:
                        logical_segments.append({
                            "title": cur_heading or "Table", 
                            "content": " || ".join(rows), 
                            "type": "table"
                        })

            # Append the last accumulated paragraph
            if cur_para:
                logical_segments.append({"title": cur_heading, "content": cur_para.strip(), "type": "paragraph"})

        except Exception as e:
            logger.debug(f"HTML structured parsing failed for {filename}: {e}")

    # 3. Fallback: Full text if no segments were captured
    if not logical_segments and all_raw_text:
        logical_segments.append({
            "title": "Full Text",
            "content": " ".join(all_raw_text),
            "type": "fallback"
        })

    # --- PHASE 2: STEP 1 - GLOBAL CHUNKING (Dry Run) ---
    temp_chunks = []
    for seg in logical_segments:
        words = seg["content"].split()
        if not words: continue
        
        start = 0
        step = max_chunk_size - overlap
        while start < len(words):
            end = start + max_chunk_size
            chunk_text = ' '.join(words[start:end])
            
            temp_chunks.append({
                "content": chunk_text,
                "title": seg["title"],
                "type": seg["type"]
            })
            # Ensure we always move forward at least one word
            start += max(1, step)

    # --- PHASE 3: STEP 2 - FINALIZATION ---
    total_parts = len(temp_chunks)
    data = []
    
    for idx, temp in enumerate(temp_chunks, 1):
        # Clean title for readable text
        clean_title = re.sub(r'\s+', ' ', temp['title']).strip()
        
        data.append({
            "doc_id": filename,
            "url": filename,
            "sec_title": f"#{filename} - {clean_title} | Part {idx} of {total_parts}",
            "content": temp["content"].strip(),
            "content_type": temp["type"],
            "image_urls": [],
            "image": False,
            "image_names": []
        })

    try:
        doc.close()
    except:
        pass
        
    logger.info(f"PDF parsing complete for {filename}: {total_parts} total chunks created.")
    return data

def get_readable_text(text):
    if not text:
        return ""
    return ''.join(char for char in text if char in string.printable)

def parse_docx(docx_bytes: bytes, filename: str):
    """Parse DOCX and extract structured content, chunked with 2-step total calculation."""
    MAX_DOCX_PAGES = 2500
    WORDS_PER_PAGE = 500
    
    try:
        zf = zipfile.ZipFile(io.BytesIO(docx_bytes))
        doc_xml = zf.read("word/document.xml")
    except Exception as e:
        logger.exception("Failed to open DOCX %s: %s", filename, e)
        return []

    root = ET.fromstring(doc_xml)
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    body = root.find('w:body', ns)
    if body is None: return []

    # Estimate DOCX pages
    all_text = ' '.join(t.text for t in root.findall('.//w:t', ns) if t.text)
    word_count = len(all_text.split())
    page_breaks = len(root.findall('.//w:br[@w:type="page"]', ns))
    section_breaks = len(root.findall('.//w:sectPr', ns))
    estimated_pages = max(
        page_breaks + section_breaks,
        word_count // WORDS_PER_PAGE + 1
        )

    if estimated_pages > MAX_DOCX_PAGES:
        raise DocumentLimitException(
            message=(
                f"DOCX estimated to have {estimated_pages} pages. "
                f"Maximum allowed is {MAX_DOCX_PAGES}.")
        )

    # extracting text into a linear stream
    elements = []
    current_heading = ""
    styles = {'title': 1, 'subtitle': 1, 'heading1': 2, 'heading2': 3}

    # Iterate through all children of body to maintain order
    for child in body:
        if child.tag.endswith('p'): # Paragraph
            style_val = ''
            pStyle = child.find(".//w:pStyle", ns)
            if pStyle is not None:
                style_val = pStyle.attrib.get(f'{{{ns["w"]}}}val', '').lower()
            
            text = ' '.join([t.text for t in child.findall('.//w:t', ns) if t.text]).strip()
            if not text: continue

            if style_val in styles:
                current_heading = text
            else:
                elements.append({"text": text, "heading": current_heading, "type": "paragraph"})

        elif child.tag.endswith('tbl'): # Table
            rows = []
            for row in child.findall('.//w:tr', ns):
                cells = [c.text for c in row.findall('.//w:t', ns) if c.text]
                if cells: rows.append(' | '.join(cells))
            if rows:
                elements.append({"text": ' || '.join(rows), "heading": current_heading, "type": "table"})

    # Chunking (The Dry Run) basically im running through the chunking loop and creating chunks before appending them to the chunk list
    max_chunk_size = int(os.getenv('max_chunk', 256))
    overlap = 30
    temp_chunks = []
    
    # We combine all text but keep context of the heading
    # To keep it simple and accurate, we split into words globally
    all_words_with_metadata = []
    for el in elements:
        # We store words alongside the heading they belong to
        for word in el["text"].split():
            all_words_with_metadata.append((word, el["heading"], el["type"]))

    start = 0
    while start < len(all_words_with_metadata):
        end = start + max_chunk_size
        chunk_data = all_words_with_metadata[start:end]
        
        # Extract content and determine the primary heading for this chunk
        chunk_text = ' '.join([item[0] for item in chunk_data])
        # Use the heading of the first word in the chunk as the title
        chunk_heading = chunk_data[0][1]
        chunk_type = chunk_data[0][2]
        
        temp_chunks.append({
            "content": chunk_text,
            "heading":  f"### {chunk_heading}" if chunk_heading and chunk_heading!="" else "",
            "type": chunk_type
        })
        start += max(1, max_chunk_size - overlap)

    # 4. STEP 2: Finalize (The Labeling)
    total_parts = len(temp_chunks)
    data = []
    for idx, temp in enumerate(temp_chunks, 1):
        
        data.append({
            "doc_id": filename,
            "url": filename,
            "sec_title": get_readable_text(f"# {filename}\n## Part {idx} of {total_parts}\n  {temp['heading']}"),
            "content": get_readable_text(temp["content"]),
            "content_type": temp["type"],
            "image_urls": [],
            "image": False,
            "image_names": []
        })

    logger.info(f"DOCX parsing complete: {total_parts} chunks created.")
    return data


def parse_txt(txt_bytes: bytes, filename: str):
    """Parse TXT file, clean content, and chunk intelligently."""
    try:
        text_content = txt_bytes.decode("utf-8", errors="ignore").strip()
    except Exception as e:
        logger.exception("Failed to decode TXT %s: %s", filename, e)    
        return []

    # Clean up multiple spaces, tabs, and line breaks
    text_content = re.sub(r'\s+', ' ', text_content)
    text_content = text_content.strip()

    if not text_content:
        logger.warning(f"No text found in TXT file: {filename}")
        return []

    # Chunk parameters
    max_chunk_size = int(os.getenv('max_chunk', 256))
    overlap = 30
    words = text_content.split()
    
    # --- STEP 1: Generate all chunk strings first to get the real count ---
    temp_chunk_texts = []
    start = 0
    step = max_chunk_size - overlap
    
    while start < len(words):
        end = start + max_chunk_size
        chunk_words = words[start:end]
        temp_chunk_texts.append(' '.join(chunk_words))
        
        # Move forward by (size - overlap), ensure at least 1 word move
        start += max(1, step)

    # --- STEP 2: Calculate the real total ---
    total_chunks = len(temp_chunk_texts)
    data = []

    # Helper function matching your requested signature
    def create_chunk(content, chunk_index, total_chunks):
        return {
            "doc_id": filename,
            "url": filename,
            "sec_title": f"# {filename} - Part {chunk_index} of {total_chunks}",
            "content": content.strip(),
            "content_type": "paragraph",
            "image_urls": [],
            "image": False,
            "image_names": []
        }

    # --- STEP 3: Finalize the data objects ---
    for idx, content in enumerate(temp_chunk_texts, 1):
        data.append(create_chunk(
            content=content,
            chunk_index=idx,
            total_chunks=total_chunks
        ))

    logger.info(f"TXT parsing complete for {filename}: {total_chunks} chunks created.")
    return data

def parse_xlsx(xlsx_bytes: bytes, filename: str):
    """Parse XLSX file — includes multiple sheets, data tables, and deep chart info."""
    MAX_XLSX_ROWS = 50000
    try:
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
        total_rows = 0
        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            for row in sheet.iter_rows(values_only=True):
                if any(cell is not None and str(cell).strip() for cell in row):
                    total_rows += 1
        if total_rows > MAX_XLSX_ROWS:
            wb.close()
            raise DocumentLimitException(
                message=(
                    f"Excel file has {total_rows} rows. "
                    f"Maximum allowed is {MAX_XLSX_ROWS}."
                )
            )
    except DocumentLimitException:
        raise
    except Exception as e:
        logger.exception(f"Failed to load XLSX file {filename}: {e}")
        return []

    data = []
    max_chunk_size = int(os.getenv('max_chunk', 256))
    overlap = 30

    def clean_text(value):
        """Normalize cell text."""
        if value is None:
            return ""
        text = str(value).strip()
        return re.sub(r'\s+', ' ', text)

    def create_chunk(content, idx, sheet_name, total_parts):
        """Create standard data chunk."""
        return {
            "doc_id": filename,
            "url": filename,
            "sec_title": f"# {filename} - {sheet_name}\n## Part {idx} of {total_parts}",
            "content": content.strip(),
            "content_type": "table_data",
            "image_urls": [],
            "image": False,
            "image_names": []
        }

    # Iterate all sheets
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        logger.info(f"Parsing sheet: {sheet_name}")
        text_lines = []
        # Extract data from cells
        headers = []
        for row in sheet.iter_rows(values_only=True):
            cleaned = [clean_text(cell) for cell in row]
            if not any(c for c in cleaned):
                continue

            # First non-empty row = headers
            if not headers:
                headers = [h if h else f"Column_{i+1}" for i, h in enumerate(cleaned)]
                continue

            # Pair each value with its column name
            row_text = ' | '.join(
                f"{col}: {val if val else 'N/A'}" for col, val in zip(headers, cleaned)
            )
            text_lines.append(row_text)
        # Extract charts information
        charts = getattr(sheet, "_charts", [])
        for chart in charts:
            try:
                chart_info = []
                # Chart title
                if getattr(chart, "title", None):
                    try:
                        if hasattr(chart.title, "tx") and getattr(chart.title.tx, "rich", None):
                            # Extract rich text
                            title_parts = []
                            for p in chart.title.tx.rich.p:
                                for r in getattr(p, "r", []):
                                    title_parts.append(r.t)
                            chart_info.append("Chart Title: " + " ".join(title_parts))
                        else:
                            chart_info.append(f"Chart Title: {chart.title}")
                    except Exception:
                        chart_info.append("Chart Title: [unavailable]")
                # Axis titles
                if hasattr(chart, "x_axis") and getattr(chart.x_axis, "title", None):
                    chart_info.append(f"X-Axis Title: {chart.x_axis.title}")
                if hasattr(chart, "y_axis") and getattr(chart.y_axis, "title", None):
                    chart_info.append(f"Y-Axis Title: {chart.y_axis.title}")
                # Series names and categories
                if hasattr(chart, "series"):
                    for s in chart.series:
                        series_text = f"Series Name: {getattr(s, 'title', None)}"
                        if getattr(s, "values", None):
                            series_text += f" | Values: {s.values}"
                        if getattr(s, "categories", None):
                            series_text += f" | Categories: {s.categories}"
                        chart_info.append(series_text)

                if chart_info:
                    text_lines.append(" | ".join(chart_info))
            except Exception as e:
                logger.debug(f"Chart extraction failed in {sheet_name}: {e}")

        # Combine all extracted text
        sheet_text = " ".join(text_lines)
        sheet_text = re.sub(r'\s+', ' ', sheet_text).strip()

        if not sheet_text:
            logger.warning(f"No extractable text in sheet: {sheet_name}")
            continue

        # Chunking logic (same as your txt/docx)
        header_context = f"[Sheet: {sheet_name}] Columns: {', '.join(headers)}"
        chunk_index = 1
        i = 0
        n = len(text_lines)
        sheet_chunks = []

        step_size = max_chunk_size - overlap  # ✅ same old logic

        while i < n:
            current_chunk = []
            current_size = 0
            j = i

            # Build chunk (line-based)
            while j < n:
                line = text_lines[j]
                words = line.split()
                line_word_count = len(words)
                # Split oversized single row
                if line_word_count > max_chunk_size:
                    # finalize existing chunk first
                    if current_chunk:
                        break
                    start_idx = 0
                    while start_idx < line_word_count:
                        split_words = words[start_idx:start_idx + max_chunk_size]
                        split_line = " ".join(split_words)
                        chunk_content = header_context + "\n" + split_line
                        sheet_chunks.append((chunk_content, chunk_index))
                        chunk_index += 1
                        # overlap logic
                        start_idx += max_chunk_size - overlap
                    j += 1
                    i = j
                    current_chunk = []
                    current_size = 0
                    continue
                # normal chunking
                if current_size + line_word_count > max_chunk_size and current_chunk:
                    break

                current_chunk.append(line)
                current_size += line_word_count
                j += 1

            # Store chunk
            chunk_content = header_context + "\n" + "\n".join(current_chunk)
            sheet_chunks.append((chunk_content, chunk_index))
            chunk_index += 1

            # ✅ OLD overlap logic (sliding window)
            words_moved = 0
            lines_moved = 0

            while i + lines_moved < n and words_moved < step_size:
                words_moved += len(text_lines[i + lines_moved].split())
                lines_moved += 1

            if lines_moved == 0:
                lines_moved = 1  # safety

            i += lines_moved
        total_parts = len(sheet_chunks)
        for content, idx in sheet_chunks:
            data.append(create_chunk(content, idx, sheet_name, total_parts))

        logger.info(f"Completed sheet: {sheet_name} — {chunk_index - 1} chunks created.")

    wb.close()
    logger.info(f"XLSX parsing complete for {filename}: {len(data)} total chunks.")
    return data


def parse_csv(csv_bytes: bytes, filename: str):
    """Parse CSV file into structured readable chunks with accurate part counting."""
    MAX_CSV_ROWS = 50000
    try:
        text_data = csv_bytes.decode("utf-8", errors="ignore")
    except Exception as e:
        logger.exception("Failed to decode CSV %s: %s", filename, e)
        return []

    try:
        # StringIO for in-memory reading
        df = pd.read_csv(io.StringIO(text_data), sep=None, engine="python")
    except Exception as e:
        logger.warning(f"pandas could not read {filename}, falling back to csv.reader: {e}")
        # Fallback: use CSV reader manually
        reader = csv.reader(io.StringIO(text_data))
        rows = list(reader)
        if not rows:
            logger.warning(f"No data found in CSV file: {filename}")
            return []

        headers = rows[0]
        data_rows = rows[1:]
        df = pd.DataFrame(data_rows, columns=headers if len(headers) == len(rows[1]) else None)

    if df.empty:
        logger.warning(f"No rows parsed from CSV: {filename}")
        return []
    
    row_count = len(df)
    if row_count > MAX_CSV_ROWS:
        # Note: Assuming DocumentLimitException is defined in your environment
        raise Exception(f"CSV has {row_count} rows. Maximum allowed is {MAX_CSV_ROWS}.")

    # Clean headers
    df.columns = [str(col).strip() for col in df.columns]

    # Convert each row into readable natural-language text
    all_lines = []
    for idx, row in df.iterrows():
        # "ColName: Value, ColName2: Value2"
        row_data = ", ".join(
            [f"{col}: {str(row[col])}" for col in df.columns if pd.notna(row[col])]
        )
        row_data = re.sub(r'\s+', ' ', row_data).strip()
        if row_data:
            all_lines.append(f"- Row {idx + 1}: Data:{row_data}\n")

    if not all_lines:
        logger.warning(f"No readable rows found in CSV file: {filename}")
        return []

    # Combine all rows into one word list
    full_text = " ".join(all_lines)
    words = full_text.split()

    # Chunk parameters
    max_chunk_size = int(os.getenv('max_chunk', 256))
    overlap = 30
    
    # --- STEP 1: CHUNKING (Dry Run to get total) ---
    temp_chunk_texts = []
    start = 0
    step = max_chunk_size - overlap
    
    while start < len(words):
        end = start + max_chunk_size
        chunk_words = words[start:end]
        temp_chunk_texts.append(' '.join(chunk_words))
        
        # Ensure the pointer moves forward at least one word
        start += max(1, step)

    # --- STEP 2: FINALIZATION ---
    total_parts = len(temp_chunk_texts)
    data = []

    for idx, content in enumerate(temp_chunk_texts, 1):
        data.append({
            "doc_id": filename,
            "url": filename,
            "sec_title": f"#{filename} | Part {idx} of {total_parts}",
            "content": content.strip(),
            "content_type": "table",
            "image_urls": [],
            "image": False,
            "image_names": []
        })

    logger.info(f"CSV parsing complete for {filename}: {total_parts} chunks created.")
    return data

def parse_pptx(pptx_bytes: bytes, filename: str):
    """Parse PPTX file and extract text, slide titles, table contents, and notes."""
    try:
        prs = Presentation(io.BytesIO(pptx_bytes))
    except Exception as e:
        logger.exception("Failed to open PPTX %s: %s", filename, e)
        return []

    max_chunk_size = int(os.getenv('max_chunk', 256))
    overlap = 30
    
    # This list will hold temporary objects until we know the total count
    all_temp_chunks = []

    def clean_text(text):
        if not text:
            return ""
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def create_chunk(content, slide_num, idx, total_parts, content_type="paragraph"):
        return {
            "doc_id": filename,
            "url": filename,
            "sec_title": f"#{filename} - Part {idx} of {total_parts}\n## Slide {slide_num}",
            "content": content.strip(),
            "content_type": content_type,
            "image_urls": [],
            "image": False,
            "image_names": []
        }

    # Step 1: Collect all chunks from all slides first
    for i, slide in enumerate(prs.slides, start=1):
        slide_text_elements = []

        for shape in slide.shapes:
            if hasattr(shape, "text"):
                txt = clean_text(shape.text)
                if txt:
                    slide_text_elements.append(txt)

            if shape.shape_type == 19:  # TABLE
                for row in shape.table.rows:
                    for cell in row.cells:
                        cell_txt = clean_text(cell.text)
                        if cell_txt:
                            slide_text_elements.append(cell_txt)

        if slide.has_notes_slide:
            notes_text = clean_text(slide.notes_slide.notes_text_frame.text)
            if notes_text:
                slide_text_elements.append(f"Notes: {notes_text}")

        full_slide_text = " ".join(slide_text_elements).strip()
        if not full_slide_text:
            continue

        # Sliding window for this specific slide
        words = full_slide_text.split()
        start = 0
        step = max_chunk_size - overlap
        while start < len(words):
            end = start + max_chunk_size
            chunk_content = ' '.join(words[start:end])
            
            # Store the content and the slide number it belongs to
            all_temp_chunks.append({
                "content": chunk_content,
                "slide_num": i
            })
            
            start += max(1, step)

    # Step 2: Now that we have processed all slides, we know the global total
    total_parts = len(all_temp_chunks)
    data = []

    # Step 3: Finalize the data objects with the global index and total count
    for idx, temp_item in enumerate(all_temp_chunks, 1):
        data.append(create_chunk(
            content=temp_item["content"],
            slide_num=temp_item["slide_num"],
            idx=idx,
            total_parts=total_parts
        ))

    logger.info(f"PPTX parsing complete for {filename}: {total_parts} global chunks created.")
    return data


def parse_with_tika(file_bytes: bytes, filename: str) -> list: 
    """Parse file using Tika and chunk intelligently with a 2-step process."""
    try:
        # Extract text using Tika
        parsed_data = parser.from_buffer(file_bytes)
        content = parsed_data.get('content', None)
        
        if not content:
            logger.warning(f"No extractable text found in {filename}")
            return []

        # Clean up multiple spaces, tabs, and line breaks
        text_content = str(content).strip()
        text_content = re.sub(r'\s+', ' ', text_content)
        text_content = text_content.strip()

        if not text_content:
            return []

        # Chunk parameters
        max_chunk_size = int(os.getenv('max_chunk', 256))
        overlap = 30
        words = text_content.split()
        
        # --- STEP 1: Generate all chunk strings first to get the real count ---
        temp_chunk_texts = []
        start = 0
        step = max_chunk_size - overlap
        
        while start < len(words):
            end = start + max_chunk_size
            chunk_words = words[start:end]
            temp_chunk_texts.append(' '.join(chunk_words))
            
            # Ensure at least 1 word move forward to prevent infinite loops
            start += max(1, step)

        # --- STEP 2: Calculate the real total ---
        total_chunks = len(temp_chunk_texts)
        data = []

        # Helper function for chunk creation
        def create_chunk(content, chunk_index, total_chunks):
            return {
                "doc_id": filename,
                "url": filename,
                "sec_title": f"# {filename} - Part {chunk_index} of {total_chunks}",
                "content": content.strip(),
                "content_type": "paragraph",
                "image_urls": [],
                "image": False,
                "image_names": []
            }

        # --- STEP 3: Finalize the data objects ---
        for idx, content in enumerate(temp_chunk_texts, 1):
            data.append(create_chunk(
                content=content,
                chunk_index=idx,
                total_chunks=total_chunks
            ))

        logger.info(f"Tika parsing complete for {filename}: {total_chunks} chunks created.")
        return data

    except Exception as e:
        logger.error(f"Tika extraction failed or service not responsive for {filename}: {e}")
        return []


def parse_zip(file_bytes:bytes,filename:str,current_depth=1)->list:
    """
        a recursive function to handle Zip files

    """
    data = list()
    if current_depth > 3:
            return data
    
    else:
        with io.BytesIO(file_bytes) as zip_buffer:
            try:
                with zipfile.ZipFile(zip_buffer) as the_zip:
                    for member in the_zip.infolist():

                        if member.is_dir():  # to prevent the file from reading itself(as a .zip)
                            continue
                        
                        member_name = member.filename
                        full_path = f"{str(filename).rsplit('.zip', 1)[0]}/{member_name}"
                        content = the_zip.read(member.filename)
                        if member_name.lower().endswith('.zip'):
                            if current_depth < 3:  
                                next_prefix = full_path.rsplit('.zip', 1)[0] # remove the .zip from name to get the path/filename
                                sub_zib_data = parse_zip(file_bytes=content,filename=full_path,current_depth=current_depth+1)
                                data.extend(sub_zib_data)
                            else:
                                pass
                        else:
                            sub_document_data = parse_with_tika(file_bytes=content,filename=full_path)
                            data.extend(sub_document_data)
                return data
                                       
            except zipfile.BadZipFile as e:
                # This handles cases where a file might have a .zip extension but is invalid
                logger.exception("Failed to open  %s as a zipfile, exception %s", filename, e)
                return data
            except Exception as e:
                logger.exception("Unknown error while handling file:%s as a zipfile, exception %s", filename, e)
                return data




