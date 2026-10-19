from azure.keyvault.secrets import SecretClient
from azure.identity import DefaultAzureCredential
import traceback
import requests
import os 

keyVaultName = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
# keyVaultName = "kumaranchatbotpoc"
KVUri = f"https://{keyVaultName}.vault.azure.net"

TOKEN = os.environ.get('CUSTOMCONNSTR_ConfigManagerToken') 
CONF_URL =  os.environ.get('CUSTOMCONNSTR_ConfigManagerURL')

# CONF_URL ="https://chatbotconfigjavaservice.azurewebsites.net/"

def get_key(key_name):
    credential = DefaultAzureCredential()
    # client = AzureAppConfigurationClient(base_url=KVUri, credential=credential)
    client = SecretClient(vault_url=KVUri, credential=credential)
    #print(f"Retrieving your secret from {keyVaultName}.")
    # print(key_name)
    try:
        retrieved_secret = client.get_secret(name = key_name)
        # print("================================",retrieved_secret.value)
        return retrieved_secret.value
    except:
        print(traceback.print_exc())
        return None

def getconfigvalues(app_name , ENV ):
    
    url = f"{CONF_URL}chatBotConfig/getConfigurations/{ENV}/{app_name}"
    headers = {"Authorization": "Bearer "+TOKEN} 
    response = requests.get(url, headers=headers)
    # print("Status Code", response.status_code)
    config_values = response.json()
    # print(config_values)
    return config_values


def setkeyvaultenv_variables(config_values):
    data = config_values.get('data')
    for d in data:
        if "APP_REG" in d.get('key'):
            value =  d.get("value")
            key = d.get('key').replace("APP_REG", "AZURE")
            # print('setting azure')
            # print(key, value)
            os.environ[key] = value
    # return sec


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
    APPNAME = ["Conv_AI_Common", "Conv_AI_Conversation","Conv_AI_Config","Conv_AI_ContentMgmt"]
    print("setting env variables")
    for name in APPNAME:
        config_values = getconfigvalues(name, ENV)
        setkeyvaultenv_variables(config_values)
        setenv_variables(config_values)

