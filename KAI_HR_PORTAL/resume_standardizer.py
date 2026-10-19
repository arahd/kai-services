import json,copy
from io import BytesIO
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import blue
from prompts.resume_formatter import *
from utils.resume_utils import _register_palatino_fonts
from utils import resume_utils as ru
from docx import Document

_register_palatino_fonts()

def create_resume_docx(template_bytes, data):
    global name, email, linkedin, template_pdf
    if isinstance(data, str):
        data = json.loads(data)
    ru.initialize_globals(template_bytes, data)
    # ================= BUILD =================
    ru.new_page()

    # SUMMARY
    if data.get("professional_summary"):
        ru.section("Professional Summary")
        for item in data["professional_summary"]:
            #  ru.bullet symbol
            indent = ru.BASE_BULLET_INDENT
            bullet_x = ru.LEFT_MARGIN + indent
            text_x = bullet_x + 10
            max_width = ru.RIGHT_MARGIN - text_x
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(bullet_x, ru.content_position, u"\u2022")
            #  justified text
            ru.draw_text_justified(item, text_x, max_width)
    # ================= TECHNICAL SKILLS =================
    if data.get("technical_skills"):
        ru.section("Technical Skills")
        SKILL_LABEL_WIDTH = 170   #  adjust for perfect alignment
        for k, v in data["technical_skills"].items():
            label = k.replace('_', ' ').title()
            value = ", ".join(v) if isinstance(v, list) else str(v)
            if not value or value.strip() == "":
                continue
            indent = ru.BASE_BULLET_INDENT
            bullet_x = ru.LEFT_MARGIN + indent
            label_x = bullet_x + 12
            colon_x = label_x + SKILL_LABEL_WIDTH
            value_x = colon_x + 12
            ru.check_space()
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(bullet_x, ru.content_position, u"\u2022")
            #  Label (bold like image)
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(label_x, ru.content_position, label)
            #  Colon aligned
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(colon_x, ru.content_position, ":")
            #  Value (normal font, wrapped properlru.content_position)
            ru.draw_text(value, x=value_x)
            ru.content_position -= ru.LINE_HEIGHT
    # ================= APPRECIATIONS / AWARDS =================
    if data.get("appreciations_awards"):
        awards = data.get("appreciations_awards", [])
        if awards:   # only render if not empty
            ru.section("Appreciations & Awards")
            for item in awards:
                ru.bullet(item)
    # ================= CERTIFICATIONS =================
    if data.get("certifications"):
        ru.section("Certifications:")
        for cert in data["certifications"]:
            if isinstance(cert, dict):
                name = str(cert.get("name", "")).strip()
                year = str(cert.get("year", "")).strip()
                #  format with dash and year
                if year:
                    cert_text = f"{name} – {year}"
                else:
                    cert_text = name
            else:
                cert_text = str(cert)
            ru.bullet(cert_text, level=0)
    # ================= EMPLOYMENT HISTORY =================
    if data.get("employment_history"):
        ru.section("Employment History")
        for emp in data["employment_history"]:
            #  add spacing BEFORE next line (except first)
            if ru.content_position != ru.TOP:
                ru.content_position -= 6   #  visible gap between ru.bullets
            designation = str(emp.get("designation", "")).strip()
            company = str(emp.get("company", "")).strip()
            start = str(emp.get("start_date", "")).strip()
            end = str(emp.get("end_date") or "Present").strip()
            indent = ru.BASE_BULLET_INDENT
            bullet_x = ru.LEFT_MARGIN + indent
            text_x = bullet_x + 12
            date_text = f"{start} to {end}"
            ru.check_space()
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(bullet_x, ru.content_position, u"\u2022")
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(text_x, ru.content_position, designation)
            role_width = ru.resume_canvas.stringWidth(designation, "Palatino-Bold", 10)
            company_x = text_x + role_width + 5
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(company_x, ru.content_position, f" - {company}")
            company_width = ru.resume_canvas.stringWidth(f" - {company}", "Palatino", 10)
            date_x = company_x + company_width + 5
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(date_x, ru.content_position, f" – {date_text}")
            #  normal line move
            ru.content_position -= ru.LINE_HEIGHT   
    # ================= PROFESSIONAL EXPERIENCE =================
    if data.get("professional_experience"):
        ru.section("Professional Experience")
        ru.content_position -= ru.LINE_HEIGHT * 2
        for exp in data["professional_experience"]:
            company = str(exp.get("company", "")).strip()
            start = str(exp.get("start_date", "")).strip()
            end = str(exp.get("end_date") or "Present").strip()
            date_str = f"{start} - {end}"
            projects = exp.get("projects") or []
            for proj in projects:
                ru.check_space(120)
                desc = proj.get("project_description", [])
                roles = proj.get("roles_responsibilities", [])
                tech_list = proj.get("technologies", [])
                if not desc and not roles and not tech_list:
                    continue
                # COMPANY + DATE (REPEAT FOR EVERY PROJECT)
                if company:
                    ru.resume_canvas.setFont("Palatino-Bold", 10)
                    ru.resume_canvas.drawString(ru.LEFT_MARGIN,ru.content_position,company)
                    ru.resume_canvas.drawRightString(ru.RIGHT_MARGIN,ru.content_position,date_str)
                    ru.content_position -= 4
                    ru.resume_canvas.line(
                        ru.LEFT_MARGIN,
                        ru.content_position,
                        ru.RIGHT_MARGIN,
                        ru.content_position
                    )
                    ru.content_position -= ru.LINE_HEIGHT
                # CLIENT NAME + LOCATION
                client_name = str(proj.get("client_name", "")).strip()
                location = str(proj.get("location", "")).strip()
                ru.resume_canvas.setFont("Palatino-Bold", 10)
                if client_name:
                    ru.resume_canvas.drawString(ru.LEFT_MARGIN,ru.content_position,f"Client Name: {client_name}")
                if location:
                    ru.resume_canvas.drawRightString(ru.RIGHT_MARGIN,ru.content_position,f"Location: {location}")
                ru.content_position -= ru.LINE_HEIGHT * 2
                # PROJECT
                project_name = str(proj.get("project_name", "")).strip()
                if project_name:
                    ru.draw_text(f"Project: {project_name}",bold=True)
                ru.content_position -= ru.LINE_HEIGHT
                # PROJECT DESCRIPTION
                ru.draw_text("Project Description:",bold=True)
                if isinstance(desc, str):
                    desc = [desc]
                for d in desc:
                    ru.bullet(d, level=1)
                ru.content_position -= ru.LINE_HEIGHT
                # ROLES & RESPONSIBILITIES
                if roles:
                    ru.draw_text("Roles and Responsibilities:",bold=True)
                    for r in roles:
                        ru.bullet(r, level=1)
                ru.content_position -= ru.LINE_HEIGHT
                # TECHNOLOGIES
                if tech_list:
                    tech_text = ", ".join(tech_list)
                    ru.resume_canvas.setFont("Palatino-Bold", 10)
                    ru.resume_canvas.drawString(ru.LEFT_MARGIN,ru.content_position,"Technologies:")
                    text_x = (ru.LEFT_MARGIN + ru.resume_canvas.stringWidth("Technologies: ","Palatino-Bold",10))
                    ru.resume_canvas.setFont("Palatino", 10)
                    ru.draw_text(tech_text,x=text_x)
                # GAP BETWEEN PROJECTS
                ru.content_position -= ru.LINE_HEIGHT * 2
    if data.get("education"):
        ru.section("Educational Qualifications")
        for edu in data["education"]:
            ru.check_space()
            degree = str(edu.get("degree", "")).strip()
            institution = str(edu.get("institution", "")).strip()
            score = str(edu.get("percentage", "")).strip()
            year = str(edu.get("year", "")).strip()
            indent = ru.BASE_BULLET_INDENT
            #  ru.bullet
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(ru.LEFT_MARGIN + indent, ru.content_position, u"\u2022")
            x = ru.LEFT_MARGIN + indent + 10
            cur_x = x
            #  1. DEGREE (BOLD)
            if degree:
                ru.resume_canvas.setFont("Palatino-Bold", 10)
                ru.resume_canvas.drawString(cur_x, ru.content_position, degree)
                cur_x += ru.resume_canvas.stringWidth(degree + " - ", "Palatino-Bold", 10)
            #  2. BUILD REST TEXT
            rest_text = ""
            if institution:
                rest_text += institution
            if score:
                rest_text += f" (CGPA: {score})"
            #  3. WRAP REST TEXT
            if rest_text:
                available_width = ru.RIGHT_MARGIN - cur_x
                lines = ru.wrap_text(rest_text, "Palatino", 10, available_width)
                for i, line in enumerate(lines):
                    if i == 0:
                        #  SAME LINE CONTINUE
                        ru.resume_canvas.setFont("Palatino", 10)
                        ru.resume_canvas.drawString(cur_x, ru.content_position, " - " + line)
                    else:
                        #  NEXT LINE
                        ru.content_position -= ru.LINE_HEIGHT
                        ru.check_space()
                        ru.resume_canvas.setFont("Palatino", 10)
                        ru.resume_canvas.drawString(x, ru.content_position, line)
            #  4. YEAR (RIGHT SIDE, BOLD)
            if year:
                ru.resume_canvas.setFont("Palatino-Bold", 10)
                ru.resume_canvas.drawRightString(ru.PAGE_WIDTH - 60, ru.content_position, year)
            ru.content_position -= ru.LINE_HEIGHT
            ru.content_position -= 4
    if ru.resume_canvas:
        ru.resume_canvas.save()
        ru.buffer.seek(0)
        ru.pages.append(ru.buffer)
    total_pages = len(ru.pages)
    writer = PdfWriter()
    for i, pg in enumerate(ru.pages, start=1):
        content = PdfReader(pg)
        footer_buf = BytesIO()
        fc = canvas.Canvas(footer_buf, pagesize=letter)
        fc.setFont("Palatino-Italic", 8)
        fc.drawString(ru.LEFT_MARGIN, ru.FOOTER_Y1,f"Profile of {ru.name} (Page {i} of {total_pages})")
        if ru.email:
            fc.drawRightString(ru.RIGHT_MARGIN, ru.FOOTER_Y1, ru.email)
        if ru.linkedin:
            fc.setFillColor(blue)
            fc.drawString(ru.LEFT_MARGIN, ru.FOOTER_Y2, ru.linkedin)
            width = ru.resume_canvas.stringWidth(ru.linkedin, "Palatino-Italic", 8)
            fc.line(ru.LEFT_MARGIN, ru.FOOTER_Y2 - 2, ru.LEFT_MARGIN + width, ru.FOOTER_Y2 - 2)
        fc.save()
        footer_buf.seek(0)
        footer_pdf = PdfReader(footer_buf)
        base = copy.copy(ru.template_pdf.pages[0])
        base.merge_page(content.pages[0])
        base.merge_page(footer_pdf.pages[0])
        writer.add_page(base)
    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output

'''def create_resume_docx(template_bytes, data):
    doc = Document()
    doc.add_heading(data.get("name", ""),level=1)
    if data.get("professional_summary"):
        doc.add_heading("Professional Summary",level=2)
        for item in data["professional_summary"]:
            doc.add_paragraph(item,style="List Bullet")
    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer'''

def create_resume_pdf(template_bytes, data):
    global name, email, linkedin, template_pdf
    if isinstance(data, str):
        data = json.loads(data)
    ru.initialize_globals(template_bytes, data)
    # ================= BUILD =================
    ru.new_page()
    # SUMMARY
    if data.get("professional_summary"):
        ru.section("Professional Summary")
        for item in data["professional_summary"]:
            #  ru.bullet symbol
            indent = ru.BASE_BULLET_INDENT
            bullet_x = ru.LEFT_MARGIN + indent
            text_x = bullet_x + 10
            max_width = ru.RIGHT_MARGIN - text_x
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(bullet_x, ru.content_position, u"\u2022")
            #  justified text
            ru.draw_text_justified(item, text_x, max_width)
    # ================= TECHNICAL SKILLS =================
    if data.get("technical_skills"):
        ru.section("Technical Skills")
        SKILL_LABEL_WIDTH = 170   #  adjust for perfect alignment
        for k, v in data["technical_skills"].items():
            label = k.replace('_', ' ').title()
                #  Convert value
            value = ", ".join(v) if isinstance(v, list) else str(v)
                #  IMPORTANT: skip empty values
            if not value or value.strip() == "":
                continue
            indent = ru.BASE_BULLET_INDENT
            bullet_x = ru.LEFT_MARGIN + indent
            label_x = bullet_x + 12
            colon_x = label_x + SKILL_LABEL_WIDTH
            value_x = colon_x + 12
            ru.check_space()
            #  ru.bullet
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(bullet_x, ru.content_position, u"\u2022")
            #  Label (bold like image)
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(label_x, ru.content_position, label)
            #  Colon aligned
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(colon_x, ru.content_position, ":")
            ru.draw_text(value, x=value_x)
            ru.content_position -= ru.LINE_HEIGHT
    # ================= APPRECIATIONS / AWARDS =================
    if data.get("appreciations_awards"):
        awards = data.get("appreciations_awards", [])
        if awards:   # only render if not empty
            ru.section("Appreciations & Awards")
            for item in awards:
                ru.bullet(item)
    # ================= CERTIFICATIONS =================
    if data.get("certifications"):
        ru.section("Certifications:")
        for cert in data["certifications"]:
            if isinstance(cert, dict):
                name = str(cert.get("name", "")).strip()
                year = str(cert.get("year", "")).strip()
                # format with dash and year
                if year:
                    cert_text = f"{name} – {year}"
                else:
                    cert_text = name
            else:
                cert_text = str(cert)
            ru.bullet(cert_text, level=0)
    # ================= EMPLOYMENT HISTORY =================
    if data.get("employment_history"):
        ru.section("Employment History")
        for emp in data["employment_history"]:
            #  add spacing BEFORE next line (except first)
            if ru.content_position != ru.TOP:
                ru.content_position -= 6   #  visible gap between ru.bullets
            designation = str(emp.get("designation", "")).strip()
            company = str(emp.get("company", "")).strip()
            start = str(emp.get("start_date", "")).strip()
            end = str(emp.get("end_date") or "Present").strip()
            indent = ru.BASE_BULLET_INDENT
            bullet_x = ru.LEFT_MARGIN + indent
            text_x = bullet_x + 12
            date_text = f"{start} to {end}"
            ru.check_space()
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(bullet_x, ru.content_position, u"\u2022")
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(text_x, ru.content_position, designation)
            role_width = ru.resume_canvas.stringWidth(designation, "Palatino-Bold", 10)
            company_x = text_x + role_width + 5
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(company_x, ru.content_position, f" - {company}")
            company_width = ru.resume_canvas.stringWidth(f" - {company}", "Palatino", 10)
            date_x = company_x + company_width + 5
            ru.resume_canvas.setFont("Palatino-Bold", 10)
            ru.resume_canvas.drawString(date_x, ru.content_position, f" – {date_text}")
            #  normal line move
            ru.content_position -= ru.LINE_HEIGHT
    # ================= PROFESSIONAL EXPERIENCE =================
    if data.get("professional_experience"):
        ru.section("Professional Experience")
        ru.content_position -= ru.LINE_HEIGHT * 2
        for exp in data["professional_experience"]:
            company = str(exp.get("company", "")).strip()
            start = str(exp.get("start_date", "")).strip()
            end = str(exp.get("end_date") or "Present").strip()
            date_str = f"{start} - {end}"
            projects = exp.get("projects") or []
            for proj in projects:
                ru.check_space(120)
                desc = proj.get("project_description", [])
                roles = proj.get("roles_responsibilities", [])
                tech_list = proj.get("technologies", [])
                if not desc and not roles and not tech_list:
                    continue
                # COMPANY + DATE (REPEAT FOR EVERY PROJECT)
                if company:
                    ru.resume_canvas.setFont("Palatino-Bold", 10)
                    ru.resume_canvas.drawString(ru.LEFT_MARGIN,ru.content_position,company)
                    ru.resume_canvas.drawRightString(ru.RIGHT_MARGIN,ru.content_position,date_str)
                    ru.content_position -= 4
                    ru.resume_canvas.line(ru.LEFT_MARGIN,ru.content_position,ru.RIGHT_MARGIN,ru.content_position)
                    ru.content_position -= ru.LINE_HEIGHT
                # CLIENT NAME + LOCATION
                client_name = str(proj.get("client_name", "")).strip()
                location = str(proj.get("location", "")).strip()
                ru.resume_canvas.setFont("Palatino-Bold", 10)
                if client_name:
                    ru.resume_canvas.drawString(ru.LEFT_MARGIN,ru.content_position,f"Client Name: {client_name}")
                if location:
                    ru.resume_canvas.drawRightString(ru.RIGHT_MARGIN,ru.content_position,f"Location: {location}")
                ru.content_position -= ru.LINE_HEIGHT * 2
                # PROJECT
                project_name = str(proj.get("project_name", "")).strip()
                if project_name:
                    ru.draw_text(f"Project: {project_name}",bold=True)
                ru.content_position -= ru.LINE_HEIGHT
                # PROJECT DESCRIPTION
                ru.draw_text("Project Description:",bold=True)
                if isinstance(desc, str):
                    desc = [desc]
                for d in desc:
                    ru.bullet(d, level=1)
                ru.content_position -= ru.LINE_HEIGHT
                # ROLES & RESPONSIBILITIES
                if roles:
                    ru.draw_text("Roles and Responsibilities:",bold=True)
                    for r in roles:
                        ru.bullet(r, level=1)
                ru.content_position -= ru.LINE_HEIGHT
                # TECHNOLOGIES
                if tech_list:
                    tech_text = ", ".join(tech_list)
                    ru.resume_canvas.setFont("Palatino-Bold", 10)
                    ru.resume_canvas.drawString(ru.LEFT_MARGIN,ru.content_position,"Technologies:")
                    text_x = (ru.LEFT_MARGIN + ru.resume_canvas.stringWidth("Technologies: ","Palatino-Bold",10))
                    ru.resume_canvas.setFont("Palatino", 10)
                    ru.draw_text(tech_text,x=text_x)
                # GAP BETWEEN PROJECTS
                ru.content_position -= ru.LINE_HEIGHT * 2
    if data.get("education"):
        ru.section("Educational Qualifications")
        for edu in data["education"]:
            ru.check_space()
            degree = str(edu.get("degree", "")).strip()
            institution = str(edu.get("institution", "")).strip()
            score = str(edu.get("percentage", "")).strip()
            year = str(edu.get("year", "")).strip()
            indent = ru.BASE_BULLET_INDENT
            # ru.bullet
            ru.resume_canvas.setFont("Palatino", 10)
            ru.resume_canvas.drawString(ru.LEFT_MARGIN + indent, ru.content_position, u"\u2022")
            x = ru.LEFT_MARGIN + indent + 10
            cur_x = x
            # 1. DEGREE (BOLD)
            if degree:
                ru.resume_canvas.setFont("Palatino-Bold", 10)
                ru.resume_canvas.drawString(cur_x, ru.content_position, degree)
                cur_x += ru.resume_canvas.stringWidth(degree + " - ", "Palatino-Bold", 10)
            # 2. BUILD REST TEXT
            rest_text = ""
            if institution:
                rest_text += institution
            if score:
                rest_text += f" (CGPA: {score})"
            # 3. WRAP REST TEXT
            if rest_text:
                available_width = ru.RIGHT_MARGIN - cur_x
                lines = ru.wrap_text(rest_text, "Palatino", 10, available_width)
                for i, line in enumerate(lines):
                    if i == 0:
                        # SAME LINE CONTINUE
                        ru.resume_canvas.setFont("Palatino", 10)
                        ru.resume_canvas.drawString(cur_x, ru.content_position, " - " + line)
                    else:
                        # NEXT LINE
                        ru.content_position -= ru.LINE_HEIGHT
                        ru.check_space()
                        ru.resume_canvas.setFont("Palatino", 10)
                        ru.resume_canvas.drawString(x, ru.content_position, line)
            #4. YEAR (RIGHT SIDE, BOLD)
            if year:
                ru.resume_canvas.setFont("Palatino-Bold", 10)
                ru.resume_canvas.drawRightString(ru.PAGE_WIDTH - 60, ru.content_position, year)
            ru.content_position -= ru.LINE_HEIGHT
            ru.content_position -= 4
    if ru.resume_canvas:
        ru.resume_canvas.save()
        ru.buffer.seek(0)
        ru.pages.append(ru.buffer)
    total_pages = len(ru.pages)
    writer = PdfWriter()
    for i, pg in enumerate(ru.pages, start=1):
        content = PdfReader(pg)
        footer_buf = BytesIO()
        fc = canvas.Canvas(footer_buf, pagesize=letter)
        fc.setFont("Palatino-Italic", 8)
        fc.drawString(ru.LEFT_MARGIN, ru.FOOTER_Y1,f"Profile of {ru.name} (Page {i} of {total_pages})")
        if ru.email:
            fc.drawRightString(ru.RIGHT_MARGIN, ru.FOOTER_Y1, ru.email)
        if ru.linkedin:
            fc.setFillColor(blue)
            fc.drawString(ru.LEFT_MARGIN, ru.FOOTER_Y2, ru.linkedin)
            width = ru.resume_canvas.stringWidth(ru.linkedin, "Palatino-Italic", 8)
            fc.line(ru.LEFT_MARGIN, ru.FOOTER_Y2 - 2, ru.LEFT_MARGIN + width, ru.FOOTER_Y2 - 2)
        fc.save()
        footer_buf.seek(0)
        footer_pdf = PdfReader(footer_buf)
        base = copy.copy(ru.template_pdf.pages[0])
        base.merge_page(content.pages[0])
        base.merge_page(footer_pdf.pages[0])
        writer.add_page(base)
    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output





