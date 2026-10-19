import os
from openai import AzureOpenAI


MODEL = os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o-mini")

client = AzureOpenAI(
    azure_endpoint=os.getenv("OPENAIAPI_ENDPOINT_gpt-4o-mini","https://kai-dev-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions"),
    api_key=os.getenv("OPENAI_API_KEY_gpt-4o-mini"),
    api_version="2024-08-01-preview",
)