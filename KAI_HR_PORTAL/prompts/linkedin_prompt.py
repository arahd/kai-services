LINKEDIN_SYSTEM = (
    "You are an expert background verification specialist. "
    "Be flexible with titles ('Software Engineer' vs 'Software Developer') and certifications. "
    "Compare like a human, not strict string match. "
    "Always respond with valid JSON only."
)

LINKEDIN_USER = """Perform a detailed Profile vs LinkedIn presence validation.

**Resume:**
{resume_text}

**LinkedIn URL:**
{linkedin_url}

**LinkedIn Data:**
{linkedin_text}

Return this exact JSON structure:
{{
  "request_id": "<uuid-v4>",
  "generated_at": "<ISO8601 timestamp>",
  "version": "consistency_v2",
  "candidate": {{
    "full_name": "<string|null>",
    "current_title": "<string|null>",
    "location": "<string|null>"
  }},
  "resume_profile": {{
    "work_experience": [
      {{ "company": "<string>", "title": "<string>", "start": "<YYYY-MM|null>", "end": "<YYYY-MM|null>", "location": "<string|null>" }}
    ],
    "skills": ["<skill>"],
    "education": [{{ "institution": "<string>", "degree": "<string|null>", "field": "<string|null>", "end_year": <int|null> }}],
    "certifications": [{{ "name": "<string>", "issuer": "<string|null>", "issue_date": "<YYYY-MM|null>" }}]
  }},
  "linkedin_profile": {{
    "url": "<use linkedin_url if provided else null>",
    "fetched_at": "<ISO8601 timestamp|null>",
    "visibility": "public | limited | unknown",
    "experience": [
      {{ "company": "<string>", "title": "<string>", "start": "<YYYY-MM|null>", "end": "<YYYY-MM|null>", "location": "<string|null>" }}
    ],
    "skills": ["<skill>"],
    "education": [{{ "institution": "<string>", "degree": "<string|null>", "field": "<string|null>", "end_year": <int|null> }}],
    "certifications": [{{ "name": "<string>", "issuer": "<string|null>", "issue_date": "<YYYY-MM|null>" }}]
  }},
  "consistency_assessment": {{
    "overall_consistency_score": <0.0-1.0>,
    "confidence": <0.0-1.0>,
    "summary": "<1 sentence>",
    "discrepancies": [
      {{
        "category": "employment_dates | titles | skills | education | certifications",
        "item": "<string>",
        "resume_value": "<string|null>",
        "linkedin_value": "<string|null>",
        "delta_days": <int|null>,
        "severity": "high | medium | low",
        "action": "clarify | update_linkedin | update_resume | ignore"
      }}
    ],
    "checks": {{
      "employment": {{
        "status": "pass | warn | fail",
        "details": [
          {{
            "company": "<string>",
            "title_resume": "<string|null>",
            "title_linkedin": "<string|null>",
            "date_resume": {{ "start": "<YYYY-MM|null>", "end": "<YYYY-MM|null>" }},
            "date_linkedin": {{ "start": "<YYYY-MM|null>", "end": "<YYYY-MM|null>" }},
            "location_resume": "<string|null>",
            "location_linkedin": "<string|null>",
            "consistency_score": <0.0-1.0>,
            "notes": ["<string>"]
          }}
        ]
      }},
      "titles": {{ "status": "pass | warn | fail", "mismatches": ["<string>"], "consistency_score": <0.0-1.0> }},
      "skills": {{
        "status": "pass | warn | fail",
        "missing_on_linkedin": ["<skill>"],
        "missing_on_resume": ["<skill>"],
        "overclaimed_on_resume": ["<skill>"],
        "consistency_score": <0.0-1.0>
      }},
      "education": {{ "status": "pass | warn | fail", "mismatches": ["<string>"], "consistency_score": <0.0-1.0> }},
      "certifications": {{ "status": "pass | warn | fail", "mismatches": ["<string>"], "consistency_score": <0.0-1.0> }}
    }},
    "red_flags": ["<string>"],
    "recommendations": ["<string>"]
  }},
  "ui_hints": {{
    "consistency_thresholds": {{ "pass": 0.9, "warn": 0.7 }},
    "sections_order": ["summary", "discrepancies", "checks", "recommendations"]
  }}
}}

Rules:
- Compare resume vs LinkedIn on employment dates, titles, key skills, education, and certifications.
- Use only evidence present in inputs; do not invent data.
- Prefer YYYY-MM date normalization; if only year is available, use YYYY and keep deltas conservative.
- Keep discrepancies focused and actionable.
- Use neutral language and flag items requiring clarification."""

