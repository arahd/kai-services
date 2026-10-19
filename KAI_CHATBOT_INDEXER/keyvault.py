from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
import traceback
from http_client import http_client
import os 
from logger import logger,get_caller_frame

keyVaultName = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
KVUri = f"https://{keyVaultName}.vault.azure.net"

SERVICE_NAME='KAI_AI_CHATBOT_INDEXER_SERVICE'
PROJECT_NAME='KAI'

TOKEN = os.environ.get('CUSTOMCONNSTR_ConfigManagerToken')
CONF_URL =  os.environ.get('CUSTOMCONNSTR_ConfigManagerURL') 


def get_key(key_name):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name': 'kumaran'
            }
    credential = DefaultAzureCredential()
    # client = AzureAppConfigurationClient(base_url=KVUri, credential=credential)
    client = SecretClient(vault_url=KVUri, credential=credential)
    try:
        retrieved_secret = client.get_secret(name = key_name)
        return retrieved_secret.value
    except:
        logger.exception(f'exception occured in keyvault get_key()',extra=extras)
        print(traceback.print_exc())
        return None

def getconfigvalues(app_name , ENV ):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name': 'kumaran'
            }
    url = f"{CONF_URL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
    headers = {"Authorization": "Bearer "+TOKEN} 
    
    response = http_client.get(url, headers=headers)
    logger.info(f'getconfigvalues response:{response.status_code},app_name:{app_name}',extra=extras)
    config_values = response.json()
    return config_values

def getBotConfigValues(ENV):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name': 'kumaran'
            }
    url = f"{CONF_URL}/{ENV}/chatBotConfig/findAllBotConfig"
    headers = {"Authorization": "Bearer "+TOKEN} 
    response = http_client.get(url, headers=headers)
    bot_config_values = response.json()
    logger.info(f'getBotConfigValues response:{response.status_code}',extra=extras)
    print(bot_config_values)
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
            print(d.get("value"))
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