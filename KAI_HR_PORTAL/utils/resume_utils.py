import os,json,copy
from io import BytesIO
import pdfplumber
from docx import Document
from PyPDF2 import PdfReader
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfbase.pdfmetrics import Font


def _register_palatino_fonts():
    """Register Palatino TTFs if available, else alias the names to built-in Times-Roman.

    Keeps every setFont("Palatino", ...) call working on Linux containers where
    Windows fonts are absent and no TTF files are shipped with the project.
    """
    _here = os.path.dirname(os.path.abspath(__file__))
    candidate_sets = [
        {
            'Palatino':            os.path.join(_here, 'fonts', 'pala.ttf'),
            'Palatino-Bold':       os.path.join(_here, 'fonts', 'palab.ttf'),
            'Palatino-Italic':     os.path.join(_here, 'fonts', 'palai.ttf'),
            'Palatino-BoldItalic': os.path.join(_here, 'fonts', 'palabi.ttf'),
        },
    ]
    for fonts in candidate_sets:
        if all(os.path.isfile(p) for p in fonts.values()):
            try:
                for name, path in fonts.items():
                    pdfmetrics.registerFont(TTFont(name, path))
                return
            except Exception:
                pass

    for alias, face in (('Palatino','Times-Roman'),('Palatino-Bold','Times-Bold'),('Palatino-Italic','Times-Italic'),('Palatino-BoldItalic', 'Times-BoldItalic'),):
        pdfmetrics.registerFont(Font(alias, face, 'WinAnsiEncoding'))


def extract_docx_text(file_path):
    try:
        doc = Document(file_path)
        full_text = []
        for para in doc.paragraphs:
            full_text.append(para.text)
        return "\n".join(full_text)
    except Exception as e:
        # Log or handle error as needed
        return None


def extract_pdf_text(file_path):
    try:
        full_text = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text.append(text)
        return "\n".join(full_text)

    except Exception as e:
        # Log or handle error as needed
        return None
    
# ================= PAGE =================
PAGE_WIDTH, PAGE_HEIGHT = letter
LEFT_MARGIN = 60
RIGHT_MARGIN = 550
TOP = 720
BOTTOM = 80
MAX_WIDTH = PAGE_WIDTH - 120
LINE_HEIGHT = 11.5
SECTION_GAP = 12
SKILL_LABEL_WIDTH = 150   #  adjust this for alignment
BLACK = HexColor("#000000")
FOOTER_Y1 = 30
FOOTER_Y2 = 20
PARA_SPACING = LINE_HEIGHT   #  1.0 spacing (same as line height)
DRAW_SECTION_BORDER=True
BASE_BULLET_INDENT = 10   #  shift all bullets slightly right
DEFAULT_FONT = "Palatino"
DEFAULT_BOLD = "Palatino-Bold"

# ================= DATA =================
name = ""
email = ""
linkedin = ""
template_pdf = None

def initialize_globals(template_bytes, data):
    global name, email, linkedin, template_pdf
    global pages, buffer, resume_canvas,content_position
    name = str(data.get("name", "Unknown")).strip()
    email = str(data.get("email", "")).strip()
    linkedin = str(data.get("linkedin", "")).strip()
    template_pdf = PdfReader(BytesIO(template_bytes))
    pages = []
    buffer = None
    resume_canvas = None
    content_position = TOP


def new_page():
    global buffer, resume_canvas,content_position
    if buffer and resume_canvas:
        resume_canvas.save()
        buffer.seek(0)
        pages.append(buffer)

    buffer = BytesIO()
    resume_canvas = canvas.Canvas(buffer, pagesize=letter)
    content_position = TOP
    resume_canvas.setFillColor(BLACK)
    resume_canvas.setFont("Palatino-Bold", 16)   #  font + size updated
    resume_canvas.drawRightString(RIGHT_MARGIN, PAGE_HEIGHT - 40, name)
    resume_canvas.setFont("Palatino", 10)


def check_space(space=LINE_HEIGHT * 2):
    global content_position
    if content_position - space < BOTTOM:
        new_page()

# ================= TEXT =================
def draw_text(text, x=LEFT_MARGIN, bold=False):
    global content_position

    text = str(text or "")
    font = "Palatino-Bold" if bold else "Palatino"
    words = text.split()
    line = ""

    for word in words:
        test = f"{line} {word}".strip()

        if resume_canvas.stringWidth(test, font, 10) <= (RIGHT_MARGIN - x):
            line = test
        else:
            check_space()

            # CRITICAL FIX → reset font after page break
            resume_canvas.setFont(font, 10)
            resume_canvas.drawString(x,content_position, line)
            content_position -= LINE_HEIGHT
            line = word

    if line:
        check_space()
        # AGAIN reset font
        resume_canvas.setFont(font, 10)
        resume_canvas.drawString(x,content_position, line)
        content_position -= LINE_HEIGHT

def bullet(text, level=0):
    global content_position
    BULLET_TAB = 25

    indent = BASE_BULLET_INDENT + (level * BULLET_TAB)
    check_space()

    # reset font
    resume_canvas.setFont("Palatino", 10)
    resume_canvas.drawString(LEFT_MARGIN + indent,content_position, u"\u2022")
    draw_text(text, x=LEFT_MARGIN + indent + 10)


def section(title):
    global content_position
    check_space(30)

    content_position -= SECTION_GAP
    resume_canvas.setFont("Palatino-Bold", 11)
    resume_canvas.drawString(LEFT_MARGIN,content_position, title)
    content_position -= 5  # spacing after heading

    #  controlled border logic
    if DRAW_SECTION_BORDER:
        resume_canvas.setLineWidth(0.8)
        resume_canvas.setStrokeColor(BLACK)
        resume_canvas.line(LEFT_MARGIN,content_position, RIGHT_MARGIN,content_position)
    content_position -= LINE_HEIGHT

def draw_text_justified(text, x, max_width):
    global content_position
    font = "Palatino"
    size = 10
    resume_canvas.setFont(font, size)
    words = text.split()
    lines = []
    current_line = []

    #  split text into lines
    for word in words:
        test_line = " ".join(current_line + [word])
        if resume_canvas.stringWidth(test_line, font, size) <= max_width:
            current_line.append(word)
        else:
            lines.append(current_line)
            current_line = [word]
    if current_line:
        lines.append(current_line)

    #  draw justified lines
    for i, line_words in enumerate(lines):
        if i == len(lines) - 1:
            # last line → normal left align
            line_text = " ".join(line_words)
            resume_canvas.drawString(x,content_position, line_text)
        else:
            total_words_width = sum(resume_canvas.stringWidth(w, font, size) for w in line_words)
            spaces = len(line_words) - 1
            if spaces > 0:
                space_width = (max_width - total_words_width) / spaces
            else:
                space_width = 0
            cur_x = x
            for w in line_words:
                resume_canvas.drawString(cur_x,content_position, w)
                cur_x += resume_canvas.stringWidth(w, font, size) + space_width
        content_position -= LINE_HEIGHT    


def wrap_text(text, font, size, max_width):
    words = text.split()
    lines = []
    current_line = ""
    for word in words:
        test_line = current_line + (" " if current_line else "") + word
        if stringWidth(test_line, font, size) <= max_width:
            current_line = test_line
        else:
            lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)
    return lines


