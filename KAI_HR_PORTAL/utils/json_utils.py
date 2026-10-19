import json

def safe_json_parse(raw, client, model):
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 1)[1].rsplit("```", 1)[0]

    try:
        return json.loads(raw)
    except:
        fix_prompt = f"Fix JSON:\n{raw}"

        resp = client.chat.completions.create(
            model=model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": fix_prompt}],
        )

        return json.loads(resp.choices[0].message.content)