import re
import os
import json
import base64
from io import BytesIO
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
from docx.shared import Inches, Pt, RGBColor

import dotenv
from urllib.parse import urlparse

from agent_framework import Agent,Message,Content,SkillsProvider

from logger import logger,get_caller_frame
from llm_helpers import TokenCounter
from simple_agent_pool import SimpleAgentPool

from document_generation.document_generation_pdf import json_to_pdf_base64

dotenv.load_dotenv()

PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATIONAL_SERVICE"

def load_prompt_from_file(prompt_file_name:str):
    """Load prompt template from external file"""
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'load_prompt_from_file',
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        # Get the directory where this script is located
        script_dir = os.path.dirname(os.path.abspath(__file__))
        prompts_dir = os.path.join(script_dir, 'prompts')
        prompt_file = os.path.join(prompts_dir, f"{prompt_file_name}.txt")
        
        # Check if file exists
        if not os.path.exists(prompt_file):
            logger.error(f"Prompt file not found: {prompt_file}", extra=extras)
            raise FileNotFoundError(f"Prompt file not found: {prompt_file}")
        
        # Read the prompt from file
        with open(prompt_file, 'r', encoding='utf-8') as f:
            prompt = f.read()
        
        logger.info(f"Successfully loaded prompt from: {prompt_file}", extra=extras)
        return prompt
        
    except Exception as e:
        logger.error(f"Error loading prompt file {prompt_file_name}: {str(e)}", extra=extras)
        raise

    

async def docx_outline_generation(model_name:str,user_query:str,token_counter:TokenCounter,simple_agent_pool:SimpleAgentPool):

    agent = simple_agent_pool.agent_pool.get(model_name,None)
    if not agent:
        agent = simple_agent_pool.agent_pool.get("gpt-4o-mini")
    
    prompt = load_prompt_from_file(prompt_file_name="docx_document_generation")

    system_message = Message( role="system",contents=[
        Content.from_text(text=prompt)
                                               ],)
           
    user_prompt = f"""## User Request Details
Request : {user_query}
"""
    user_message= Message( role="user",contents=[
                                 Content.from_text(text=user_prompt)
                                               ],)

    response = await agent.run(messages=[system_message,user_message])

    token_counter.update_usuage(response=response)
    response=str(response)

    if response.startswith("```") or response.endswith("```"):
                response = re.sub(r"^```(?:json)?\s*", "", response,flags=re.IGNORECASE)
                response = re.sub(r"\s*```$", "", response)
    response = response.strip()

    response = json.loads(response)
    return response


async def generate_docx_file(user_query,model_name,simple_agent_pool:SimpleAgentPool,output_format:str, web_search_context: str = ''):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    token_counter = TokenCounter()
    ppt_file_bytes = None
    ppt_outline_json = None
    slide_contents = list()
    try:
        if web_search_context:
            user_query += f"\n\nContext from Web Search:\n{web_search_context}"
        # prev_slide_details = dict()
        logger.info(f"OUTLINE GENERATION FOR PPT STARTED",extra=extras)
        docx_outline_json = await docx_outline_generation(model_name=model_name,user_query=user_query,token_counter=token_counter,simple_agent_pool=simple_agent_pool)
        logger.info(f"Completed OUTLINE GENERATION FOR PPT",extra = extras)
        logger.info(f"Compiling PPT from generated content",extra = extras)
        if output_format == "docx":
            docx_file_bytes = json_to_docx_base64(data=docx_outline_json)
            return {"docx_file_bytes":docx_file_bytes,"filename":docx_outline_json.get("document_name"),"input_tokens":token_counter.total_input_tokens,"output_tokens":token_counter.total_output_tokens}
        elif output_format == "pdf":
            pdf_file_bytes = json_to_pdf_base64(json_input=docx_outline_json)
            return {"pdf_file_bytes":pdf_file_bytes,"filename":docx_outline_json.get("document_name"),"input_tokens":token_counter.total_input_tokens,"output_tokens":token_counter.total_output_tokens}
        else:
            {"generation_failed":True}
  
    except Exception as e:
        return "Unexpected Error During PPT generation"
    finally:
        del ppt_file_bytes
        del ppt_outline_json
        del slide_contents

ALIGN_MAP = {
    "left": WD_ALIGN_PARAGRAPH.LEFT,
    "center": WD_ALIGN_PARAGRAPH.CENTER,
    "right": WD_ALIGN_PARAGRAPH.RIGHT,
    "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
}


def sanitize_hex(color_str: str) -> str:
    """Strip '#' and return a clean 6-digit hex string."""
    if not color_str:
        return ""
    clean = color_str.strip().lstrip("#")
    return clean if len(clean) in (3, 6, 8) else ""


def hex_to_rgb(hex_str: str) -> RGBColor:
    """Convert hex string (e.g. '#FF5733' or 'FF5733') to RGBColor."""
    clean = sanitize_hex(hex_str)
    if len(clean) == 3:
        clean = "".join([c * 2 for c in clean])
    if len(clean) >= 6:
        r = int(clean[0:2], 16)
        g = int(clean[2:4], 16)
        b = int(clean[4:6], 16)
        return RGBColor(r, g, b)
    return RGBColor(0, 0, 0)


def parse_font_size(size_str) -> Pt:
    """Parse font size from int, float, or string like '14', '14pt'."""
    if not size_str:
        return None
    match = re.search(r"(\d+(\.\d+)?)", str(size_str))
    if match:
        return Pt(float(match.group(1)))
    return None


def apply_font_styles(run, font_family="", font_size="", font_color=""):
    """Apply family, size, and color to a Run."""
    if font_family:
        run.font.name = font_family
    if font_size:
        size_pt = parse_font_size(font_size)
        if size_pt:
            run.font.size = size_pt
    if font_color:
        run.font.color.rgb = hex_to_rgb(font_color)


def set_cell_background(cell, fill_hex: str):
    """Set background shading on a table cell."""
    clean_hex = sanitize_hex(fill_hex)
    if clean_hex:
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{clean_hex}"/>')
        cell._tc.get_or_add_tcPr().append(shading)


def json_to_docx_base64(data) -> str:
    if isinstance(data, str):
        data = json.loads(data)

    doc = Document()

    
    bg_color = sanitize_hex(data.get("document_background_color", ""))

#__________________adding bg color to docx__________________#
    if bg_color:
        bg_element = parse_xml(f'<w:background {nsdecls("w")} w:color="{bg_color}"/>')
        doc.element.insert(0, bg_element)
        doc.settings.element.append(
            parse_xml(f'<w:displayBackgroundShape {nsdecls("w")}/>')
        )

#__________________Footer thingy__________________#
    logo_path = "document_generation/assets/kai_logo.png"
    for section in doc.sections:
        footer = section.footer
        footer_p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        footer_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        if os.path.exists(logo_path):
            run = footer_p.add_run()
            run.add_picture(logo_path, height=Inches(0.3))
        else:
            print(f"[Warning] Footer logo not found at: {logo_path}")

#___________________Beginning of the Document Generation_________________#
    for item in data.get("content", []):
        item_type = item.get("type", "").lower()

#__________________Heading Block__________________#
        if item_type == "heading":
            heading_type = str(item.get("heading_type", "1")).lower()
            level = 1
            if "h" in heading_type:
                digits = re.findall(r"\d+", heading_type)
                level = int(digits[0]) if digits else 1
            elif heading_type.isdigit():
                level = int(heading_type)

            p = doc.add_heading(level=min(max(level, 1), 9))
            p.alignment = ALIGN_MAP.get(
                item.get("text_align_type", "left").lower(), WD_ALIGN_PARAGRAPH.LEFT
            )

            run = p.add_run(item.get("text", ""))
            apply_font_styles(
                run,
                font_family=item.get("font_family"),
                font_size=item.get("font_size"),
                font_color=item.get("font_color"),
            )

#__________________Blank Space Block__________________#
        elif item_type == "space":
            lines = item.get("new_lines", 1)
            line_font_size = item.get("line_font_size",10)
            for _ in range(int(lines)):
                para=doc.add_paragraph()
                run = para.add_run()
                run.font.size = Pt(line_font_size)

#__________________Content Block__________________#
        elif item_type == "content":
            p = doc.add_paragraph()
            p.alignment = ALIGN_MAP.get(
                item.get("text_align_type", "left").lower(), WD_ALIGN_PARAGRAPH.LEFT
            )

            run = p.add_run(item.get("text", ""))
            apply_font_styles(
                run,
                font_family=item.get("font_family"),
                font_size=item.get("font_size"),
                font_color=item.get("font_color"),
            )

#__________________Page Break/New page__________________#

        elif item_type == "page_break":
            doc.add_page_break()
    
#__________________Bulleted List Block__________________#

        elif item_type == "bulleted_list":
            align = ALIGN_MAP.get(
                item.get("text_align_type", "left").lower(), WD_ALIGN_PARAGRAPH.LEFT
            )
            for list_item in item.get("content", []):
                p = doc.add_paragraph(style="List Bullet")
                p.alignment = align
                run = p.add_run(str(list_item))
                apply_font_styles(
                    run,
                    font_family=item.get("font_family"),
                    font_size=item.get("font_size"),
                    font_color=item.get("font_color"),
                )

#__________________Table Block__________________#
        elif item_type == "table":
            table_data = item.get("table_content", [])
            if not table_data:
                continue

            num_rows = len(table_data)
            num_cols = max(len(row) for row in table_data)

            table = doc.add_table(rows=num_rows, cols=num_cols)
            table.style = "Table Grid"

            # Style properties for header & rows
            hdr_bg = item.get("table_header_background_color", "")
            hdr_font = item.get("table_header_text_font_family", "")
            hdr_size = item.get("table_header_text_font_size", "")
            hdr_color = item.get("table_header_text_font_color", "")
            hdr_align = ALIGN_MAP.get(
                item.get("table_header_text_align_type", "left").lower(),
                WD_ALIGN_PARAGRAPH.LEFT,
            )

            row_bg = item.get("table_content_background_color", "")
            row_font = item.get("table_content_font_family", "")
            row_size = item.get("table_content_font_size", "")
            row_color = item.get("table_content_font_color", "")
            row_align = ALIGN_MAP.get(
                item.get("table_content_align_type", "left").lower(),
                WD_ALIGN_PARAGRAPH.LEFT,
            )

            for r_idx, row in enumerate(table_data):
                is_header = r_idx == 0
                for c_idx, cell_value in enumerate(row):
                    cell = table.cell(r_idx, c_idx)
                    p = cell.paragraphs[0]
                    p.alignment = hdr_align if is_header else row_align
                    run = p.add_run(str(cell_value))

                    if is_header:
                        set_cell_background(cell, hdr_bg)
                        apply_font_styles(
                            run,
                            font_family=hdr_font,
                            font_size=hdr_size,
                            font_color=hdr_color,
                        )
                    else:
                        set_cell_background(cell, row_bg)
                        apply_font_styles(
                            run,
                            font_family=row_font,
                            font_size=row_size,
                            font_color=row_color,
                        )

    # 4. Save to in-memory bytes and encode as Base64
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    b64_output = base64.b64encode(buffer.read()).decode("utf-8")

    return b64_output