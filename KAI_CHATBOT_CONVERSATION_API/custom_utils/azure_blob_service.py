import os
import json
import uuid
import base64
from datetime import datetime
from azure.storage.blob import BlobServiceClient,ContentSettings
from azure.core.exceptions import ResourceExistsError

from logger import logger,get_caller_frame

SERVICE_NAME='KAI_CHATBOT_CONVERSATION_API'
PROJECT_NAME='KAI'

class Azure_blob:

    def __init__(self) -> None:
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        self.AZURE_STORAGE_CONNECTION_STRING_KAI = os.environ.get('DATA_LAKE_CONNECTION_STRING',None)
        logger.info(f"Azure Connection String Fetch Test : Type :{type(self.AZURE_STORAGE_CONNECTION_STRING_KAI)}",extra=extras)
        self.blob_service_client =  BlobServiceClient.from_connection_string(self.AZURE_STORAGE_CONNECTION_STRING_KAI)
        self.CONTAINER_NAME =os.environ.get('IMAGE-CONTAINER-NAME',None)
        logger.info(f"IMAGE-CONTAINER-NAME fetch test: Type :{type(self.CONTAINER_NAME)}",extra=extras)
        self.container_client = self.blob_service_client.get_container_client(self.CONTAINER_NAME)

    def save_image_to_blob(self, image_bytes,extension,mime_type,conversation_id: str, query: str,token_usuage):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        try:
            logger.info(f"Started Image Storage in BLOB for Conversation ID {conversation_id}",extra=extras)
            while True:
                image_id = str(uuid.uuid4())
                logger.info(f"Image ID generated, {image_id}",extra=extras)
                blob_path = f"{conversation_id}/{image_id}.{extension}"
                blob_client = self.container_client.get_blob_client(blob_path)
                try:
                    blob_client.upload_blob(
                        image_bytes,
                        overwrite=False,
                        content_settings=ContentSettings(content_type=mime_type)
                    )
                    break
                except ResourceExistsError:
                    continue 
            metadata = {
                "image_id": image_id,
                "conversation_id": conversation_id,
                "query": query,
                "created_at": datetime.utcnow().isoformat(),
                "token_usuage":token_usuage
            }
            metadata_blob_path = f"{conversation_id}/{image_id}_metadata.json"
            metadata_blob_client = self.container_client.get_blob_client(metadata_blob_path)

            metadata_blob_client.upload_blob(json.dumps(metadata),overwrite=False,content_settings=ContentSettings(content_type="application/json"))
            logger.info(f" Image Stored In BLOB, returned Embed for Image ID : {image_id}",extra=extras)
            return f"<KUMARAN_GENERATED_IMAGE>{image_id}</KUMARAN_GENERATED_IMAGE>"
        except Exception as e:
            logger.exception(f" Unknown Error When Storing Generated Image In Blob Exception :{e} ",extra=extras)
            return "Image could not be generated"
    def get_first_image_by_id(self, conversation_id: str, image_id: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        try:
            prefix = f"{conversation_id}/{image_id}"
            blobs = self.container_client.list_blobs(name_starts_with=prefix)

            for blob in blobs:
                blob_name = blob.name

                if blob_name.endswith("_metadata.json"): # this is to skip meta data files
                    continue
                logger.info(f'Starting Download of Image from Blob for image id:{image_id},For Conversation Id {conversation_id}',extra=extras)
                blob_client = self.container_client.get_blob_client(blob_name)
                image_bytes = blob_client.download_blob().readall()
                mime_type = (
                    blob.content_settings.content_type
                    if blob.content_settings and blob.content_settings.content_type
                    else "application/octet-stream"
                )
                extension = blob_name.split(".")[-1] if "." in blob_name else None
                logger.info(f'Image Downloaded From Blob',extra=extras)
                return {
                    "image_name": blob_name,
                    "image_bytes": base64.b64encode(image_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "extension": extension
                }
            

        except Exception as e:
            logger.exception(f'Unknown Exception : {e}',extra=extras)
            return None
        
    def get_image(self, conversation_id: str, image_id: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        try:
            prefix = f"{conversation_id}/{image_id}"
            blobs = self.container_client.list_blobs(name_starts_with=prefix)

            image_bytes = None
            metadata_bytes = None
            mime_type = "application/octet-stream"
            extension = None

            for blob in blobs:
                blob_name = blob.name
                blob_client = self.container_client.get_blob_client(blob_name)
                logger.info(f"Downloading blob: {blob_name} for image_id: {image_id}, conversation_id: {conversation_id}",extra=extras)
                
                data = blob_client.download_blob().readall()
                if blob_name.endswith("_metadata.json"):
                    metadata = json.loads(data.decode("utf-8"))
                else:
                    image_bytes = data
                    mime_type = (
                        blob.content_settings.content_type
                        if blob.content_settings and blob.content_settings.content_type
                        else "application/octet-stream"
                    )
                    extension = blob_name.split(".")[-1] if "." in blob_name else None
            return {
                    "image_name": blob_name,
                    "image_bytes": base64.b64encode(image_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "extension": extension,
                    "image_prompt":metadata.get("query"),
                    "tokens_used":metadata.get("token_usuage")
                }

        except Exception as e:
            logger.exception(f'Unknown Exception : {e}',extra=extras)
            return None

