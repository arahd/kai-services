from azure.keyvault.secrets import SecretClient
from azure.identity import ClientSecretCredential
import traceback
import requests
import os
from logger import logger,SERVICE_NAME,PROJECT_NAME,get_caller_frame,extras

keyVaultName = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
KVUri = f"https://{keyVaultName}.vault.azure.net"

TOKEN = os.environ.get('CUSTOMCONNSTR_ConfigManagerToken') 
CONF_URL =  os.environ.get('CUSTOMCONNSTR_ConfigManagerURL')

def get_key(key_name):
    AZURE_TENANT_ID = os.getenv('AZURE_TENANT_ID')
    AZURE_CLIENT_ID = os.getenv('AZURE_CLIENT_ID')
    AZURE_CLIENT_SECRET = os.getenv('AZURE_CLIENT_SECRET')
    credential = ClientSecretCredential(client_id=AZURE_CLIENT_ID,tenant_id=AZURE_TENANT_ID,client_secret=AZURE_CLIENT_SECRET)
    client = SecretClient(vault_url=KVUri, credential=credential)
    try:
        retrieved_secret = client.get_secret(name = key_name)
        return retrieved_secret.value
    except:
        print(traceback.print_exc())
        return None

def getconfigvalues(app_name , ENV ):
    extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'trialbot'
        }
    print(f'inside getconfigvalues for app_name:{app_name}')
    url = f"{CONF_URL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
    headers = {"Authorization": f"Bearer {TOKEN}"}
    logger.info(f'config_url:{url},headers:{headers}',extra=extras)
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    logger.info(f'response for config service:{response.status_code}',extra=extras)
    config_values = response.json()
    return config_values


def setkeyvaultenv_variables(config_values):
    data = config_values.get('data')
    for d in data:
        if "APP_REG" in d.get('key'):
            value =  d.get("value")
            key = d.get('key').replace("APP_REG", "AZURE")
            os.environ[key] = value

def setenv_variables(config_values):
    print(f'inside setenv_variables')
    data = config_values.get('data')
    for d in data:
        if "VAULTKEY" in d.get('key'):
            print(d.get("value"))
            value =  get_key(d.get("value"))
            key = d.get('key').replace("_VAULTKEY", '')
            os.environ[key] = value
        else:
            key = d.get('key')
            value = d.get('value')
            os.environ[key] = value

def setallenv_variables(ENV):
    APPNAME = ["Conv_AI_Common", "Conv_AI_Conversation","Conv_AI_Config"]
    # return True
    for name in APPNAME:
        config_values = getconfigvalues(name, ENV)
        setkeyvaultenv_variables(config_values)
        setenv_variables(config_values)