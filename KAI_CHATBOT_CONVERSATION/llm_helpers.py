import os
import base64
from io import BytesIO
from PIL import Image
from urllib.parse import urlparse

from anthropic import AsyncAnthropic
from agent_framework.openai import OpenAIChatClient,OpenAIChatCompletionOptions
from agent_framework.anthropic import AnthropicFoundryClient,AnthropicChatOptions

from logger import logger,get_caller_frame

PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATION"

def load_prompt_from_file_absoulute_path(prompt_file_name:str,directory_name:str):
    """Load prompt template from external file"""
    # the prompt filename here requires extension, so general_rpompt.txt instead of just general_prompt
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
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

#maf update done
def get_chat_completion_object(provider:str,model_name:str):

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }


    if provider and provider.lower()== 'azure':
        if "claude" in model_name.lower():
            logger.info(f"Creating Client for {model_name} (Claude)",extra=extras)
            AZURE_DEPLOYMENT_NAME = os.getenv(f"ANTHROPIC_DEP_NAME_{model_name}")
            AZURE_ENDPOINT = os.getenv(f"ANTHROPIC_API_ENDPOINT_{model_name}")
            AZURE_COMPLETION_KEY = os.getenv(f"ANTHROPIC_API_KEY_{model_name}")
            anthropic_raw_client = AsyncAnthropic(api_key=AZURE_COMPLETION_KEY,base_url=AZURE_ENDPOINT)
            client = AnthropicFoundryClient(anthropic_client=anthropic_raw_client,model=AZURE_DEPLOYMENT_NAME)
            return client
        
        elif "gpt" in model_name.lower():
            logger.info(f"Creating Client for {model_name} (GPT)",extra=extras)
            AZURE_DEPLOYMENT_NAME = os.getenv(f"OPENAI_GPT_DEP_NAME_{model_name}")
            AZURE_COMPLETION_KEY = os.getenv(f"OPENAI_API_KEY_{model_name}")
            AZURE_ENDPOINT = os.getenv(f"OPENAIAPI_ENDPOINT_{model_name}")

            AZURE_OPENAI_PARSED_ENDPOINT = urlparse(AZURE_ENDPOINT)
            AZURE_OPENAI_BASE_URL = f"{AZURE_OPENAI_PARSED_ENDPOINT.scheme}://{AZURE_OPENAI_PARSED_ENDPOINT.netloc}"
            
            query_params = AZURE_OPENAI_PARSED_ENDPOINT.query.split('=')
            AZURE_OPENAI_API_VERSION = query_params[1] if len(query_params) > 1 else None

            client = OpenAIChatClient(azure_endpoint=AZURE_OPENAI_BASE_URL,api_key=AZURE_COMPLETION_KEY,model=AZURE_DEPLOYMENT_NAME)
            return client
        elif "kimi" in model_name.lower():
            logger.info(f"Creating Client for {model_name} (Kimi)",extra=extras)
            AZURE_DEPLOYMENT_NAME = os.getenv(f"OPENAI_KIMI_DEP_NAME_{model_name}")
            AZURE_COMPLETION_KEY = os.getenv(f"OPENAI_KIMI_APIKEY_{model_name}")
            AZURE_ENDPOINT = os.getenv(f"OPENAI_KIMI_ENDPOINT_{model_name}")

            client = OpenAIChatClient(azure_endpoint=AZURE_ENDPOINT,api_key=AZURE_COMPLETION_KEY,model=AZURE_DEPLOYMENT_NAME)

            return client
        elif "gemma" in model_name.lower():
            logger.info(f"Creating Client for {model_name} (Gemma)",extra=extras)
            AZURE_DEPLOYMENT_NAME = os.getenv(f"GEMMA_DEP_NAME_{model_name}")
            AZURE_COMPLETION_KEY = os.getenv(f"GEMMA_API_KEY_{model_name}")
            AZURE_ENDPOINT = os.getenv(f"GEMMA_ENDPOINT_{model_name}")

            AZURE_OPENAI_PARSED_ENDPOINT = urlparse(AZURE_ENDPOINT)
            AZURE_OPENAI_BASE_URL = f"{AZURE_OPENAI_PARSED_ENDPOINT.scheme}://{AZURE_OPENAI_PARSED_ENDPOINT.netloc}"
            
            query_params = AZURE_OPENAI_PARSED_ENDPOINT.query.split('=')
            AZURE_OPENAI_API_VERSION = query_params[1] if len(query_params) > 1 else None

            client = OpenAIChatClient(azure_endpoint=AZURE_ENDPOINT,api_key=AZURE_COMPLETION_KEY,model=AZURE_DEPLOYMENT_NAME)
            return client
            
    else:
        raise Exception('Chat completion creation failed')

#maf update done
def get_execution_settings(model_name:str): #called execution settings in semantic kernel  and chat options in maf 
    model_name = model_name.lower()
    if "claude" in model_name:
        return AnthropicChatOptions(max_tokens=10240,temperature=0.5)
    elif "gpt" in model_name:
        return OpenAIChatCompletionOptions(temperature=1)
    elif "kimi" in model_name:
        return OpenAIChatCompletionOptions(max_tokens=6144)

#maf update done
class TokenCounter:
    def __init__(self):
        self.total_input_tokens = 0
        self.total_output_tokens = 0
        self.total_tokens = 0

    def update_usuage(self, response):
        """Updates the token usage with new values."""
        try:
            usage = response.usage_details
            self.total_input_tokens+=usage.get("input_token_count",0)
            self.total_output_tokens+=usage.get("output_token_count",0)
        except Exception as e:
            print(e)
            pass

    def get_total_usuage(self) -> dict:
        """Returns the total accumulated token usage."""
        return {
            "prompt_tokens": self.total_input_tokens,
            "completion_tokens": self.total_output_tokens,
            "total_tokens": self.total_tokens
        }
    
def get_content_type(file_bytes:str):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    try:
        import mimetypes, base64,imghdr
        data = base64.b64decode(file_bytes)
        fmt = imghdr.what(None, data)           # e.g. 'png', 'jpeg', 'gif', ...
        mime_from_content = f"image/{fmt}" if fmt else "application/octet-stream"
        return mime_from_content
    except Exception as e:
        logger.exception(f'exception occured in image type identification',extra=extras)
        return "application/octet-stream"

def add_generation_tool_call_context(conversation):
    if len(conversation.get("generated_image_ids",[]))>0 and conversation.get("image_prompt",None):
        return str(conversation.get("response", "")) + f"\nIMAGE GENRERATION TOOL CALL USED WITH PROMPT : {conversation.get('image_prompt',None)}"
    if len(conversation.get("generated_document_ids",[]))>0 and conversation.get("generated_document_prompt",None):
        return str(conversation.get("response", "")) + f"\DOCUMENT GENRERATION TOOL CALL USED WITH PROMPT : {conversation.get('generated_document_prompt',None)}"
    else:
        return str(conversation.get("response", ""))
    
def compress_image(image_bytes: str, max_size: tuple = (1024, 1024), quality: int = 60) -> str:
    """
    Decodes base64 image, resizes & compresses it, returns new base64 string.
    """
    extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'KAI'
        }
    content_type = "image/jpeg"
    try:
        raw_bytes = base64.b64decode(image_bytes)
        img = Image.open(BytesIO(raw_bytes))

        # Convert RGBA/P to RGB (JPEG doesn't support transparency)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")

        # Resize while maintaining aspect ratio
        img.thumbnail(max_size, Image.LANCZOS)

        # Compress to JPEG
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)
        buffer.seek(0)

        # Re-encode to base64
        compressed_b64 = base64.b64encode(buffer.read()).decode("utf-8")
        return compressed_b64, content_type
    except Exception as e:
        logger.info(f"image compression failed, Exception :{e}",extra=extras)
        return image_bytes, content_type