from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential,ClientSecretCredential
import traceback
import requests
import time
import atexit
import os 
from apscheduler.schedulers.background import BackgroundScheduler

keyVaultName = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
KVUri = f"https://{keyVaultName}.vault.azure.net"

TOKEN = os.environ.get('CUSTOMCONNSTR_ConfigManagerToken') 
CONF_URL =  os.environ.get('CUSTOMCONNSTR_ConfigManagerURL') 


def get_key(key_name):
    AZURE_TENANT_ID = os.getenv('AZURE_TENANT_ID')
    AZURE_CLIENT_ID = os.getenv('AZURE_CLIENT_ID')
    AZURE_CLIENT_SECRET = os.getenv('AZURE_CLIENT_SECRET')
    print(f'conf_url:{CONF_URL},AZURE_TENANT_ID:{AZURE_TENANT_ID},AZURE_CLIENT_ID:{AZURE_CLIENT_ID},AZURE_CLIENT_SECRET:{AZURE_CLIENT_SECRET}')
    print(f'inside get_key for key:{key_name}')
    credential = ClientSecretCredential(client_id=AZURE_CLIENT_ID,tenant_id=AZURE_TENANT_ID,client_secret=AZURE_CLIENT_SECRET)
    # client = AzureAppConfigurationClient(base_url=KVUri, credential=credential)
    client = SecretClient(vault_url=KVUri, credential=credential)
    print(f"Retrieving your secret from {keyVaultName}.")
    # print(key_name)
    try:
        retrieved_secret = client.get_secret(name = key_name)
        # print("================================",retrieved_secret.value)
        return retrieved_secret.value
    except:
        print(traceback.print_exc())
        return None

def getconfigvalues(app_name , ENV ):
    print(f'inside getconfigvalues for app_name:{app_name}')
    url = f"{CONF_URL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
    # url =f"https://chatbotconfigjavaservice.azurewebsites.net/chatBotConfig/getConfigurations/{ENV}/{app_name}"
    # headers = {"Authorization": "Bearer "+TOKEN} 
    headers = {"Authorization": f"Bearer {TOKEN}"} 
    
    response = requests.get(url, headers=headers)
    print(f"config service service result for app_name:{app_name} Status Code", response.status_code)
    config_values = response.json()
    # print(config_values)
    return config_values


def setkeyvaultenv_variables(config_values):
    print(f'inside setkeyvaultenv_variables')
    data = config_values.get('data')
    for d in data:
        if "APP_REG" in d.get('key'):
            print(f"found key with suffix_app_reg:{d.get('key')}")
            value =  d.get("value")
            key = d.get('key').replace("APP_REG", "AZURE")
            # print('setting azure')
            # print(key, value)
            os.environ[key] = value
        
    # return sec


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
    print("setting env variables")
    for name in APPNAME:
        config_values = getconfigvalues(name, ENV)
        setkeyvaultenv_variables(config_values)
        setenv_variables(config_values)



# scheduler = BackgroundScheduler()
# scheduler.add_job(func=getconfigvalues, trigger="interval", seconds=10)
# scheduler.start()

#Shut down the scheduler when exiting the app
# atexit.register(lambda: scheduler.shutdown())