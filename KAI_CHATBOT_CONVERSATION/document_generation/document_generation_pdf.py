import io
import os
import re
import base64
import unicodedata

from functools import lru_cache
from html import escape


# ---------------------------------------------------------------------------
# PyMuPDF import
# ---------------------------------------------------------------------------

try:
    import pymupdf
except ImportError:  # PyMuPDF < 1.24.3
    import fitz as pymupdf


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

MARGIN = 30
FOOTER_HEIGHT = 20

LOGO_PATH = os.path.join(
    BASE_DIR,
    "assets",
    "kai_logo.png"
)

FONT_DIR = os.path.join(
    BASE_DIR,
    "assets",
    "fonts"
)

LOGO_MAX_WIDTH = 20
LOGO_MAX_HEIGHT = 20


# ---------------------------------------------------------------------------
# Text / HTML behavior
# ---------------------------------------------------------------------------

# Text is passed through as HTML.
#
# Example:
#
#     "Hello <b>world</b>"
#
# will render "world" as bold.
#
# Set this to True if input text can contain literal:
#
#     <
#     >
#     &
#
# and those should NOT be interpreted as HTML.
ESCAPE_TEXT = False


# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------

ALIGN_MAP = {
    "left": "left",
    "center": "center",
    "right": "right",
    "justify": "justify",
}


# ---------------------------------------------------------------------------
# Generic font mapping
# ---------------------------------------------------------------------------

FONT_GENERIC = {
    "calibri": "sans-serif",
    "abadi": "sans-serif",
    "arial": "sans-serif",
    "helvetica": "sans-serif",
    "palatino linotype": "serif",
    "times new roman": "serif",
    "courier new": "monospace",
}


# ---------------------------------------------------------------------------
# Heading sizes
# ---------------------------------------------------------------------------

HEADING_SIZES = {
    "h1": 24,
    "h2": 20,
    "h3": 16,
    "h4": 14,
    "h5": 12,
    "h6": 10,
}


# ---------------------------------------------------------------------------
# Script -> font family mapping
# ---------------------------------------------------------------------------

SCRIPT_FONTS = {
    "sans": "NotoSans",

    "tamil": "NotoSansTamil",
    "devanagari": "NotoSansDevanagari",
    "bengali": "NotoSansBengali",
    "gujarati": "NotoSansGujarati",
    "gurmukhi": "NotoSansGurmukhi",
    "telugu": "NotoSansTelugu",
    "kannada": "NotoSansKannada",
    "malayalam": "NotoSansMalayalam",
    "sinhala": "NotoSansSinhala",

    "thai": "NotoSansThai",

    "arabic": "NotoSansArabic",
    "hebrew": "NotoSansHebrew",

    "zh": "NotoSansSC",
    "ja": "NotoSansJP",
    "ko": "NotoSansKR",
}


# ---------------------------------------------------------------------------
# Optional bundled fonts -> @font-face
# ---------------------------------------------------------------------------

def _discover_fonts():
    """
    Return:

        available: {script_key: family}
        font_face_css: CSS @font-face declarations
    """

    available = {}
    css = []

    if not os.path.isdir(FONT_DIR):
        return available, ""

    for key, family in SCRIPT_FONTS.items():

        regular = f"{family}-Regular.ttf"
        bold = f"{family}-Bold.ttf"

        regular_path = os.path.join(
            FONT_DIR,
            regular
        )

        if not os.path.exists(regular_path):
            continue

        bold_path = os.path.join(
            FONT_DIR,
            bold
        )

        bold_file = (
            bold
            if os.path.exists(bold_path)
            else regular
        )

        css.append(
            f"@font-face {{ "
            f"font-family: '{family}'; "
            f"font-weight: normal; "
            f"src: url('{regular}'); "
            f"}}"
        )

        css.append(
            f"@font-face {{ "
            f"font-family: '{family}'; "
            f"font-weight: bold; "
            f"src: url('{bold_file}'); "
            f"}}"
        )

        available[key] = family

    return available, "\n".join(css)


AVAILABLE_SCRIPT_FONTS, FONT_FACE_CSS = _discover_fonts()


# ---------------------------------------------------------------------------
# Script detection
# ---------------------------------------------------------------------------

SCRIPT_RANGES = [

    # Latin extended
    (0x0100, 0x024F, "sans"),
    (0x1E00, 0x1EFF, "sans"),

    # Greek
    (0x0370, 0x03FF, "sans"),

    # Cyrillic
    (0x0400, 0x052F, "sans"),

    # Hebrew
    (0x0590, 0x05FF, "hebrew"),
    (0xFB1D, 0xFB4F, "hebrew"),

    # Arabic
    (0x0600, 0x06FF, "arabic"),
    (0x0750, 0x077F, "arabic"),
    (0xFB50, 0xFDFF, "arabic"),
    (0xFE70, 0xFEFF, "arabic"),

    # Devanagari
    (0x0900, 0x097F, "devanagari"),
    (0xA8E0, 0xA8FF, "devanagari"),

    # Bengali
    (0x0980, 0x09FF, "bengali"),

    # Gurmukhi
    (0x0A00, 0x0A7F, "gurmukhi"),

    # Gujarati
    (0x0A80, 0x0AFF, "gujarati"),

    # Tamil
    (0x0B80, 0x0BFF, "tamil"),

    # Telugu
    (0x0C00, 0x0C7F, "telugu"),

    # Kannada
    (0x0C80, 0x0CFF, "kannada"),

    # Malayalam
    (0x0D00, 0x0D7F, "malayalam"),

    # Sinhala
    (0x0D80, 0x0DFF, "sinhala"),

    # Thai
    (0x0E00, 0x0E7F, "thai"),

    # Korean
    (0x1100, 0x11FF, "ko"),
    (0x3130, 0x318F, "ko"),
    (0xAC00, 0xD7AF, "ko"),

    # Japanese
    (0x3040, 0x30FF, "ja"),
    (0x31F0, 0x31FF, "ja"),

    # CJK / Han
    (0x3000, 0x303F, "han"),
    (0x3400, 0x4DBF, "han"),
    (0x4E00, 0x9FFF, "han"),
    (0xFF00, 0xFFEF, "han"),
    (0x20000, 0x2A6DF, "han"),
]


TAG_RE = re.compile(
    r"(<[^>]*>)"
)

TOKEN_RE = re.compile(
    r"&#?\w+;|.",
    re.DOTALL
)


# ---------------------------------------------------------------------------
# Character script detection
# ---------------------------------------------------------------------------

@lru_cache(maxsize=4096)
def char_script(ch: str):

    cp = ord(ch)

    if cp < 0x80:
        return "latin" if ch.isalpha() else None

    for start, end, key in SCRIPT_RANGES:

        if start <= cp <= end:
            return key

    # Neutral characters:
    # punctuation, symbols, spaces, controls, etc.
    if unicodedata.category(ch)[0] in "PSZC":
        return None

    return "latin" if cp <= 0xFF else "sans"


# ---------------------------------------------------------------------------
# Han language detection
# ---------------------------------------------------------------------------

def _pick_han(plain: str) -> str:

    for ch in plain:

        script = char_script(ch)

        if script in ("ja", "ko"):
            return script

    return "zh"


# ---------------------------------------------------------------------------
# Wrap text runs in matching fonts
# ---------------------------------------------------------------------------

def _wrap_segment(seg: str, han_key: str) -> str:

    runs = []
    pending = ""

    for match in TOKEN_RE.finditer(seg):

        token = match.group(0)

        script = None if len(token) > 1 else char_script(token)

        if script == "han":
            script = han_key

        if script is None:

            if runs:
                runs[-1][1] += token
            else:
                pending += token

        elif runs and runs[-1][0] == script:

            runs[-1][1] += token

        else:

            runs.append([
                script,
                (pending if not runs else "") + token
            ])

            pending = ""

    if not runs:
        return pending

    output = []

    for script, text in runs:

        family = AVAILABLE_SCRIPT_FONTS.get(script)

        if family:

            output.append(
                f"<span style=\"font-family:'{family}'\">"
                f"{text}"
                f"</span>"
            )

        else:
            output.append(text)

    return "".join(output)


# ---------------------------------------------------------------------------
# Apply fonts to HTML text
# ---------------------------------------------------------------------------

def apply_fonts(text: str) -> str:
    """
    Wrap non-Latin runs in spans using available bundled fonts.
    """

    if not AVAILABLE_SCRIPT_FONTS or not text:
        return text

    parts = TAG_RE.split(text)

    # Odd indexes are HTML tags.
    plain_text = "".join(parts[0::2])

    han_key = _pick_han(plain_text)

    for i in range(0, len(parts), 2):

        if parts[i]:

            parts[i] = _wrap_segment(
                parts[i],
                han_key
            )

    return "".join(parts)


# ---------------------------------------------------------------------------
# Text direction
# ---------------------------------------------------------------------------

def text_dir(text: str) -> str:
    """
    Return dir="rtl" if the first strong character is Arabic/Hebrew.
    """

    plain = TAG_RE.sub(
        "",
        text or ""
    )

    for ch in plain:

        bidi = unicodedata.bidirectional(ch)

        if bidi in ("R", "AL"):
            return ' dir="rtl"'

        if bidi == "L":
            return ""

    return ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def font_css(font_family) -> str:

    if not font_family:
        return "sans-serif"

    key = str(
        font_family
    ).strip().lower()

    return FONT_GENERIC.get(
        key,
        "sans-serif"
    )


def align_css(align_str) -> str:

    if not align_str:
        return "left"

    return ALIGN_MAP.get(
        str(align_str).strip().lower(),
        "left"
    )


def css_color(
    value,
    default="#000000"
) -> str:

    if not value:
        return default

    value = str(value).strip()

    if re.fullmatch(
        r"[0-9a-fA-F]{3,8}",
        value
    ):
        value = "#" + value

    # MuPDF CSS parser does not understand #rrggbbaa.
    # Drop the alpha pair.
    if re.fullmatch(
        r"#[0-9a-fA-F]{8}",
        value
    ):
        value = value[:7]

    return value


def hex_to_rgb(
    value,
    default=(1, 1, 1)
):

    value = css_color(
        value,
        ""
    )

    match = re.fullmatch(
        r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})",
        value
    )

    if not match:
        return default

    h = match.group(1)

    if len(h) == 3:
        h = "".join(
            c * 2
            for c in h
        )

    return tuple(
        int(h[i:i + 2], 16) / 255
        for i in (0, 2, 4)
    )


def parse_font_size(
    size_val,
    default=12
) -> int:

    try:
        return int(size_val)

    except (TypeError, ValueError):
        return default


def txt(value) -> str:

    value = (
        ""
        if value is None
        else str(value)
    )

    return (
        escape(value)
        if ESCAPE_TEXT
        else value
    )


def rich(value) -> str:

    return apply_fonts(
        txt(value)
    )


# ---------------------------------------------------------------------------
# Block builders
# ---------------------------------------------------------------------------

def build_heading(block: dict) -> str:

    h_type = (
        block.get("heading_type")
        or "h2"
    ).lower()

    size = parse_font_size(
        block.get("font_size"),
        HEADING_SIZES.get(
            h_type,
            16
        )
    )

    raw = txt(
        block.get("text", "")
    )

    style = (
        f"font-family:{font_css(block.get('font_family'))};"
        f"font-size:{size}pt;"
        f"line-height:{size + 4}pt;"
        f"font-weight:bold;"
        f"color:{css_color(block.get('font_color'))};"
        f"text-align:{align_css(block.get('text_align_type'))};"
        f"margin-top:6pt;"
        f"margin-bottom:6pt;"
    )

    return (
        f'<p{text_dir(raw)} style="{style}">'
        f"<b>{apply_fonts(raw)}</b>"
        f"</p>"
    )


def build_content(block: dict) -> str:

    size = parse_font_size(
        block.get("font_size")
    )

    raw = txt(
        block.get("text", "")
    )

    style = (
        f"font-family:{font_css(block.get('font_family'))};"
        f"font-size:{size}pt;"
        f"line-height:{size + 4}pt;"
        f"color:{css_color(block.get('font_color'))};"
        f"text-align:{align_css(block.get('text_align_type'))};"
        f"margin-top:6pt;"
        f"margin-bottom:6pt;"
    )

    return (
        f'<p{text_dir(raw)} style="{style}">'
        f"{apply_fonts(raw)}"
        f"</p>"
    )


def build_space(block: dict) -> str:

    new_lines = int(
        block.get(
            "new_lines",
            1
        )
    )

    line_font_size = parse_font_size(
        block.get("line_font_size")
    )

    height = new_lines * (
        line_font_size + 2
    )

    # An empty box can collapse,
    # so use one blank line with the wanted height.
    return (
        f'<p style="'
        f"margin:0;"
        f"padding:0;"
        f"font-size:1pt;"
        f"line-height:{height}pt;"
        f'">&nbsp;</p>'
    )


def build_bulleted_list(block: dict) -> str:

    size = parse_font_size(
        block.get("font_size")
    )

    ul_style = (
        f"font-family:{font_css(block.get('font_family'))};"
        f"font-size:{size}pt;"
        f"line-height:{size + 4}pt;"
        f"color:{css_color(block.get('font_color'))};"
        f"text-align:{align_css(block.get('text_align_type'))};"
        f"margin:0;"
        f"padding-left:20pt;"
    )

    items = "".join(
        f'<li{text_dir(txt(item))} '
        f'style="margin-bottom:3pt;">'
        f"{rich(item)}"
        f"</li>"
        for item in block.get(
            "content",
            []
        )
    )

    return (
        f'<ul style="{ul_style}">'
        f"{items}"
        f"</ul>"
    )


def build_table(block: dict) -> str:

    table_content = block.get(
        "table_content",
        []
    )

    if not table_content:
        return ""

    # Header style
    h_font = font_css(
        block.get(
            "table_header_text_font_family"
        )
    )

    h_size = parse_font_size(
        block.get(
            "table_header_text_font_size"
        )
    )

    h_color = css_color(
        block.get(
            "table_header_text_font_color"
        ),
        "#FFFFFF"
    )

    h_bg = css_color(
        block.get(
            "table_header_background_color"
        ),
        "#194c7e"
    )

    h_align = align_css(
        block.get(
            "table_header_text_align_type"
        )
    )

    # Content style
    c_font = font_css(
        block.get(
            "table_content_font_family"
        )
    )

    c_size = parse_font_size(
        block.get(
            "table_content_font_size"
        )
    )

    c_color = css_color(
        block.get(
            "table_content_font_color"
        ),
        "#000000"
    )

    c_bg = css_color(
        block.get(
            "table_content_background_color"
        ),
        "#FFFFFF"
    )

    c_align = align_css(
        block.get(
            "table_content_align_type"
        )
    )

    num_cols = max(
        len(row)
        for row in table_content
    )

    width = f"{100 / num_cols:.2f}%"

    base = (
        f"width:{width};"
        f"border:0.5pt solid #CCCCCC;"
        f"padding:4pt 6pt;"
    )

    header_style = (
        f"{base}"
        f"font-family:{h_font};"
        f"font-size:{h_size}pt;"
        f"line-height:{h_size + 4}pt;"
        f"font-weight:bold;"
        f"color:{h_color};"
        f"background-color:{h_bg};"
        f"text-align:{h_align};"
    )

    content_style = (
        f"{base}"
        f"font-family:{c_font};"
        f"font-size:{c_size}pt;"
        f"line-height:{c_size + 4}pt;"
        f"color:{c_color};"
        f"background-color:{c_bg};"
        f"text-align:{c_align};"
    )

    rows = []

    for row_idx, row in enumerate(
        table_content
    ):

        if row_idx == 0:
            tag = "th"
            style = header_style
        else:
            tag = "td"
            style = content_style

        cells = [
            f'<{tag}{text_dir(txt(cell))} '
            f'style="{style}">'
            f"{rich(cell)}"
            f"</{tag}>"
            for cell in row
        ]

        # Pad short rows
        cells += [
            f'<{tag} style="{style}"></{tag}>'
            for _ in range(
                num_cols - len(row)
            )
        ]

        rows.append(
            f"<tr>{''.join(cells)}</tr>"
        )

    return (
        '<table width="100%" '
        'cellspacing="0" '
        'cellpadding="0" '
        'style="'
        'border-collapse:collapse;'
        'margin-top:6pt;'
        'margin-bottom:6pt;'
        '">'
        f"{''.join(rows)}"
        "</table>"
    )


# ---------------------------------------------------------------------------
# Block builders
#
# IMPORTANT:
#
# page_break is intentionally NOT included here.
#
# page_break is document structure, not HTML content.
# ---------------------------------------------------------------------------

BLOCK_BUILDERS = {
    "heading": build_heading,
    "content": build_content,
    "space": build_space,
    "bulleted_list": build_bulleted_list,
    "table": build_table,
}


# ---------------------------------------------------------------------------
# Document assembly
# ---------------------------------------------------------------------------

def json_to_html_pages(json_input: dict):
    """
    Convert JSON blocks into separate HTML sections.

    Every page_break creates a new section.

    Example:

        content
        content
        page_break
        content
        table
        page_break
        heading

    becomes:

        [
            "<html>...content...</html>",
            "<html>...content + table...</html>",
            "<html>...heading...</html>"
        ]

    This is intentionally done outside CSS because PyMuPDF Story
    does not reliably support CSS page-break properties.
    """

    pages = []
    current_body = []

    for block in json_input.get(
        "content",
        []
    ):

        block_type = (
            block.get("type")
            or ""
        ).lower()

        # ---------------------------------------------------------------
        # TRUE PAGE BREAK
        # ---------------------------------------------------------------

        if block_type == "page_break":

            # Don't create an empty page for consecutive page_breaks
            # or a page_break at the beginning.
            if current_body:

                pages.append(
                    "<html>"
                    "<body>"
                    f"{''.join(current_body)}"
                    "</body>"
                    "</html>"
                )

                current_body = []

            continue

        # ---------------------------------------------------------------
        # Normal block
        # ---------------------------------------------------------------

        builder = BLOCK_BUILDERS.get(
            block_type
        )

        if builder:

            current_body.append(
                builder(block)
            )

        else:

            print(
                f"[WARNING] "
                f"Unknown block type "
                f"'{block_type}' - skipped."
            )

    # Add remaining content
    if current_body:

        pages.append(
            "<html>"
            "<body>"
            f"{''.join(current_body)}"
            "</body>"
            "</html>"
        )

    # Empty document
    if not pages:

        pages.append(
            "<html>"
            "<body>"
            "<p>&nbsp;</p>"
            "</body>"
            "</html>"
        )

    return pages


# ---------------------------------------------------------------------------
# Write one Story completely
# ---------------------------------------------------------------------------

def _write_story(
    story,
    writer,
    mediabox,
    where
):
    """
    Write a Story to the DocumentWriter.

    The Story may require multiple physical PDF pages.

    Returns once the Story has been completely placed.

    IMPORTANT:
    This function always starts with a new physical PDF page.
    """

    while True:

        # ---------------------------------------------------------------
        # Start a NEW physical PDF page
        # ---------------------------------------------------------------

        device = writer.begin_page(
            mediabox
        )

        try:

            # -----------------------------------------------------------
            # Place Story content into the page rectangle
            # -----------------------------------------------------------

            more, filled = story.place(
                where
            )

            # -----------------------------------------------------------
            # Draw the placed Story content
            # -----------------------------------------------------------

            story.draw(
                device
            )

        finally:

            # -----------------------------------------------------------
            # Finish this physical page
            # -----------------------------------------------------------

            writer.end_page()

        # ---------------------------------------------------------------
        # Story is completely consumed
        # ---------------------------------------------------------------

        if not more:
            break


# ---------------------------------------------------------------------------
# Page decoration
# ---------------------------------------------------------------------------

def _decorate_pages(pdf_bytes: bytes, bg_color) -> bytes:
    doc = pymupdf.open("pdf", pdf_bytes)
    use_logo = os.path.exists(LOGO_PATH)
    bg = hex_to_rgb(bg_color) if bg_color else None

    try:
        for page in doc:
            w, h = page.rect.width, page.rect.height

            # Logo first: overlay=False puts it under the page content,
            # in a clean graphics state.
            if use_logo:
                x1 = w - MARGIN
                x0 = x1 - LOGO_MAX_WIDTH
                y1 = h - 15
                y0 = y1 - LOGO_MAX_HEIGHT
                try:
                    page.insert_image(
                        pymupdf.Rect(x0, y0, x1, y1),
                        filename=LOGO_PATH,
                        keep_proportion=True,
                        overlay=False,
                    )
                except Exception as e:
                    print(f"[WARNING] Could not draw footer logo: {e}")
                    use_logo = False

            # Background last, so it sits underneath the logo.
            if bg is not None:
                page.draw_rect(page.rect, color=None, fill=bg, overlay=False)

        return doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def json_to_pdf_base64(
    json_input: dict
) -> str:
    """
    Convert structured JSON to a PDF and return
    a base64-encoded string.

    Supported block types:

        heading
        content
        space
        bulleted_list
        table
        page_break

    Example:

        {
            "document_background_color": "#FFFFFF",

            "content": [

                {
                    "type": "heading",
                    "heading_type": "h1",
                    "text": "Page 1"
                },

                {
                    "type": "content",
                    "text": "This is page one."
                },

                {
                    "type": "page_break"
                },

                {
                    "type": "heading",
                    "heading_type": "h1",
                    "text": "Page 2"
                },

                {
                    "type": "content",
                    "text": "This starts on a new page."
                }

            ]
        }

    The page_break is a TRUE physical page break.
    """
    # -------------------------------------------------------------------
    # Split document into page-break-separated sections
    # -------------------------------------------------------------------

    html_pages = json_to_html_pages(
        json_input
    )

    archive = (pymupdf.Archive(FONT_DIR) if FONT_FACE_CSS else None)
    mediabox = pymupdf.paper_rect("a4")

    where = mediabox + (
        MARGIN,
        MARGIN,
        -MARGIN,
        -(MARGIN + FOOTER_HEIGHT)
    )

    

    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer) # for PDF output buffer
    try:

        # ---------------------------------------------------------------
        # Each item in html_pages is one explicit page-break section.
        #
        # _write_story() ALWAYS starts that section on a NEW physical
        # PDF page.
        # ---------------------------------------------------------------

        for html in html_pages:

            story = pymupdf.Story(
                html=html,
                user_css=(
                    FONT_FACE_CSS
                    or None
                ),
                em=12,
                archive=archive
            )

            _write_story(
                story=story,
                writer=writer,
                mediabox=mediabox,
                where=where
            )

    finally:

        writer.close()

    # -------------------------------------------------------------------
    # Add background and footer logo
    # -------------------------------------------------------------------

    pdf_bytes = _decorate_pages(
        buffer.getvalue(),
        json_input.get(
            "document_background_color"
        )
    )

    # -------------------------------------------------------------------
    # Return base64
    # -------------------------------------------------------------------

    return base64.b64encode(
        pdf_bytes
    ).decode("utf-8")