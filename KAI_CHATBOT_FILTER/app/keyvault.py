import os
from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
import traceback
import requests
import json
import time 
# from app.applogging import logger
from app.logger import logger,get_caller_frame,extras,SERVICE_NAME,PROJECT_NAME


def get_key(key_name):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        logger.info("Retrieving KeyVault credentials and secrets.",extra=extras)
        credential = DefaultAzureCredential()
        # client = AzureAppConfigurationClient(base_url=KVUri, credential=credential)
        client = SecretClient(vault_url=os.environ.get("KEYVAULT_ENDPOINT"), credential=credential)
        print(f"Retrieving your secret from keyVaultName.")
        # print(key_name)
        try:
            logger.info ('Retrieving secret from KeyVault.',extra=extras)
            retrieved_secret = client.get_secret(name = key_name)
            # print("================================",retrieved_secret.value)
            logger.info('Secrets from KeyVault retrieved successfully.',extra=extras)
            return retrieved_secret.value
        except Exception:
            print(traceback.print_exc())
            logger.exception('Error in retrieving secrets from KeyVault.',extra=extras)    
            return None
    except Exception:
        logger.info("Error in Retrieving KeyVault credentials and secrets.",extra=extras)

def getconfigvalues(app_name , ENV,ConfigManagerURL,ConfigManagerToken):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        logger.info("Fetching config values from Config Manager.",extra=extras)
        url = f"{ConfigManagerURL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
        headers = {"Authorization": f"Bearer {ConfigManagerToken}"} 
        
        response = requests.get(url, headers=headers)
        # print("Status Code", response.status_code)
        config_values = response.json()
        # print(config_values)
        logger.info("Config values from Config Manager fetched successfully.",extra=extras)
        return config_values
    except Exception:
        logger.exception("Error in Fetching config values from Config Manager.",extra=extras)

def setkeyvaultenv_variables(config_values):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        data = config_values.get('data')
        for d in data:
            if "APP_REG" in d.get('key'):
                value =  d.get("value")
                key = d.get('key').replace("APP_REG", "AZURE")
                # print('setting azure')
                # print(key, value)
                os.environ[key] = value
                logger.info("Environment variables from Azure app set successfully.",extra=extras)
            elif d.get('key') == "KEYVAULT_ENDPOINT" :
                value =  d.get("value")
                key = d.get('key')
                # print('setting azure')
                # print(key, value)
                os.environ[key] = value
                logger.info("Environment variables from KeyVault set successfully.",extra=extras)
    except Exception:
        logger.exception("Error in setting KeyVault environment variables.",extra=extras)


def setenv_variables(config_values):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        data = config_values.get('data')
        for d in data:
            if "VAULTKEY" in d.get('key'):
                # print(d.get("value"))
                value =  get_key(d.get("value"))
                key = d.get('key').replace("_VAULTKEY", '')
                os.environ[key] = value
            else:
                key = d.get('key')
                value = d.get('value')
                os.environ[key] = value
        logger.info("Environment Variables set successfully.",extra=extras)
    except Exception:
        logger.exception("Error in setting environment variables.",extra=extras)

def getBotConfigValues(ENV,ConfigManagerURL,ConfigManagerToken):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    url = f"{ConfigManagerURL}{ENV}/chatBotConfig/findAllBotConfig"
    #url =f"http://localhost:5000/chatBotConfig/getConfigurations/{ENV}/chatBotConfig/findAllBotConfig"
    headers = {"Authorization": "Bearer "+ConfigManagerToken} 
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        # print("Status Code", response.status_code)
        bot_config_values = response.json()
        return bot_config_values
    else:
        logger.error(f'sensitivesearch: error in getBotconfigValues response:{response}',extra=extras)
        return None
    # print(bot_config_values)

def setallenv_variables(ENV,ConfigManagerURL,ConfigManagerToken):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        APPNAME = ["Conv_AI_Common", "Conv_AI_Conversation","Conv_AI_ContentMgmt","Conv_AI_ContentMgmt_MessageService","Conv_AI_Filter","Conv_AI_Indexer"]
        # while True:
        for name in APPNAME:
            logger.info(f"Setting environment variables of:{name}",extra=extras)
            config_values = getconfigvalues(name, ENV ,ConfigManagerURL,ConfigManagerToken)
            setkeyvaultenv_variables(config_values)
            setenv_variables(config_values)
        bot_config_value = getBotConfigValues(ENV,ConfigManagerURL,ConfigManagerToken)
        if bot_config_value:
            setenv_variables(bot_config_value)
        logger.info('All Environment variables for services set successfully.',extra=extras)
            # time.sleep(300)
    except Exception:
        logger.exception("Error in setting environment variables for services.",extra=extras)
 