import os
from datetime import datetime, timezone

from azure.storage.blob import BlobServiceClient

from logger import logger, get_caller_frame

SERVICE_NAME='KAI_AI_CHATBOT_INDEXER_SERVICE'
PROJECT_NAME='KAI'


class Azure_blob:

    def __init__(self) -> None:

        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'KAI'
        }

        self.AZURE_STORAGE_CONNECTION_STRING = os.environ.get(
            'DATA_LAKE_CONNECTION_STRING',
            None
        )

        logger.info(
            f"Azure Connection String Fetch Test : "
            f"Type : {type(self.AZURE_STORAGE_CONNECTION_STRING)}",
            extra=extras
        )

        self.blob_service_client = (
            BlobServiceClient.from_connection_string(
                self.AZURE_STORAGE_CONNECTION_STRING
            )
        )

        self.CONTAINER_NAME = os.getenv('INDEXER_FILE_CONTAINER_NAME', None)

        logger.info(f"INDEXER_FILE_CONTAINER_NAME fetch test : "f"Type : {type(self.CONTAINER_NAME)}",extra=extras)

        self.container_client = (
            self.blob_service_client.get_container_client(
                self.CONTAINER_NAME
            )
        )

    def upload_file(
        self,
        file_content,
        filename,
        conversation_id,
        user
    ):

        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'KAI'
        }

        try:
            current_date = datetime.now(timezone.utc).date()
            blob_path = (f"{user}/"f"{conversation_id}/"f"{current_date}/"f"{filename}" )
            logger.info(f"Starting Upload of File to Blob : "f"{blob_path}",extra=extras)
            blob_client = (
                self.container_client.get_blob_client(
                    blob_path
                )
            )
            blob_client.upload_blob(
                file_content,
                overwrite=True
            )
            logger.info(f"File Uploaded Successfully to Blob : "f"{blob_path}",extra=extras)
            return blob_path

        except Exception as e:
            logger.exception(
                f"Exception occurred while uploading "
                f"file to Azure Blob : {e}",
                extra=extras
            )

            return None