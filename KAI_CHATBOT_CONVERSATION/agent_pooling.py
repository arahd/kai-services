from logger import logger,get_caller_frame, time_sync_func
from agent_framework import Agent
from agent_framework.openai import OpenAIChatClient,OpenAIChatCompletionOptions
from agent_framework.ollama import OllamaChatClient
from anthropic import AsyncAnthropic
from agent_framework.anthropic import AnthropicFoundryClient,AnthropicChatOptions

from custom_utils.azure_blob_service import Azure_blob

#Plugin Imports
from plugins.web_search_plugin import WebSearchPlugin
from plugins.document_generation import DocumentGenerationPlugin
from plugins.vector_search_plugin import DocumentVectorSearchPlugin
from plugins.image_fetch_plugin import ImageFetchPlugin
from plugins.image_generation_service import ImageGeneratorPlugin
from plugins.get_uploaded_filenames import UploadedFilenames
from plugins.python_interpreter_plugin import PythonInterpreterPlugin

from llm_helpers import load_prompt_from_file_absoulute_path,get_execution_settings,get_chat_completion_object
from simple_agent_pool import SimpleAgentPool

PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATION_SERVICE"

KERNEL_SERVICE_ID_REGEX = r"^[a-zA-Z0-9_-]+$" 

class AgentPool:
    def __init__(self,model_list:list[str],blob_object:Azure_blob,simple_agent_pool:SimpleAgentPool):
        self.blob_object = blob_object
        self.model_list:list[str]=model_list
        self.web_search_plugin_obj = WebSearchPlugin()
        self.image_generation_plugin = ImageGeneratorPlugin(conv_id="KAI_TEMP_CONV",max_results=1,blob_object=blob_object)
        self.document_vector_search_plugin = DocumentVectorSearchPlugin(conv_id="KAI_TEMP_CONV")
        self.document_generation_plugin = DocumentGenerationPlugin(conv_id="KAI_TEMP_CONV",model_name="KAI_TEMP_MODEL",blob_object=blob_object,simple_agent_pool=simple_agent_pool)
        self.uploaded_filenames_plugin = UploadedFilenames(conv_id="KAI_TEMP_CONV")
        self.image_fetch_plugin = ImageFetchPlugin(conv_id="KAI_TEMP_CONV",model_name='gpt-4o-mini')
        self.python_interpreter_plugin = PythonInterpreterPlugin(conv_id="KAI_TEMP_CONV", blob_object=blob_object)
        self.base_system_prompt = load_prompt_from_file_absoulute_path(prompt_file_name="maf_chatservice_prompt.txt",directory_name="prompts")
        self.agent_pool = self.create_agent_pool()
        
    def create_agent_pool(self)->dict[str,Agent]:
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
        agent_pool:dict[str,Agent]=dict()
        for model in self.model_list:
            if model == "":
                logger.info(f"COULD NOT CREATE MODEL, INVALID MODEL NAME :{model}, MODEL NAME LIST :{self.model_list}",extra=extras)
                raise Exception(f"COULD NOT CREATE MODEL, INVALID MODEL NAME :{model}, MODEL NAME LIST :{self.model_list}")
            agent:Agent = Agent(
                client=get_chat_completion_object(model_name=model,provider='azure'),
                instructions=self.base_system_prompt,
                tools=[self.image_fetch_plugin.fetch_image,
                       self.uploaded_filenames_plugin.get_uploaded_filenames,
                       self.document_generation_plugin.generate_document,
                       self.document_vector_search_plugin.document_vector_search,
                       self.image_generation_plugin.image_generator,
                       self.web_search_plugin_obj.search_web,
                       self.python_interpreter_plugin.execute_python_code,

                       ],
                default_options=get_execution_settings(model_name=model))
            agent_pool.update({model:agent})
        return agent_pool
    
    # @time_sync_func('update_conversation_id_in_plugins')
    # def update_conversation_id_in_plugins(self,new_conv_id:str):
        # self.image_fetch_plugin.conv_id = new_conv_id
        # self.image_generation_plugin.conv_id=new_conv_id
        # self.document_vector_search_plugin.conv_id=new_conv_id
        # self.document_generation_plugin.conv_id=new_conv_id
        # self.uploaded_filenames_plugin.conv_id=new_conv_id
        # self.image_fetch_plugin.conv_id=new_conv_id

    # @time_sync_func('update_model_name_in_plugins')
    # def update_model_name_in_plugins(self,model_name):
    #     self.document_generation_plugin.model_name=model_name

    

    def token_consumption_from_plugins(self)->dict[str,int]:
        # TODO: Need to modify token counting logic in image generation
        total_input_tokens:int = 0
        total_input_tokens+= self.image_fetch_plugin.total_input_tokens_consumed
        total_input_tokens+=self.document_generation_plugin.total_input_tokens_consumed
        total_output_tokens:int=0
        total_output_tokens+=self.document_generation_plugin.total_output_tokens_consumend
        total_output_tokens+=self.image_fetch_plugin.total_output_tokens_consumed

        return {"total_input_tokens_consumed":total_input_tokens,"total_output_tokens_consumed":total_output_tokens}

    def reset_plugin_token_consumption(self):
        self.image_fetch_plugin.total_input_tokens_consumed=0
        self.image_fetch_plugin.total_output_tokens_consumed=0
        self.document_generation_plugin.total_input_tokens_consumed=0
        self.document_generation_plugin.total_output_tokens_consumend=0

    # def reset_generation_status(self):
    #     self.image_generation_plugin.is_image_generated=False
    #     self.document_generation_plugin.is_pptx_generated=False
    #     self.image_generation_plugin.generated_image_ids=list()
    #     self.document_generation_plugin.generated_pptx_ids=list()
    
    # def get_generated_content_ids(self)->dict[str,list]:
    #     return {"generated_image_ids":self.image_generation_plugin.generated_image_ids,"generated_ppt_ids":self.document_generation_plugin.generated_pptx_ids}

    # def get_generation_status(self):
    #     return {"is_image_generated":self.image_generation_plugin.is_image_generated,"is_ppt_generated":self.document_generation_plugin.is_pptx_generated,"generation_triggered": True if self.image_generation_plugin.is_image_generated or self.document_generation_plugin.is_pptx_generated else False}
    



