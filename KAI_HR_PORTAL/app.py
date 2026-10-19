import os
from dotenv import load_dotenv
load_dotenv()
import uuid
from config.keyvault import setallenv_variables
ENV_NAME = os.environ.get("CUSTOMCONNSTR_ENV")
HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
if HOST_NAME_ENV == "AZURE":
    setallenv_variables(ENV_NAME)
# AUTH CONFIG
SERVICE_NAME = "KAI_HR_PORTAL"
PROJECT_NAME = "CHATBOT"
Auth_API_URl = os.getenv("AUTH_URL", "")
KAI_CHATBOT_DEV_HR = os.getenv("KAI_CHATBOT_DEV_HR", "")
KAI_CHATBOT_DEV_ADMIN=os.getenv("KAI_CHATBOT_DEV_ADMIN", "")
# IMPORT AFTER ENV READY
import hashlib
import json
import time
import re
import io
from werkzeug.datastructures import FileStorage
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from utils.document_style_extractor import analyze_document
from zoneinfo import ZoneInfo
from functools import wraps
IST = ZoneInfo("Asia/Kolkata")
import requests
from flask import (Flask,jsonify,make_response,request,send_file,g as request_context)
from flask_cors import CORS
from sqlalchemy import func
from flask import jsonify, request
from config.settings import MODEL
from logging_config.logger import logger, get_caller_frame
from models.tablemodels import *
from utils.redis_utils import RedisClass
from prompts.jd_prompt import *
from prompts.linkedin_prompt import *
from prompts.resume_formatter import *
from prompts.visa_formatter import VISA_PROCESS_PROMPT
from reports.report_generator import generate_fitment_pdf
from resume_standardizer import (create_resume_docx,create_resume_pdf,)
from new_hire_resume_standardizer import (create_resume_docx_for_new_hires,create_resume_pdf_for_new_hires,)
from services.blob_service import (download_blob_as_bytes,get_blob_bytes,load_from_blob,save_resume_docx_to_blob,save_resume_pdf_to_blob,save_to_blob,)
from services.report_service import *
from utils.file_utils import (extract_docx_text,extract_pdf_text,)
from utils.llm_utils import (assess_jd_fit_three_step,call_llm_json_with_tokens,call_llm_json_GPT5,call_llm_json_GPT5_with_tokens,
    call_llm_json_GPT5_visa_process,validate_jd_only,validate_resume_only,call_llm_one_liner_with_tokens)
from utils.visa_process_utils import extract_file_text
app = Flask(__name__)
CORS(app)
app.url_map.strict_slashes = False

@app.before_request
def before_request():
    request_context.db = Session()

@app.teardown_request
def teardown_request(exception):
    db = getattr(request_context,"db",None)
    if db:
        if exception:
            db.rollback()
        db.close()

#TimeZone Utility Helper
from utils.timezone_utils import convert_utc_to_timezone, get_utc_range_for_local_date
 
@app.get("/")
def home():
    return {"success": True, "status": "ok", "model": MODEL, "version":1.0}

# ---------- logging helper ----------
def log_resume_activity(email_id=None,uploaded_file_name=None,downloaded_file_name=None,download_url=None,upload_resume_status=None,download_resume_status=None,upload_visa_status=None,download_visa_status=None,):
    session = Session()
    try:
        log = ResumeProcessActivityLog(email_id=email_id,uploaded_file_name=uploaded_file_name,
            downloaded_file_name=downloaded_file_name,download_url=download_url,upload_resume_status=upload_resume_status,
            download_resume_status=download_resume_status,upload_visa_status=upload_visa_status,
            download_visa_status=download_visa_status,role="USER",process="Resume",process_type="Formatter")
        session.add(log)        
        session.commit()
    except Exception as e:
        session.rollback()
    finally:
        session.close()
       
def log_hr_portal_report(user_name=None,email_id=None,uploaded_file_name=None,downloaded_file_name=None,download_url=None,upload_resume_status=None,
    download_resume_status=None,upload_visa_status=None,download_visa_status=None,process="Resume",process_type="Formatter",token_used=0):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }
    session = Session()
    try:
        status = (upload_resume_status or upload_visa_status or download_resume_status or download_visa_status)
        logger.info((f"Creating HrPortalReportLog | "
                f"user_name={user_name}, "
                f"process={process}, "
                f"process_type={process_type}, "
                f"status={status}, "
                f"token_used={token_used}"),extra=extras)

        record = HrPortalReportLog(user_name=user_name,email_id=email_id,process=process,process_type=process_type,uploaded_file_name=uploaded_file_name,
            downloaded_file_name=downloaded_file_name,download_url=download_url,status=status,token_used=token_used)
        session.add(record)
        session.commit()
        logger.info("Record committed successfully",extra=extras)
    except Exception as e:
        session.rollback()
        logger.exception(f"Error logging report: {str(e)}",extra=extras)
    finally:
        session.close()

# PROFILING HELPER
def log_execution_time(step_name,start_time,extras):
    elapsed = round(time.perf_counter() - start_time,2)
    logger.info(f"{step_name} completed in {elapsed} sec",extra=extras)
    return elapsed

def validate_bearer_token(bearer_token,roles_required):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(IST)}",extra=extras)
    Tok   = bearer_token.split()[1]
    logger.info(f'received token:{Tok},roles_required:{roles_required}',extra=extras)
    response = requests.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok},data={'roles_required':roles_required})
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(IST)}",extra=extras)
    return response

def requires_authorization(roles_required=[]):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            bearer_token = request.headers.get('Authorization')
            result =  validate_bearer_token(bearer_token,roles_required)
            if result.status_code == 409:
                    return jsonify({"error": "Session Expired"}), 409
            if result.status_code != 200:
                return make_response(jsonify(error= "Unauthorized access"), 401)
            else:
                response_content = json.loads(result.content)
                user_groups = response_content.get("groups", [])
                if roles_required:
                    if not any(role in user_groups for role in roles_required):
                        return make_response(jsonify(error="Unauthorized access"),401)
                auth_info = {'current_user':response_content.get('current_user',''),'user_roles':response_content.get('roles',None)}
                return func(*args, auth_info,**kwargs)
        return wrapper
    return decorator

@app.get("/api/health")
def health():
    return {"success": True, "status": "ok", "model": MODEL}

@app.post("/api/assess/jd-fit-multiple")
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def assess_jd_fit_multiple(auth_info):
        extras = {
            "servicename": SERVICE_NAME,
            "functionname": get_caller_frame().f_code.co_name,
            "projectname": PROJECT_NAME,
            "bot_name": "kumaran"
        }
        """
        Process multiple resumes against a single job description
        """
        # 1. Validate inputs
        if "resumes[]" not in request.files:
            return jsonify({"success": False,"error": "At least one resume file is required","error_code": "MISSING_RESUME_FILES"}), 400
        if "jd_pdf" not in request.files:
            return jsonify({"success": False,"error": "Job description file is required","error_code": "MISSING_JD_FILE"}), 400
        resume_files = request.files.getlist("resumes[]")
        jd_file = request.files["jd_pdf"]
        # 2. Validate file count
        if len(resume_files) == 0:
            return jsonify({"success": False,"error": "No resume files uploaded","error_code": "EMPTY_RESUME_LIST"}), 400
        if len(resume_files) > 50:  # Set reasonable limit
            return jsonify({"success": False,"error": f"Too many resumes. Maximum 50 allowed, got {len(resume_files)}","error_code": "TOO_MANY_FILES"}), 400

        # 3. Validate and extract JD text (once)
        jd_file_ext = os.path.splitext(jd_file.filename)[1].lower()
        allowed_extensions = {'.pdf', '.docx'}
        
        if jd_file_ext not in allowed_extensions:
            return jsonify({"success": False,"error": f"Unsupported JD format: {jd_file_ext}. Allowed: PDF, DOCX","error_code": "INVALID_JD_FORMAT"}), 400
        try:
            # Extract JD text
            if jd_file_ext == '.pdf':
                jd_text = extract_pdf_text(jd_file)
            elif jd_file_ext == '.docx':
                jd_text = extract_docx_text(jd_file)
            if not jd_text or not jd_text.strip() or len(jd_text) < 150:
                return jsonify({"success": False,"error": "Job description is too short or could not be extracted","error_code": "INVALID_JD_CONTENT"}), 422
        except Exception as e:
            logger.info(f"JD extraction error: {str(e)}")
            return jsonify({"success": False,"error": "Failed to extract job description content","error_code": "JD_EXTRACTION_FAILED"}), 422
        # 4. Validate JD before processing
        logger.info("\n Step 4: Validating Job Description...")
        try:
            jd_validation = validate_jd_only(jd_text)
            if not jd_validation.get("is_valid", False):
                logger.info(f"Invalid JD: {jd_validation.get('reasoning', 'Unknown reason')}")
                return jsonify({"success": False,
                    "error": "Invalid job description document",
                    "details": {
                        "reasoning": jd_validation.get("reasoning"),
                        "confidence": jd_validation.get("confidence"),
                        "document_type": jd_validation.get("document_type"),
                        "red_flags": jd_validation.get("red_flags", []),
                        "quality_assessment": jd_validation.get("quality_assessment")
                    },"error_code": "INVALID_JD_DOCUMENT"}), 422
            logger.info(f"Valid JD (confidence: {jd_validation.get('confidence')}%)")
        except Exception as e:
            logger.info(f"JD validation failed: {str(e)}")
            return jsonify({"success": False,
                "error": "Failed to validate job description",
                "error_code": "JD_VALIDATION_FAILED"}), 500  
        # 5. Process each resume
        results = []
        failed_resumes = []
        batch_id = str(uuid.uuid4())
        total_tokens_used = 0
        logger.info("\n Step 5: Extracting JD Requirements...",extra=extras)
        # Cache by JD text sha256 so the skill list -- the denominator of every score --
        # is extracted once and stays persistent across server restarts.
        _sha = hashlib.sha256(" ".join(jd_text.split()).encode("utf-8")).hexdigest()
        _redis_inst = RedisClass()
        _redis_prefix = getattr(_redis_inst, 'jd_req_prefix', 'kai_hr:jd_req:')
        _redis_key = f"{_redis_prefix}{_sha}"
        cached_jd_data = None
        if _redis_inst.REDIS_HOST:
            try:
                cached_jd_data = _redis_inst.fetch_key_data(_redis_key)
            except Exception as e:
                logger.warning(f"[JD] Redis fetch exception: {e}", extra=extras)
        if cached_jd_data:
            jd_requirements = json.loads(cached_jd_data)
            logger.info(f"[JD] Redis cache hit {_redis_key[:24]}", extra=extras)
        else:
            jd_requirements = call_llm_json_GPT5(JD_FIT_SYSTEM,JD_EXTRACTION_PROMPT.format(jd_text=jd_text))
            # Canonicalise: strip education/certs/soft skills, collapse aliases,
            # dedupe across tiers (mandatory > preferred > better_to_have), sort A-Z.
            _ALIAS = {"api testing": "API Testing", "rest api testing": "API Testing","rest api": "API Testing", "api validation": "API Testing","sql server": "SQL", "database testing": "SQL","sql and database testing": "SQL","azure devops": "Azure DevOps", "ado": "Azure DevOps","selenium webdriver": "Selenium", "test rail": "TestRail","cicd": "CI/CD", "agile scrum": "Agile", "scrum": "Agile","user acceptance testing": "UAT", "defect management": "Defect Tracking","software development life cycle": "SDLC","software testing life cycle": "STLC",}
            _DROP = ("bachelor", "master", "b.tech", "b.e", "mca", "degree","computer science", "information technology", "istqb", "pmp","csm", "certification", "certified", "communication", "analytical","problem solving", "leadership", "teamwork", "collaboration","attention to detail", "time management")
            _PREFIX = ("knowledge of ", "experience with ", "experience in ","understanding of ", "familiarity with ", "expertise in ","proficiency in ", "working knowledge of ", "strong ")
            _PROF = {"expert": 7.0, "advanced": 5.0, "intermediate": 3.0,"working": 2.0, "familiar": 0.6}

            skills = jd_requirements.get("skills", {}) or {}
            _seen = set()
            for tier_name in ["mandatory", "preferred", "better_to_have"]:
                cleaned = []
                for skill in (skills.get(tier_name) or []):
                    if not isinstance(skill, dict):
                        continue
                    name = str(skill.get("skill", "")).strip()
                    if name.lower() not in ("ci/cd", "tcp/ip", "a/b testing", "i/o","ui/ux", "24/7", "r&d", "p&l"):
                        name = re.sub(r"\s*\([^)]*\)", " ", name)
                        name = re.split(r"\s*[/;]\s*", name)[0]
                    for sep in (" using ", " via ", " or similar", " or equivalent"):
                        name = name.split(sep)[0]
                    for p in _PREFIX:
                        if name.lower().startswith(p):
                            name = name[len(p):]
                            break
                    name = " ".join(name.split()).strip(" .:-")
                    display = _ALIAS.get(name.lower(), name)
                    key = display.lower()
                    if not key or key in _seen or any(d in key for d in _DROP):
                        continue
                    _seen.add(key)
                    prof = str(skill.get("proficiency") or "familiar").lower().strip()
                    prof = prof if prof in _PROF else "familiar"
                    try:
                        yrs = float(skill.get("years") or 0)
                    except (TypeError, ValueError):
                        yrs = 0.0
                    # Keep the model's aliases — they are what makes matching work
                    # for domains no hardcoded dictionary covers.
                    aliases = [str(a).strip() for a in (skill.get("aliases") or [])
                            if str(a).strip() and str(a).strip().lower() != key]
                    if display.lower() != name.lower():
                        aliases.append(name)
                    cleaned.append({"skill": display,"aliases": sorted(set(aliases), key=str.lower),"years": round(yrs or _PROF[prof], 1),"proficiency": prof})
                cleaned.sort(key=lambda s: s["skill"].lower())
                skills[tier_name] = cleaned
            jd_requirements["skills"] = skills
            # Store in Redis with 30-day TTL (2,592,000s) to avoid memory leak and lock score baseline
            if _redis_inst.REDIS_HOST:
                try:
                    _redis_inst.set_key_value(_redis_key, json.dumps(jd_requirements))
                except Exception as e:
                    logger.warning(f"[JD] Redis set exception: {e}", extra=extras)
        logger.info(f"jd_requirements--->{jd_requirements}",extra=extras)
        total_tokens_used = 0
        def _process_single_resume(item):
            idx, resume_filename, resume_bytes = item
            try:
                resume_file_ext = os.path.splitext(resume_filename)[1].lower()
                if resume_file_ext not in allowed_extensions:
                    return (False, {"filename": resume_filename,"error": f"Unsupported format: {resume_file_ext}","error_code": "INVALID_FORMAT"})
                if not resume_bytes or len(resume_bytes) == 0:
                    return (False, {"filename": resume_filename,"error": "File is empty","error_code": "EMPTY_FILE"})
                # Create thread-safe FileStorage object for text extraction
                file_obj = FileStorage(io.BytesIO(resume_bytes), filename=resume_filename)
                # Extract text
                if resume_file_ext == '.pdf':
                    resume_text = extract_pdf_text(file_obj)
                elif resume_file_ext == '.docx':
                    resume_text = extract_docx_text(file_obj)
                if not resume_text or not resume_text.strip() or len(resume_text) < 150:
                    return (False, {
                        "filename": resume_filename,
                        "error": "Could not extract text or text too short",
                        "error_code": "TEXT_EXTRACTION_FAILED"
                    })
                # Validate resume (JD already validated earlier)
                validation_result = validate_resume_only(resume_text)
                if not validation_result.get("is_valid", False):
                    return (False, {
                        "filename": resume_filename,
                        "error": f"Invalid resume: {validation_result.get('document_type', 'unknown')}",
                        "error_code": "VALIDATION_FAILED",
                        "details": validation_result.get("reasoning", ""),
                        "confidence": validation_result.get("confidence", 0),
                        "red_flags": validation_result.get("red_flags", [])
                    })
                
                # Check Redis cache for candidate evaluation result
                resume_sha = hashlib.sha256(" ".join(resume_text.split()).encode("utf-8")).hexdigest()
                eval_cache_key = f"kai_hr:eval:v1.0:{_sha}:{resume_sha}"

                parsed = None
                if _redis_inst and getattr(_redis_inst, 'REDIS_HOST', None):
                    try:
                        cached_eval_data = _redis_inst.fetch_key_data(eval_cache_key)
                        if cached_eval_data:
                            parsed = json.loads(cached_eval_data)
                            logger.info(f"[EVAL] Redis cache hit for {resume_filename} ({eval_cache_key[:32]})")
                    except Exception as e:
                        logger.warning(f"[EVAL] Redis fetch exception: {e}")

                if not parsed:
                    # Perform JD fit analysis using three-step approach
                    parsed = assess_jd_fit_three_step(
                        resume_text,
                        jd_requirements
                    )
                    if _redis_inst and getattr(_redis_inst, 'REDIS_HOST', None):
                        try:
                            _redis_inst.set_key_value(eval_cache_key, json.dumps(parsed))
                        except Exception as e:
                            logger.warning(f"[EVAL] Redis set exception: {e}")

                

                
                # The scoring service returns a total that is not the weighted sum
                # of its own breakdown. Recompute it so the API, the blob and the
                # PDF all report one number.
                _sc = parsed.setdefault("scorecard", {})
                _bd = [b for b in (_sc.get("breakdown") or []) if isinstance(b, dict)]
                _total = 0
                for b in _bd:
                    b["score"] = int(round(float(str(b.get("score", 0)).replace("%", "") or 0)))
                    b["weight"] = int(round(float(str(b.get("weight", 0)).replace("%", "") or 0)))
                    _total += b["score"] * b["weight"] / 100.0
                _claimed = _sc.get("total_score")
                _sc["total_score"] = int(round(_total))
                # Add batch metadata
                parsed["request_id"] = str(uuid.uuid4())
                parsed["batch_id"] = batch_id
                parsed["generated_at"] = datetime.now(IST).isoformat()
                parsed["resume_filename"] = resume_filename
                parsed["resume_index"] = idx
                _verdict_payload = json.dumps({
                    "scorecard": {
                        k: v
                        for k, v in parsed.get("scorecard", {}).items()
                        if k in ("total_score", "tier", "breakdown")
                    },
                    "skill_comparison": parsed.get("skill_comparison", {}),
                    "experience_comparison": parsed.get("experience_comparison", {}),
                    "education_comparison": parsed.get("education_comparison", {}),
                    "certification_comparison": parsed.get("certification_comparison", {})
                }, ensure_ascii=False)
                one_liner_response = call_llm_one_liner_with_tokens(ONE_LINER_SYSTEM,
                    ONE_LINER_VERDICT_PROMPT.format(candidate_analysis=_verdict_payload),)
                one_liner = one_liner_response["data"]
                parsed["scorecard"]["one_liner"] = one_liner.get("one_liner", "")
                # Add UI hints for frontend display
                parsed["ui_hints"] = {
                    "tier_thresholds": {
                        "highly_recommended": 85,
                        "recommended": 70,
                        "reservations": 50
                    },
                    "tier_label_thresholds": {
                        "strong": 75,
                        "moderate": 50
                    },
                    "status_colors": {
                        "Met": "green",
                        "Partial": "amber",
                        "Not Met": "red"
                    },
                    "match_colors": {
                        "matched": "green",
                        "partial": "amber",
                        "not_found": "red"
                    },
                    "verified_colors": {
                        "verified": "green",
                        "unverified": "orange"
                    },
                    "flag_colors": {
                        "critical": "red",
                        "moderate": "amber",
                        "minor": "blue"
                    },
                    "skill_tier_order": [
                        "mandatory",
                        "preferred",
                        "better_to_have"
                    ],
                    "within_tier_order": [
                        "matched",
                        "partial",
                        "not_found"
                    ],
                    "sections_order": [
                        "scorecard",
                        "skill_comparison",
                        "experience_comparison",
                        "education_comparison",
                        "certification_comparison",
                        "flags"
                    ]
                }
                # Save to blob
                blob_key = save_to_blob(parsed, "candidate", "role", "user")
                parsed["blob_key"] = blob_key 
                parsed["_tokens_used"] = (one_liner_response["tokens"]) 
                return (True, parsed)
            except Exception as e:
                logger.info(f"Error processing {resume_filename}: {str(e)}", extra=extras)
                return (False, {"filename": resume_filename,"error": "Processing failed",
                    "error_code": "PROCESSING_ERROR","details": str(e)})
        # Read resume file bytes in main thread for thread-safe concurrent processing
        resume_items = []
        for idx, resume_file in enumerate(resume_files, 1):
            resume_bytes = resume_file.read()
            resume_items.append((idx, resume_file.filename, resume_bytes))
        # Execute resume evaluation concurrently with up to 5 workers
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_item = {executor.submit(_process_single_resume, item): item for item in resume_items}
            for future in as_completed(future_to_item):
                success, data = future.result()
                if success:
                    results.append(data)
                else:
                    failed_resumes.append(data)
        logger.info(f"[PARALLEL MODE - MAX 5 WORKERS] Complete: {len(results)} successful, {len(failed_resumes)} failed",extra=extras)    
        # 5. Sort results by total score (descending)
        results.sort(key=lambda x: x.get("scorecard", {}).get("total_score", 0), reverse=True)
        # 6. Generate summary
        tier_distribution = {}
        for result in results:
            tier = result.get("scorecard", {}).get("tier", "Unranked")
            tier_distribution[tier] = tier_distribution.get(tier, 0) + 1
        # Create ranked candidates list (top to bottom)
        ranked_candidates = []
        for rank, result in enumerate(results, 1):
            ranked_candidates.append({
                "rank": rank,            
                "candidate_name": (result.get("meta", {}).get("candidate_name") or result.get("meta", {}).get("candidate") or "Unknown"),
                "total_score": result.get("scorecard", {}).get("total_score", 0),
                "tier": result.get("scorecard", {}).get("tier", "Unranked"),
                "resume_filename": result.get("resume_filename", ""),
                "overall_experience": result.get("experience_comparison", {}).get("candidate_has", {}).get("years", 0),
                "blob_key": result.get("blob_key", "")
            }) 
        summary = {
            "batch_id": batch_id,
            "total_uploaded": len(resume_files),
            "successfully_processed": len(results),
            "failed": len(failed_resumes),
            "tier_distribution": tier_distribution,
            "ranked_candidates": ranked_candidates
        }
        total_tokens_used = sum(r.get("_tokens_used", 0)for r in results)
        downloaded_file_name = None
        download_url = None
        if results:
            first_blob_key = results[0].get("blob_key")
            if first_blob_key:
                downloaded_file_name = os.path.basename(first_blob_key)
                download_url = (f"/api/fitment-report/download/"f"{first_blob_key}")
        log_hr_portal_report(
            user_name=auth_info.get("current_user"),
            email_id=auth_info.get("current_user"),
            uploaded_file_name=json.dumps([f.filename for f in resume_files]),
            downloaded_file_name=downloaded_file_name,
            download_url=download_url,
            process="Resume",
            process_type="JD Analysis",
            upload_resume_status="SUCCESS",
            download_resume_status="SUCCESS",
            token_used=total_tokens_used
        )
        for result in results:
            result.pop("_tokens_used", None)
        # 7. Return response
        return jsonify({
            "success": True,
            "summary": summary,
            "failed_resumes": failed_resumes if failed_resumes else None
        })

@app.get("/api/assess/retrieve_blob_data/<path:blob_key>")
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def retrieve_blob_data(auth_info, blob_key):
    report_data = load_from_blob(blob_key)
    return jsonify({"success": True,"data": report_data})

@app.route("/api/fitment-report/download/<path:blob_key>", methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def download_report(auth_info, blob_key):
    report_data = load_from_blob(blob_key)
    pdf_buffer = generate_fitment_pdf(report_data)
    candidate_name = (report_data.get("meta", {}).get("candidate", "candidate"))
    job_title = (report_data.get("meta", {}).get("job_title", "role"))
    download_name = (f"{candidate_name}_"f"{job_title}_"f"fitment_report.pdf")
    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=download_name
    )

# TEMPLATE CACHE HELPER
TEMPLATE_CACHE = None
def get_cached_template(extras):
    global TEMPLATE_CACHE
    if TEMPLATE_CACHE is None:
        TEMPLATE_CACHE = get_blob_bytes("EMPTY_TEMPLATE_RESUME/empty_resume_template.pdf")
    return TEMPLATE_CACHE

@app.route("/api/visa/process", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def visa_process(auth_info):
    extras = {
            "servicename": SERVICE_NAME,
            "functionname": get_caller_frame().f_code.co_name,
            "projectname": PROJECT_NAME,
            "bot_name": "kumaran"
        }
    logger.info(f"Entering {extras['functionname']} at "f"{datetime.now(IST)}",extra=extras)
    try:
        email_id =auth_info.get("current_user")
        document_format_issues:list = []
        if not email_id:
            return jsonify({"success": False,"error": "email_id is required"}), 400
        type_of_visa_process = request.form.get("type_of_visa_process")
        resume_file = request.files.get("resume_file",None)
        indian_letter_file = request.files.get("indian_letter_file",None)
        canada_letter_file = request.files.get("canada_letter_file",None)
        resume_filename = ""
        indian_letter_filename = ""
        canada_letter_filename = ""
        resume_text=""
        indian_letter_text=""
        canada_letter_text=""
        indian_letter_text = ""
        if resume_file:
            resume_filename =str(request.files.get("resume_file").filename)
            if resume_filename.lower().split(".")[-1] in ["docx","pdf"]:
                resume_text = (extract_file_text(resume_file) if resume_file else "")
                if resume_filename.lower().split(".")[-1]=="docx":
                    document_format_issues.append(analyze_document(file_bytes=resume_file,document_type="resume",document_name=resume_filename))
                else:
                    document_format_issues.append({"document_name":resume_filename,"document_type":"resume","is_corupted":False,"issues":[],"is_pdf":True})
            else:
                return {"message":f"The Uploaded resume : {resume_filename} is not of .docx or pdf format"}, 400 
        if indian_letter_file:
            indian_letter_filename =str(request.files.get("indian_letter_file").filename)
            if indian_letter_filename.lower().split(".")[-1] in ["docx","pdf"]:
                indian_letter_text = (extract_file_text(indian_letter_file) if indian_letter_file else "")
                if indian_letter_filename.lower().split(".")[-1]=="docx":
                    document_format_issues.append(analyze_document(file_bytes=indian_letter_file,document_type="letter",document_name=indian_letter_filename))
                else:
                    document_format_issues.append({"document_name":indian_letter_filename,"document_type":"letter","is_corupted":False,"issues":[],"is_pdf":True})
            else:
                return {"message":f"The Uploaded letter : {indian_letter_filename} is not of .docx or pdf format"}, 400 
        if canada_letter_file:
            canada_letter_filename=str(request.files.get("canada_letter_file").filename)
            if canada_letter_filename.lower().split(".")[-1] in ["docx","pdf"]:
                canada_letter_text = (extract_file_text(canada_letter_file) if canada_letter_file else "")
                if canada_letter_filename.lower().split(".")[-1]=="docx":
                    document_format_issues.append(analyze_document(file_bytes=canada_letter_file,document_type="letter",document_name=canada_letter_filename))
                else:
                    document_format_issues.append({"document_name":canada_letter_filename,"document_type":"letter","is_corupted":False,"issues":[],"is_pdf":True})
            else:
                return {"message":f"The Uploaded letter : {canada_letter_filename} is not of .docx or pdf format"}, 400 
        llm_output = call_llm_json_GPT5_visa_process(system=VISA_PROCESS_PROMPT,
                                                     canada_document_name=canada_letter_filename,canada_letter_text=canada_letter_text,
                                                     indian_document_name=indian_letter_filename,indian_letter_text=indian_letter_text,
                                                     resume_document_name=resume_filename,resume_text=resume_text)
        visa_process_status = llm_output["response"]
        token_used = llm_output["token_used"]
        logger.info(f"Successfully completed {extras['functionname']} "f"for email_id={email_id}",extra=extras)
        log_hr_portal_report(user_name=email_id,email_id=email_id,uploaded_file_name=(resume_file.filename if resume_file else None),
            process="Visa",
            process_type=type_of_visa_process,
            upload_visa_status="SUCCESS",
            token_used=token_used)
        return jsonify({
            "success": True,
            "email_id": email_id,
            "process": "Visa",
            "type_of_visa_process": type_of_visa_process,
            "token_used":token_used,
            "document_format_issues":document_format_issues,
            "document_inconsistency": visa_process_status
        }), 200
    except Exception as e:
        logger.exception(f"Error in {extras['functionname']}: {str(e)}",extra=extras)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/generate/resume/db",methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def generate_resume_db(auth_info):
    uploaded_file_name = None
    download_url = None    
    uploaded_file = request.files.get("resume_file")
    if not uploaded_file:
        log_hr_portal_report(user_name=auth_info.get("current_user"),email_id=auth_info.get("current_user"),
            uploaded_file_name=None,downloaded_file_name=None,download_url=None,upload_resume_status="FAILED",
            download_resume_status=None,process="Resume",process_type="Formatter",token_used=0)
        log_resume_activity(email_id=auth_info.get("current_user"),uploaded_file_name=uploaded_file_name,
            downloaded_file_name=None,download_url=None,upload_resume_status="FAILED",download_resume_status=None)
        return jsonify({"success": False,"error": "No file uploaded"}), 400
    uploaded_file_name = uploaded_file.filename
    total_start = time.perf_counter()
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }
    try:
        logger.info(f"Entering {extras['functionname']} at "f"{datetime.now(IST)}",extra=extras)
        # VALIDATE REQUEST
        if "resume_file" not in request.files:
            logger.info("resume_file not found in request",extra=extras)
            return jsonify({"success": False, "error": "resume_file required"}), 400
        resume_file = request.files["resume_file"]
        logger.info(f"Received file: {resume_file.filename}",extra=extras)
        ext = os.path.splitext(resume_file.filename)[1].lower()
        if ext not in [".pdf", ".docx"]:
            logger.info(f"Invalid file type: {ext}",extra=extras)
            return jsonify({"success": False,"error": "Invalid file type. Only PDF and DOCX are allowed."}), 400
        # EXTRACT RESUME TEXT
        start = time.perf_counter()
        if ext == ".pdf":
            resume_text = extract_pdf_text(resume_file)
        else:
            resume_text = extract_docx_text(resume_file)
        if not resume_text:
            logger.info("Resume extraction failed",extra=extras)
            return jsonify({"success": False,"error": "Resume extraction failed"}), 400
        logger.info("Resume text extracted successfully",extra=extras)
        # PARALLEL LLM CALLS
        start = time.perf_counter()
        logger.info("Starting parallel LLM processing",extra=extras)
        with ThreadPoolExecutor(max_workers=3) as executor:
            validation_future = executor.submit(
                call_llm_json_with_tokens,
                (
                """you are a resume validator.Determine whether the document contains REAL candidate resume information.
                Return JSON only:{"is_resume": true,"reason": ""} if the document is a valid resume OR {"is_resume": false,"reason": ""} if the document is NOT a valid resume.
                Mark is_resume = false if:The document is a blank resume template.The document contains only headings.Sections such as Education, Skills, Experience, Projects are empty.The document contains placeholders like FULL NAME,PROFESSIONAL SUMMARY,EDUCATION,WORK EXPERIENCE,PROJECTS,REFERENCES.No actual candidate details are present.Most content is missing.Mark is_resume = true only if the document contains actual candidate information such as:Name,Education details,Work history,Skills,Projects,Certifications.Be strict."""
                ),
                f"Text:\n{resume_text}"
            )
            structured_future = executor.submit(call_llm_json_GPT5_with_tokens,SYSTEM_PROMPT,f"Extract resume details:\n{resume_text}")
            employee_future = executor.submit(call_llm_json_with_tokens,EMPLOYEE_TYPE_PROMPT,f"Extract employee classification:\n{resume_text}")
            validation_response = validation_future.result()
            structured_response = structured_future.result()
            employee_response = employee_future.result()
            validation_result = (validation_response["data"] if isinstance(validation_response, dict) and "data" in validation_response else validation_response)
            structured_data = (structured_response["data"] if isinstance(structured_response, dict) and "data" in structured_response else structured_response)
            employee_classification = (employee_response["data"] if isinstance(employee_response, dict) and "data" in employee_response else employee_response)
            validation_tokens = validation_response.get("tokens", 0)
            extraction_tokens = structured_response.get("tokens", 0)
            employee_tokens = employee_response.get("tokens", 0)
            logger.info(f"Validation Tokens Used: {validation_tokens}",extra=extras)
            logger.info(f"Structured Extraction Tokens Used: {extraction_tokens}",extra=extras)
            logger.info(f"Employee Classification Tokens Used: {employee_tokens}",extra=extras)
        # VALIDATE RESUME
        if not validation_result.get("is_resume",False):
            logger.info("Uploaded document is not a resume",extra=extras)
            return jsonify({"success": False,"error": "Uploaded file is not a valid resume"}), 400
        logger.info("Resume validation completed",extra=extras)
        # EMPLOYEE CLASSIFICATION
        is_existing_employee = bool(employee_classification.get("is_existing_employee",False))
        employee_type = ("Existing" if is_existing_employee else "New Hire")
        logger.info(f"Employee Type: {employee_type}",extra=extras)
        # EXTRA / MISSING DETAILS
        start = time.perf_counter()
        extra_response = call_llm_json_GPT5_with_tokens(EXTRA_MISSING_PROMPT,
            f"""
            employee_type: {employee_type}
 
            resume_text:
            {resume_text}
 
            structured_data:
            {json.dumps(structured_data, indent=2)}
            """
        )
        refined_result = (extra_response["data"] if isinstance(extra_response, dict) and "data" in extra_response else extra_response)
        extra_missing_tokens = extra_response.get("tokens", 0)
        total_tokens_used = (validation_tokens + extraction_tokens + employee_tokens + extra_missing_tokens)
        structured_data["extra_details"] = (
            refined_result.get("extra_details") or structured_data.get("extra_details",{}))
        structured_data["missing_details"] = (refined_result.get("missing_details") or structured_data.get("missing_details",{}))
        # CLEAN EXTRA DETAILS
        extra_details = {k: v for k, v in structured_data.get("extra_details",{}).items() if v not in (None,"",[],{})}
        # CLEAN MISSING DETAILS
        missing_details = {k: v for k, v in structured_data.get("missing_details",{}).items() if v not in (None,"",[],{})}
        # NEW HIRE CLEANUP
        if employee_type == "New Hire":
            remove_missing_keys = [
                "missing_certification_year","certification_year_missing","certification_year_missing","missing_certification_years",
                "missing_linkedin","missing_email","missing_name_format","missing_name_passport_format","appreciations_awards_year_missing"
            ]
            for key in remove_missing_keys:
                missing_details.pop(key,None)
        structured_data["extra_details"] = extra_details
        structured_data["missing_details"] = missing_details
        logger.info(f"Cleaned extra_details: {extra_details}",extra=extras)
        logger.info(f"Cleaned missing_details: {missing_details}",extra=extras)
        # LOAD TEMPLATE
        template_bytes = get_cached_template(extras)  
        # PDF / DOCX GENERATION
        start = time.perf_counter()
        if is_existing_employee:
            output_buffer = create_resume_pdf(template_bytes,structured_data)
            output_docx_buffer = create_resume_docx(template_bytes,structured_data)
        else:
            output_buffer = create_resume_pdf_for_new_hires(template_bytes,structured_data)
            output_docx_buffer = create_resume_docx_for_new_hires(template_bytes,structured_data)
        logger.info("Resume PDF generated successfully",extra=extras)
        # BLOB UPLOAD
        candidate_name = structured_data.get("name","candidate")
        start = time.perf_counter()
        # PDF Upload
        blob_path = save_resume_pdf_to_blob(file_bytes=output_buffer.getvalue(),candidate=candidate_name)
        logger.info("DOCX validation started")
        logger.info("Output DOCX buffer type: %s", type(output_docx_buffer))
        if output_docx_buffer is None:
            logger.error("Output DOCX buffer is None")
            raise ValueError("output_docx_buffer is None")
        docx_bytes = output_docx_buffer.getvalue()
        logger.info("Generated DOCX size: %d bytes", len(docx_bytes))
        if not docx_bytes:
            raise ValueError("Generated DOCX buffer is empty")
        if docx_bytes[:4] != b'PK\x03\x04':
            raise ValueError(f"Invalid DOCX Header: {docx_bytes[:20]}")
        logger.info("DOCX validation completed")
        # DOCX Upload
        blob_path_docx = save_resume_docx_to_blob(file_bytes=docx_bytes,candidate=candidate_name)
        logger.info(f"DOCX uploaded to blob: {blob_path_docx}",extra=extras)
        # Logging
        log_execution_time("Blob Upload",start,extras)
        logger.info(f"Resume PDF uploaded to blob: {blob_path}",extra=extras)
        # TOTAL EXECUTION TIME
        total_time = round(time.perf_counter() - total_start,2)
        logger.info(f"TOTAL API EXECUTION TIME : {total_time} sec",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at "f"{datetime.now(IST)}",extra=extras)
        log_hr_portal_report(user_name=auth_info.get("current_user"),email_id=auth_info.get("current_user"),uploaded_file_name=uploaded_file_name,
            downloaded_file_name=os.path.basename(blob_path),download_url=f"/api/resume_db/download/{blob_path}",upload_resume_status="SUCCESS",
            download_resume_status="PENDING",process="Resume",process_type="Formatter",token_used=total_tokens_used)
        download_url = f"/api/resume_db/download/{blob_path}"
        log_resume_activity(email_id=auth_info.get("current_user"),uploaded_file_name=uploaded_file_name,downloaded_file_name=os.path.basename(blob_path),
            download_url=download_url,upload_resume_status="SUCCESS",download_resume_status="PENDING")   
        return jsonify({
            "success": True,
            "blob_path_pdf": blob_path,
            "blob_path_docx": blob_path_docx,
            "employee_type": employee_type,
            "extra_details": extra_details,
            "missing_details": missing_details,
            "execution_time_seconds": total_time,
            "tokens": {
                "validation_tokens": validation_tokens,
                "extraction_tokens": extraction_tokens,
                "employee_classification_tokens": employee_tokens,
                "extra_missing_tokens": extra_missing_tokens,
                "total_tokens_used": total_tokens_used
            }
        }), 200
    except Exception as e:
        log_resume_activity(email_id=auth_info.get("current_user"),uploaded_file_name=uploaded_file_name,downloaded_file_name=None,download_url=None,upload_resume_status="FAILED",download_resume_status=None)
        logger.exception(f"Exception occurred in {extras['functionname']} : {str(e)}",extra=extras)
        return jsonify({"success": False,"error": str(e)}), 500
 
@app.route("/api/resume_db/download/<path:blob_key>", methods=["GET"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def download_resume_db(auth_info,blob_key):
    extras = {
        "servicename": SERVICE_NAME,
        "functionname": get_caller_frame().f_code.co_name,
        "projectname": PROJECT_NAME,
        "bot_name": "kumaran"
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(IST)}",extra=extras)
    session = Session()
    try:
        logger.info(f"Received blob_key: {blob_key}",extra=extras)
        # Download file from Blob
        file_buffer = download_blob_as_bytes(blob_key)
        file_name = blob_key.split("/")[-1]
        logger.info(f"Resolved file name: {file_name}",extra=extras)
        extension = os.path.splitext(file_name)[1].lower()
        mime_types = {".pdf": "application/pdf",".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
        mime_type = mime_types.get(extension,"application/octet-stream")
        file_buffer.seek(0)
        # UPDATE DOWNLOAD STATUS
        try:
            download_url = f"/api/resume_db/download/{blob_key}"
            record = (session.query(ResumeProcessActivityLog)
                .filter(ResumeProcessActivityLog.download_url == download_url)
                .order_by(ResumeProcessActivityLog.id.desc()).first())
            if record:
                record.download_resume_status = "SUCCESS"
                report_record = (session.query(HrPortalReportLog)
                    .filter(HrPortalReportLog.download_url == download_url)
                    .order_by(HrPortalReportLog.id.desc()).first())
                if report_record:
                    report_record.status = "SUCCESS"
                session.commit()
                logger.info(f"Updated download_resume_status = SUCCESS for record ID {record.id}",extra=extras)
            else:
                logger.info(f"No record found for download_url: {download_url}",extra=extras)
        except Exception as db_error:
            session.rollback()
            logger.exception(f"Failed to update download status: {str(db_error)}",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(IST)}",extra=extras)
        return send_file(file_buffer,mimetype=mime_type,as_attachment=True,download_name=file_name)
    except Exception as e:
        logger.exception(f"Exception occurred in {extras['functionname']}: {str(e)}",extra=extras)
        return jsonify({"success": False,"error": "Failed to download file"}), 500
    finally:
        session.close()

#Admin Access Control
@app.route('/api/hr/get-users', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def get_hr_users(auth_info):
    session = request_context.db
    try:
        users = session.query(HrUsers).all()
        result = []
        for user in users:
            result.append({
                "id": user.id,
                "user_name": user.user_name,
                "email_id": user.email_id,
                "is_admin": user.is_admin,
                "resume_offshore": user.resume_offshore,
                "resume_onsite": user.resume_onsite,
                "resume_internal": user.resume_internal,
                "visa_ict": user.visa_ict,
                "visa_business": user.visa_business,
                "visa_extension": user.visa_extension
            })
        return jsonify({"success": True,"data": result})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False,"message": str(e)}), 500

#create
@app.route('/api/hr/create-user', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def create_hr_user(auth_info):
    session = request_context.db
    try:
        data = request.get_json() or {}
        email = data.get("email_id")
        if not email:
            return jsonify({"success": False, "message": "Missing email_id"}), 400

        email = email.strip().lower()
        existing_user = session.query(HrUsers).filter(HrUsers.email_id == email).first()
        if existing_user:
            return jsonify({"success": False,"message": "User already exists"}), 400

        user = HrUsers(
            user_name=data.get("user_name"),
            email_id=email,
            is_admin=data.get("is_admin", False),
            resume_offshore=data.get("resume_offshore", False),
            resume_onsite=data.get("resume_onsite", False),
            resume_internal=data.get("resume_internal", False),
            visa_ict=data.get("visa_ict", False),
            visa_business=data.get("visa_business", False),
            visa_extension=data.get("visa_extension", False)
        )
        session.add(user)
        session.commit()
        return jsonify({"success": True,"message": "User created successfully"})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False,"message": str(e)}), 500


#Update users
@app.route('/api/hr/users/<int:user_id>', methods=['PUT'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def update_hr_user(auth_info, user_id):
    session = request_context.db
    try:
        current_user_email = auth_info.get("current_user")
        if current_user_email:
            current_user_email = current_user_email.strip().lower()

        requesting_user = session.query(HrUsers).filter(
            HrUsers.email_id == current_user_email
        ).first()
        if requesting_user is None or not requesting_user.is_admin:
            return jsonify({
                "success": False, 
                "message": "Access Denied: Only administrators can edit user privileges."
            }), 403

        data = request.get_json() or {}
        user = session.query(HrUsers).filter(HrUsers.id == user_id).first()
        if user is None:
            return jsonify({"success": False, "message": "User not found"}), 404

        if user.is_admin and data.get("is_admin") is False:
            admin_count = session.query(HrUsers).filter(HrUsers.is_admin == True).count()
            if admin_count <= 1:
                return jsonify({"success": False, "message": "At least one admin must exist"}), 400

        user.user_name = data.get("user_name", user.user_name)
        user.is_admin = data.get("is_admin", user.is_admin)
        user.resume_offshore = data.get("resume_offshore", user.resume_offshore)
        user.resume_onsite = data.get("resume_onsite", user.resume_onsite)
        user.resume_internal = data.get("resume_internal", user.resume_internal)
        user.visa_ict = data.get("visa_ict", user.visa_ict)
        user.visa_business = data.get("visa_business", user.visa_business)
        user.visa_extension = data.get("visa_extension", user.visa_extension)
        
        session.commit()
        session.refresh(user)
        return jsonify({"success": True, "message": "User updated successfully"})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    
#delete
@app.route('/api/hr/users/<int:user_id>', methods=['DELETE'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_ADMIN])
def delete_hr_user(auth_info, user_id):
    session = request_context.db
    try:
        user = session.query(HrUsers).filter(HrUsers.id == user_id).first()
        if not user:
            return jsonify({"success": False,"message": "User not found"}), 404
        if user.is_admin:
            return jsonify({"success": False,"message": "Admin user cannot be deleted"}), 400

        session.delete(user)
        session.commit()
        return jsonify({"success": True,"message": "User deleted successfully"})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False,"message": str(e)}), 500
    
#HR access control
@app.route('/api/hr/access-control', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_access_control(auth_info):
    session = request_context.db
    try:
        logger.info(f"Auth Info: {auth_info}")
        email = auth_info.get("current_user")
        if not email:
            return jsonify({"success": False, "message": "Invalid authentication token details."}), 401

        email = email.strip().lower()
        user = session.query(HrUsers).filter(HrUsers.email_id == email).populate_existing().first()
        if user is None:
            return jsonify({
                "success": False,
                "message": "Access Denied: Your profile has not been configured by an Administrator yet."
            }), 403

        return jsonify({
            "success": True,
            "user_name": user.user_name,
            "email_id": user.email_id,
            "is_admin": user.is_admin,
            "resume_offshore": user.resume_offshore,
            "resume_onsite": user.resume_onsite,
            "resume_internal": user.resume_internal,
            "visa_ict": user.visa_ict,
            "visa_business": user.visa_business,
            "visa_extension": user.visa_extension
        })
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

#Dashboard Page
@app.route('/api/hr/history', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_hr_history(auth_info):
    session = request_context.db
    try:
        # FIX: Look for query param '?tz=' first to bypass Azure header stripping--"tz=timezone"
        user_tz = request.args.get('tz') or request.headers.get('X-Timezone', 'UTC')
        module = request.args.get("module")
        process_type = request.args.get("process_type")
        email_id = request.args.get("email_id")
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        page = max(int(request.args.get("page", 1)), 1)
        page_size = max(int(request.args.get("page_size", 20)), 1)
        offset = (page - 1) * page_size
        query = session.query(HrPortalReportLog)
        query = query.filter(HrPortalReportLog.email_id.isnot(None),HrPortalReportLog.email_id != "",
            ~HrPortalReportLog.email_id.in_(["USER", "email_id"]))
        if module:
            query = query.filter(HrPortalReportLog.process == module)
        if process_type:
            query = query.filter(HrPortalReportLog.process_type == process_type)
        if email_id:
            query = query.filter(HrPortalReportLog.email_id == email_id)
        if from_date:
            utc_start, _ = get_utc_range_for_local_date(from_date, user_tz)
            query = query.filter(HrPortalReportLog.created_date >= utc_start)
        if to_date:
            _, utc_end = get_utc_range_for_local_date(to_date, user_tz)
            query = query.filter(HrPortalReportLog.created_date <= utc_end)
        total_count = query.count()
        records = (query.order_by(HrPortalReportLog.created_date.desc()).offset(offset).limit(page_size).all())
        result = []
        for row in records:
            local_time = convert_utc_to_timezone(row.created_date, user_tz)
            result.append({
                "id": row.id,
                "date_time": local_time.strftime("%d %b %Y, %I:%M %p") if local_time else None,
                "user_name": row.user_name,
                "email_id": row.email_id,
                "token_used": row.token_used,
                "module": row.process,
                "process_type": row.process_type,
                "uploaded_file_name": (json.loads(row.uploaded_file_name)
                    if row.uploaded_file_name and row.uploaded_file_name.startswith("[")
                    else row.uploaded_file_name),
                "downloaded_file_name": row.downloaded_file_name,
                "download_url": row.download_url,
                "upload_status": row.status,
                "download_status": "SUCCESS" if row.downloaded_file_name else "PENDING"
            })
        return jsonify({
            "success": True,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "count": len(result),
            "data": result
        })
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/hr/history/users', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_history_users(auth_info):
    session = request_context.db
    try:
        users = (session.query(HrPortalReportLog.email_id)
            .filter(
                HrPortalReportLog.email_id.isnot(None),
                HrPortalReportLog.email_id != "",
                ~HrPortalReportLog.email_id.in_(
                    ["USER", "email_id"]
                )).distinct().all())
        return jsonify({"success": True, "data": [row[0] for row in users if row[0]]})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False,"message": str(e)}), 500

@app.route('/api/hr/history/modules', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_history_modules(auth_info):
    session = request_context.db
    try:
        modules = (session.query(HrPortalReportLog.process).filter(HrPortalReportLog.process.isnot(None)).distinct().all())
        return jsonify({"success": True, "data": [row[0] for row in modules  if row[0]]})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False,"message": str(e)}), 500

@app.route('/api/hr/history/process-types', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_process_types(auth_info):
    session = request_context.db
    try:
        process_types = (session.query(HrPortalReportLog.process_type)
            .filter(HrPortalReportLog.process_type.isnot(None),
                ~HrPortalReportLog.process_type.in_(["New Hire"])).distinct().all())
        return jsonify({"success": True, "data": [row[0] for row in process_types if row[0]]})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    
@app.route('/api/hr/history/recent-activity', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_admin_history(auth_info):
    session = request_context.db
    try:
        # FIX: Support URL query parameters for timezone tracking--"tz=timezone"
        user_tz = request.args.get('tz') or request.headers.get('X-Timezone', 'UTC')
        page = max(int(request.args.get("page", 1)), 1)
        page_size = max(int(request.args.get("page_size", 20)), 1)
        offset = (page - 1) * page_size
        query = session.query(HrPortalReportLog)
        current_user = auth_info.get("current_user")
        query = query.filter(HrPortalReportLog.email_id == current_user)
        total_count = query.count()
        records = (query.order_by(HrPortalReportLog.created_date.desc()).offset(offset).limit(page_size).all())
        result = []
        for row in records:
            # 2. Convert UTC db time to client local time
            local_time = convert_utc_to_timezone(row.created_date, user_tz)
            result.append({
                "id": row.id,
                "date_time": local_time.strftime("%d %b %Y, %I:%M %p") if local_time else None,
                "user_name": row.user_name,
                "email_id": row.email_id,
                "module": row.process,
                "process_type": row.process_type,
                "uploaded_file_name": (json.loads(row.uploaded_file_name)
                    if row.uploaded_file_name and row.uploaded_file_name.startswith("[")
                    else row.uploaded_file_name),
                "downloaded_file_name": row.downloaded_file_name,
                "download_url": row.download_url,
                "status": row.status,
                "token_used": row.token_used,
                "validation_score": None
            })
        return jsonify({
            "success": True,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "data": result
        })
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/hr/dashboard', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_dashboard(auth_info):
    session = request_context.db
    try:
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        module = request.args.get("module")
        email_id = request.args.get("email_id")
        base_query = session.query(HrPortalReportLog)
        if module:
            base_query = base_query.filter(HrPortalReportLog.process == module)
        if email_id:
            base_query = base_query.filter(HrPortalReportLog.email_id == email_id)
        if from_date:
            base_query = base_query.filter(func.date(HrPortalReportLog.created_date) >= from_date)
        if to_date:
            base_query = base_query.filter(func.date(HrPortalReportLog.created_date) <= to_date)
        # SUMMARY
        total_reports = base_query.count()
        successful_reports = (base_query.filter(HrPortalReportLog.status == "SUCCESS").count())
        failed_reports = (base_query.filter(HrPortalReportLog.status == "FAILED").count())
        total_tokens_used = (base_query.with_entities(func.sum(HrPortalReportLog.token_used)).scalar() or 0)
        active_users = (base_query.with_entities(HrPortalReportLog.email_id).distinct().count())
        success_rate = round((successful_reports / total_reports) * 100, 2) if total_reports else 0
        average_tokens = round(total_tokens_used / total_reports, 2) if total_reports else 0
        jd_analysis_count = (base_query.filter(HrPortalReportLog.process == "Resume",HrPortalReportLog.process_type == "JD Analysis").count())
        # MODULE CARDS  
        allowed_process_types = ["Formatter","JD Analysis","ICT","Business","Work"]
        module_cards_rows = (base_query.with_entities(HrPortalReportLog.process,HrPortalReportLog.process_type,func.count(HrPortalReportLog.id).label("count")
            ).filter(HrPortalReportLog.process_type.in_(allowed_process_types)
            ).group_by(HrPortalReportLog.process,HrPortalReportLog.process_type).all())
        module_cards = []
        for row in module_cards_rows:
            module_cards.append({"process":row.process, "process_type":row.process_type, "count":row.count})
        # STATUS DISTRIBUTION
        status_distribution = {"success":successful_reports,"failed":failed_reports}
        # MODULE DISTRIBUTION
        module_rows = (base_query.with_entities(HrPortalReportLog.process,
                func.count(HrPortalReportLog.id).label("count")
            ).group_by(HrPortalReportLog.process).all())
        module_distribution = []
        for row in module_rows:
            module_distribution.append({"module":row.process,"count":row.count})
        return jsonify({"success": True,
            "summary": {
                "total_reports":total_reports,
                "successful_reports":successful_reports,
                "failed_reports":failed_reports,
                "active_users":active_users,
                "success_rate":success_rate,
                "total_tokens_used":total_tokens_used,
                "average_tokens":average_tokens,
                "jd_analysis_count":jd_analysis_count
            },
            "module_cards":module_cards,
            "status_distribution":status_distribution,
            "module_distribution":module_distribution
        })
    except Exception as e:
        session.rollback()
        return jsonify({"success": False,"message": str(e)}), 500
    
@app.route('/api/hr/dashboard/report-trend', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_report_trend(auth_info):
    session = request_context.db
    try:
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        module = request.args.get("module")
        email_id = request.args.get("email_id")
        query = session.query(HrPortalReportLog)
        if module:
            query = query.filter(HrPortalReportLog.process == module)
        if email_id:
            query = query.filter(HrPortalReportLog.email_id == email_id)
        if from_date:
            query = query.filter(func.date(HrPortalReportLog.created_date) >= from_date)
        if to_date:
            query = query.filter(func.date(HrPortalReportLog.created_date) <= to_date)
        allowed_process_types = ["Formatter","JD Analysis","ICT","Business","Work"]
        trend_rows = (query.with_entities(
                func.date(HrPortalReportLog.created_date).label("report_date"),
                HrPortalReportLog.process,
                HrPortalReportLog.process_type,
                func.count(HrPortalReportLog.id).label("report_count"))
            .filter(HrPortalReportLog.process_type.in_(allowed_process_types))
            .group_by(func.date(HrPortalReportLog.created_date),HrPortalReportLog.process,HrPortalReportLog.process_type).all())
        trend_map = {}
        for row in trend_rows:
            report_date = str(row.report_date)
            if report_date not in trend_map:
                trend_map[report_date] = {"date": report_date}
            key = (f"{row.process}_"f"{row.process_type}")
            trend_map[report_date][key] = row.report_count
        return jsonify({"success": True, "data": list(trend_map.values())})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500
    
@app.route('/api/hr/dashboard/top-users', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_top_users(auth_info):
    session = request_context.db
    try:
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        module = request.args.get("module")
        email_id = request.args.get("email_id")
        query = session.query(HrPortalReportLog)
        if module:
            query = query.filter(HrPortalReportLog.process == module)
        if email_id:
            query = query.filter(HrPortalReportLog.email_id == email_id)
        if from_date:
            query = query.filter(func.date(HrPortalReportLog.created_date) >= from_date)
        if to_date:
            query = query.filter(func.date(HrPortalReportLog.created_date) <= to_date)
        top_users_rows = (query
            .with_entities(HrPortalReportLog.email_id,
                func.count(HrPortalReportLog.id)
                .label("report_count"),func.sum(HrPortalReportLog.token_used).label("tokens_used"))
            .filter(
                HrPortalReportLog.email_id.isnot(None),
                HrPortalReportLog.email_id != "",
                ~HrPortalReportLog.email_id.in_(["USER", "email_id"]))
            .group_by(HrPortalReportLog.email_id)
            .order_by(func.count(HrPortalReportLog.id).desc()).limit(5).all())
        result = []
        for rank, row in enumerate(top_users_rows,start=1):
            user_module_query = session.query(HrPortalReportLog.process).filter(HrPortalReportLog.email_id == row.email_id)
            if module:
                user_module_query = user_module_query.filter(HrPortalReportLog.process == module)
            if from_date:
                user_module_query = user_module_query.filter(func.date(HrPortalReportLog.created_date) >= from_date)
            if to_date:
                user_module_query = user_module_query.filter(func.date(HrPortalReportLog.created_date) <= to_date)
            user_module = (user_module_query.group_by(HrPortalReportLog.process)
                .order_by(func.count(HrPortalReportLog.id).desc()).first())
            result.append({
                "rank": rank,
                "user": row.email_id,
                "module": (user_module[0] if user_module else None),
                "tokens": row.tokens_used or 0,
                "report_count": row.report_count
            })
        return jsonify({"success": True, "data": result})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/hr/dashboard/recent-activity', methods=['GET'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_HR])
def get_recent_activity(auth_info):
    session = request_context.db
    try:
        # FIX: Support URL query parameters for timezone tracking -- "tz=timezone"
        user_tz = request.args.get('tz') or request.headers.get('X-Timezone', 'UTC')
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        module = request.args.get("module")
        email_id = request.args.get("email_id")
        query = session.query(HrPortalReportLog)
        query = query.filter(HrPortalReportLog.email_id.isnot(None),
            HrPortalReportLog.email_id != "",
            ~HrPortalReportLog.email_id.in_(["USER", "email_id"]))
        if module:
            query = query.filter(HrPortalReportLog.process == module)
        if email_id:
            query = query.filter(HrPortalReportLog.email_id == email_id)
        if from_date:
            utc_start, _ = get_utc_range_for_local_date(from_date, user_tz)
            query = query.filter(HrPortalReportLog.created_date >= utc_start)
        if to_date:
            _, utc_end = get_utc_range_for_local_date(to_date, user_tz)
            query = query.filter(HrPortalReportLog.created_date <= utc_end)
        recent_rows = (query.order_by(HrPortalReportLog.created_date.desc()).limit(10).all())
        result = []
        for row in recent_rows:
            local_time = convert_utc_to_timezone(row.created_date, user_tz)
            result.append({
                "user_name": row.user_name,
                "email_id": row.email_id,
                "uploaded_file_name": (json.loads(row.uploaded_file_name)
                    if row.uploaded_file_name and row.uploaded_file_name.startswith("[")
                    else row.uploaded_file_name),
                "process": row.process,
                "process_type": row.process_type,
                "status": row.status,
                "token_used": row.token_used,
                "created_date": local_time.strftime("%Y-%m-%d %H:%M:%S") if local_time else None
            })
        return jsonify({"success": True, "data": result})
    except Exception as e:
        session.rollback()
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000,debug=True,use_reloader=False)

