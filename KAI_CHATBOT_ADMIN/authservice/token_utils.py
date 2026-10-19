import os
from jose import jwt
import requests, os
from datetime import datetime, timedelta

def verify_id_token(token):
    tenant_id = os.getenv("CUSTOMCONNSTR_AZURE_TENANT_ID")
    client_id = os.getenv("CUSTOMCONNSTR_AZURE_CLIENT_ID")
    config_url = f"https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration"
    config = requests.get(config_url).json()
    keys = requests.get(config['jwks_uri']).json()['keys']

    for key in keys:
        try:
            return jwt.decode(
                token,
                key,
                algorithms=['RS256'],
                audience=client_id,
                issuer=f"https://login.microsoftonline.com/{tenant_id}/v2.0"
            )
        except jwt.JWTError:
            continue
    raise Exception("Invalid id_token")

def generate_app_token(user_id):
    payload = {
        'user': user_id,
        'roles': ['user'],
        'exp': datetime.utcnow() + timedelta(hours=1)
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET"), algorithm='HS256')


if __name__ == "__main__":
    result = verify_id_token(os.getenv("KEYVAULT_TOKEN"))

    print(result)