import time
import threading
import uuid
import os
import json
import base64
import logging
import tiktoken
import queue
from pii_masker import mask_pii
from embed_service import embed_openai
from db import SessionLocal, PDFChunk, UploadedFile, ParsedDocument, DocumentPIIAudit
from parsers import parse_docx, parse_txt, parse_xlsx, parse_csv, parse_pptx,parse_with_tika,parse_zip
from tabular_summarizer import generate_tabular_summary
from website_parser_common import ParserChunk
from exceptions import DocumentLimitException
logger = logging.getLogger("indexer")

audit_queue = queue.Queue()

def pii_audit_worker():
    while True:
        try:
            batch = []
            item = audit_queue.get()
            batch.append(item)
            
            while not audit_queue.empty() and len(batch) < 100:
                batch.append(audit_queue.get_nowait())
                
            session = SessionLocal()
            for record in batch:
                doc_audit = DocumentPIIAudit(
                    doc_id=record['doc_id'],
                    username=record['username'],
                    filename=record['filename'],
                    doc_pii_mapping=record['doc_pii_mapping'],
                    total_masked=record['total_masked'],
                    pii_type_counts=record['pii_type_counts']
                )
                session.add(doc_audit)
            session.commit()
            session.close()
            
            for _ in range(len(batch)):
                audit_queue.task_done()
                
        except Exception as e:
            logger.error(f"Error in PII audit background worker: {e}")

worker_thread = threading.Thread(target=pii_audit_worker, daemon=True)
worker_thread.start()

class IndexerService:
    """Handles parsing, chunking, embedding, and storing document data."""
    def __init__(self):
        self.openai_obj = embed_openai(os.getenv("OPENAI_API_TYPE"), os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"), os.getenv("OPENAI_EMBEDDING_MODEL"))
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.TOKEN_THRESHOLD = int(os.getenv("TOKEN_THRESHOLD", 15000))

    def count_tokens(self, text: str) -> int:
        if not text:
            return 0
        return len(self.tokenizer.encode(text))

    def store_chunks(self, doc_id, filename, parsed_data, conversation_id=None):
        total = 0
        session = SessionLocal()
        try:
            valid_contents = []
            valid_metadata = []
            for data in parsed_data:
                content = f"{data.get('sec_title', '')}\n{data.get('content', '')}".strip()
                if content:
                    valid_contents.append(content)
                    valid_metadata.append(data)
                    total += 1

            if not valid_contents:
                logger.info("No valid text content found to embed.")
                return 0

            BATCH_SIZE = 40
            
            logger.info(f"Processing {len(valid_contents)} chunks. Batching into groups of {BATCH_SIZE}...")
            
            for i in range(0, len(valid_contents), BATCH_SIZE):
                batch_contents = valid_contents[i : i + BATCH_SIZE]
                batch_metadata = valid_metadata[i : i + BATCH_SIZE]

                batch_embeddings = self.openai_obj.embed_text(batch_contents)

                if not batch_embeddings:
                    raise Exception(f"Failed to generate embeddings for batch starting at index {i}")

                for metadata, content, embedding in zip(batch_metadata, batch_contents, batch_embeddings):
                    chunk_row = PDFChunk(
                        doc_id=doc_id,
                        source=filename,
                        conv_id=conversation_id,
                        content=content,
                        embedding=embedding,
                    )
                    session.add(chunk_row)

                if i + BATCH_SIZE < len(valid_contents):
                    time.sleep(0.1)

            logger.info("Batch processing complete. Executing single bulk database commit...")
            session.commit()

        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
            
        return total
    
    def index_file(self, file_bytes, filename, conversation_id=None, user=None):
        """Parse file, store chunks or full document/summary, and save file metadata."""
        doc_id = str(uuid.uuid4())
        filename_lower = filename.lower()
        self.custom_parser = ParserChunk(filename_lower,filename_lower)
        parsed = None
        # --- IMAGE HANDLING ---
        if filename_lower.endswith((".png", ".jpg", ".jpeg")):
            logger.info(f"Storing image file: {filename}")
            session = SessionLocal()
            try:
                #Save in pdf_chunks table
                b64 = base64.b64encode(file_bytes).decode("ascii")
                image_b64 = PDFChunk(
                    doc_id=doc_id,
                    source=filename,
                    conv_id=conversation_id,
                    content=None,
                    image_data=b64,
                    embedding=None
                )
                session.add(image_b64)

                # Save in uploaded_files for metadata
                new_file = UploadedFile(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    conv_id=conversation_id,
                    filename=filename,
                    filedata=file_bytes,
                    exceeds_threshold=False,
                    username=user
                )
                session.add(new_file)
                session.commit()
            except Exception as e:
                session.rollback()
                raise
            finally:
                session.close()

            logger.info(f"Image stored: {filename}")
            return doc_id, 1, True , 0

        is_tabular = filename_lower.endswith((".csv", ".xlsx", ".xls"))

        try:
            if filename_lower.endswith(".pdf"):
                parsed = self.custom_parser.parse_and_chunk_pdf(file_bytes, filename_lower)
            elif filename_lower.endswith(".docx"):
                parsed = parse_docx(file_bytes, filename)
            elif filename_lower.endswith(".txt"):
                parsed = parse_txt(file_bytes, filename)
            elif filename_lower.endswith((".xlsx", ".xls")):
                parsed = parse_xlsx(file_bytes, filename)
            elif filename_lower.endswith(".csv"):
                parsed = parse_csv(file_bytes, filename)
            elif filename_lower.endswith(".pptx") or filename_lower.endswith(".ppt"):
                parsed = parse_pptx(file_bytes, filename)
            elif filename_lower.endswith(".zip"):
                parsed = parse_zip(file_bytes=file_bytes,filename=filename)
            else:
                try:
                    parsed = parse_with_tika(file_bytes, filename)
                except DocumentLimitException:
                    raise
                except Exception as e:
                    logger.warning(f"Unsupported file format: {filename}")
                    return None, 0, False , 0
        except DocumentLimitException:
            raise

        if not parsed:
            logger.warning(f"No text extracted from file: {filename},Trying with tika fall back")
            parsed = parse_with_tika(file_bytes, filename)
            if not parsed:
                logger.warning(f"No text extracted from file: {filename}")
                return None, 0, False , 0

        # Combine parsed pieces to evaluate total token count
        full_text_pieces = []
        for item in parsed:
            sec_title = item.get("sec_title", "")
            content = item.get("content", "")
            piece = f"{sec_title}\n{content}".strip() if sec_title else content.strip()
            if piece:
                full_text_pieces.append(piece)

        full_text = "\n\n".join(full_text_pieces)
        token_count = self.count_tokens(full_text)

        session = SessionLocal()
        try:
            doc_prefix = f"DOC_{doc_id[:8]}"
            ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
            PII_ALLOWED_ENV = os.getenv("PII_ALLOWED_ENV")
            masking_enabled = PII_ALLOWED_ENV and ENV_NAME and ENV_NAME in PII_ALLOWED_ENV

            if is_tabular and token_count > self.TOKEN_THRESHOLD:
                logger.info(
                    f"Tabular file ({filename}) token count ({token_count}) > {self.TOKEN_THRESHOLD}. "
                    "Routing to Automated Structural Summarization & Code Exploration mode (0 vector chunks)."
                )
                summary_text = generate_tabular_summary(file_bytes, filename)
                if masking_enabled:
                    masked_summary, pii_map, type_counts = mask_pii(summary_text, prefix=doc_prefix)
                else:
                    masked_summary, pii_map, type_counts = summary_text, {}, {}

                summary_tokens = self.count_tokens(masked_summary)
                parsed_doc = ParsedDocument(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    conv_id=conversation_id,
                    filename=filename,
                    content=masked_summary,
                    token_count=summary_tokens,
                    pii_mapping=json.dumps(pii_map) if pii_map else None,
                )
                session.add(parsed_doc)

                if pii_map:
                    try:
                        audit_queue.put({
                            'doc_id': doc_id,
                            'username': user,
                            'filename': filename,
                            'doc_pii_mapping': pii_map,
                            'total_masked': len(pii_map),
                            'pii_type_counts': type_counts
                        })
                    except Exception as e:
                        logger.error(f"Failed to enqueue Document PII Audit: {e}")

                # Always add binary file record to UploadedFile table
                new_file = UploadedFile(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    conv_id=conversation_id,
                    filename=filename,
                    filedata=file_bytes,
                    exceeds_threshold=False,
                    username=user
                )
                session.add(new_file)
                session.commit()

                logger.info(f"Tabular summary stored in parsed_documents for {filename} (summary tokens: {summary_tokens})")
                return doc_id, 1, False, summary_tokens

            elif token_count <= self.TOKEN_THRESHOLD:
                logger.info(f"Document token count ({token_count}) <= {self.TOKEN_THRESHOLD}. Storing as full parsed document.")
                if masking_enabled:
                    masked_text, pii_map, type_counts = mask_pii(full_text, prefix=doc_prefix)
                    logger.info(f"masked text : {masked_text[:100]}")
                else:
                    masked_text, pii_map, type_counts = full_text, {}, {}

                token_count = self.count_tokens(masked_text)
                parsed_doc = ParsedDocument(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    conv_id=conversation_id,
                    filename=filename,
                    content=masked_text,
                    token_count=token_count,
                    pii_mapping=json.dumps(pii_map) if pii_map else None,
                )
                session.add(parsed_doc)

                if pii_map:
                    try:
                        audit_queue.put({
                            'doc_id': doc_id,
                            'username': user,
                            'filename': filename,
                            'doc_pii_mapping': pii_map,
                            'total_masked': len(pii_map),
                            'pii_type_counts': type_counts
                        })
                    except Exception as e:
                        logger.error(f"Failed to enqueue Document PII Audit: {e}")

                new_file = UploadedFile(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    conv_id=conversation_id,
                    filename=filename,
                    filedata=file_bytes,
                    exceeds_threshold=False,
                    username=user
                )
                session.add(new_file)
                session.commit()

                logger.info(f"File stored in parsed_documents: {filename} (tokens: {token_count})")
                return doc_id, 1, False, token_count

            else:
                logger.info(f"General document token count ({token_count}) > {self.TOKEN_THRESHOLD}. Proceeding with chunking and embedding pipeline.")
                chunks_count = self.store_chunks(doc_id, filename, parsed, conversation_id)

                new_file = UploadedFile(
                    id=str(uuid.uuid4()),
                    doc_id=doc_id,
                    conv_id=conversation_id,
                    filename=filename,
                    filedata=file_bytes,
                    exceeds_threshold=True,
                    username=user
                )
                session.add(new_file)
                session.commit()

                logger.info(f"File indexed via chunking pipeline: {filename} ({chunks_count} chunks, tokens: {token_count})")
                return doc_id, chunks_count, True, token_count

        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()