import json
import os
import re
import gc
import re
import random
import string
from datetime import datetime,timezone
from contextservice.token_tracker import TokenTracker
from logger import logger,get_caller_frame,extras
from custom_pydantic_models.sk_models import GeneralResponseModel
from json.decoder import JSONDecodeError
from pydantic import ValidationError
from semantic_kernel.prompt_template import PromptTemplateConfig
from semantic_kernel.contents.chat_history import ChatHistory
from semantic_kernel.prompt_template.input_variable import InputVariable
from semantic_kernel.kernel import KernelArguments
from semantic_kernel.connectors.ai.open_ai import AzureChatPromptExecutionSettings
from semantic_kernel.connectors.ai.function_choice_behavior import FunctionChoiceBehavior
from semantic_kernel.connectors.ai.anthropic import AnthropicChatPromptExecutionSettings
from semantic_kernel.exceptions import KernelInvokeException
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from kernel_pooling import KernelPool

def expand_acronyms(text,acronyms):
    for acronym,expansion in acronyms.items():
        text=text.replace(acronym,expansion)
    return text

def generate_random_delimiter(length=10):
    characters=string.ascii_letters+string.digits
    return ' '.join(random.choice(characters) for i in range(length)) 

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

meaning_endpoint = os.getenv("GET_MEANING_URL")
logger.info(f"conversation service endpoints: 'GET_MEANING_URL':'{meaning_endpoint}'",extra=extras)

def is_valid_json(json_str):
    try:
        json.loads(json_str)
        return True
    except ValueError as e:
        logger.error(f'{SERVICE_NAME} :  Invalid JSON {e}', extra=extras)
        return False

def load_prompt_from_file(prompt_name):
    """Load prompt template from external file"""
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'load_prompt_from_file',
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    
    try:

        script_dir = os.path.dirname(os.path.abspath(__file__))
        prompts_dir = os.path.join(script_dir, 'prompts')
        prompt_file = os.path.join(prompts_dir, f"{prompt_name}.txt")

        if not os.path.exists(prompt_file):
            logger.error(f"Prompt file not found: {prompt_file}", extra=extras)
            raise FileNotFoundError(f"Prompt file not found: {prompt_file}")
        
        with open(prompt_file, 'r', encoding='utf-8') as f:
            prompt = f.read()
        
        logger.info(f"Successfully loaded prompt from: {prompt_file}", extra=extras)
        return prompt
        
    except Exception as e:
        logger.error(f"Error loading prompt file {prompt_name}: {str(e)}", extra=extras)
        raise

def return_default_get_answer_gpt(retry_state):
    return None

def anthropic_model_setup(max_tokens,temperature):
    execution_settings = AnthropicChatPromptExecutionSettings(temperature=temperature,max_tokens=max_tokens)
    execution_settings.function_choice_behavior = FunctionChoiceBehavior.Auto()
    return execution_settings

def azure_models_setup(temperature):
    execution_settings = AzureChatPromptExecutionSettings()
    execution_settings.function_choice_behavior = FunctionChoiceBehavior.Auto()
    execution_settings.temperature = temperature
    return execution_settings

def parse_model_response(raw_str:str):
        """
        This function is responsible for parsing the model's raw response and converting them into a json format
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        # Strip markdown code fences if Claude wraps response in them
        try:
            if raw_str.startswith("```") or raw_str.endswith("```"):
                raw_str = re.sub(r"^```(?:json)?\s*", "", raw_str)
                raw_str = re.sub(r"\s*```$", "", raw_str)
            raw_str = raw_str.strip()
            parsed = json.loads(raw_str)
            print("PARSED RESPONSE:", parsed)
            normalized = normalize_response_dict(parsed)
            validated_response = GeneralResponseModel.model_validate(normalized)
            return validated_response,raw_str
        except Exception as e:
            logger.exception(f"JSON LOAD failed when PArsing Model Response, Exception :{e}",extra=extras)
            raw_str = raw_str.strip()
            validated_response = None
            return validated_response,raw_str

@retry(
    stop=stop_after_attempt(3),  # Retry up to 3 times
    wait=wait_exponential(multiplier=1, min=2, max=10),  # Exponential backoff starting at 2 seconds
    retry=retry_if_exception_type((KernelInvokeException,ValidationError,JSONDecodeError)),  # Retry on rate limit and general exceptions
    retry_error_callback=return_default_get_answer_gpt
)

async def image_get_answer_gpt(user_query, model, bot_type="kumaran",kernel_pool:KernelPool=None,token_tracker:TokenTracker = None, conv_id = None,prompt="",temprature=0.5,max_tokens=4096):

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    try:
        start_time = datetime.now(timezone.utc)
        logger.info(f"Entering {extras['functionname']} at {start_time}", extra=extras)
        kernel = kernel_pool.kernel_pool.get(model,None)
        if not kernel:
            kernel = kernel_pool.kernel_pool.get("gpt-4o-mini")

        execution_settings = None
        if "claude" in model.lower():
            execution_settings = anthropic_model_setup(max_tokens=max_tokens,temperature=temprature)
        else:
            execution_settings = azure_models_setup(temperature=temprature)

        if prompt =="":
            load_prompt_from_file("general_chat")
        # add the prompt fetch thing here

        response = None

        history = ChatHistory()
        history.add_system_message(prompt)
        history.add_user_message(user_query)

        prompt_template = """
        <message role="system">{{$system_prompt}}</message>
        <message role="user">{{$user_input}}</message>
        """

        prompt_template_config = PromptTemplateConfig(
        template=prompt_template,
        name="agent_chat",
        input_variables=[
            InputVariable(name="system_prompt", description="System instructions", is_required=True,allow_dangerously_set_content=True),
            InputVariable(name="user_input", description="User query", is_required=True,allow_dangerously_set_content=True),
            ],
        execution_settings=execution_settings)

        arguments = KernelArguments(system_prompt=prompt,user_input=user_query)
        agent_function = kernel.add_function(plugin_name="GenralChat",function_name="chat",prompt_template_config=prompt_template_config)
        response = await kernel.invoke(agent_function, arguments)

        add_log_token(user_query,"getting answer from gpt",response,conv_id,token_tracker,call_type="image_get_answer_gpt")

        response_returned = {"response":response,"augSrc":kernel_pool.web_search_plugin_obj.aug_source} 
        end_time = datetime.now(timezone.utc)
        logger.info(f"{SERVICE_NAME}: Execution time for {extras['functionname']} = {end_time - start_time}", extra=extras)
        return response_returned
    
    except KernelInvokeException as e:
        logger.exception(f"{SERVICE_NAME}: KernelInvokeException Error during get_answer_gpt generation for query:{user_query}", extra=extras)
        raise KernelInvokeException
    except ValidationError as e:
        logger.exception(f"{SERVICE_NAME}: ValidationError Error during get_answer_gpt generation for query:{user_query}", extra=extras)
        raise Exception(e)
    except JSONDecodeError as e:
        logger.exception(f"{SERVICE_NAME}:JSONDecodeError Error during get_answer_gpt generation for query:{user_query}", extra=extras)
        raise JSONDecodeError(e.msg,e.doc,e.pos)
    except Exception as e:
        logger.exception(f"{SERVICE_NAME}: Error during GPT response for query:{user_query}", extra=extras)
        return None
    finally:
        gc.collect()

def add_log_token(ques,prompt_type,response,ConversationID,token_tracker:TokenTracker,call_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        try:
            x = response.value[0]
            usage = x.inner_content.usage
            output_token_count = getattr(usage, 'completion_tokens', None) or getattr(usage, 'output_tokens', None) or 0
            input_token_count  = getattr(usage, 'prompt_tokens',     None) or getattr(usage, 'input_tokens',  None) or 0
            token_tracker.update_tokens(input_tokens=input_token_count,output_tokens=output_token_count,call_type=call_type)
            logger.info(f'{SERVICE_NAME}_IMAGE : {prompt_type}: token management: searchquery:{ques}, output_token:{output_token_count}, input_output_token:{input_token_count}, unique_id:{ConversationID} ',extra=extras)
            return "ok"
        except Exception as e:
            logger.exception(f'{SERVICE_NAME} : exception occured in token logging try1',extra=extras)
        try:
            x = json.loads(response.content)
            output_token_count=x.inner_content.usage.completion_tokens
            input_token_count=x.inner_content.usage.prompt_tokens
            token_tracker.update_tokens(input_tokens=input_token_count,output_tokens=output_token_count,call_type=call_type)
            logger.info(f'{SERVICE_NAME} : {prompt_type}: token management: searchquery:{ques}, output_token:{output_token_count}, input_output_token:{input_token_count}, unique_id:{ConversationID} ',extra=extras)
            return "ok"
        except Exception as e:
            logger.exception(f'{SERVICE_NAME} : exception occured in token logging try2',extra=extras)

def return_default_suggested_follow_up_on_failure(retry_state):
    return {"follow_up_questions":[]}


def normalize_response_dict(data: dict):
    """Normalise the LLM JSON response to always contain a 'response' key.
    Never returns None — falls back to an empty string so model_validate never crashes.
    """
    if "response" in data and isinstance(data["response"], str):
        return {"response": data["response"]}

    if "properties" in data:
        try:
            desc = data["properties"]["response"].get("description")
            if desc:
                return {"response": desc}
        except Exception:
            pass

    if "description" in data and isinstance(data["description"], str):
        return {"response": data["description"]}

    # FIX: was returning None which caused model_validate to raise ValidationError → 3 retries → 'not-answered'
    # Now gracefully falls back to the full JSON dump so the response is never silently lost
    return {"response": str(data)}