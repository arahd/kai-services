from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
import requests
import os 
from logging_config.logger import logger,get_caller_frame

keyVaultName = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
# keyVaultName = "kumaranchatbotpoc"
KVUri = f"https://{keyVaultName}.vault.azure.net"

SERVICE_NAME='KAI_HR_PORTAL'
PROJECT_NAME='CHATBOT'

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
    logger.info(f"Retrieving secret from {keyVaultName}.", extra=extras)
    try:
        retrieved_secret = client.get_secret(name = key_name)
        return retrieved_secret.value
    except Exception:
        logger.exception(f'exception occured in keyvault get_key()',extra=extras)
        return None

def getconfigvalues(app_name , ENV ):
    extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name': 'kumaran'
            }
    url = f"{CONF_URL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
    #url =f"https://chatbotconfigservice.azurewebsites.net/chatBotConfig/getConfigurations/{ENV}/{app_name}"
    headers = {"Authorization": "Bearer "+TOKEN} 
    #headers = {"Authorization": os.getenv("KEYVAULT_TOKEN")} 
    
    response = requests.get(url, headers=headers)
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
    #url =f"http://localhost:5000/chatBotConfig/getConfigurations/{ENV}/chatBotConfig/findAllBotConfig"
    headers = {"Authorization": "Bearer "+TOKEN} 
    response = requests.get(url, headers=headers)
    bot_config_values = response.json()
    logger.info(f'getBotConfigValues response:{response.status_code}',extra=extras)
    # bot_config_values is returned and logged above if needed
    return bot_config_values

def setkeyvaultenv_variables(config_values):
    data = config_values.get('data')
    for d in data:
        if "APP_REG" in d.get('key'):
            value =  d.get("value")
            key = d.get('key').replace("APP_REG", "AZURE")
            # setting azure
            os.environ[key] = value
    # return sec


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
