import io
import os
import base64
import requests
from PIL import Image
from semantic_kernel.functions import kernel_function
from logger import logger,get_caller_frame
from custom_utils.azure_blob_service import Azure_blob
from custom_utils.http_client import get_http_session

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
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
        self.conv_id = conv_id
        self.max_results = max_results
        self.aug_source = []
        self.aug_content = ''
        self.blob_object = blob_object

    @kernel_function(
        name="image_generator",
        description="""
        # Image Generator
        Generates an Image based on the query you give it,

        ###ONLY use this function when the user's query requires specifically asks to generate an Image, DO NOT assume an image was asked unless user explicitly mentions Image, 
        ###ONLY give query to this tool in ENGLISH, if user's Query is not in english translate it before calling this tool,
        ###Ensure that the Query given to this tool is descriptive
        ### This Tool will return a Tag like <KUMARAN_GENERATED_IMAGE>914adff4-1c6d-4e32-950b-e6a71bd8e974</KUMARAN_GENERATED_IMAGE>" Include the whole Tag in the place where you want the Image to be,
        or attach it in the end of your message the Image will be attached in the location of the Tag,

        **DO NOT use this function for:**
        - anything other than generating images which was explicitly asked by user,
        """
    )
    async def image_generator(self, query: str) -> str:
        """
        Generates Images based on the Query you pass to it, and returns special tag,
        you are to include the contents of this tag in your response,
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
                "size": "1024x1024",
                "quality": "medium",
                "n": 1
            }
            logger.info(f'Sending Image Generation Request To Model',extra=extras)
            session = get_http_session()
            response = session.post(url, headers=headers, json=body, timeout=60.0)
            response.raise_for_status()
            data = response.json()
            logger.info(f'Image Generation Complete',extra=extras)
            b64_image = data["data"][0]["b64_json"]
            extension = data["output_format"]
            token_usuage = data["usage"]
            image_bytes = base64.b64decode(b64_image)
            img = Image.open(io.BytesIO(image_bytes))
            mime_type = Image.MIME[img.format]
            logger.info(f'Image Type Inference complete,Storing Image In BLOB',extra=extras)
            image_embed = self.blob_object.save_image_to_blob(conversation_id=self.conv_id,image_bytes=image_bytes,mime_type=mime_type,query=query,extension=extension,token_usuage=token_usuage)
            return image_embed
        
        except Exception as e:
            print(e)
            return f"unable generate image"