import openai
from openai.embeddings_utils import get_embedding
from typing import TypeAlias
# from app.applogging import logger
from app.logger import logger,get_caller_frame,extras,SERVICE_NAME,PROJECT_NAME
from datetime import datetime,timezone
Vector: TypeAlias = list[float]


class ServeOpenai:
    def __init__(self, api_type: str, api_key: str, api_base: str, api_version :str, model: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.api_type = api_type
        self.api_key = api_key
        self.api_base = api_base
        self.api_version = api_version
        self.model = model 
        openai.api_type = self.api_type
        openai.api_key = self.api_key
        openai.api_base = self.api_base
        openai.api_version = self.api_version
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    def embed_text(self, text: str) ->Vector:
        """Returns vector of text

        Args:
            text (str): String of which vector is to be created

        Returns:
            vector: openai vector of s string
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            logger.info ("Text Embedding Started.",extra=extras)
            embedding = get_embedding(text, engine = self.model) # engine should be set to the deployment name you chose when you deployed the text-embedding-ada-002 (Version 2) model
            logger.info("Text Embedding Completed successfully.",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return embedding
        except Exception:
            logger.exception('Error in Text Embedding.',extra=extras)
    
# import openai
# # from openai.embeddings_utils import get_embedding
# from openai import AzureOpenAI

# from logger import logger,get_caller_frame,extras
# from datetime import datetime,timezone
# from typing import TypeAlias
# Vector: TypeAlias = list[float]


# class ServeOpenai:
#     def __init__(self, api_type: str, api_key: str, api_base: str, api_version :str, model: str):
#         self.api_type = api_type
#         self.api_key = api_key
#         self.api_base = api_base
#         self.api_version = api_version
#         self.model = model 
#         openai.api_type = self.api_type
#         openai.api_key = self.api_key
#         openai.api_base = self.api_base
#         openai.api_version = "2024-02-01"

#     # def embed_text(self, text: str) ->Vector:
#     #     """Returns vector of text

#     #     Args:
#     #         text (str): String of which vector is to be created

#     #     Returns:
#     #         vector: openai vector of s string
#     #     """      
#     #     extras['functionname'] = get_caller_frame().f_code.co_name
#     #     logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)  
#     #     embedding = get_embedding(text, engine = self.model) # engine should be set to the deployment name you chose when you deployed the text-embedding-ada-002 (Version 2) model
#     #     logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
#     #     return embedding

#     def embed_text(self, text: str) ->Vector:
#         """Returns vector of text

#         Args:
#             text (str): String of which vector is to be created

#         Returns:
#             vector: openai vector of s string
#         """        
#         try:
#             client = AzureOpenAI(api_key = self.api_key,  
#                                 api_version = self.api_version,
#                                 azure_endpoint = self.api_base)

#             # embedding = get_embedding(text, engine = self.model) # engine should be set to the deployment name you chose when you deployed the text-embedding-ada-002 (Version 2) model
#             embedding= client.embeddings.create(input = [text], model=self.model).data[0].embedding
#             return embedding
#         except Exception:
#             logger.exception('Error in Text Embedding.',extra=extras)
    
    
