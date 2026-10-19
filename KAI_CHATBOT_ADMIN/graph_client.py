from flask import jsonify, make_response
import msal
import requests
import os
from logger import logger,extras

TENANT_ID = os.getenv('AZURE_TENANT_ID')
CLIENT_ID = os.getenv('AZURE_CLIENT_ID')
CLIENT_SECRET = os.getenv('AZURE_CLIENT_SECRET')


AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPE = ["https://graph.microsoft.com/.default"]
GRAPH_URL = "https://graph.microsoft.com/v1.0"

def get_access_token():
    logger.info("Fetching Graph token...", extra=extras)

    try:
        app = msal.ConfidentialClientApplication(
            CLIENT_ID,
            authority=AUTHORITY,
            client_credential=CLIENT_SECRET
        )

        result = app.acquire_token_silent(SCOPE, account=None)

        if not result:
            logger.info("Token not found in cache, calling acquire_token_for_client", extra=extras)
            result = app.acquire_token_for_client(scopes=SCOPE)

        if "access_token" not in result:
            logger.error(f"Failed to get token: {result}", extra=extras)
            raise Exception("Unable to get token")

        logger.info("Graph token fetched successfully", extra=extras)
        return result["access_token"]

    except Exception as e:
        logger.exception(f"Token fetch error: {str(e)}", extra=extras)
        raise


def get_object_id_from_email(email, access_token, extras):
    logger.info(f"Fetching object ID for {email}", extra=extras)

    url = f"https://graph.microsoft.com/v1.0/users?$filter=mail eq '{email}'"
    headers = {"Authorization": f"Bearer {access_token}"}

    res = requests.get(url, headers=headers)

    if res.status_code != 200:
        raise Exception(f"Graph error: {res.text}")

    data = res.json().get("value", [])

    if not data:
        raise Exception(f"User not found for {email}")

    oid = data[0]["id"]
    logger.info(f"Resolved {email} -> {oid}", extra=extras)
    return oid



def add_member_to_group(group_id, object_id, access_token, extras):
    logger.info(f"Adding {object_id} to group {group_id}", extra=extras)

    url = f"https://graph.microsoft.com/v1.0/groups/{group_id}/members/$ref"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "@odata.id": f"https://graph.microsoft.com/v1.0/directoryObjects/{object_id}"
    }

    res = requests.post(url, json=payload, headers=headers)

    # 204 = success
    if res.status_code not in [200, 201, 204]:
        raise Exception(f"Failed to add user to group: {res.text}")
    logger.info(f"SUCCESS: Added {object_id} to group", extra=extras)



def add_to_user_group(azure_group_id, email):
    logger.info(
        f"[add_to_user_group] Adding {email} to Azure AD group {azure_group_id}",
        extra=extras
    )

    # === Get Access Token ===
    token_url = f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token"
    token_data = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "scope": "https://graph.microsoft.com/.default"
    }

    token_res = requests.post(token_url, data=token_data)
    token_res.raise_for_status()
    access_token = token_res.json()["access_token"]

    try:
        # Resolve Graph Object ID
        oid = get_object_id_from_email(email, access_token, extras)

        # Add to the Azure AD security group
        add_member_to_group(azure_group_id, oid, access_token, extras)

        logger.info(f"[add_to_user_group] SUCCESS for {email}", extra=extras)

        return {
            "email": email,
            "status": "added",
            "objectId": oid
        }

    except Exception as e:
        logger.error(f"[add_to_user_group] ERROR for {email}: {str(e)}", extra=extras)
        return {
            "email": email,
            "azure_group_id": azure_group_id,
            "status": "error",
            "error": str(e)
        }
