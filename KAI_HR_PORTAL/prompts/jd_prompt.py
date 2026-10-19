JD_FIT_SYSTEM = (
    "You are a senior technical recruiter. "
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

ONE_LINER_SYSTEM = (
    "You are a senior technical recruiter writing concise, insightful candidate verdicts. "
    "Always respond with a single sentence, no quotes, no preamble."
)

DUAL_DOCUMENT_VALIDATOR_SYSTEM = (
    "You are a document classifier that validates both resumes and job descriptions simultaneously. "
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

DUAL_DOCUMENT_VALIDATION_PROMPT = """Analyze the following two documents and validate if Document 1 is a valid resume and Document 2 is a valid job description.

**Document 1 (Expected: Resume):**
{resume_text}

**Document 2 (Expected: Job Description):**
{jd_text}

Return ONLY the JSON below — no other text:

{{
  "resume_validation": {{
    "is_valid": <true|false>,
    "confidence": <0-100>,
    "document_type": "<resume|job_description|invoice|bill|receipt|story|book|article|form|letter|menu|advertisement|other>",
    "reasoning": "<brief explanation of determination>",
    "indicators": {{
      "has_personal_info": <true|false>,
      "has_work_experience": <true|false>,
      "has_education": <true|false>,
      "has_skills_section": <true|false>,
      "has_contact_info": <true|false>
    }},
    "red_flags": ["<list any issues found>"]
  }},
  
  "jd_validation": {{
    "is_valid": <true|false>,
    "confidence": <0-100>,
    "document_type": "<resume|job_description|invoice|bill|receipt|story|book|article|form|letter|menu|advertisement|other>",
    "reasoning": "<brief explanation of determination>",
    "indicators": {{
      "has_job_title": <true|false>,
      "has_responsibilities": <true|false>,
      "has_requirements": <true|false>,
      "has_qualifications": <true|false>,
      "has_company_info": <true|false>
    }},
    "red_flags": ["<list any issues found>"]
  }},
  
  "overall_status": {{
    "both_valid": <true|false>,
    "can_proceed": <true|false>,
    "error_summary": "<null if both valid, otherwise brief summary of issues>"
  }}
}}

═══════════════════════════════════════
VALIDATION RULES
═══════════════════════════════════════

RESUME VALIDATION (Document 1):
- is_valid = true ONLY if:
  * confidence >= 70 AND
  * at least 3 resume indicators are true AND
  * document_type = "resume"
- is_valid = false if document appears to be JD, invoice, or other non-resume

JOB DESCRIPTION VALIDATION (Document 2):
- is_valid = true ONLY if:
  * confidence >= 70 AND
  * at least 3 JD indicators are true AND
  * document_type = "job_description"
- is_valid = false if document appears to be resume, invoice, or other non-JD

OVERALL STATUS:
- both_valid = true ONLY if resume_validation.is_valid AND jd_validation.is_valid both are true
- can_proceed = true ONLY if both_valid is true
- error_summary: Summarize which document(s) failed and why

RED FLAGS TO CHECK:
RESUME (Document 1):
- Contains "we are looking for", "required qualifications", "job responsibilities" → might be JD
- Contains invoice numbers, prices, payment terms → invalid document
- Lacks personal info, work history, education → not a proper resume

JOB DESCRIPTION (Document 2):
- Contains personal contact info, "I achieved", work history with dates → might be resume
- Contains invoice numbers, story narrative, menu items → invalid document
- Lacks job title, requirements, responsibilities → not a proper JD

CONFIDENCE SCORING:
- 90-100: Very clear what document type it is
- 70-89:  Strong indicators with minor ambiguity
- 50-69:  Mixed signals, some expected elements but concerns
- 0-49:   Likely not the expected document type

CROSS-CONTAMINATION:
- If Document 1 looks like JD → red_flag in resume_validation
- If Document 2 looks like resume → red_flag in jd_validation
- Provide clear feedback about what was actually detected
"""

# ═══════════════════════════════════════════════════════════════════════════════
# JD-ONLY DOCUMENT VALIDATION (Single Document Validation)
# ═══════════════════════════════════════════════════════════════════════════════

JD_VALIDATOR_SYSTEM = (
    "You are a specialized document classifier for job descriptions. "
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

JD_VALIDATION_PROMPT = """Analyze the following document and validate if it is a valid job description (JD).

**Document to Validate:**
{jd_text}

Return ONLY the JSON below — no other text:

{{
  "is_valid": <true|false>,
  "confidence": <0-100>,
  "document_type": "<job_description|resume|invoice|bill|receipt|story|book|article|form|letter|menu|advertisement|other>",
  "reasoning": "<brief explanation of what this document is and why>",
  
  "indicators": {{
    "has_job_title": <true|false>,
    "has_responsibilities": <true|false>,
    "has_requirements": <true|false>,
    "has_qualifications": <true|false>,
    "has_company_info": <true|false>,
    "has_skills_required": <true|false>,
    "has_experience_required": <true|false>
  }},
  
  "red_flags": ["<list any issues found>"],
  
  "quality_assessment": {{
    "completeness": "<complete|partial|minimal>",
    "clarity": "<clear|moderate|unclear>",
    "actionable": <true|false>
  }},
  
  "detected_sections": {{
    "job_title": "<extracted title or null>",
    "company_name": "<extracted company or null>",
    "location": "<extracted location or null>",
    "has_salary_info": <true|false>,
    "has_benefits_info": <true|false>
  }}
}}

═══════════════════════════════════════
VALIDATION RULES
═══════════════════════════════════════

JOB DESCRIPTION VALIDATION:
- is_valid = true ONLY if ALL of these conditions are met:
  * confidence >= 70 AND
  * at least 4 JD indicators are true AND
  * document_type = "job_description" AND
  * Contains clear job requirements or responsibilities

- is_valid = false if:
  * Document appears to be a resume (has personal info, work history with "I achieved", dates)
  * Document is invoice, bill, receipt, story, or other non-JD type
  * Lacks essential JD elements (no job title, no requirements, no responsibilities)
  * Confidence < 70

CONFIDENCE SCORING (0-100):
- 90-100: Very clearly a job description
  * Clear job title in header/opening
  * Multiple sections: requirements, responsibilities, qualifications
  * Uses "we are looking for", "required", "must have" language
  * No personal pronouns like "I achieved", "my experience"
  
- 70-89: Strong indicators with minor ambiguity
  * Has job title and requirements
  * May be missing some typical sections
  * Language mostly employer-focused
  * Minor concerns about completeness
  
- 50-69: Mixed signals or incomplete JD
  * Has some JD elements but missing others
  * Unclear if job posting or something else
  * Very brief or poorly structured
  * May be job summary rather than full description
  
- 0-49: Likely NOT a job description
  * Missing critical elements (title, requirements)
  * Appears to be resume, invoice, or other document type
  * Uses wrong perspective (candidate instead of employer)

INDICATORS EXPLAINED:

has_job_title:
- True: Document clearly states a job title/position
- Examples: "Senior Software Engineer", "Java Developer", "Project Manager"
- False: No clear job title, or only vague descriptions

has_responsibilities:
- True: Lists job duties, responsibilities, or day-to-day tasks
- Keywords: "responsibilities", "duties", "you will", "the role involves"
- False: No description of what the job entails

has_requirements:
- True: Lists required skills, experience, or qualifications
- Keywords: "required", "must have", "essential", "mandatory"
- False: No clear requirements specified

has_qualifications:
- True: Specifies education, certifications, or professional qualifications
- Keywords: "degree", "bachelor's", "certification", "qualified"
- False: No qualification requirements mentioned

has_company_info:
- True: Mentions company name, industry, or company description
- False: No company information provided

has_skills_required:
- True: Lists specific technical or professional skills needed
- Examples: "Java", "Project Management", "SQL", "Agile"
- False: No specific skills mentioned

has_experience_required:
- True: Specifies years of experience or experience level
- Examples: "5+ years", "senior level", "entry level"
- False: No experience requirements stated

RED FLAGS TO DETECT:

JD Contaminated with Resume Content:
- Contains "I achieved", "My experience", "I developed"
- Has personal contact info (email, phone, address)
- Lists work history with employment dates (2018-2021)
- Uses first-person narrative

Invalid Document Types:
- Invoice: Contains invoice numbers, prices, payment terms, "total amount due"
- Receipt: Transaction details, payment confirmation
- Story/Article: Narrative writing, no job requirements
- Form: Fill-in-blanks, template structure without content
- Menu: Food items, prices
- Advertisement: Marketing language focused on selling products

Incomplete or Poor Quality JD:
- Extremely short (< 100 words)
- Only job title with no other details
- Copy-paste errors, placeholder text
- Mixed languages or garbled text
- Duplicate sections

QUALITY ASSESSMENT:

completeness:
- "complete": Has all major sections (title, company, responsibilities, requirements, qualifications)
- "partial": Has some sections but missing important ones
- "minimal": Only has job title or very basic info

clarity:
- "clear": Well-structured, easy to understand requirements
- "moderate": Somewhat clear but could be better organized
- "unclear": Confusing, poorly written, or ambiguous

actionable:
- true: Contains enough detail for candidate to understand role and requirements
- false: Too vague or incomplete to be useful

EXAMPLES:

VALID JD (confidence: 95):
"Senior Java Developer - ABC Tech
We are seeking an experienced Java developer with 5+ years...
Responsibilities: Design and develop backend services...
Required Skills: Java 8+, Spring Boot, Microservices...
Qualifications: Bachelor's in Computer Science or equivalent..."

VALID JD (confidence: 80):
"Looking for Java Developer
Requirements:
- 3+ years Java experience
- Knowledge of Spring Framework
- SQL database skills"

INVALID - Actually a Resume (confidence: 15):
"John Doe
john@email.com | 555-1234
Software Engineer with 5 years experience
I developed backend services using Java and Spring at XYZ Corp (2018-2021)..."

INVALID - Too Vague (confidence: 45):
"Java Developer needed
Good salary"

INVALID - Invoice (confidence: 5):
"Invoice #12345
Services Rendered: Software Development
Total Amount: $5,000"

REASONING EXAMPLES:
- "This is a valid job description with clear title, requirements, and responsibilities for a Java Developer position."
- "This appears to be a resume rather than a JD - contains personal contact info and work history in first-person."
- "This is too brief to be a complete job description - only contains a job title with no requirements or details."
- "This is an invoice document, not a job description - contains payment terms and transaction details."
"""

# ═══════════════════════════════════════════════════════════════════════════════
# RESUME-ONLY DOCUMENT VALIDATION (Single Document Validation)
# ═══════════════════════════════════════════════════════════════════════════════

RESUME_VALIDATOR_SYSTEM = (
    "You are a specialized document classifier for resumes. "
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

RESUME_VALIDATION_PROMPT = """Analyze the following document and validate if it is a valid resume.

**Document to Validate:**
{resume_text}

Return ONLY the JSON below — no other text:

{{
  "is_valid": <true|false>,
  "confidence": <0-100>,
  "document_type": "<resume|job_description|invoice|bill|receipt|story|book|article|form|letter|menu|advertisement|other>",
  "reasoning": "<brief explanation of what this document is and why>",
  
  "indicators": {{
    "has_personal_info": <true|false>,
    "has_work_experience": <true|false>,
    "has_education": <true|false>,
    "has_skills_section": <true|false>,
    "has_contact_info": <true|false>,
    "has_projects": <true|false>,
    "has_achievements": <true|false>
  }},
  
  "red_flags": ["<list any issues found>"],
  
  "quality_assessment": {{
    "completeness": "<complete|partial|minimal>",
    "clarity": "<clear|moderate|unclear>",
    "assessable": <true|false>
  }},
  
  "detected_sections": {{
    "candidate_name": "<extracted name or null>",
    "email": "<extracted email or null>",
    "phone": "<extracted phone or null>",
    "linkedin_url": "<extracted LinkedIn URL or null>",
    "github_url": "<extracted GitHub URL or null>",
    "has_work_experience": <true|false>,
    "has_education": <true|false>,
    "has_certifications": <true|false>
  }}
}}

═══════════════════════════════════════
VALIDATION RULES
═══════════════════════════════════════

RESUME VALIDATION:
- is_valid = true ONLY if ALL of these conditions are met:
  * confidence >= 70 AND
  * at least 4 resume indicators are true AND
  * document_type = "resume" AND
  * Contains clear work experience or education sections

- is_valid = false if:
  * Document appears to be a job description (has "we are looking for", job requirements, employer perspective)
  * Document is invoice, bill, receipt, story, or other non-resume type
  * Lacks essential resume elements (no work experience, no education, no personal info)
  * Confidence < 70

CONFIDENCE SCORING (0-100):
- 90-100: Very clearly a resume
  * Clear personal info (name, contact details)
  * Work experience with job titles, companies, dates, responsibilities
  * Education section with degree and institution
  * Skills section listing technical/professional skills
  * Uses first-person perspective ("I developed", "Led team", "Achieved")
  
- 70-89: Strong indicators with minor ambiguity
  * Has personal info and work history
  * May be missing some typical sections (e.g., no skills section)
  * Language mostly candidate-focused
  * Minor concerns about completeness or structure
  
- 50-69: Mixed signals or incomplete resume
  * Has some resume elements but missing others
  * Unclear if professional resume or personal bio
  * Very brief or poorly structured
  * May be resume summary rather than full resume
  
- 0-49: Likely NOT a resume
  * Missing critical elements (work experience, education)
  * Appears to be job description, invoice, or other document type
  * Uses wrong perspective (employer instead of candidate)

INDICATORS EXPLAINED:

has_personal_info:
- True: Document includes candidate's name (typically at top of document)
- False: No personal identification found

has_work_experience:
- True: Lists previous jobs with company names, job titles, dates, responsibilities
- Keywords: "Experience", company names, job titles, employment dates (YYYY-MM format)
- False: No work history or employment details

has_education:
- True: Lists educational qualifications with degree, institution, graduation year
- Examples: "Bachelor of Science", "Computer Science", "University", "Graduated 2020"
- False: No education section found

has_skills_section:
- True: Dedicated section listing technical or professional skills
- Keywords: "Skills", "Technical Skills", "Core Competencies"
- False: No structured skills listing

has_contact_info:
- True: Includes email, phone number, or LinkedIn profile
- False: No contact information provided

has_projects:
- True: Lists personal or professional projects with descriptions
- Keywords: "Projects", project names, technologies used, outcomes
- False: No project section found

has_achievements:
- True: Mentions certifications, awards, publications, or notable accomplishments
- Keywords: "Certifications", "Awards", "Achievements", "Publications"
- False: No achievements section

RED FLAGS TO DETECT:

Resume Contaminated with JD Content:
- Contains "we are looking for", "required qualifications", "job responsibilities"
- Uses employer perspective ("the candidate will", "we seek", "company offers")
- Lists job requirements instead of candidate qualifications
- Has salary ranges, benefits descriptions

Invalid Document Types:
- Invoice: Contains invoice numbers, prices, payment terms, "total amount due"
- Receipt: Transaction details, payment confirmation
- Story/Article: Narrative writing without professional context
- Form: Fill-in-blanks, template structure without content
- Menu: Food items, prices
- Advertisement: Marketing language focused on selling products
- Job Description: Employer perspective, job requirements, "we are hiring"

Incomplete or Poor Quality Resume:
- Extremely short (< 100 words)
- Only contact info with no work history
- Copy-paste errors, placeholder text like "[Your Name]", "[Company Name]"
- Mixed languages or garbled text
- Duplicate sections
- Scanned resume with OCR errors

QUALITY ASSESSMENT:

completeness:
- "complete": Has all major sections (personal info, work experience, education, skills, contact info)
- "partial": Has some sections but missing important ones (e.g., work experience present but no education)
- "minimal": Only has basic info like contact details or very brief history

clarity:
- "clear": Well-structured, easy to read, professional formatting
- "moderate": Somewhat clear but could be better organized or formatted
- "unclear": Confusing structure, poor formatting, difficult to extract information

assessable:
- true: Contains enough detail to evaluate candidate's qualifications and experience
- false: Too vague, incomplete, or poorly written to make hiring assessment

DETECTED SECTIONS:

Extract the following if present:
- candidate_name: Full name (usually at document top)
- email: Email address
- phone: Phone number
- linkedin_url: LinkedIn profile URL
- github_url: GitHub profile URL or personal website
- has_work_experience: true if work history section exists
- has_education: true if education section exists
- has_certifications: true if certifications/licenses listed

EXAMPLES:

VALID RESUME (confidence: 95):
"John Doe
john.doe@email.com | +1-555-1234 | linkedin.com/in/johndoe

Software Engineer with 5+ years of experience

EXPERIENCE
Senior Software Engineer | ABC Tech | 2020-2023
- Developed microservices using Java and Spring Boot
- Led team of 3 developers

EDUCATION
B.S. Computer Science | MIT | 2018

SKILLS
Java, Python, Spring Boot, AWS, Docker"

VALID RESUME (confidence: 80):
"Jane Smith
jane@email.com

Work Experience:
- Software Developer at XYZ Corp (2019-2022)
  Built web applications using React and Node.js
- Junior Developer at ABC Inc (2017-2019)

Education:
Bachelor's in Computer Science, 2017"

INVALID - Actually a Job Description (confidence: 10):
"Software Engineer Position - ABC Tech

We are looking for an experienced software engineer with 5+ years...

Requirements:
- 5+ years Java experience
- Strong knowledge of Spring Boot
- Bachelor's degree required"

INVALID - Too Vague (confidence: 40):
"John Doe
Software Engineer
Good with computers"

INVALID - Invoice (confidence: 5):
"Invoice #12345
Bill To: John Doe
Services: Software Development
Total: $5,000"

REASONING EXAMPLES:
- "This is a valid resume with clear personal info, work experience at multiple companies, education credentials, and technical skills."
- "This appears to be a job description rather than a resume - uses employer perspective with 'we are looking for' and lists job requirements."
- "This is too brief to be a complete resume - only contains contact info with no work history or education."
- "This is an invoice document, not a resume - contains billing information and payment terms."
"""

ONE_LINER_VERDICT_PROMPT = """Based on the following candidate analysis, provide a concise one-line verdict summarizing the candidate's fit for the role. Focus on key strengths, scores and critical gaps.
{candidate_analysis}

Return ONLY the JSON below — no other text:
{{
  "one_liner": "<a single sentence summarizing the candidate's fit, no quotes>"
}}
"""

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: JD EXTRACTION PROMPT
# ═══════════════════════════════════════════════════════════════════════════════

JD_EXTRACTION_PROMPT = """Extract all requirements from the job description below. Return ONLY the JSON — no other text.

**Job Description:**
{jd_text}

{{
  "job_title": "<exact job title from JD>",
  "company": "<company name if mentioned, else null>",
  
  "skills": {{
    "mandatory": [
      {{
        "skill": "<canonical atomic skill name>",
        "aliases": ["<every other way a resume might write this exact skill>"],
        "years": <float>,
        "proficiency": "<expert|advanced|intermediate|working|familiar>"
      }}
    ],
    "preferred": [
      {{
        "skill": "<canonical atomic skill name>",
        "aliases": ["<variants>"],
        "years": <float>,
        "proficiency": "<level>"
      }}
    ],
    "better_to_have": [
      {{
        "skill": "<canonical atomic skill name>",
        "aliases": ["<variants>"],
        "years": <float>,
        "proficiency": "<level>"
      }}
    ]
  }},
  
  "experience": {{
    "years": <int>,
    "leadership": <true|false>
  }},
  
  "education": "<education requirement from JD or null>",
  
  "certifications": ["<cert name>"]
}}

═══════════════════════════════════════
EXTRACTION RULES
═══════════════════════════════════════

SKILL CATEGORIZATION:
- mandatory: Skills explicitly marked as "required", "must have", "mandatory", "essential"
- preferred: Skills explicitly marked as "preferred" or "desired"
- better_to_have: Skills explicitly marked as "nice to have", "bonus", "plus", "advantageous"

DETERMINISTIC RULES:
- NEVER move a skill between categories based on your judgment.
- ONLY use the wording present in the JD.
- If a category is not explicitly stated, use:
    1. mandatory if the skill appears in Required Skills, Must Have Skills, Requirements, Qualifications sections
    2. preferred if the skill appears in Preferred Skills or Desired Skills sections
    3. better_to_have for all remaining skills

- The same JD must always produce the same categorization.

YEARS & PROFICIENCY:
- ALWAYS extract explicit year requirements first (e.g., "5+ years of Java" → years=5.0)
- If years NOT explicitly stated but proficiency keywords found, use this mapping:
  
  Proficiency Level → Years to Assign
  ----------------------------------
  "expert"        → 7.0
  "advanced"      → 5.0
  "intermediate"  → 3.0
  "working"       → 2.0
  "familiar"      → 0.6
  
- If NEITHER years NOR proficiency mentioned → default: years=0.6, proficiency="familiar"
- NEVER assign years=0.0 for any skill

EXAMPLES:
- "5+ years of Java experience" → years=5.0, proficiency="advanced"
- "Advanced knowledge of Spring" → years=5.0, proficiency="advanced"
- "Familiarity with Angular" → years=0.6, proficiency="familiar"
- "Knowledge of Git" → years=0.6, proficiency="familiar" (default)

NOT A VALID SKILL:

Education:
- Bachelor Degree
- Master Degree
- Computer Science
- Information Technology

Certifications:
- ISTQB
- PMP
- AWS Certification
- Azure Certification

Soft Skills:
- Communication
- Analytical Skills
- Problem Solving
- Leadership
- Teamwork
- Collaboration

These must NEVER appear under:
- mandatory
- preferred
- better_to_have

EXPERIENCE:
- Extract total years required
- leadership: true if mentions "lead", "manage", "mentor", "senior", "principal"

EDUCATION:
- Extract educational requirements ONLY into the education field.
- NEVER add education requirements to mandatory, preferred, or better_to_have.
- Bachelor Degree, Master Degree, Computer Science, Information Technology are NOT skills.
- If education appears in any skill bucket, the response is invalid.
- NEVER add education requirements as skills.
- Examples that must NOT appear in skills:
  - Bachelor degree
  - Computer Science
  - Information Technology
  - Master's Degree

CERTIFICATIONS:
- Certifications must ONLY appear in certifications.
- NEVER add certifications into mandatory, preferred, or better_to_have.
- ISTQB, PMP, AWS, Azure, Scrum certifications are NOT skills.
- If a certification appears in any skill bucket, the response is invalid.


SKILL NORMALIZATION RULES:

- Extract atomic skills only.
- Never combine multiple skills into a single skill entry.

Correct:
- SDLC
- STLC
- Jira
- Azure DevOps
- SQL
- Postman

Incorrect:
- Knowledge of SDLC and STLC
- Experience with Jira, Azure DevOps, or similar tools
- Understanding of SQL and database testing
- API testing using Postman or equivalent tools

Remove prefixes:
- Knowledge of
- Experience with
- Understanding of
- Familiarity with
- Expertise in
- Proficiency in

Split skills connected by:
- and
- or
- commas
- slash (/)

Education must never appear as a skill.
Certifications must never appear as a skill.
Soft skills such as communication, analytical skills,
problem solving, teamwork must never appear as skills.

GENERAL:
- Extract exactly what is stated.
- The same JD input must always generate identical output.
- Never move skills between mandatory, preferred, and better_to_have on different runs.
- Education belongs only in education.
- Certifications belong only in certifications.
- Do not infer categories.
- Follow section headers literally.
- Verify all skills have years > 0.0 before returning.

═══════════════════════════════════════
OUTPUT STABILITY — MANDATORY
═══════════════════════════════════════

- Within each bucket, sort skills ALPHABETICALLY (A→Z, case-insensitive).
- Emit each skill EXACTLY ONCE across all three buckets.
  On conflict the precedence is: mandatory > preferred > better_to_have.
- Use the canonical SHORT name — the shortest form a practitioner would
  recognise. Strip qualifier clauses:
    "Jira, Azure DevOps, or similar tools"  -> "Jira", "Azure DevOps"
    "API testing using Postman"             -> "API Testing", "Postman"
    "NET Core / .NET 6+"                    -> ".NET Core"
    "Registered Nurse (RN)"                 -> "Registered Nurse"

- aliases: every string a resume might plausibly use for THAT SAME skill.
  Include the acronym AND the expansion, version-numbered forms,
  vendor-prefixed forms, common abbreviations, and spelling variants.
    ".NET Core"           -> [".NET", "ASP.NET Core", ".NET 6", ".NET 8", "dotnet"]
    "Registered Nurse"    -> ["RN", "R.N."]
    "GAAP"                -> ["Generally Accepted Accounting Principles", "US GAAP"]
    "Kubernetes"          -> ["K8s", "EKS", "AKS", "GKE"]
    "Accounts Receivable" -> ["AR", "A/R", "receivables"]
  A version variant is an ALIAS, never a separate skill: ".NET 6+" belongs
  in the aliases of ".NET Core", not in its own entry.
  Never alias two genuinely different skills together. Selenium is not an
  alias of Playwright. IFRS is not an alias of GAAP.
  aliases may be [] when only one spelling is in common use.

- Split compounds joined by "/", ",", "and", "or" into separate entries —
  EXCEPT genuine single terms containing a slash: CI/CD, TCP/IP, A/B testing,
  I/O, UI/UX, R&D, P&L. Emit those whole.
- A tools inventory section ("Tools", "Tools Commonly Used", "Technologies",
  "Tech Stack") carries NO requirement wording. Every tool listed there that is
  not already in mandatory or preferred goes to better_to_have — list ALL of
  them, never a subset.
- If a bucket has no qualifying skills, return [] for it.
  NEVER move a skill from another bucket to avoid an empty list.
- Do not invent, merge, split or rename skills not literally in the JD.

SELF-CHECK BEFORE RETURNING:
1. Is every bucket sorted A→Z?
2. Does any skill name appear in more than one bucket? Delete the lower-precedence copy.
3. Does any entry contain "and", "or", "/" or a comma? Split it.
4. Does any entry match Education, Certification or Soft Skill? Remove it.
5. Does every skill have years > 0.0?
"""

RESUME_MATCHING_SYSTEM = (
    "You are a senior skill analyser. Compare the skills from JD against resume."
    "Always respond with valid JSON only. No preamble, no markdown fences."
)

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: RESUME MATCHING PROMPT
# ═══════════════════════════════════════════════════════════════════════════════
RESUME_MATCHING_PROMPT = """Locate evidence in the resume for each required skill. Return ONLY the JSON — no other text.

**Job Requirements (extracted from JD):**
{jd_requirements}

**Candidate Resume:**
{resume_text}

{{
  "meta": {{
    "job_title": "<job title, copied from Job Requirements>",
    "company": "<current or most recent employer from resume, else null>",
    "candidate_name": "<full name from resume>",
    "candidate_email": "<email or null>",
    "candidate_phone": "<phone or null>",
    "candidate_linkedin": "<LinkedIn URL or null>",
    "candidate_github": "<GitHub URL or null>",
    "candidate_portfolio": "<portfolio URL or null>"
  }},

  "skill_comparison": {{
    "mandatory": {{ "skills": [
      {{
        "skill": "<name copied character-for-character from Job Requirements>",
        "resume_terms": ["<the exact words the RESUME uses for this skill, if any>"],
        "evidence": [
          {{
            "quote": "<VERBATIM substring copied from the resume, 12+ characters>",
            "section": "work_experience | project | skills_list | summary | certification | education"
          }}
        ],
        "interview_question": "<question naming this skill, or null if fully evidenced>"
      }}
    ] }},
    "preferred":      {{ "skills": [<same object shape>] }},
    "better_to_have": {{ "skills": [<same object shape>] }}
  }},

  "experience_comparison": {{
    "candidate_has": {{ "years": <float> }},
    "years_quote": "<VERBATIM resume text stating total years, or null>",
    "leadership_quote": "<VERBATIM resume line showing they led, managed, supervised or mentored other people, or null>"
  }},

  "education_comparison": {{
    "jd_requires": "<education requirement, copied from Job Requirements>",
    "candidate_has": "<qualification, field, institution, year from resume>",
    "evidence_quote": "<VERBATIM resume line stating the qualification, or null>"
  }},

  "certification_comparison": {{
    "jd_requires": ["<cert, copied from Job Requirements>"],
    "candidate_has": ["<cert exactly as written in the resume>"]
  }}
}}

═══════════════════════════════════════
YOUR ONLY JOB IS TO LOCATE EVIDENCE
═══════════════════════════════════════

You do NOT assign buckets. You do NOT compute scores or match percentages.
You do NOT decide "verified", "Met", "Partial" or "Not Met". A downstream
program derives all of that from what you report. Report what the resume
says; nothing else. There are no numbers for you to invent here.

═══════════════════════════════════════
ONE ENTRY PER REQUIRED SKILL
═══════════════════════════════════════

- Walk the skills in each tier in the order given in Job Requirements.
- Emit exactly ONE object per skill. Never add, merge, split, rename or drop one.
- Copy the skill name character-for-character.
- The tier is FIXED by Job Requirements. Never move a skill between tiers.
- A skill the candidate clearly lacks still gets an object, with
  resume_terms: [] and evidence: []. That is a complete, correct answer.

═══════════════════════════════════════
resume_terms — HOW THE RESUME SAYS IT
═══════════════════════════════════════

Search the resume for the skill name AND every alias listed for it in
Job Requirements. Report the literal words you found.

  JD ".NET Core"        resume "ASP.NET Core 6"   -> ["ASP.NET Core 6"]
  JD "Registered Nurse" resume "RN, BSN"          -> ["RN"]
  JD "GAAP"             resume "US GAAP reporting"-> ["US GAAP"]
  JD "Kubernetes"       resume "EKS clusters"     -> ["EKS"]
  not mentioned anywhere                          -> []

Only report a term if it means the SAME skill. A term for a different,
merely adjacent skill does not count.

═══════════════════════════════════════
evidence — VERBATIM QUOTES ONLY
═══════════════════════════════════════

Every quote is checked programmatically against the resume text. A quote
that is not an exact substring is DISCARDED and counts against the candidate.

- Copy character for character. Do not paraphrase, summarise, tidy up,
  translate, fix typos, or join two separate lines into one.
- Minimum 12 characters.
- Never write a quote for a skill you did not find. An empty list is correct.
- Emit one entry per place the skill appears. If it is in both the skills
  inventory and a job bullet, report BOTH.

section — label honestly where you copied it from:
  work_experience  a bullet or line under a job at a named employer
  project          a line under a named project
  skills_list      a comma-separated skills / technologies / competencies inventory
  summary          the profile, objective or headline paragraph
  certification    the certifications or licences list
  education        the education block

A skill named only in a skills inventory is skills_list — even if you are
confident the candidate must have used it at work. Labelling it
work_experience to be generous corrupts the assessment.

═══════════════════════════════════════
NO INFERENCE, ANY DOMAIN
═══════════════════════════════════════

Report only what is written. Never reason about related, similar,
transferable or implied skills.

  Selenium is not Playwright.        Jira is not Azure DevOps.
  PostgreSQL is not MongoDB.         Pediatrics is not Neonatal ICU.
  IFRS is not US GAAP.               French is not Canadian French.
  Salesforce is not HubSpot.         Six Sigma is not Lean.

A responsibility that would normally require the skill is not evidence that
the candidate has the skill, unless the skill is named.

═══════════════════════════════════════
experience, education, certifications
═══════════════════════════════════════

- years: the candidate's total professional experience as a float. Preserve exact decimal values (e.g., 5.5 instead of rounding to 5 or 6). Prefer an explicit statement in the resume ("5.5 years of…") and quote it in years_quote. If no total is stated, sum the employment date ranges and set years_quote to null.
- leadership_quote: only a line showing they led, managed, supervised or
  mentored OTHER PEOPLE. Seniority in a job title is not leadership.
  Improving a process is not leadership. If there is no such line, null.
  Never write a sentence of your own here — quote the resume or write null.
- certifications: copy each one exactly as the resume writes it. Do not
  judge whether it satisfies the requirement.

═══════════════════════════════════════
BEFORE YOU RETURN
═══════════════════════════════════════

1. Does each tier have exactly as many objects as Job Requirements lists?
2. Is every quote an exact substring of the resume above?
3. Did you write any number other than experience years? Remove it.
4. Did you write any of the words matched, partial, not_found, verified,
   Met or Not Met? Remove them — those are not your decision.
"""

# ═══════════════════════════════════════════════════════════════════════════════
# LEGACY PROMPT (KEPT FOR BACKWARD COMPATIBILITY)
# ═══════════════════════════════════════════════════════════════════════════════

JD_FIT_PROMPT3 = """Perform a structured fit assessment. Return ONLY the JSON below — no other text.

**Job Description:**
{jd_text}

**Candidate Resume:**
{resume_text}

{{
  "request_id": "<uuid-v4>",
  "generated_at": "<ISO8601 timestamp>",
  "version": "fit_v7",

  "meta": {{
    "job_title":    "<job title>"extracted strictly from JD, no fabrication,
    "company":      "<company name> extracted from resume if present, else null",
    "candidate":    "<full name>",
    "evaluated_on": "<ISO8601 date>"
  }},

  "scorecard": {{
    "total_score": <0-100>,
    "tier": "Highly Recommended | Recommended | Recommended with Reservations | Not Recommended",
    "one_liner": "<single sentence verdict>",

  "skill_comparison": {{

    "mandatory": {{
      "tier_score": <0-100>,
      "tier_label": "Strong | Moderate | Weak",
      "matched": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<expert|advanced|intermediate|working|familiar>" }},
          "candidate_has": {{
            "years":      <float>,
            "proficiency": "<level>",
            "verified":   true,
            "proof": [
              {{
                "type":    "work_experience | project",
                "name":    "<company name or project name>",
                "role":    "<their role e.g. Backend Developer, Lead Engineer>",
                "context": "<one line — what they did with this skill>"
              }}
            ]
          }},
          "match_score":  <0.0-1.0>,
          "interview_q":  null
        }}
      ],
      "partial": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": {{
            "years":      <float>,
            "proficiency": "<level>",
            "verified":   <true|false>,
            "unverified_reason": "<null if verified | 'Only listed in skills section — no project or work experience proof'>",
            "proof": [
              {{
                "type":    "work_experience | project",
                "name":    "<company name or project name>",
                "role":    "<their role>",
                "context": "<one line — what they did with this skill>"
              }}
            ]
          }},
          "match_score":  <0.0-1.0>,
          "gap":          "<one line — what is short e.g. '1 yr short' or 'proficiency below expected' or 'skill unverified'>",
          "interview_q":  "<specific question naming this skill and what is short or unverified>"
        }}
      ],
      "not_found": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": null,
          "match_score":   0.0,
          "gap":           "No evidence found in any resume section",
          "interview_q":   "<question asking about any real-world exposure to this skill>"
        }}
      ]
    }},

    "preferred": {{
      "tier_score": <0-100>,
      "tier_label": "Strong | Moderate | Weak",
      "matched": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": {{
            "years":      <float>,
            "proficiency": "<level>",
            "verified":   true,
            "proof": [
              {{
                "type":    "work_experience | project",
                "name":    "<company name or project name>",
                "role":    "<their role>",
                "context": "<one line — what they did with this skill>"
              }}
            ]
          }},
          "match_score":  <0.0-1.0>,
          "interview_q":  null
        }}
      ],
      "partial": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": {{
            "years":      <float>,
            "proficiency": "<level>",
            "verified":   <true|false>,
            "unverified_reason": "<null if verified | 'Only listed in skills section — no project or work experience proof'>",
            "proof": [
              {{
                "type":    "work_experience | project",
                "name":    "<company name or project name>",
                "role":    "<their role>",
                "context": "<one line — what they did with this skill>"
              }}
            ]
          }},
          "match_score":  <0.0-1.0>,
          "gap":          "<one line — what is short or unverified>",
          "interview_q":  "<specific question naming this skill and what is short or unverified>"
        }}
      ],
      "not_found": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": null,
          "match_score":   0.0,
          "gap":           "No evidence found in any resume section",
          "interview_q":   "<question asking about any exposure>"
        }}
      ]
    }},

    "better_to_have": {{
      "tier_score": <0-100>,
      "tier_label": "Strong | Moderate | Weak",
      "matched": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": {{
            "years":      <float>,
            "proficiency": "<level>",
            "verified":   true,
            "proof": [
              {{
                "type":    "work_experience | project",
                "name":    "<company name or project name>",
                "role":    "<their role>",
                "context": "<one line — what they did with this skill>"
              }}
            ]
          }},
          "match_score":  <0.0-1.0>,
          "interview_q":  null
        }}
      ],
      "partial": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": {{
            "years":      <float>,
            "proficiency": "<level>",
            "verified":   <true|false>,
            "unverified_reason": "<null if verified | 'Only listed in skills section — no project or work experience proof'>",
            "proof": []
          }},
          "match_score":  <0.0-1.0>,
          "gap":          "<one line — what is short or unverified>",
          "interview_q":  null
        }}
      ],
      "not_found": [
        {{
          "skill":         "<skill name>",
          "jd_requires":   {{ "years": <float>, "proficiency": "<level>" }},
          "candidate_has": null,
          "match_score":   0.0,
          "gap":           "No evidence found in any resume section",
          "interview_q":   null
        }}
      ]
    }}

  }},

  "experience_comparison": {{
    "jd_requires":   {{ "years": <int>, "leadership": <true|false> }},
    "candidate_has": {{ "years": <float>, "leadership_evidence": "<one line or null>" }},
    "status":        "Met | Partial | Not Met",
    "score":         <0-100>
  }},

  "education_comparison": {{
    "jd_requires":   "<education requirement from JD>",
    "candidate_has": "<degree, field, institution, year>",
    "status":        "Met | Not Met",
    "score":         <0-100>
  }},

  "certification_comparison": {{
    "jd_requires":   ["<cert name>"],
    "candidate_has": ["<cert name — issuer (YYYY-MM)>"],
    "status":        "Met | Partial | Not Met",
    "score":         <0-100>
  }},

  "flags": [
    {{
      "severity": "critical | moderate | minor",
      "type":     "missing_skill | unverified_skill | experience_gap | certification_gap | other",
      "label":    "<5 words max>",
      "detail":   "<one sentence>"
    }}
  ],

  "ui_hints": {{
    "tier_thresholds":       {{ "highly_recommended": 85, "recommended": 70, "reservations": 50 }},
    "tier_label_thresholds": {{ "strong": 75, "moderate": 50 }},
    "status_colors":         {{ "Met": "green", "Partial": "amber", "Not Met": "red" }},
    "match_colors":          {{ "matched": "green", "partial": "amber", "not_found": "red" }},
    "verified_colors":       {{ "verified": "green", "unverified": "orange" }},
    "flag_colors":           {{ "critical": "red", "moderate": "amber", "minor": "blue" }},
    "skill_tier_order":      ["mandatory", "preferred", "better_to_have"],
    "within_tier_order":     ["matched", "partial", "not_found"],
    "sections_order": [
      "scorecard", "skill_comparison", "experience_comparison",
      "education_comparison", "certification_comparison", "flags"
    ]
  }}
}}

═══════════════════════════════════════
RULES
═══════════════════════════════════════

── PROOF-FIRST SKILL VALIDATION ────────
- A skill is ONLY considered verified if it appears in at least one of:
    • work_experience entry (job role, company, highlights)
    • project entry (project name, stack, outcomes)
- The skills section of a resume is NOT proof of working with a skill.
- Skills section is only used to identify year claims — never as standalone evidence.

── VERIFICATION STATES ─────────────────
- verified: true  → explicit proof found in work_experience or projects
- verified: false → skill only appears in skills section, no work/project proof found
  → move to partial bucket (not matched), set unverified_reason, add interview_q
- proof: []       → only when verified: false (no proof entries to list)

── SKILL BUCKET ASSIGNMENT ─────────────
- matched    → verified: true AND years_found >= years_expected
- partial    → ANY of: verified: false, OR years_found < years_expected,
                       OR proficiency below expected
- not_found  → skill not mentioned anywhere in resume → candidate_has: null

── PROOF OBJECT ────────────────────────
- type: "work_experience" → name = company name, role = job title held there
- type: "project"         → name = project name,  role = role in that project
- context: one line describing exactly what they did with this skill in that role
- List ALL proof entries found — one object per company or project where skill is evidenced
- proof: [] only when verified: false

── MATCH SCORE ─────────────────────────
- verified: true  → match_score = (years_found / years_expected) capped at 1.0
- verified: false → match_score = (years_claimed / years_expected) × 0.4 (penalty weight)
- not_found       → match_score = 0.0

── TIER SCORES ─────────────────────────
- tier_score = average match_score of all skills in that tier × 100
- tier_label : "Strong" ≥ 75 | "Moderate" ≥ 50 | "Weak" < 50

── TOTAL SCORE ─────────────────────────
- total_score = mandatory_score×0.40 + preferred_score×0.20 + bth_score×0.10
                + experience_score×0.15 + education_score×0.15

── INTERVIEW QUESTIONS ─────────────────
- mandatory partial/not_found   → always add interview_q
- preferred  partial/not_found  → always add interview_q
- better_to_have (any bucket)   → interview_q: null always
- matched + verified (any tier) → interview_q: null always
- Unverified skill question must ask for a specific project or role example
- Total questions: 4–6 max, prioritise mandatory critical gaps first

── FLAGS ────────────────────────────────
- mandatory not_found            → critical  / missing_skill
- mandatory partial + unverified → critical  / unverified_skill
- mandatory partial + years_short→ moderate  / missing_skill
- preferred not_found            → moderate  / missing_skill
- preferred partial + unverified → moderate  / unverified_skill
- experience Not Met             → moderate  / experience_gap
- missing required cert          → critical  / certification_gap
- better_to_have gaps            → no flag
- flags: [] if none. Never omit field.

── GENERAL ──────────────────────────────
- Extract JD fields exactly — do not fabricate any requirement.
- Job title in meta should be strictly extracted from JD.
- Only use evidence explicitly present in resume text — never infer or assume.
- All three tier objects must always be present even if buckets are empty arrays.
- Never treat a skill name appearing only in a skills list as proof of usage."""