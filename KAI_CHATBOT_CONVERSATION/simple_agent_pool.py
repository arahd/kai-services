import os
import re
import dotenv
from logger import logger,get_caller_frame, time_sync_func

from agent_framework import Agent
from agent_framework.openai import OpenAIChatClient,OpenAIChatCompletionOptions
from agent_framework.ollama import OllamaChatClient
from anthropic import AsyncAnthropic
from agent_framework.anthropic import AnthropicFoundryClient,AnthropicChatOptions

from llm_helpers import get_chat_completion_object,get_execution_settings

PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATION"

class SimpleAgentPool:
    def __init__(self,model_list:list[str]):
        self.model_list:list[str]=model_list
        self.base_system_prompt="You are K-AI (Kumaran AI), a professional AI assistant for Kumaran Systems employees"
        self.agent_pool = self.create_agent_pool()
        
    def create_agent_pool(self)->dict[str,Agent]:
        
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': 'create_kernel_pool',
        'projectname': PROJECT_NAME,
        'bot_name': 'KAI'
    }
        agent_pool:dict[str,Agent]=dict()
        for model in self.model_list:
            if model == "":
                logger.info(f"COULD NOT CREATE MODEL, INVALID MODEL NAME :{model}, MODEL NAME LIST :{self.model_list}",extra=extras)
                raise Exception(f"COULD NOT CREATE MODEL, INVALID MODEL NAME :{model}, MODEL NAME LIST :{self.model_list}")
            
            agent:Agent = Agent(
                client=get_chat_completion_object(model_name=model,provider='azure'),#api client 
                instructions=self.base_system_prompt,
                default_options=get_execution_settings(model_name=model)
                )
            agent_pool.update({model:agent})
        return agent_pool    


