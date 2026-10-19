import os
import re
import dotenv
from urllib.parse import urlparse
from logger import logger


from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion

from anthropic import AsyncAnthropic
from semantic_kernel.connectors.ai.anthropic import AnthropicChatCompletion

from custom_utils.azure_blob_service import Azure_blob

#Plugin Imports
from plugins.web_search_plugin import WebSearchPlugin
from plugins.image_generation_service import ImageGeneratorPlugin


SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

dotenv.load_dotenv()

KERNEL_SERVICE_ID_REGEX = r"^[a-zA-Z0-9_-]+$"

# Prompt and Chat completion object helper functions

def load_prompt_from_file_absoulute_path(prompt_file_name:str,directory_name:str):
    """Load prompt template from external file"""
    # the prompt filename here requires extension, so general_rpompt.txt instead of just general_prompt
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'load_prompt_from_file',
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        prompt_file = os.path.join(directory_name,prompt_file_name)
        
        # Check if file exists
        if not os.path.exists(prompt_file):
            logger.error(f"Prompt file not found: {prompt_file}", extra=extras)
            raise FileNotFoundError(f"Prompt file not found: {prompt_file}")
        
        # Read the prompt from file
        with open(prompt_file, 'r', encoding='utf-8') as f:
            prompt = f.read()
        
        logger.info(f"Successfully loaded prompt from: {prompt_file}", extra=extras)
        return prompt
        
    except Exception as e:
        logger.error(f"Error loading prompt file {prompt_file_name}: {str(e)}", extra=extras)
        raise


class TokenCounter:
    def __init__(self):
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_tokens = 0

    def update_usuage(self, response):
        """Updates the token usage with new values."""
        try:
            x = response.metadata.get("metadata")[0]
            usage = x.get("usage")
            output_token_count = getattr(usage, 'completion_tokens', None) or getattr(usage, 'output_tokens', None) or 0
            input_token_count  = getattr(usage, 'prompt_tokens',     None) or getattr(usage, 'input_tokens',  None) or 0
            self.total_input_tokens+=input_token_count
            self.total_output_tokens+=output_token_count
        except Exception as e:
            pass

    def get_total_usuage(self) -> dict:
        """Returns the total accumulated token usage."""
        return {
            "prompt_tokens": self.total_input_tokens,
            "completion_tokens": self.total_output_tokens,
            "total_tokens": self.total_tokens
        }

# modified version of get_chat_completion_object from kai-conversation service
def get_chat_completion_object(provider:str,model_name):

    if provider and provider.lower()== 'azure':
        if "claude" in model_name.lower():
            AZURE_DEPLOYMENT_NAME = os.getenv(f"ANTHROPIC_DEP_NAME_{model_name}")
            AZURE_ENDPOINT = os.getenv(f"ANTHROPIC_API_ENDPOINT_{model_name}")
            AZURE_COMPLETION_KEY = os.getenv(f"ANTHROPIC_API_KEY_{model_name}")
            raw_client = AsyncAnthropic(
                api_key=AZURE_COMPLETION_KEY,
                base_url=AZURE_ENDPOINT
            )
            print(AZURE_DEPLOYMENT_NAME, AZURE_ENDPOINT)
            completion_obj = AnthropicChatCompletion(
                ai_model_id=AZURE_DEPLOYMENT_NAME,    
                api_key=AZURE_COMPLETION_KEY,  
                async_client=raw_client)
            
            return completion_obj
        
        elif "gpt" in model_name.lower():
            AZURE_DEPLOYMENT_NAME = os.getenv(f"OPENAI_GPT_DEP_NAME_{model_name}")
            AZURE_COMPLETION_KEY = os.getenv(f"OPENAI_API_KEY_{model_name}")
            AZURE_ENDPOINT = os.getenv(f"OPENAIAPI_ENDPOINT_{model_name}")

            AZURE_OPENAI_PARSED_ENDPOINT = urlparse(AZURE_ENDPOINT)
            AZURE_OPENAI_BASE_URL = f"{AZURE_OPENAI_PARSED_ENDPOINT.scheme}://{AZURE_OPENAI_PARSED_ENDPOINT.netloc}"
            
            query_params = AZURE_OPENAI_PARSED_ENDPOINT.query.split('=')
            AZURE_OPENAI_API_VERSION = query_params[1] if len(query_params) > 1 else None
            completion_obj = AzureChatCompletion(
                    deployment_name=AZURE_DEPLOYMENT_NAME,
                    endpoint=AZURE_OPENAI_BASE_URL,
                    api_key=AZURE_COMPLETION_KEY,
                    api_version=AZURE_OPENAI_API_VERSION,  
                )
            return completion_obj
    else:
        raise Exception('Chat completion creation failed')
    
class KernelPool:
    def __init__(self,model_list:list[str],blob_object:Azure_blob):
        self.blob_object = blob_object
        self.model_list:list[str]=model_list
        self.web_search_plugin_obj = WebSearchPlugin()
        self.image_generation_plugin = ImageGeneratorPlugin(conv_id="KAI_TEMP_CONV",max_results=1,blob_object=blob_object)
        self.kernel_pool = self.create_kernel_pool()

    def create_kernel_pool(self)->dict[str,Kernel]:
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'create_kernel_pool',
        'projectname': PROJECT_NAME,
        'bot_name': 'KAI'
    }
        kernel_dict:dict[str,Kernel]=dict()
        for model in self.model_list:
            if model == "":
                logger.info(f"COULD NOT CREATE MODEL, INVALID MODEL NAME :{model}, MODEL NAME LIST :{self.model_list}",extra=extras)
                raise Exception(f"COULD NOT CREATE MODEL, INVALID MODEL NAME :{model}, MODEL NAME LIST :{self.model_list}")
            kernel:Kernel = Kernel()
            completion_obj=get_chat_completion_object(provider='azure',model_name=model)
            completion_obj.service_id="primary_chat"
            kernel.add_service(completion_obj)

            #adding plugins here
            kernel.add_plugin(self.web_search_plugin_obj, "WebSearchPlugin")
            kernel.add_plugin(self.image_generation_plugin,"ImageGenerationPlugin")
            kernel_dict.update({model:kernel})
        return kernel_dict
    
    def update_conversation_id_in_plugins(self,new_conv_id:str):
        self.image_generation_plugin.conv_id=new_conv_id

    def reset_augSrc_and_augContent(self):
        self.web_search_plugin_obj.aug_content=""
        self.web_search_plugin_obj.aug_source=list()