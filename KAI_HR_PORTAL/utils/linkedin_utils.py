def _normalize_title(value):
    if not isinstance(value, str):
        return ""
    normalized = "".join(ch.lower() if ch.isalnum() else " " for ch in value)
    return " ".join(normalized.split())

def post_process_linkedin_result(data):
    assessment = data.get("consistency_assessment", {})
    checks = assessment.get("checks", {})
    details = checks.get("employment", {}).get("details", [])

    for item in details:
        if not isinstance(item, dict):
            continue

        title_res = item.get("title_resume")
        title_li = item.get("title_linkedin")

        if _normalize_title(title_res) == _normalize_title(title_li):
            item["title_match"] = True
            item["title_linkedin"] = None

    return data