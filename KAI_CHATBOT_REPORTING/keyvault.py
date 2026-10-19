from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
import traceback
import requests
import time
import atexit
import os 
 
keyVaultName = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
KVUri = f"https://{keyVaultName}.vault.azure.net"
 
TOKEN = os.environ.get('CUSTOMCONNSTR_ConfigManagerToken') 
CONF_URL =  os.environ.get('CUSTOMCONNSTR_ConfigManagerURL') 
 
 
def get_key(key_name):
    credential = DefaultAzureCredential()
    client = SecretClient(vault_url=KVUri, credential=credential)
    try:
        retrieved_secret = client.get_secret(name = key_name)
        return retrieved_secret.value
    except:
        return None
 
def getconfigvalues(app_name , ENV ):
    
    url = f"{CONF_URL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
    headers = {"Authorization": "Bearer "+TOKEN} 
    response = requests.get(url, headers=headers)
    config_values = response.json()
    return config_values
def getBotConfigValues(ENV):
    url = f"{CONF_URL}/{ENV}/chatBotConfig/findAllBotConfig"
    headers = {"Authorization": "Bearer "+TOKEN} 
    response = requests.get(url, headers=headers)
    bot_config_values = response.json()
    return bot_config_values
 
def setkeyvaultenv_variables(config_values):
    data = config_values.get('data')
    for d in data:
        if "APP_REG" in d.get('key'):
            value =  d.get("value")
            key = d.get('key').replace("APP_REG", "AZURE")
            os.environ[key] = value

 
 
def setenv_variables(config_values):
    data = config_values.get('data')
    for d in data:
        if "VAULTKEY" in d.get('key'):
            value =  get_key(d.get("value"))
            key = d.get('key').replace("_VAULTKEY", '')
            os.environ[key] = value
        else:
            key = d.get('key')
            value = d.get('value')
            os.environ[key] = value
 
def setallenv_variables(ENV):
    APPNAME = ["Conv_AI_Common", "Conv_AI_Conversation","Conv_AI_Config","Conv_AI_ContentMgmt","Conv_AI_ContentMgmt_MessageService"]
    for name in APPNAME:
        config_values = getconfigvalues(name, ENV)
        setkeyvaultenv_variables(config_values)
        setenv_variables(config_values)
    bot_config_value = getBotConfigValues(ENV)
    setenv_variables(bot_config_value)
 
