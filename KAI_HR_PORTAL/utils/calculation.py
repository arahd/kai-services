def count_of_each_category(category_data):
    matched_count = len(category_data.get("matched", []))
    partial_count = len(category_data.get("partial", []))
    not_found_count = len(category_data.get("not_found", []))
    total = matched_count + partial_count + not_found_count
    score = ((matched_count * 1 + partial_count * 0.75) / total)*100 if total > 0 else 0
    return score


def skill_calculation(data, skill_score_tier):
    """Score only tiers that have JD skills; redistribute empty-tier weight."""
    categories = ["mandatory", "preferred", "better_to_have"]
    total_skill_weight = sum(skill_score_tier.get(c, 0) for c in categories)

    active = {}
    data_of_each_category = {}
    for category in categories:
        category_data = data.get(category, {}) or {}
        skill_count = (len(category_data.get("matched", []))
                       + len(category_data.get("partial", []))
                       + len(category_data.get("not_found", [])))
        if skill_score_tier.get(category, 0) and skill_count > 0:
            active[category] = skill_score_tier[category]
            data_of_each_category[category] = count_of_each_category(category_data)

    # Fixed weights: 40 / 20 / 10 always, no redistribution. A tier the JD
    # does not mention scores 0 and still costs its full weight.
    effective_weights = {c: float(skill_score_tier.get(c, 0)) for c in categories}
    overall_score = 0
    for category in categories:
        weight = skill_score_tier.get(category, 0)
        if not weight:
            continue
        overall_score += (weight / 100) * data_of_each_category.get(category, 0)

    return overall_score, data_of_each_category, effective_weights

def experience_calculation(exp_data, experience_score_tier):
    allocated_score = experience_score_tier.get("Experience", 0)
    score = 0
    if allocated_score:
        if (exp_data.get("candidate_has", {}).get("status","")=='Met'):
            score = (allocated_score*1)
            return score
        elif(exp_data.get("candidate_has", {}).get("status","")=='Partial'):
            score = (allocated_score*0.50)
            return score
    return score

def education_calculation(edu_data, cert_data, education_score_tier):
    allocated_score = education_score_tier.get("Education & Certs", 0)
    score = 0
    if allocated_score:
        if (edu_data.get("status","")=='Met' and cert_data.get("status","")=='Met'):
            score = (allocated_score*1)
            return score
        elif(edu_data.get("status","")=='Met' or cert_data.get("status","")=='Met'):
            score = (allocated_score*0.75)
        elif(cert_data.get("status","")=='Partial'):
            score = (allocated_score*0.50)
            return score
    return score

def _normalize_optional_requirements(parsed):
    """JD asks for no certs / no degree -> that requirement is satisfied,
    instead of letting the LLM coin-flip Met vs Not Met (15 point swing)."""
    cert = parsed.get("certification_comparison") or {}
    if not [c for c in (cert.get("jd_requires") or [])
            if str(c).strip().lower() not in ("", "null", "none")]:
        cert["status"] = "Met"
        parsed["certification_comparison"] = cert

    edu = parsed.get("education_comparison") or {}
    if str(edu.get("jd_requires") or "").strip().lower() in ("", "null", "none"):
        edu["status"] = "Met"
    elif "status" not in edu:
        # Compare attainment LEVEL, not mere presence of a degree line.
        ranks = [(("phd", "ph.d", "doctorate", "doctoral", "d.phil"), 4),
                 (("master", "m.tech", "m.sc", "msc", "mca", "m.e.", "mba",
                   "post graduate", "postgraduate"), 3),
                 (("bachelor", "b.tech", "b.e.", "b.sc", "bsc", "bca", "b.com",
                   "undergraduate", "degree"), 2),
                 (("diploma", "associate"), 1)]

        def _levels(text):
            low = str(text or "").lower()
            return [r for kws, r in ranks if any(k in low for k in kws)]

        # "Master's or PhD" -> the MINIMUM acceptable level is Master's.
        need = min(_levels(edu.get("jd_requires")) or [0])
        have = max(_levels(edu.get("candidate_has")) or [0])
        edu["status"] = "Met" if have >= need else "Not Met"
    parsed["education_comparison"] = edu

    # Cert status by name containment, not by LLM judgement:
    # "ISTQB Advanced Test Manager" satisfies a requirement of "ISTQB".
    if cert.get("status") != "Met":
        need = [str(c).lower() for c in (cert.get("jd_requires") or []) if str(c).strip()]
        have = " ".join(str(c).lower() for c in (cert.get("certifications")
                                                 or cert.get("candidate_has") or []))
        if need:
            got = sum(1 for n in need if n in have)
            cert["status"] = "Met" if got == len(need) else ("Partial" if got else "Not Met")

    # The PDF renders a numeric `score` on each block. The matching prompt no
    # longer emits one, so every row was showing 0% even when status was Met.
    _pts = {"Met": 100, "Partial": 50, "Not Met": 0}
    edu["score"] = _pts.get(edu.get("status"), 0)
    cert["score"] = _pts.get(cert.get("status"), 0)
    parsed["education_comparison"] = edu
    parsed["certification_comparison"] = cert


def calculate_scores_and_tier(parsed):
    overall_score = 0
    experience_score = 0
    education_score = 0
    details = {}
    skill_score_tier = {"mandatory": 40, "preferred": 20, "better_to_have": 10}
    experience_score_tier = {"Experience": 15}
    education_score_tier = {"Education & Certs": 15}
    effective_weights = {"mandatory": 0.0, "preferred": 0.0, "better_to_have": 0.0}
    _normalize_optional_requirements(parsed)
    if parsed.get("skill_comparison", {}):
        skill_score, details, effective_weights = skill_calculation(
            parsed.get("skill_comparison", {}), skill_score_tier)
        overall_score += skill_score
    if parsed.get("experience_comparison", {}):
        experience_score = experience_calculation(parsed.get("experience_comparison", {}), experience_score_tier)
        overall_score += experience_score
        # Scoring reads candidate_has.status; the report reads the top level.
        # Mirror both so a candidate who Met it stops rendering as "—" and 0%.
        _exp = parsed["experience_comparison"]
        _ch = _exp.get("candidate_has") or {}
        _exp["status"] = _ch.get("status", "Not Met")
        _exp["score"] = _ch.get("score", {"Met": 100, "Partial": 50}.get(_exp["status"], 0))
    if parsed.get("education_comparison", {}) or parsed.get("certification_comparison",{}):
        education_score = education_calculation(parsed.get("education_comparison", {}), parsed.get("certification_comparison",{}), education_score_tier)
        overall_score += education_score

    tier = ""
    if overall_score >= 90:
        tier = "Highly Recommended"
    elif overall_score >= 80 and overall_score < 90:
        tier = "Recommended"
    elif overall_score >= 60 and overall_score < 80:
        tier = "Recommended with Reservations"
    else:
        tier = "Not Recommended"
    
    # Initialize scorecard if it doesn't exist
    if "scorecard" not in parsed:
        parsed["scorecard"] = {}
    
    # Round to nearest integer (66.5 becomes 67)
    parsed["scorecard"]["total_score"] = f"{round(overall_score)}%"
    parsed["scorecard"]["tier"] = tier

    mandatory_score = details.get("mandatory", 0)
    preferred_score = details.get("preferred", 0)
    better_to_have_score = details.get("better_to_have", 0)

    # Round to nearest integer and format as percentage string
    exp_weight = experience_score_tier.get("Experience", 0)
    edu_weight = education_score_tier.get("Education & Certs", 0)
    exp_pct = (experience_score / exp_weight * 100) if exp_weight else 0
    edu_pct = (education_score / edu_weight * 100) if edu_weight else 0

    parsed["scorecard"]["breakdown"] = [
        { "label": "Mandatory Skills",  "weight": f"{round(effective_weights.get('mandatory', 0))}%",      "score": f"{round(mandatory_score)}%" },
        { "label": "Preferred Skills",  "weight": f"{round(effective_weights.get('preferred', 0))}%",      "score": f"{round(preferred_score)}%" },
        { "label": "Better to Have",    "weight": f"{round(effective_weights.get('better_to_have', 0))}%", "score": f"{round(better_to_have_score)}%" },
        { "label": "Experience",        "weight": f"{exp_weight}%", "score": f"{round(exp_pct)}%" },
        { "label": "Education & Certs", "weight": f"{edu_weight}%", "score": f"{round(edu_pct)}%" }
    ]

    categories = ["mandatory", "preferred", "better_to_have"]
    skill_categories = [mandatory_score, preferred_score, better_to_have_score]

    for category, skill_category in zip(categories, skill_categories):
        if skill_category:
            # Format tier_score as percentage string
            parsed["skill_comparison"][category]["tier_score"] = f"{round(skill_category)}%"
            if skill_category >= 75:
                parsed["skill_comparison"][category]["tier_label"] = "Strong"
            elif skill_category >= 50 and skill_category < 75:
                parsed["skill_comparison"][category]["tier_label"] = "Moderate"
            else:
                parsed["skill_comparison"][category]["tier_label"] = "Weak"
    
    # Initialize once
    Deduction_score_details = {"skill_comparison": {}, "experience_comparison": {}, "Education & Certs": {}}
    
    # Populate skill_comparison
    for category in categories:
        #Check if category has allocated weight before calculating deductions
        if skill_score_tier.get(category, 0):
            matched_count = len(parsed.get("skill_comparison", {}).get(category, {}).get("matched", []))
            partial_count = len(parsed.get("skill_comparison", {}).get(category, {}).get("partial", []))
            not_found_count = len(parsed.get("skill_comparison", {}).get(category, {}).get("not_found", []))
            total_count = matched_count + partial_count + not_found_count
            
            # Check if category has no skills defined in JD but has allocated weight
            if total_count == 0 and skill_score_tier.get(category, 0) > 0:
                Deduction_score_details["skill_comparison"][category] = {
                    "no_skills_defined": {
                        "message": "No skills defined in JD for this category",
                        "Overall_deduction_score_from_Total_score": f"{skill_score_tier.get(category, 0)}%"
                    }
                }
                continue
            
            # Initialize category if either partial or not_found exists
            if partial_count > 0 or not_found_count > 0:
                Deduction_score_details["skill_comparison"][category] = {}
            
            # Add partial deductions
            if partial_count > 0:
                partial_list = [item.get("skill", "") for item in parsed["skill_comparison"][category]["partial"]]
                ded_score = ((partial_count * 0.25) / total_count) * 100
                overall_ded_score = (skill_score_tier.get(category, 0) / 100) * ded_score
                Deduction_score_details["skill_comparison"][category]["partial"] = {
                    "skills": partial_list,
                    "partial_count": partial_count,
                    f"Deduction_score_for_{category}": f"{round(ded_score)}%",
                    f"Overall_deduction_score_from_Total_score": f"{round(overall_ded_score)}%"
                }
            
            # Add not_found deductions
            if not_found_count > 0:
                not_found_list = [item.get("skill", "") for item in parsed["skill_comparison"][category]["not_found"]]
                ded_score = ((not_found_count * 1) / total_count) * 100
                overall_ded_score = (skill_score_tier.get(category, 0) / 100) * ded_score
                Deduction_score_details["skill_comparison"][category]["not_found"] = {
                    "skills": not_found_list,
                    "not_found_count": not_found_count,
                    f"Deduction_score_for_{category}": f"{round(ded_score)}%",
                    f"Overall_deduction_score_from_Total_score": f"{round(overall_ded_score)}%"
                }

    # Check if experience has allocated weight before calculating deductions
    if experience_score_tier.get("Experience", 0):
        # Populate experience_comparison
        if parsed.get("experience_comparison", {}).get("candidate_has", {}).get("status","") == "Partial":
            deducted_exp_score = experience_score_tier.get('Experience', 0) - experience_score
            Deduction_score_details["experience_comparison"]["Deduction_score_for_Experience"] = "50%"
            Deduction_score_details["experience_comparison"]["Overall_deduction_score_from_Total_score"] = f"{round(deducted_exp_score)}%"
        elif parsed.get("experience_comparison", {}).get("candidate_has", {}).get("status","") == "Not Met":
            Deduction_score_details["experience_comparison"]["Deduction_score_for_Experience"] = "100%"
            Deduction_score_details["experience_comparison"]["Overall_deduction_score_from_Total_score"] = f"{round(experience_score_tier.get('Experience', 0))}%"
        
    
    # Check if Education & Certs has allocated weight before calculating deductions
    if education_score_tier.get("Education & Certs", 0):    
        # Populate Education & Certs
        if (parsed.get("education_comparison", {}).get("status","") == "Not Met" and parsed.get("certification_comparison", {}).get("status","") == "Not Met"):
            Deduction_score_details["Education & Certs"]["Deduction_score_for_Education_&_Certs"] = "100%"
            Deduction_score_details["Education & Certs"]["Overall_deduction_score_from_Total_score"] = f"{round(education_score_tier.get('Education & Certs', 0))}%"
        elif (parsed.get("education_comparison", {}).get("status","") == "Not Met" or parsed.get("certification_comparison", {}).get("status","") == "Not Met"):
            deducted_edu_score = education_score_tier.get('Education & Certs', 0) - education_score
            Deduction_score_details["Education & Certs"]["Deduction_score_for_Education_&_Certs"] = "25%"
            Deduction_score_details["Education & Certs"]["Overall_deduction_score_from_Total_score"] = f"{round(deducted_edu_score)}%"
        elif (parsed.get("certification_comparison", {}).get("status","") == "Partial"):
            deducted_edu_score = education_score_tier.get('Education & Certs', 0) - education_score
            Deduction_score_details["Education & Certs"]["Deduction_score_for_Education_&_Certs"] = "50%"
            Deduction_score_details["Education & Certs"]["Overall_deduction_score_from_Total_score"] = f"{round(deducted_edu_score)}%"
        
    parsed["Deduction_score_details"] = Deduction_score_details
