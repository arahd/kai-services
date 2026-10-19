import os
import json
import uuid
import base64
from PIL import Image
from datetime import datetime
from azure.storage.blob import BlobServiceClient,ContentSettings
from azure.core.exceptions import ResourceNotFoundError,ResourceExistsError

from logger import logger,get_caller_frame,extras

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='CHATBOT'


class Azure_blob:

    def __init__(self) -> None:
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'KAI'
        }
        self.AZURE_STORAGE_CONNECTION_STRING_KAI = os.environ.get('DATA_LAKE_CONNECTION_STRING',None)
        logger.info(f"Azure Connection String Fetch Test : Type :{type(self.AZURE_STORAGE_CONNECTION_STRING_KAI)}",extra=extras)
        self.blob_service_client =  BlobServiceClient.from_connection_string(self.AZURE_STORAGE_CONNECTION_STRING_KAI)
        self.IMAGE_CONTAINER_NAME =os.environ.get('IMAGE-CONTAINER-NAME',None)
        self.GENERATED_DOCUMENT_CONTAINER_NAME =os.environ.get('GENERATED-PPT-CON-NAME',None)
        self.INDEXER_FILE_CONTAINER_NAME = os.environ.get('INDEXER_FILE_CONTAINER_NAME', None)
        logger.info(f"IMAGE-CONTAINER-NAME fetch test: Type :{type(self.IMAGE_CONTAINER_NAME)}",extra=extras)
        logger.info(f"GENERATED_DOCUMENT_CONTAINER_NAME fetch test: Type :{type(self.IMAGE_CONTAINER_NAME)}",extra=extras)
        logger.info(f"INDEXER_FILE_CONTAINER_NAME fetch test: Type :{type(self.INDEXER_FILE_CONTAINER_NAME)}", extra=extras)
        

    def get_first_image_by_id(self, conversation_id: str, image_id: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
        }
        try:
            self.container_client = self.blob_service_client.get_container_client(self.IMAGE_CONTAINER_NAME)
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
                    "image_name": "kai_image",
                    "image_bytes": base64.b64encode(image_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "extension": extension
                }
        except Exception as e:
            print(e, extras)
            return None
        
        
    def get_first_generated_document_by_id(self, conversation_id: str, generated_document_id: str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
        }
        try:
            self.container_client = self.blob_service_client.get_container_client(self.GENERATED_DOCUMENT_CONTAINER_NAME)
            prefix = f"{conversation_id}/{generated_document_id}"
            blobs = self.container_client.list_blobs(name_starts_with=prefix)

            for blob in blobs:
                blob_name = blob.name

                if blob_name.endswith("_metadata.json"): # this is to skip meta data files
                    continue
                logger.info(f'Starting Download of Document from Blob for generated document id:{generated_document_id},For Conversation Id {conversation_id}',extra=extras)
                blob_client = self.container_client.get_blob_client(blob_name)
                document_bytes = blob_client.download_blob().readall()
                mime_type = (
                    blob.content_settings.content_type
                    if blob.content_settings and blob.content_settings.content_type
                    else "application/octet-stream"
                )

                full_filename = os.path.basename(blob_name)
                name_without_extension = os.path.splitext(full_filename)[0]
                extension = full_filename.split(".")[-1] if "." in full_filename else None


                extension = blob_name.split(".")[-1] if "." in blob_name else None
                logger.info(f'Document Downloaded From Blob',extra=extras)
                return {
                    "generated_document_name": name_without_extension,
                    "file_bytes": base64.b64encode(document_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "extension": extension
                }
        except Exception as e:
            print(e, extras)
            return None

    def get_uploaded_documents(self, conversation_id: str, user: str = None, current_date: str = None, filename: str = None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            import mimetypes
            documents_list = []

            # 1. Primary path: Query SQL Database (uploaded_files table) for high-speed single query retrieval
            try:
                from mainqueries import SQLFactory
                from tableModels import UploadedFile

                db_factory = SQLFactory()
                SessionMaker = db_factory.create_connection()
                if SessionMaker and SessionMaker != "DB NOT CONNECTED":
                    session = SessionMaker()
                    try:
                        query = session.query(UploadedFile).filter(UploadedFile.conv_id == conversation_id)
                        if filename:
                            query = query.filter(UploadedFile.filename.ilike(f"%{filename}%"))
                        records = query.order_by(UploadedFile.uploaded_at.asc()).all()

                        if records:
                            logger.info(f"Retrieved {len(records)} uploaded document(s) from SQL DB for conv_id: {conversation_id}", extra=extras)
                            for rec in records:
                                fn = rec.filename
                                name_wo_ext = os.path.splitext(fn)[0]
                                ext = fn.split(".")[-1] if "." in fn else None
                                m_type = mimetypes.guess_type(fn)[0] or "application/octet-stream"
                                file_b64 = base64.b64encode(rec.filedata).decode("utf-8") if rec.filedata else ""
                                u_date = rec.uploaded_at.strftime("%Y-%m-%d") if rec.uploaded_at else (current_date or "")
                                u_user = rec.username or user or ""

                                documents_list.append({
                                    "doc_id": rec.doc_id,
                                    "exceeds_threshold": bool(rec.exceeds_threshold),
                                    "document_name": name_wo_ext,
                                    "filename": fn,
                                    "file_bytes": file_b64,
                                    "mime_type": m_type,
                                    "extension": ext,
                                    "user": u_user,
                                    "upload_date": u_date
                                })
                            return documents_list
                    finally:
                        session.close()
            except Exception as db_err:
                logger.warning(f"SQL DB fetch for uploaded documents failed, falling back to Azure Blob: {db_err}", extra=extras)

            # 2. Fallback path: Azure Blob Storage (for legacy uploads before conv_id was persisted in uploaded_files)
            self.container_client = self.blob_service_client.get_container_client(self.INDEXER_FILE_CONTAINER_NAME)
            
            if user:
                prefix = f"{user}/{conversation_id}/"
                blobs = self.container_client.list_blobs(name_starts_with=prefix)
            else:
                blobs = self.container_client.list_blobs()

            for blob in blobs:
                blob_name = blob.name

                if blob_name.endswith("_metadata.json"):  # skip metadata files
                    continue

                if not user and f"/{conversation_id}/" not in f"/{blob_name}":
                    continue

                if current_date and f"/{current_date}/" not in blob_name:
                    continue

                if filename and filename.lower() not in blob_name.lower():
                    continue

                logger.info(f'Starting Download of Uploaded Document from Blob: {blob_name}', extra=extras)
                blob_client = self.container_client.get_blob_client(blob_name)
                document_bytes = blob_client.download_blob().readall()
                mime_type = (
                    blob.content_settings.content_type
                    if blob.content_settings and blob.content_settings.content_type
                    else "application/octet-stream"
                )

                full_filename = os.path.basename(blob_name)
                name_without_extension = os.path.splitext(full_filename)[0]
                extension = full_filename.split(".")[-1] if "." in full_filename else None

                parts = blob_name.split('/')
                extracted_user = parts[0] if len(parts) >= 4 else (user or "")
                extracted_date = parts[2] if len(parts) >= 4 else (current_date or "")

                documents_list.append({
                    "doc_id": None,
                    "exceeds_threshold": None,
                    "document_name": name_without_extension,
                    "filename": full_filename,
                    "file_bytes": base64.b64encode(document_bytes).decode("utf-8"),
                    "mime_type": mime_type,
                    "extension": extension,
                    "user": extracted_user,
                    "upload_date": extracted_date
                })

            logger.info(f'Extracted {len(documents_list)} uploaded document(s) from Blob for conversation_id: {conversation_id}', extra=extras)
            return documents_list
        except Exception as e:
            logger.exception(f"Get_uploaded_documents getting error: {e}", extra=extras)
            return None

