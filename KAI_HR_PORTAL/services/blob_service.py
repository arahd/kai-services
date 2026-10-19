import os
import json
import logging
from datetime import datetime, timezone
from pathlib import PurePosixPath
from azure.storage.blob import BlobServiceClient, ContentSettings
from io import BytesIO
import uuid
logger = logging.getLogger(__name__)
RES_BUILD = os.getenv("RESUME_BUILDER_CONTAINER_NAME")
print("resume builder print sucessfully",RES_BUILD)

def save_resume_pdf_to_blob(file_bytes: bytes, candidate: str) -> str:
    """
    Save generated resume PDF to blob storage with unique file name
    """
    try:
        # Folder date (for grouping)
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Clean candidate name
        def safe(s):
            return str(s).replace(" ", "_").replace("/", "-")

        # Unique ID (timestamp + short UUID)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        uid = uuid.uuid4().hex[:6]

        # Final file name
        file_name = f"{safe(candidate)}_{timestamp}_{uid}.pdf"

        # Blob path
        blob_key = str(PurePosixPath(
            RES_BUILD,
            date_str,
            file_name
        ))

        # Upload to blob
        blob_client = get_client(blob_key)
        logger.info(f"Uploading resume PDF: {blob_key} for candidate: {candidate}")
        
        blob_client.upload_blob(
            file_bytes,
            overwrite=True,
            content_settings=ContentSettings(content_type="application/pdf")
        )
        
        logger.info(f"Resume PDF uploaded successfully: {blob_key}")
        return blob_key
    
    except Exception as e:
        logger.error(f"Failed to upload resume PDF for {candidate}: {str(e)}", exc_info=True)
        raise




def save_resume_docx_to_blob(file_bytes: bytes, candidate: str) -> str:
    """
    Save generated resume DOCX to blob storage with unique file name
    """
    try:
        # Folder date (for grouping)
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # Clean candidate name
        def safe(s):
            return str(s).strip().replace(" ", "_").replace("/", "-").replace("\\", "-")

        # Unique ID (timestamp + short UUID)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        uid = uuid.uuid4().hex[:6]

        # Final file name
        file_name = f"{safe(candidate)}_{timestamp}_{uid}.docx"

        # Blob path
        blob_key = str(PurePosixPath(
            RES_BUILD,
            date_str,
            file_name
        ))

        # Upload to blob
        blob_client = get_client(blob_key)
        logger.info(f"Uploading resume DOCX: {blob_key} for candidate: {candidate}")

        blob_client.upload_blob(
            file_bytes,
            overwrite=True,
            content_settings=ContentSettings(
                content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            )
        )

        logger.info(f"Resume DOCX uploaded successfully: {blob_key}")
        return blob_key

    except Exception as e:
        logger.error(f"Failed to upload resume DOCX for {candidate}: {str(e)}", exc_info=True)
        raise



def download_blob_as_bytes(blob_key: str):

    blob_client = get_client(blob_key)

    stream = blob_client.download_blob()
    data = stream.readall()

    logger.info(f"Blob Size : {len(data)} bytes")
    logger.info(f"First 20 Bytes : {data[:20]}")

    return BytesIO(data)

def get_blob_service():
    conn_str = os.getenv("DATA_LAKE_CONNECTION_STRING")

    if not conn_str:
        raise ValueError("❌ DATA_LAKE_CONNECTION_STRING is not set")

    return BlobServiceClient.from_connection_string(conn_str)


def get_client(blob_key: str):
    blob_service = get_blob_service()
    container = os.getenv("HR_BLOB_CONTAINER")

    print("Container =", container)
    print("Blob Key =", blob_key)

    return blob_service.get_blob_client(
        container=container,
        blob=blob_key
    )


def save_to_blob(data: dict, candidate: str, role: str, current_user: str) -> str:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    safe = lambda s: s.replace(" ", "_").replace("/", "-")

    folder = str(PurePosixPath(
        date_str,
        safe(current_user),
        f"{safe(candidate)}_{safe(role)}"
    ))

    blob_key = f"{folder}/{data['request_id']}.json"

    get_client(blob_key).upload_blob(
        json.dumps(data, indent=2),
        overwrite=True,
        content_settings=ContentSettings(content_type="application/json"),
    )

    return blob_key


def load_from_blob(blob_key: str) -> dict:
    raw = get_client(blob_key).download_blob().readall()
    return json.loads(raw)



def get_blob_bytes(blob_key: str) -> bytes:
    print("Downloading Blob:", blob_key)
    print("Container:", os.getenv("HR_BLOB_CONTAINER"))
    blob_client = get_client(blob_key)
    return blob_client.download_blob().readall()
