from utils.json_utils import safe_json_parse
from utils.skill_bucket_corrector import correct_skill_buckets, validate_skill_buckets
import os
import json
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
IST = ZoneInfo("Asia/Kolkata")
from utils.calculation import calculate_scores_and_tier
import uuid
from openai import AzureOpenAI, AsyncAzureOpenAI
from prompts.jd_prompt import (
    DUAL_DOCUMENT_VALIDATOR_SYSTEM,
    DUAL_DOCUMENT_VALIDATION_PROMPT,
    JD_VALIDATOR_SYSTEM,
    JD_VALIDATION_PROMPT,
    RESUME_VALIDATOR_SYSTEM,
    RESUME_VALIDATION_PROMPT,
    JD_EXTRACTION_PROMPT,
    ONE_LINER_SYSTEM,
    ONE_LINER_VERDICT_PROMPT,
    RESUME_MATCHING_PROMPT,
    JD_FIT_SYSTEM,
)

import logging
logger = logging.getLogger(__name__)

weekday_list = ['Monday','Tuesday','Wednesday', 'Thursday', 'Friday', 'Saturday','Sunday']

def call_llm_json(system: str, user: str) -> dict:
    client = AzureOpenAI(
    azure_endpoint = os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini",""),
    api_key        = os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
    api_version    = "2024-08-01-preview",
    )
    model="gpt-4o-mini"
    try:
        response = client.chat.completions.create(
            model       = "gpt-4o-mini",  # ← add this env var
            temperature = 0,top_p = 0,
            max_tokens  = 16000,
            response_format = {"type": "json_object"},
            messages = [
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
        )
        raw = response.choices[0].message.content.strip()
        return safe_json_parse(raw,client,model)
    except Exception as e:
        logger.exception("LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


async def call_llm_json_async(system: str, user: str) -> dict:
    """Async wrapper for OpenAI chat completion JSON requests."""
    model = "gpt-4o-mini"
    try:
        async with AsyncAzureOpenAI(
            azure_endpoint=os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini", ""),
            api_key=os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
            api_version="2024-08-01-preview",
        ) as client:
            response = await client.chat.completions.create(
                model=model,
                temperature=0,
                max_tokens=16000,
                seed=42,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            raw = response.choices[0].message.content.strip()
            return safe_json_parse(raw, client, model)
    except Exception as e:
        logger.exception("Async LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


async def call_llm_one_liner_async(system: str, user: str) -> dict:
    """Async one-liner verdict call for resume scoring."""
    model = "gpt-4o-mini"
    try:
        async with AsyncAzureOpenAI(
            azure_endpoint=os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini", ""),
            api_key=os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
            api_version="2024-08-01-preview",
        ) as client:
            response = await client.chat.completions.create(
                model=model,
                temperature=0,
                seed=42,
                max_tokens=4000,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            raw = response.choices[0].message.content.strip()
            return safe_json_parse(raw, client, model)
    except Exception as e:
        logger.exception("Async one-liner LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


async def validate_resume_and_jd_async(resume_text: str, jd_text: str) -> dict:
    """Async resume + JD validation in a single call."""
    model = "gpt-4o-mini"
    try:
        async with AsyncAzureOpenAI(
            azure_endpoint=os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini", "https://kai-dev-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions"),
            api_key=os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
            api_version="2024-08-01-preview",
        ) as client:
            response = await client.chat.completions.create(
                model=model,
                temperature=0,
                max_tokens=16000,
                seed=42,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": DUAL_DOCUMENT_VALIDATOR_SYSTEM},
                    {"role": "user", "content": DUAL_DOCUMENT_VALIDATION_PROMPT.format(
                        resume_text=resume_text,
                        jd_text=jd_text,
                    )},
                ],
            )
            raw = response.choices[0].message.content.strip()
            return safe_json_parse(raw, client, model)
    except Exception as e:
        logger.exception("Async dual document validation LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


def call_llm_json_GPT5_visa_process(system, resume_document_name:str,resume_text:str,indian_document_name:str,indian_letter_text:str,canada_document_name:str,canada_letter_text:str):
    endpoint = os.getenv("RESUME_FORMATTER_AZURE_ENDPOINT")
    api_key = os.getenv("RESUME_FORMATTER_AZURE_API_KEY")
    VERSION = os.getenv("RESUME_FORMATTER_AZURE_AI_VERSION")
    DEPLOYMENT = os.getenv("RESUME_FORMATTER_AZURE_DEP_MODEL")
    GPT_MODELS = os.getenv("AZURE_GPT_DEP_MODELS","")
    client = AzureOpenAI(azure_endpoint=endpoint,api_key=api_key,api_version=VERSION)

    naive_dt = datetime.now()
    india_tz = ZoneInfo("Asia/Kolkata")
    localized_datetime = naive_dt.replace(tzinfo=india_tz)
    localized_dt = str(localized_datetime).split(" ")
    localized_day = int(localized_datetime.weekday())
    utc_datetime = naive_dt.replace(tzinfo=india_tz).astimezone(timezone.utc)
    utc_dt = str(utc_datetime).split(" ")
    utc_day = int(utc_datetime.weekday())
    current_date_str = f"- Localized(Asia/Kolkata) Date and Day {localized_dt[0]}-{weekday_list[localized_day]} , Time : {localized_dt[1]}\n- UTC Date and Day: {utc_dt[0]}-{weekday_list[utc_day]} , Time: {utc_dt[1]}"
    user_message = f"""

## Contents of the Resume / Candidate Profile
- name of document : {resume_document_name}
{resume_text}

## Contents of the Indian Letter
- name of document : {indian_document_name}
{indian_letter_text}

## Contents of the Canadian Letter
- name of document : {canada_document_name}
{canada_letter_text}


## Current Date and Time
{current_date_str}

"""
    try:
        # -----------------------------------
        # GPT Chat Completion Models
        # -----------------------------------
        if DEPLOYMENT in GPT_MODELS:

            response = client.chat.completions.create(
                model=DEPLOYMENT,
                reasoning_effort="minimal",
                messages=[
                    {
                        "role": "system",
                        "content": system
                    },
                    {
                        "role": "user",
                        "content": user_message
                    }
                ],
                store=False
            )

            token_used = 0

            if hasattr(response, "usage") and response.usage:
                token_used = response.usage.total_tokens or 0

            parsed_response = json.loads(
                response.choices[0].message.content
            )

            return {
                "response": parsed_response,
                "token_used": token_used
            }

        # -----------------------------------
        # GPT Responses API Models
        # -----------------------------------
        else:

            response = client.responses.create(
                model=DEPLOYMENT,
                input=[
                    {
                        "role": "system",
                        "content": system
                    },
                    {
                        "role": "user",
                        "content": user_message
                    }
                ],
                store=False
            )

            answer = response.output[0].content[0].text

            token_used = 0

            if hasattr(response, "usage") and response.usage:
                token_used = response.usage.total_tokens or 0

            parsed_response = json.loads(answer)

            return {
                "response": parsed_response,
                "token_used": token_used
            }

    except Exception as e:
        logger.exception("LLM call failed: %s: %s", type(e).__name__, str(e))
        raise
      

def call_llm_json_GPT5(system, user):
    endpoint = os.getenv("RESUME_FORMATTER_AZURE_ENDPOINT")
    api_key = os.getenv("RESUME_FORMATTER_AZURE_API_KEY")
    VERSION = os.getenv("RESUME_FORMATTER_AZURE_AI_VERSION")
    DEPLOYMENT = os.getenv("RESUME_FORMATTER_AZURE_DEP_MODEL")
    GPT_MODELS = os.getenv("AZURE_GPT_DEP_MODELS")
    client = AzureOpenAI(azure_endpoint=endpoint,api_key=api_key,api_version=VERSION)

    if DEPLOYMENT in GPT_MODELS:
        response = client.chat.completions.create(
            model=DEPLOYMENT,
            reasoning_effort="minimal",
            messages=[
                {
                    "role": "system",
                    "content": system
                },
                {
                    "role": "user",
                    "content": user
                }
            ],
            max_completion_tokens=12000
        )

        return json.loads(
            response.choices[0].message.content
        )
    else:
        response = client.responses.create(
                        model=DEPLOYMENT,
                        input=[
                            {"role": "system", "content": system},
                            {"role": "user", "content": user}
                        ],
                        max_output_tokens=12000
                    )

        answer = response.output[0].content[0].text
        return json.loads(answer)

def validate_resume_and_jd(resume_text: str, jd_text: str) -> dict:
    """
    Validates both resume and job description in a single LLM call.
    
    Args:
        resume_text: Extracted text from uploaded resume file
        jd_text: Extracted text from uploaded job description file
        
    Returns:
        dict: Validation result with keys:
            - resume_validation: dict with is_valid, confidence, document_type, reasoning, indicators, red_flags
            - jd_validation: dict with is_valid, confidence, document_type, reasoning, indicators, red_flags
            - overall_status: dict with both_valid, can_proceed, error_summary
    """
    client = AzureOpenAI(
        azure_endpoint = os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini","https://kai-dev-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions"),
        api_key        = os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
        api_version    = "2024-08-01-preview",
    )
    model = "gpt-4o-mini"
    
    try:
        response = client.chat.completions.create(
            model       = model,
            temperature = 0,top_p = 0,
            seed=42,
            max_tokens  = 16000,  # Need more tokens for dual validation
            response_format = {"type": "json_object"},
            messages = [
                {"role": "system", "content": DUAL_DOCUMENT_VALIDATOR_SYSTEM},
                {"role": "user",   "content": DUAL_DOCUMENT_VALIDATION_PROMPT.format(
                    resume_text=resume_text,
                    jd_text=jd_text
                )}
            ]
        )
        raw = response.choices[0].message.content.strip()
        return safe_json_parse(raw, client, model)
    except Exception as e:
        logger.exception("Dual document validation LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


def validate_jd_only(jd_text: str) -> dict:
    """
    Validates a job description document.
    
    Args:
        jd_text: Extracted text from uploaded job description file
        
    Returns:
        dict: Validation result with keys:
            - is_valid: bool - Whether the document is a valid JD
            - confidence: int - Confidence score 0-100
            - document_type: str - Detected document type
            - reasoning: str - Brief explanation
            - indicators: dict - 7 key indicators (has_job_title, has_responsibilities, etc.)
            - red_flags: list - List of issues found
            - quality_assessment: dict - completeness, clarity, actionable
            - detected_sections: dict - job_title, company_name, location, salary/benefits info
    """
    client = AzureOpenAI(
        azure_endpoint = os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini","https://kai-dev-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions"),
        api_key        = os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
        api_version    = "2024-08-01-preview",
    )
    model = "gpt-4o-mini"
    
    try:
        response = client.chat.completions.create(
            model       = model,
            temperature = 0,top_p = 0,
            seed=42,
            max_tokens  = 16000,
            response_format = {"type": "json_object"},
            messages = [
                {"role": "system", "content": JD_VALIDATOR_SYSTEM},
                {"role": "user",   "content": JD_VALIDATION_PROMPT.format(jd_text=jd_text)}
            ]
        )
        raw = response.choices[0].message.content.strip()
        return safe_json_parse(raw, client, model)
    except Exception as e:
        logger.exception("JD validation LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


def validate_resume_only(resume_text: str) -> dict:
    """
    Validates a resume document.
    
    Args:
        resume_text: Extracted text from uploaded resume file
        
    Returns:
        dict: Validation result with keys:
            - is_valid: bool - Whether the document is a valid resume
            - confidence: int - Confidence score 0-100
            - document_type: str - Detected document type
            - reasoning: str - Brief explanation
            - indicators: dict - 7 key indicators (has_personal_info, has_work_experience, etc.)
            - red_flags: list - List of issues found
            - quality_assessment: dict - completeness, clarity, assessable
            - detected_sections: dict - candidate_name, email, phone, linkedin, github, work/education/certs
    """
    client = AzureOpenAI(
        azure_endpoint = os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini","https://kai-dev-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions"),
        api_key        = os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
        api_version    = "2024-08-01-preview",
    )
    model = "gpt-4o-mini"
    
    try:
        response = client.chat.completions.create(
            model       = model,
            temperature = 0,top_p = 0,
            seed=42,
            max_tokens  = 4000,
            response_format = {"type": "json_object"},
            messages = [
                {"role": "system", "content": RESUME_VALIDATOR_SYSTEM},
                {"role": "user",   "content": RESUME_VALIDATION_PROMPT.format(resume_text=resume_text)}
            ]
        )
        raw = response.choices[0].message.content.strip()
        return safe_json_parse(raw, client, model)
    except Exception as e:
        logger.exception("Resume validation LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


def call_llm_one_liner(system: str, user: str) -> dict:
    client = AzureOpenAI(
    azure_endpoint = os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini","https://kai-dev-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions"),
    api_key        = os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
    api_version    = "2024-08-01-preview",
    )
    model="gpt-4o-mini"
    try:
        response = client.chat.completions.create(
            model       = "gpt-4o-mini",  # ← add this env var
            temperature = 0,top_p = 0,
            seed=42,
            max_tokens  = 4000,
            response_format = {"type": "json_object"},
            messages = [
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
        )
        raw = response.choices[0].message.content.strip()
        return safe_json_parse(raw,client,model)
    except Exception as e:
        logger.exception("LLM call failed: %s: %s", type(e).__name__, str(e))
        raise


def enforce_jd_tiers(matching_results, jd_requirements, resume_text):
    """Tier membership comes from the JD, never from the matcher.

    Rebuilds every tier from jd_requirements so the denominator is identical on
    every run, and demotes a bogus not_found to partial when the skill string is
    actually present in the resume text.
    """
    tiers = ["mandatory", "preferred", "better_to_have"]
    sc = matching_results.setdefault("skill_comparison", {})
    low_resume = (resume_text or "").lower()

    # Flatten everything the matcher produced, wherever it put it.
    seen = {}
    for t in tiers:
        tier = sc.get(t) or {}
        for bucket in ("matched", "partial", "not_found"):
            for s in (tier.get(bucket) or []):
                if isinstance(s, dict) and s.get("skill"):
                    seen.setdefault(str(s["skill"]).strip().lower(), s)

    moved = 0
    for t in tiers:
        matched, partial, not_found = [], [], []

        for req in ((jd_requirements.get("skills") or {}).get(t) or []):
            name = str(req.get("skill", "")).strip()
            if not name:
                continue

            s = seen.pop(name.lower(), None)
            if s is None:
                moved += 1
                s = {"skill": name, "candidate_has": None, "match_score": 0.0,
                     "gap": "No evidence found in any resume section",
                     "interview_question": f"What real-world exposure do you have to {name}?"}

            s["skill"] = name
            s["jd_requires"] = {"years": req.get("years", 0.6),
                                "proficiency": req.get("proficiency", "familiar")}

            ch = s.get("candidate_has")

            # not_found is only legal when the string is genuinely absent.
            if ch is None and name.lower() in low_resume:
                moved += 1
                ch = {"years": 0.0, "proficiency": "familiar", "verified": False,
                      "unverified_reason": "Only listed in skills section \u2014 "
                                           "no project or work experience proof",
                      "proof": []}
                s["candidate_has"] = ch
                s["gap"] = "Listed in resume but no work experience or project proof"

            if ch is None:
                not_found.append(s)
            elif ch.get("verified") and (ch.get("proof") or []):
                matched.append(s)
            else:
                partial.append(s)

        sc[t] = {"matched": matched, "partial": partial, "not_found": not_found}

    if moved:
        logger.info("[TIER-LOCK] corrected %s skill placement(s)", moved)
    if seen:
        logger.warning("[TIER-LOCK] matcher invented %s skill(s) not in JD: %s",
                       len(seen), sorted(seen.keys()))
    return matching_results


PROOF_SECTIONS = {"work_experience", "project"}
WEAK_SECTIONS = {"skills_list", "summary", "certification", "education"}


def _norm(s):
    import re
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _squash(s):
    import re
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())


def _seen_in(text_norm, text_squash, candidate):
    n = _norm(candidate)
    return bool(n) and (n in text_norm or _squash(candidate) in text_squash)


def verify_and_bucket(matching_results, jd_requirements, resume_text):
    """The LLM supplies evidence; this decides every bucket from the resume text."""
    low, squash = _norm(resume_text), _squash(resume_text)
    tiers = ["mandatory", "preferred", "better_to_have"]
    sc = matching_results.setdefault("skill_comparison", {})

    pool = {}
    for t in tiers:
        block = sc.get(t) or {}
        for group in ("skills", "matched", "partial", "not_found"):
            for s in (block.get(group) or []):
                if isinstance(s, dict) and s.get("skill"):
                    pool.setdefault(_norm(s["skill"]), s)

    fabricated = 0

    for t in tiers:
        buckets = {"matched": [], "partial": [], "not_found": []}

        for req in ((jd_requirements.get("skills") or {}).get(t) or []):
            name = str(req.get("skill", "")).strip()
            if not name:
                continue
            src = pool.pop(_norm(name), None) or {}
            terms = [name] + list(req.get("aliases") or []) + list(src.get("resume_terms") or [])

            good = []
            for ev in (src.get("evidence") or []):
                if not isinstance(ev, dict):
                    continue
                q = ev.get("quote")
                if len(_norm(q)) < 12:
                    continue
                if _seen_in(low, squash, q):
                    good.append(ev)
                else:
                    fabricated += 1

            hit = next((x for x in terms if _seen_in(low, squash, x)), None)
            strong = [e for e in good if e.get("section") in PROOF_SECTIONS]
            weak = [e for e in good if e.get("section") in WEAK_SECTIONS]

            entry = {"skill": name,
                     "jd_requires": {"years": req.get("years", 0.6),
                                     "proficiency": req.get("proficiency", "familiar")}}

            if strong:
                entry["candidate_has"] = {"verified": True, "matched_term": hit or name,
                                          "proof": strong}
                entry["match_score"] = 1.0
                entry["interview_question"] = None
                buckets["matched"].append(entry)
            elif weak or hit:
                entry["candidate_has"] = {
                    "verified": False, "matched_term": hit or name,
                    "unverified_reason": "Named in the resume but no work experience "
                                         "or project line describes using it",
                    "proof": weak}
                entry["match_score"] = 0.4
                entry["gap"] = "Named in resume, usage not evidenced"
                entry["interview_question"] = (src.get("interview_question")
                                               or f"Describe a project or role where you used {name}.")
                buckets["partial"].append(entry)
            else:
                entry["candidate_has"] = None
                entry["match_score"] = 0.0
                entry["gap"] = "No mention found anywhere in the resume"
                entry["interview_question"] = (src.get("interview_question")
                                               or f"What exposure do you have to {name}?")
                buckets["not_found"].append(entry)

        sc[t] = buckets

    logger.info("[VERIFY] fabricated_quotes=%s skills_not_in_jd=%s", fabricated, len(pool))
    if pool:
        logger.warning("[VERIFY] matcher invented: %s", sorted(pool.keys())[:10])
    return matching_results


def enforce_experience_status(matching_results, jd_requirements, resume_text):
    """Experience status is arithmetic. Leadership needs a verified quote."""
    import re
    low, squash = _norm(resume_text), _squash(resume_text)
    exp = matching_results.setdefault("experience_comparison", {})
    req = (jd_requirements or {}).get("experience") or {}
    ch = exp.get("candidate_has") or {}

    try:
        years = float(ch.get("years") or 0)
    except (TypeError, ValueError):
        years = 0.0
    try:
        need = float(req.get("years") or 0)
    except (TypeError, ValueError):
        need = 0.0

    y_quote = exp.get("years_quote")
    quote_claims = [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)", str(y_quote))] if y_quote else []
    claims = quote_claims or [float(x) for x in re.findall(r"(\d+(?:\.\d+)?)\s*\+?\s*years?", low)]
    if claims and abs(max(claims) - years) >= 0.01:
        logger.info("[EXP-LOCK] years %s -> %s (resume states)", years, max(claims))
        years = max(claims)

    # The matcher offers a collaboration line as "leadership" often enough that
    # existence in the resume is not a sufficient test. Require a verb that
    # means leading PEOPLE. These are language-level, not domain-specific.
    LEAD_VERBS = ("led ", "lead ", "leading ", "managed ", "managing ","supervis", "mentor", "coached", "coaching", "headed ","heading ", "directed ", "oversaw", "overseeing","line manage", "direct reports")
    lq = exp.get("leadership_quote")
    has_lead = (bool(lq) and _seen_in(low, squash, lq)
                and any(v in _norm(lq) + " " for v in LEAD_VERBS))
    if lq and not has_lead:
        logger.info("[EXP-LOCK] leadership_quote rejected: %r", str(lq)[:80])
    need_lead = bool(req.get("leadership"))
    years_ok = years >= need

    if need_lead:
        status = "Met" if (years_ok and has_lead) else ("Partial" if (years_ok or has_lead) else "Not Met")
    else:
        status = "Met" if years_ok else ("Partial" if years >= need * 0.7 else "Not Met")

    ch.update({"years": years, "status": status,
               "leadership_evidence": lq if has_lead else None,
               "score": {"Met": 100, "Partial": 50, "Not Met": 0}[status]})
    exp["jd_requires"] = {"years": req.get("years", 0), "leadership": need_lead}
    exp["candidate_has"] = ch
    logger.info("[EXP-LOCK] years=%s need=%s lead_required=%s lead_found=%s -> %s",
                years, need, need_lead, has_lead, status)
    return matching_results


def assess_jd_fit_three_step(resume_text: str, jd_requirements: dict) -> dict:
    """
    Performs JD fit assessment in three focused steps:
    1. Extract requirements from JD
    2. Match candidate resume against requirements
    3. Calculate scores and generate final assessment
    
    Args:
        resume_text: Extracted text from resume
        jd_requirements: Extracted requirements from job description
        
    Returns:
        dict: Complete assessment with all sections
    """
    logger.info("[STEP 1/3] Extracting requirements from JD...")
      
    matching_results = call_llm_json(
        JD_FIT_SYSTEM,
        RESUME_MATCHING_PROMPT.format(
            jd_requirements=json.dumps(jd_requirements, indent=2),
            resume_text=resume_text
        )
    )
    candidate_name = matching_results.get('meta', {}).get('candidate_name', 'Unknown')
    logger.info("Candidate: %s", candidate_name)
    
    # Validate and correct skill bucket placement
    validation_errors = validate_skill_buckets(matching_results)
    if validation_errors:
        logger.warning("Detected %s skill bucket placement errors", len(validation_errors))
        logger.info("Applying automatic corrections...")
        matching_results = correct_skill_buckets(matching_results)
        logger.info("Skill buckets corrected")
    
    # Count matches across all tiers
    skill_matches = matching_results.get('skill_comparison', {})
    total_matched = sum(len(skill_matches.get(tier, {}).get('matched', [])) 
                       for tier in ['mandatory', 'preferred', 'better_to_have'])
    total_partial = sum(len(skill_matches.get(tier, {}).get('partial', [])) 
                       for tier in ['mandatory', 'preferred', 'better_to_have'])
    total_not_found = sum(len(skill_matches.get(tier, {}).get('not_found', [])) 
                         for tier in ['mandatory', 'preferred', 'better_to_have'])
    
    logger.info("Skills - Matched: %s, Partial: %s, Not Found: %s", total_matched, total_partial, total_not_found)

    matching_results = verify_and_bucket(matching_results, jd_requirements, resume_text)
    matching_results = enforce_experience_status(matching_results, jd_requirements, resume_text)

    calculate_scores_and_tier(matching_results)
    matching_results["request_id"] = str(uuid.uuid4())
    matching_results["generated_at"] = datetime.now(timezone.utc).isoformat()
    return matching_results


def call_llm_json_with_tokens(system: str, user: str) -> dict:
    client = AzureOpenAI(
        azure_endpoint=os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini", ""),
        api_key=os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
        api_version="2024-08-01-preview",
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        max_tokens=16000,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )

    raw = response.choices[0].message.content.strip()

    parsed = safe_json_parse(
        raw,
        client,
        "gpt-4o-mini"
    )

    return {
        "data": parsed,
        "tokens": (
            response.usage.total_tokens
            if response.usage
            else 0
        )
    }
def call_llm_one_liner_with_tokens(system: str, user: str) -> dict:
    client = AzureOpenAI(
        azure_endpoint=os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini", ""),
        api_key=os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
        api_version="2024-08-01-preview",
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0,
        max_tokens=4000,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )

    raw = response.choices[0].message.content.strip()

    parsed = safe_json_parse(
        raw,
        client,
        "gpt-4o-mini"
    )

    return {
        "data": parsed,
        "tokens": (
            response.usage.total_tokens
            if response.usage
            else 0
        )
    }

def normalize_jd_schema(parsed):

    scorecard = parsed.get("scorecard", {})

    nested_keys = [
        "certification_comparison",
        "education_comparison",
        "experience_comparison",
        "skill_comparison",
        "flags",
        "ui_hints"
    ]

    if any(key in scorecard for key in nested_keys):
        logger.warning(
            "Unexpected nested schema detected"
        )

    for key in nested_keys:
        if key in scorecard and key not in parsed:
            parsed[key] = scorecard.pop(key)

    return parsed

def call_llm_json_GPT5_with_tokens(system, user):
    endpoint = os.getenv("RESUME_FORMATTER_AZURE_ENDPOINT")
    api_key = os.getenv("RESUME_FORMATTER_AZURE_API_KEY")
    VERSION = os.getenv("RESUME_FORMATTER_AZURE_AI_VERSION")
    DEPLOYMENT = os.getenv("RESUME_FORMATTER_AZURE_DEP_MODEL")

    client = AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=VERSION
    )

    response = client.chat.completions.create(
        model=DEPLOYMENT,
        reasoning_effort="minimal",
        messages=[
            {
                "role": "system",
                "content": system
            },
            {
                "role": "user",
                "content": user
            }
        ],
        max_completion_tokens=12000
    )

    parsed = json.loads(
        response.choices[0].message.content
    )

    return {
        "data": parsed,
        "tokens": (
            response.usage.total_tokens
            if response.usage
            else 0
        )
    }

