import os
import re
import base64
import logging
import httpx
from typing import Dict, Any, List, Optional

logger = logging.getLogger("sandbox_executor")

SERVICE_NAME = 'KAI_CHATBOT_CONVERSATION_SERVICE'
PROJECT_NAME = 'KAI'

class HyperlightSandboxExecutor:
    """
    Client for the Hyperlight Sandboxed Code Interpreter microservice.
    Fetches required session file payloads in-memory, passes code execution requests to the 
    KAI_CODE_INTERPRETER microservice over REST API, and returns execution stdout/stderr and generated assets.
    """
    def __init__(self):
        self.service_url = os.getenv("CODE_INTERPRETER_SERVICE_URL")

    def clean_code_block(self, raw_code: str) -> str:
        """Strips markdown code fences (```python ... ```) and normalizes workspace file paths."""
        code = raw_code.strip()
        if code.startswith("```"):
            code = re.sub(r"^```(?:python)?\s*", "", code, flags=re.IGNORECASE)
            code = re.sub(r"\s*```$", "", code)
        code = code.strip()
        code = re.sub(r"(['\"])(?:\./)?workspace/([^'\"]+)(['\"])", r"\1\2\3", code)
        return code

    def fetch_file_payloads(
        self, 
        conv_id: str, 
        uploaded_filenames: Optional[List[str]] = None, 
        blob_object: Optional[Any] = None
    ) -> List[Dict[str, str]]:
        """
        Retrieves binary content of uploaded spreadsheet files from SQL Database (uploaded_files table)
        or Azure Blob Storage directly in-memory, converting them to base64 payloads for the execution API.
        """
        files_payload = []
        if not uploaded_filenames:
            return files_payload

        for fname in uploaded_filenames:
            fname_clean = os.path.basename(str(fname).strip())
            file_bytes = None

            # 1. Attempt to fetch binary content from SQL Database (UploadedFile table)
            try:
                from tableModels import Session, UploadedFile
                session = Session()
                db_file = session.query(UploadedFile).filter(
                    UploadedFile.filename == fname_clean
                ).order_by(UploadedFile.uploaded_at.desc()).first()
                if db_file and db_file.filedata:
                    file_bytes = db_file.filedata
                session.close()
            except Exception as db_err:
                logger.warning(f"Could not query UploadedFile from DB for '{fname_clean}': {db_err}")

            # 2. Fallback: Fetch binary content from Azure Blob Storage
            if not file_bytes and blob_object and hasattr(blob_object, 'get_uploaded_file'):
                try:
                    file_bytes = blob_object.get_uploaded_file(conversation_id=conv_id, filename=fname_clean)
                except Exception as blob_err:
                    logger.warning(f"Could not fetch '{fname_clean}' from Blob Storage: {blob_err}")

            if file_bytes:
                b64_str = base64.b64encode(file_bytes).decode("utf-8")
                files_payload.append({
                    "filename": fname_clean,
                    "content_b64": b64_str
                })
                logger.info(f"Successfully prepared in-memory payload for file '{fname_clean}' in session '{conv_id}'")
            else:
                logger.warning(f"Could not retrieve file content for '{fname_clean}' in session '{conv_id}'")

        return files_payload

    def execute_python_code(
        self, 
        conv_id: str, 
        code: str, 
        uploaded_filenames: Optional[List[str]] = None, 
        blob_object: Optional[Any] = None, 
        aug_tables: Optional[List[Dict[str, str]]] = None,
        timeout: int = 60
    ) -> Dict[str, Any]:
        """
        Executes Python code inside the Hyperlight sandbox microservice.
        Captures stdout, stderr, exit code, and generated plot/data assets entirely in memory.
        """
        logger.info(f"Invoking Hyperlight Sandbox Microservice at {self.service_url} for session {conv_id}")
        files_payload = self.fetch_file_payloads(conv_id=conv_id, uploaded_filenames=uploaded_filenames, blob_object=blob_object)
        
        if aug_tables:
            for tbl in aug_tables:
                csv_content = tbl.get("csv_content", "")
                table_id = tbl.get("table_id", "web_table")
                if csv_content:
                    b64_str = base64.b64encode(csv_content.encode("utf-8")).decode("utf-8")
                    files_payload.append({
                        "filename": f"{table_id}.csv",
                        "content_b64": b64_str
                    })

        cleaned_code = self.clean_code_block(code)

        payload = {
            "code": cleaned_code,
            "conv_id": conv_id,
            "files": files_payload,
            "timeout": timeout
        }

        try:
            endpoint = f"{self.service_url.rstrip('/')}/api/v1/execute"
            with httpx.Client(timeout=timeout + 5) as client:
                res = client.post(endpoint, json=payload)
                
            if res.status_code == 200:
                data = res.json()
                return {
                    "stdout": data.get("stdout", ""),
                    "stderr": data.get("stderr", ""),
                    "exit_code": data.get("exit_code", 0),
                    "success": data.get("success", False),
                    "generated_images": data.get("generated_images", []),
                    "generated_data_files": data.get("generated_data_files", [])
                }
            else:
                error_msg = f"Code Interpreter microservice returned HTTP {res.status_code}: {res.text}"
                logger.error(error_msg)
                return {
                    "stdout": "",
                    "stderr": error_msg,
                    "exit_code": 1,
                    "success": False,
                    "generated_images": [],
                    "generated_data_files": []
                }

        except Exception as http_err:
            error_msg = f"Error calling Sandbox Microservice: {http_err}"
            logger.error(error_msg)
            return {
                "stdout": "",
                "stderr": error_msg,
                "exit_code": 1,
                "success": False,
                "generated_images": [],
                "generated_data_files": []
            }

