from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

import os

# os.environ["AZURE_TENANT_ID"] = "fce643da-bde9-4d38-a1ab-31e13fb799c0"
# os.environ["AZURE_CLIENT_ID"] = "13dca429-2c67-4e0f-ad43-4c24926ee3c7"

os.environ["AZURE_TENANT_ID"] = os.environ.get('CUSTOMCONNSTR_AZURE_TENANT_ID')
os.environ["AZURE_CLIENT_SECRET"] = os.environ.get('CUSTOMCONNSTR_AZURE_CLIENT_SECRET')
os.environ["AZURE_CLIENT_ID"] = os.environ.get('CUSTOMCONNSTR_AZURE_CLIENT_ID')

DB_TYPE = os.getenv('DB_TYPE')

def get_values(ENV):
    keyvault_name = os.environ.get('CUSTOMCONNSTR_KEYVAULT_ENDPOINT')
    # keyvault_name = "kumaranchatbotpoc"
    vault_url = f"https://{keyvault_name}.vault.azure.net"
    credential = DefaultAzureCredential()
    client = SecretClient(vault_url=vault_url, credential=credential)
    # my_secret = client.get_secret(name="CONFIG-MGR-TOKEN-DEV")
    # print(my_secret.value)

    if ENV and DB_TYPE:
        secret_suffix = str(ENV).upper()
        if DB_TYPE.upper()=='SQL':
            secrets_variable_mapping = {
                f"CHATBOT-SQL-DB-NAME-{secret_suffix}":"SQLDBNAME",
                f"CHATBOT-SQL-HOST-{secret_suffix}":"SQLHOST",
                f"CHATBOT-SQL-PWD-{secret_suffix}":"SQLPWD",
                f"CHATBOT-SQL-USER-NAME-{secret_suffix}":"SQLUSERNAME",
                f"CHATBOT-SQL-PORT-{secret_suffix}":"SQLPORT"
            } 

        elif DB_TYPE.upper()=='PG':
            secrets_variable_mapping = {
                f"CHATBOT-PG-CNN-STR-{secret_suffix}":"PGDBCONNSTR",
            }
        else:
            raise Exception('Incompatible DB TYPE')
    else:
        raise Exception('ENV or DB_TYPE is Missing')


    for secret_name,secret_variable in secrets_variable_mapping.items():
        try:
            secret = client.get_secret(secret_name)
            os.environ[secret_variable] = secret.value
            print(secret_variable,secret.value)
        except Exception as e:
            raise Exception(f"Failed to retrieve secret '{secret_name}': {str(e)}")

    
        
