import io
import os
import base64
from http_client import http_client
from PIL import Image
from agent_framework import Message,Content,tool

from agent_pool_context_helper import current_conv_id,current_generated_image_ids

from logger import logger,get_caller_frame,extras
from custom_utils.azure_blob_service import Azure_blob

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

class ImageGeneratorPlugin:
    last_search = None
    def __init__(self, conv_id:str,blob_object:Azure_blob,max_results: int = 1):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        #self.conv_id = conv_id
        self.max_results = max_results
        self.aug_source = []
        self.aug_content = ''
        self.blob_object = blob_object
        # self.is_image_generated = False
        # self.generated_image_ids = list()

    @tool(approval_mode="never_require",
        name="image_generator",
        description="""
        # Image Generator
        Generates an Image based on the query you give it,

        ### ONLY use this function when the user's query requires specifically asks to generate an Image, DO NOT assume an image was asked unless user explicitly mentions Image,
        ### Ensure that the Query given to this tool is descriptive
        ## Response Handling
        - Returns "Image Generation Successful" or "Image Generation Failed".
        - On success, the image is automatically attached at the end of your output — structure your response accordingly.
        - On failure, acknowledge the failure gracefully
        
        - DO NOT use this tool to generate data charts, pie charts, bar graphs, statistical plots, or architecture/system diagrams. ALWAYS use `code_interpreter` for data visualizations and architecture diagrams (`diagrams` library).
        """

    )
    async def image_generator(self, query: str) -> Message:
        """
        Generates Images based on the Query you pass to it
        - Only call this tool once, do not call it multiple times
        
        Args:
            query (str): The user's query.
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f'Image Generation Started',extra=extras)
        try:
            url = os.environ.get("GPT-IMAGE-1-mini-BASEURL",None)
            gpt1_api_key = os.environ.get("GPT-IMAGE-1-mini-APIKEY",None)
            headers = {
                "Content-Type": "application/json",
                "api-key": gpt1_api_key
            }
            logger.info(f'KEYVAULT VALUE FETCH CHECK : GPT-IMAGE-1-mini-BASEURL : {type(url)}',extra=extras)
            logger.info(f'KEYVAULT VALUE FETCH CHECK : GPT-IMAGE-1-mini-BASEURL : {type(gpt1_api_key)}',extra=extras)
            body = {
                "prompt": query,
                "quality": "medium",
                "n": 1
            }
            logger.info(f'Sending Image Generation Request To Model',extra=extras)
            response = http_client.post(url, headers=headers, json=body)
            data = response.json()
            logger.info(f'Image Generation Complete',extra=extras)
            b64_image = data["data"][0]["b64_json"]
            extension = data["output_format"]
            token_usuage = data["usage"]
            image_bytes = base64.b64decode(b64_image)
            img = Image.open(io.BytesIO(image_bytes))
            mime_type = Image.MIME[img.format]
            logger.info(f'Image Type Inference complete,Storing Image In BLOB',extra=extras)
            image_id = self.blob_object.save_image_to_blob(conversation_id=current_conv_id.get(),image_bytes=image_bytes,mime_type=mime_type,query=query,extension=extension,token_usuage=token_usuage)

            current_generated_image_ids.get().append(image_id)

            return Message(  role="tool", contents=[
                Content.from_text(text="Image Generation Successful")])
    
        except Exception as e:
            return Message(  role="tool", contents=[
                Content.from_text(text="Image Generation Failed")])
            