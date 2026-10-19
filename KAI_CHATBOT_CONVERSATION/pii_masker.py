import json
import os
import re
import requests
from http_client import http_client
from logger import time_sync_func,logger

from rapidfuzz import process
from rapidfuzz.distance import JaroWinkler



VALID_PII_LIST = ['SSN', 'SOCIAL SECURITY NUMBER', 'SOC SEC #', 'SOCIAL SECURITY ID', 'SSN ID', 'AADHAAR', 'AADHAAR CARD', 'UIDAI', 'AADHAR CARD', 'AADHAR NUMBER', 'PAN', 'PAN CARD', 'PERMANENT ACCOUNT NUMBER', 'PAN ID', 'INCOME TAX PAN', 'PASSPORT NUMBER', 'PASSPORT #', 'PPT NO', 'PASSPORT ID', 'TRAVEL DOCUMENT NUMBER', 'VOTER ID', 'EPIC CARD', 'ELECTORAL PHOTO ID CARD', 'VOTER CARD #', "DRIVER'S LICENSE", 'DL NUMBER', 'LICENSE #', 'DL NO', 'DRIVER LICENSE ID', 'TIN', 'TAXPAYER ID', 'TAX IDENTIFICATION NUMBER', 'TIN NUMBER', 'EIN', 'EMPLOYER IDENTIFICATION NUMBER', 'EIN #', 'FEDERAL TAX ID', 'GSTIN', 'GST NUMBER', 'GST REGISTRATION NO', 'GST IDENTIFICATION NUMBER', 'COMPANY TAX ID', 'CORP TAX ID', 'BUSINESS TAX REGISTRATION NO', 'COMPANY TAX REFERENCE', 'TAX RETURN NUMBER', 'TAX RETURN ACK', 'ITR FILING REF', 'TAX RETURN CONFIRMATION', 'ACCOUNT NUMBER', 'BANK ACCOUNT NO', 'ACCT NUM', 'BANK A/C', 'IBAN', 'SAVINGS ACCOUNT #', 'MICR CODE', 'MICR', 'MAGNETIC INK CHARACTER RECOGNITION CODE', 'SWIFT CODE', 'BIC CODE', 'SWIFT/BIC', 'BANK IDENTIFIER CODE', 'CREDIT CARD', 'CREDIT CARD NO', 'CC NUMBER', 'CARD #', 'VISA CARD', 'MASTERCARD', 'DEBIT CARD', 'DEBIT CARD NO', 'DC NUMBER', 'DEBIT CARD #', 'ATM CARD', 'CVV', 'CVC', 'CARD VERIFICATION VALUE', 'SECURITY CODE', 'CVV2', 'EXPIRY DATE', 'EXPIRY', 'CARD VALID UPTO', 'EXP', 'EXPIRATION DATE', 'UPI ID', 'UPI VPA', 'VIRTUAL PAYMENT ADDRESS', 'UPI ADDRESS', 'PAY-TO ADDRESS', 'LOAN NUMBER', 'LOAN ACCOUNT NO', 'MORTGAGE REF', 'LOAN ID', 'CREDIT REPORT NO', 'CREDIT SCORE REF', 'EQUIFAX REF #', 'EXPERIAN ID', 'POLICY NUMBER', 'INSURANCE POLICY #', 'POLICY NO', 'COVERAGE PLAN ID', 'PORTFOLIO ID', 'INVESTMENT PORTFOLIO', 'WEALTH ACCT NO', 'FOLIO NUMBER', 'DEMAT ACCOUNT', 'DEMAT ID', 'DEPOSITORY PARTICIPANT ID', 'DP ID / CLIENT ID', 'PENSION ID', 'PENSION ACCOUNT NO', 'PRAN', 'SUPERANNUATION ID', 'PF ACCOUNT NUMBER', 'EPF NUMBER', 'PROVIDENT FUND ID', 'UAN NUMBER', 'OTP', 'ONE-TIME PASSWORD', 'VERIFICATION CODE', 'AUTH CODE', 'SMS CODE', 'PASSWORD', 'ADMIN PASSWORD', 'ROOT PASSWORD', 'PASSKEY', 'LOGIN SECRET', 'PIN', 'PASSCODE', 'SECURITY PIN', 'ACCESS PIN', 'SECRET KEY', 'CLIENT SECRET', 'PRIVATE KEY', 'HMAC SECRET', 'ENCRYPTION KEY', 'API KEY', 'APPLICATION KEY', 'DEVELOPER TOKEN', 'API SECRET', 'ACCESS TOKEN', 'BEARER TOKEN', 'OAUTH TOKEN', 'GITHUB TOKEN', 'SLACK TOKEN', 'SESSION TOKEN', 'AUTH COOKIE', 'SESSION SECRET', 'USER TOKEN', 'MFA CODE', '2FA TOKEN', 'GOOGLE AUTH CODE', 'MFA TOKEN', 'DEVICE ID', 'SERIAL NUMBER', 'HARDWARE ID', 'DEVICE SERIAL', 'UUID', 'IMEI', 'IMEI NUMBER', 'MOBILE EQUIPMENT IDENTITY', 'IMSI', 'IMSI NUMBER', 'SUBSCRIBER IDENTITY', 'COOKIE ID', 'TRACKING COOKIE', 'SESSION COOKIE VALUE', 'SESSION ID', 'SESS ID', 'SESSION KEY', 'SID', 'EMPLOYEE ID', 'EMP ID', 'STAFF NUMBER', 'BADGE ID', 'WORKER ID', 'PAYROLL ID', 'PAYEE ID', 'SALARY ID', 'PAYROLL REFERENCE', 'WORK LOCATION', 'OFFICE ADDRESS', 'BASE LOCATION', 'ASSIGNED SITE', 'STUDENT ID', 'ENROLLMENT NO', 'ROLL NUMBER', 'STUDENT REGISTRATION ID', 'TRANSCRIPT ID', 'TRANSCRIPT NO', 'ACADEMIC RECORD REF', 'PATIENT ID', 'PATIENT REF', 'HOSP RECORD ID', 'ADMIT ID', 'MEDICAL RECORD NUMBER', 'MRN', 'HEALTH RECORD ID', 'CLINICAL ID', 'HEALTH INSURANCE ID', 'POLICYHOLDER ID', 'MEMBER ID', 'PROVIDER ID', 'PRESCRIPTION NUMBER', 'RX NO', 'RX NUMBER', 'SCRIPT ID', 'DISABILITY STATUS', 'SPECIAL ASSISTANCE REQ', 'MEDICAL CONDITION NOTE', 'VACCINE ID', 'IMMUNIZATION RECORD', 'VAX CODE', 'DOSE CERTIFICATE NO', 'COVID CERTIFICATE NO', 'EU DIGITAL COVID CERT', 'VACCINE PASS ID', 'ID NUMBER', 'GOVT ID', 'NATIONAL ID', 'REGISTRATION ID', 'MOBILE NUMBER', 'PHONE NUMBER', 'CELL NUMBER', 'CONTACT NO', 'CELLULAR', 'FAX NUMBER', 'FAX', 'FACSIMILE NO']
VALID_PII_SET = set(VALID_PII_LIST)


def PII_similarity_check(word, word_list, threshold=0.85): 
    # checks word then returns true/false , similarity score,most similar word in valid pii list
    word = word.upper().strip()
    if word in VALID_PII_SET:
        return (word, True, 1.0, word)

    result = process.extractOne(
        word, 
        word_list, 
        scorer=JaroWinkler.normalized_similarity
    )
    
    if result is None:
        return (word, False, 0.0, None)
    
    matched_word, score, _ = result
    is_above_threshold = score >= threshold
    
    return (word, is_above_threshold, score, matched_word)
 

def normalize_type(pii_type):
    #Also checks if PII is valid or not
    if not pii_type or not isinstance(pii_type, str):
        return None
    word, is_valid, score, matched_pii_word = PII_similarity_check(word=pii_type, word_list=VALID_PII_LIST, threshold=0.85)
    if is_valid:
        return word.replace(" ", "_")
    else:
        print(f"Removing PII for WORD :{word}, Similarity Score: {score} matched word: {matched_pii_word}")
        return None

def detect_pii(text: str):
    base_url = os.getenv("PII_SERVICE_URL")
    if not base_url:
        raise RuntimeError("Environment variable 'PII_SERVICE_URL' is not set.")
    url = f"{base_url.rstrip('/')}/detect_pii"
    payload = {"text": text}

    try:
        response = http_client.post(url, json=payload, timeout=120)
        response.raise_for_status()
        try:
            return response.json()
        except ValueError:
            return response.text
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"PII Service call failed: {e}") from e

def detect_pii_batch(texts: list) -> list:
    if not texts:
        return []
    base_url = os.getenv("PII_SERVICE_URL")
    if not base_url:
        raise RuntimeError("Environment variable 'PII_SERVICE_URL' is not set.")
    url = f"{base_url.rstrip('/')}/detect_pii_batch"
    payload = {"texts": texts}

    try:
        response = http_client.post(url, json=payload, timeout=120)
        response.raise_for_status()
        try:
            return response.json()
        except ValueError:
            return response.text
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"PII Service batch call failed: {e}") from e


def chunk_text_with_overlap(text: str, chunk_size: int = 2048, overlap_size: int = 128) -> list:
    if not text:
        return []

    if len(text) <= chunk_size:
        return [text]

    overlap_size = min(overlap_size, chunk_size // 2)
    chunks = []
    start = 0
    n = len(text)

    delimiters = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]

    while start < n:
        if start + chunk_size >= n:
            chunks.append(text[start:])
            break

        end = start + chunk_size

        split_pos = -1
        for delim in delimiters:
            pos = text.rfind(delim, start + chunk_size // 2, end)
            if pos != -1:
                split_pos = pos + len(delim)
                break

        if split_pos == -1 or split_pos <= start:
            split_pos = end

        chunks.append(text[start:split_pos])

        target_next = max(start + 1, split_pos - overlap_size)

        if target_next >= n:
            break

        next_split = -1
        for delim in delimiters:
            pos = text.find(delim, target_next, min(n, target_next + overlap_size))
            if pos != -1:
                next_split = pos + len(delim)
                break

        if next_split != -1 and next_split < split_pos:
            start = next_split
        else:
            start = target_next

    return chunks

@time_sync_func('mask_pii')
def mask_pii(text, chunk_size=2048, overlap_size=128, prefix=""):
    try:
        chunks = chunk_text_with_overlap(text, chunk_size=chunk_size, overlap_size=overlap_size)
    except Exception as e:
        print(f"Warning: Failed to chunk text ({e}). Passing without masking.")
        return text, {}, {}

    if not chunks:
        return text, {}, {}

    all_pii = []
    try:
        if len(chunks) == 1:
            raw_output = detect_pii(chunks[0])
            if isinstance(raw_output, str):
                try:
                    raw_output = json.loads(raw_output)
                except json.JSONDecodeError:
                    raw_output = {}

            if isinstance(raw_output, dict):
                if "result" in raw_output:
                    res_val = raw_output["result"]
                    if isinstance(res_val, str):
                        try:
                            res_val = json.loads(res_val)
                        except json.JSONDecodeError:
                            res_val = {}
                    if isinstance(res_val, dict):
                        raw_output = res_val
                elif "results" in raw_output:
                    res_val = raw_output["results"]
                    if isinstance(res_val, str):
                        try:
                            res_val = json.loads(res_val)
                        except json.JSONDecodeError:
                            res_val = {}
                    if isinstance(res_val, dict):
                        raw_output = res_val

                chunk_pii = [
                    {"type": key, "value": str(value).strip()}
                    for key, value in raw_output.items()
                    if key and value and isinstance(key, str)
                ]
                all_pii.extend(chunk_pii)

        else:
            batch_output = detect_pii_batch(chunks)
            if isinstance(batch_output, str):
                try:
                    batch_output = json.loads(batch_output)
                except json.JSONDecodeError:
                    batch_output = []

            if isinstance(batch_output, dict):
                batch_output = batch_output.get("result", batch_output.get("results", [batch_output]))

            if not isinstance(batch_output, list):
                batch_output = [batch_output]

            for pii_output in batch_output:
                if isinstance(pii_output, str):
                    try:
                        pii_output = json.loads(pii_output)
                    except json.JSONDecodeError:
                        continue

                if isinstance(pii_output, dict):
                    if "result" in pii_output:
                        res_val = pii_output["result"]
                        if isinstance(res_val, str):
                            try:
                                res_val = json.loads(res_val)
                            except json.JSONDecodeError:
                                res_val = {}
                        if isinstance(res_val, dict):
                            pii_output = res_val
                    elif "results" in pii_output:
                        res_val = pii_output["results"]
                        if isinstance(res_val, str):
                            try:
                                res_val = json.loads(res_val)
                            except json.JSONDecodeError:
                                res_val = {}
                        if isinstance(res_val, dict):
                            pii_output = res_val

                    chunk_pii = [
                        {"type": key, "value": str(value).strip()}
                        for key, value in pii_output.items()
                        if key and value and isinstance(key, str)
                    ]
                    all_pii.extend(chunk_pii)
                elif isinstance(pii_output, list):
                    for item in pii_output:
                        if isinstance(item, dict):
                            ptype = item.get("type") or item.get("key")
                            pval = item.get("value")
                            if ptype and pval:
                                all_pii.append({"type": str(ptype), "value": str(pval).strip()})

    except Exception as e:
        print(f"Warning: Failed processing text batch: {e}")

    if not all_pii:
        return text, {}, {}
    try:
        seen_values = set()
        deduped_pii = []
        for item in all_pii:
            val = item["value"]
            if val not in seen_values:
                seen_values.add(val)
                deduped_pii.append(item)

        mapping = {}
        masked_text = text
        counter = {}
        deduped_pii = sorted(deduped_pii, key=lambda x: len(x["value"]), reverse=True)

        for item in deduped_pii:
            pii_type = normalize_type(item["type"])

            if not pii_type:
                continue

            value = item["value"]

            if pii_type not in counter:
                counter[pii_type] = 1
            else:
                counter[pii_type] += 1
            
            if prefix:
                placeholder = f"__PII_{prefix}_{pii_type}_{counter[pii_type]}__"
            else:
                placeholder = f"__PII_{pii_type}_{counter[pii_type]}__"
            pattern = re.escape(value)
            masked_text = re.sub(pattern, placeholder, masked_text)
            mapping[placeholder] = value

        return masked_text, mapping, counter

    except Exception as e:
        print(f"Warning: Unexpected error during parsing logic ({e}). Continuing without masking.")
        return text, {}, {}

@time_sync_func('unmask_pii')
def unmask_pii(text, mapping):
    if not mapping:
        return text
    for placeholder, value in mapping.items():
        text = text.replace(placeholder, str(value))
    return text


