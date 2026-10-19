import os
import json
import uuid
import base64
from datetime import datetime
from azure.storage.blob import BlobServiceClient,ContentSettings
from azure.core.exceptions import ResourceExistsError
from logger import logger,get_caller_frame,extras,time_sync_func

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

class Azure_blob:
    DOCUMENT_MIME_TYPES = {
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls": "application/vnd.ms-excel",
        "csv": "text/csv",
        "pdf": "application/pdf",
        "json": "application/json",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "ppt": "application/vnd.ms-powerpoint",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword"
    }

    @classmethod
    def get_mime_type_for_extension(cls, extension: str) -> str:
        """Utility method to resolve MIME type from file extension."""
        if not extension:
            return "application/octet-stream"
        return cls.DOCUMENT_MIME_TYPES.get(extension.lower().strip(), "application/octet-stream")

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
        self.GENERATED_IMAGE_CONTAINER_NAME =os.environ.get('IMAGE-CONTAINER-NAME',None)
        self.GENERATED_DOCUMENT_CONTAINER_NAME = os.environ.get('GENERATED-PPT-CON-NAME',None)

    def save_image_to_blob(self, image_bytes,extension,mime_type,conversation_id: str, query: str,token_usuage):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'}

        container_client = self.blob_service_client.get_container_client(self.GENERATED_IMAGE_CONTAINER_NAME)
        logger.info(f"Started Image Storage in BLOB for Conversation ID {conversation_id}",extra=extras)
        while True:
            image_id = str(uuid.uuid4())
            logger.info(f"Image ID generated, {image_id}",extra=extras)
            blob_path = f"{conversation_id}/{image_id}.{extension}"
            blob_client = container_client.get_blob_client(blob_path)
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
        metadata_blob_client = container_client.get_blob_client(metadata_blob_path)

        metadata_blob_client.upload_blob(json.dumps(metadata),overwrite=False,content_settings=ContentSettings(content_type="application/json"))
        logger.info(f" Image Stored In BLOB, returned Embed for Image ID : {image_id}",extra=extras)
        return image_id

        
    def get_first_image_by_id(self, conversation_id: str, image_id: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        try:
            container_client = self.blob_service_client.get_container_client(self.GENERATED_IMAGE_CONTAINER_NAME)
            prefix = f"{conversation_id}/{image_id}"
            blobs = container_client.list_blobs(name_starts_with=prefix)

            for blob in blobs:
                blob_name = blob.name

                if blob_name.endswith("_metadata.json"): # this is to skip meta data files
                    continue
                logger.info(f'Starting Download of Image from Blob for image id:{image_id},For Conversation Id {conversation_id}',extra=extras)
                blob_client = container_client.get_blob_client(blob_name)
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
            container_client = self.blob_service_client.get_container_client(self.GENERATED_IMAGE_CONTAINER_NAME)
            prefix = f"{conversation_id}/{image_id}"
            blobs = container_client.list_blobs(name_starts_with=prefix)

            image_bytes = None
            metadata = None
            mime_type = "application/octet-stream"
            extension = None

            for blob in blobs:
                blob_name = blob.name
                blob_client = container_client.get_blob_client(blob_name)
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
        
    def save_generated_document(self,query,conv_id,file_bytes,extension,tokens_consumed,model_name,document_name)->str:
        """
        This function only handles generated documents (.pptx, .xlsx, .csv, .pdf, etc.), not images.
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        mime_type = self.get_mime_type_for_extension(extension)
        container_client = self.blob_service_client.get_container_client(self.GENERATED_DOCUMENT_CONTAINER_NAME)
        logger.info(f"Started .{extension} Document storage in BLOB for Conversation ID {conv_id}",extra=extras)
        while True:
            generated_document_id = str(uuid.uuid4())
            logger.info(f"DOCUMENT GENERATED {generated_document_id}",extra=extras)
            blob_path = f"{conv_id}/{generated_document_id}/{document_name}.{extension}"
            blob_client = container_client.get_blob_client(blob_path)
            
            if isinstance(file_bytes, str):
                doc_binary_data = base64.b64decode(file_bytes)
            else:
                doc_binary_data = file_bytes
                
            try:
                blob_client.upload_blob(
                    doc_binary_data,
                    overwrite=False,
                    content_settings=ContentSettings(content_type=mime_type))
                
            except ResourceExistsError as e:
                logger.info(f"DOCUMENT GENERATED {generated_document_id} but could not save, exception:{e}",extra=extras)
                continue 
            metadata = {
                "generated_document_name":document_name,
                "generated_document_id": generated_document_id,
                "conversation_id": conv_id,
                "model_used":model_name,
                "query": query,
                "created_at": datetime.utcnow().isoformat(),
                "token_usuage":tokens_consumed
            }
            break
        metadata_blob_path = f"{conv_id}/{generated_document_id}/{document_name}_metadata.json"
        metadata_blob_client = container_client.get_blob_client(metadata_blob_path)

        metadata_blob_client.upload_blob(json.dumps(metadata),overwrite=False,content_settings=ContentSettings(content_type="application/json"))
        logger.info(f" Document Stored In BLOB, returned Embed for Document ID : {generated_document_id}",extra=extras)
        return generated_document_id

        
    def get_generated_document(self, conversation_id: str, generated_document_id: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        try:
            container_client = self.blob_service_client.get_container_client(self.GENERATED_DOCUMENT_CONTAINER_NAME)
            prefix = f"{conversation_id}/{generated_document_id}"
            blobs = container_client.list_blobs(name_starts_with=prefix)

            file_bytes = None
            metadata = dict()
            mime_type = "application/octet-stream"
            extension = None

            for blob in blobs:
                blob_name = blob.name
                blob_client = container_client.get_blob_client(blob_name)
                logger.info(f"Downloading blob: {blob_name} for generated_document_id: {generated_document_id}, conversation_id: {conversation_id}",extra=extras)
                
                data = blob_client.download_blob().readall()
                if blob_name.endswith("_metadata.json"):
                    metadata = json.loads(data.decode("utf-8"))
                else:
                    file_bytes = data
                    mime_type = (
                        blob.content_settings.content_type
                        if blob.content_settings and blob.content_settings.content_type
                        else "application/octet-stream"
                    )
                    extension = blob_name.split(".")[-1] if "." in blob_name else None

            if (not mime_type or mime_type == "application/octet-stream") and extension:
                mime_type = self.get_mime_type_for_extension(extension)

            return {
                    "generated_document_name": metadata.get("generated_document_name"),
                    "generated_file_bytes": base64.b64encode(file_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "extension": extension,
                    "generated_document_prompt":metadata.get("query"),
                    "tokens_used":metadata.get("token_usuage")
                }

        except Exception as e:
            logger.exception(f'Unknown Exception : {e}',extra=extras)
            return None

