from flask import Blueprint, json, request, jsonify,make_response
from datetime import datetime,timezone
from functools import wraps
from indexer_service import IndexerService
from azure_blob_service import Azure_blob
from config import MAX_FILE_SIZE_BYTES
from sqlalchemy import text as sql_text
from db import SessionLocal
import os
from http_client import http_client
from logger import logger,get_caller_frame
from exceptions import DocumentLimitException
bp = Blueprint("routes", __name__)
indexer_service = IndexerService()
blob_service = Azure_blob()

SERVICE_NAME='KAI_AI_CHATBOT_INDEXER_SERVICE'
PROJECT_NAME='KAI'

Auth_API_URl = os.getenv("AUTH_URL")
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')
KAI_CHATBOT_DEV_ADMIN = os.getenv('KAI_CHATBOT_DEV_ADMIN','')

def validate_bearer_token(bearer_token,roles_required):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    if not bearer_token:
        return make_response(jsonify(error="Token Missing"),401)
    Tok   = bearer_token.split()[1]
    logger.info(f'received token:{Tok},roles_required:{roles_required}',extra=extras)
    response = http_client.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok},data={'roles_required':roles_required},raise_on_error=False)
    logger.info(f'Extractor_Token : response received from validate_bearer_token : {response.status_code},{response.text}',extra=extras)
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return response

def requires_authorization(roles_required=[]):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            bearer_token = request.headers.get('Authorization')
            result =  validate_bearer_token(bearer_token,roles_required)
            if result.status_code == 409:
                    return jsonify({"error": "Session Expired"}), 409
            if result.status_code != 200:
          #  if not bearer_token or not validate_bearer_token(bearer_token):
                return make_response(jsonify(error= "Unauthorized access"), 401)
            else:
                # You can use custom_param here
                # For example: print(f"Custom param: {custom_param}")
                response_content = json.loads(result.content)
                #checking if any of the user's groups match the required roles
                user_groups = response_content.get("groups", [])
                if roles_required:
                    if not any(role in user_groups for role in roles_required):
                        return make_response(
                            jsonify(error="Unauthorized access"),
                            401
                        )
                auth_info = {'current_user':response_content.get('current_user',''),'user_roles':response_content.get('roles',None)}
                return func(auth_info,*args, **kwargs)
        return wrapper
    return decorator

@bp.route("/indexer", methods=["POST"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def indexer(auth_info):
    """Handles file uploads and indexing."""
    files = request.files.getlist("files")
    conversation_id = request.form.get("conversation_id")
    user = auth_info.get('current_user')
    
    if not files:
        return jsonify(error="No files uploaded"), 400

    stored_files, files_with_doc_ids, total_chunks = [], [], 0

    for file in files:
        content = file.read()
        blob_service.upload_file(
            file_content=content,
            filename=file.filename,
            conversation_id = request.form.get("conversation_id").strip('"'),
            user=user
        )
        if len(content) > MAX_FILE_SIZE_BYTES:
            return jsonify({
                                "error": f"File '{file.filename}' exceeds the allowed size limit of {MAX_FILE_SIZE_BYTES / (1024 * 1024):.2f} MB."
                            }), 413
        try:
            result = indexer_service.index_file(
                content,
                file.filename,
                conversation_id=conversation_id,
                user=user
            )
            if result:
                if len(result) == 4:
                    doc_id, chunks_count, exceeds_threshold, token_count = result
                else:
                    doc_id, chunks_count = result[0], result[1]
                    exceeds_threshold, token_count = True, 0

                if doc_id:
                    files_with_doc_ids.append({
                        "filename": file.filename,
                        "doc_id": doc_id,
                        "exceeds_threshold": exceeds_threshold,
                        "token_count": token_count,
                        "chunks_count": chunks_count
                    })
                    stored_files.append(file.filename)
                    total_chunks += chunks_count
        except DocumentLimitException as e:
            return jsonify({
        "error": str(e)
    }), 413
        except Exception as e:
            print(f"Error processing {file.filename}: {e}")

    if not stored_files:
        return jsonify(error="No valid text extracted from uploaded files"), 400

    return jsonify(
        message=f"{len(stored_files)} file(s) indexed successfully",
        files_indexed=files_with_doc_ids,
        total_chunks=total_chunks,
    )

@bp.route("/delete/<doc_id>", methods=["DELETE"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def delete_doc(auth_info, doc_id):
    """Delete file, chunk records, and parsed document records by doc_id."""
    try:
        with SessionLocal() as session:
            # Perform deletions directly and capture rowcounts
            r1 = session.execute(sql_text(
                "SELECT count(*) FROM uploaded_files WHERE doc_id=:doc_id"
            ), {"doc_id": doc_id})
            r2 = session.execute(sql_text(
                "SELECT count(*) FROM pdf_chunks WHERE doc_id=:doc_id"
            ), {"doc_id": doc_id})
            r3 = session.execute(sql_text(
                "SELECT count(*) FROM parsed_documents WHERE doc_id=:doc_id"
            ), {"doc_id": doc_id})

            files_count, chunks_count, parsed_docs_count = r1.scalar_one(), r2.scalar_one(), r3.scalar_one()

            if files_count == 0 and chunks_count == 0 and parsed_docs_count == 0:
                return jsonify(error="doc_id not found"), 404

            # Perform deletions
            session.execute(sql_text(
                "DELETE FROM uploaded_files WHERE doc_id=:doc_id"
            ), {"doc_id": doc_id})
            session.execute(sql_text(
                "DELETE FROM pdf_chunks WHERE doc_id=:doc_id"
            ), {"doc_id": doc_id})
            session.execute(sql_text(
                "DELETE FROM parsed_documents WHERE doc_id=:doc_id"
            ), {"doc_id": doc_id})
            session.commit()

            return jsonify(
                message="Deleted chunks, parsed documents & files",
                doc_id=doc_id,
                deleted_chunks=int(chunks_count),
                deleted_parsed_docs=int(parsed_docs_count),
            )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify(error=str(e)), 500

@bp.route("/cleanup-old-records", methods=["DELETE"])
@requires_authorization(roles_required=[])
def cleanup_old_records(auth_info):

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    try:
        with SessionLocal() as session:
            # Delete related records from pdf_chunks first
            delete_pdf_chunks = session.execute(sql_text("""
                DELETE FROM pdf_chunks
                WHERE doc_id IN (
                    SELECT doc_id
                    FROM uploaded_files
                    WHERE uploaded_at < CURRENT_DATE - INTERVAL '60 days'
                );
            """))
            # Delete related records from parsed_documents
            delete_parsed_documents = session.execute(sql_text("""
                DELETE FROM parsed_documents
                WHERE doc_id IN (
                    SELECT doc_id
                    FROM uploaded_files
                    WHERE uploaded_at < CURRENT_DATE - INTERVAL '60 days'
                );
            """))
            # Delete old records from uploaded_files
            delete_uploaded_files = session.execute(sql_text("""
                DELETE FROM uploaded_files
                WHERE uploaded_at < CURRENT_DATE - INTERVAL '60 days';
            """))
            session.commit()
            logger.info("Old uploaded_files records deleted successfully",extra=extras)
            return jsonify({
                "message": "Old uploaded_files, pdf_chunks, and parsed_documents records deleted successfully",
                "deleted_uploaded_files": delete_uploaded_files.rowcount,
                "deleted_pdf_chunks": delete_pdf_chunks.rowcount,
                "deleted_parsed_documents": delete_parsed_documents.rowcount
            }), 200

    except Exception as e:
        logger.exception(
            f"Error deleting old uploaded_files records : {e}",
            extra=extras
        )
        return jsonify({"error": "Failed to delete old records"}), 500

@bp.route("/parsed-documents/conversation/<conv_id>", methods=["GET"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_parsed_documents_by_conversation(auth_info, conv_id):
    """Retrieve all full parsed documents associated with a conversation_id."""
    try:
        with SessionLocal() as session:
            rows = session.execute(sql_text(
                "SELECT doc_id, conv_id, filename, content, token_count, pii_mapping, created_at FROM parsed_documents WHERE conv_id=:conv_id AND is_deleted=False ORDER BY created_at ASC"
            ), {"conv_id": conv_id}).mappings().all()

            documents = [dict(row) for row in rows]
            return jsonify({
                "conversation_id": conv_id,
                "count": len(documents),
                "documents": documents
            }), 200
    except Exception as e:
        logger.exception(f"Error fetching parsed documents for conversation {conv_id}: {e}")
        return jsonify(error=str(e)), 500

@bp.route("/parsed-documents/document/<doc_id>", methods=["GET"])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_parsed_document_by_doc_id(auth_info, doc_id):
    """Retrieve full parsed document content by doc_id."""
    try:
        with SessionLocal() as session:
            row = session.execute(sql_text(
                "SELECT doc_id, conv_id, filename, content, token_count, pii_mapping, created_at FROM parsed_documents WHERE doc_id=:doc_id AND is_deleted=False"
            ), {"doc_id": doc_id}).mappings().first()

            if not row:
                return jsonify(error="Parsed document not found"), 404

            return jsonify(dict(row)), 200
    except Exception as e:
        logger.exception(f"Error fetching parsed document {doc_id}: {e}")
        return jsonify(error=str(e)), 500
    
# def delete_doc(doc_id):
#     """Soft delete chunk records by doc_id (sets is_deleted=True)."""
#     try:
#         with SessionLocal() as session:
#             # Check if the doc_id exists in pdf_chunks
#             r = session.execute(sql_text(
#                 "SELECT count(*) FROM pdf_chunks WHERE doc_id = :doc_id"
#             ), {"doc_id": doc_id})
#             chunks_count = r.scalar_one()

#             if chunks_count == 0:
#                 return jsonify(error="doc_id not found in pdf_chunks"), 404

#             # Perform soft delete: mark records as deleted
#             session.execute(sql_text("""
#                 UPDATE pdf_chunks 
#                 SET is_deleted = TRUE 
#                 WHERE doc_id = :doc_id
#             """), {"doc_id": doc_id})

#             session.commit()

#             return jsonify(
#                 message="deleted chunks",
#                 doc_id=doc_id,
#                 deleted_chunks=int(chunks_count),
#             ), 200

#     except Exception as e:
#         import traceback
#         traceback.print_exc()
#         return jsonify(error=str(e)), 500


# import time
# from io import BytesIO
# from flask import request, jsonify, make_response
# import pypdf  # Standard library for parsing PDFs [1.2.6]

# @bp.route("/test_embed_pdf", methods=["POST"]) # Maintain your existing decorator if needed
# def test_embed_pdf():
#     """
#     Accepts a 100+ page PDF upload, extracts page text,
#     batches pages, and tests the optimized embed_text method.
#     """
#     if 'file' not in request.files:
#         return jsonify({"error": "Missing 'file' field in multipart/form-data payload"}), 400
        
#     pdf_file = request.files['file']
#     if pdf_file.filename == '':
#         return jsonify({"error": "Empty file name"}), 400
        
#     try:
#         start_time = time.time()
        
#         # 1. Read PDF in-memory to avoid saving local files [1.2.6]
#         pdf_bytes = pdf_file.read()
#         pdf_reader = pypdf.PdfReader(BytesIO(pdf_bytes))
#         total_pages = len(pdf_reader.pages)
        
#         # 2. Extract text page-by-page [1.2.6]
#         # (Each page behaves as an individual text chunk)
#         raw_chunks = []
#         for page_num in range(total_pages):
#             page = pdf_reader.pages[page_num]
#             text = page.extract_text()
#             if text:
#                 # Clean up whitespace slightly
#                 cleaned_text = " ".join(text.split())
#                 if cleaned_text:
#                     raw_chunks.append(cleaned_text)
                    
#         if not raw_chunks:
#             return jsonify({"error": "No extractable text was found inside the PDF"}), 400
            
#         # 3. Instantiate your embedding service class
#         # (Replace with your actual class instantiation logic)
#         embedding_service = embed_openai(os.getenv("OPENAI_API_TYPE"), os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"), os.getenv("OPENAI_EMBEDDING_MODEL"))
        
#         # 4. Group the text chunks into batches of 100 
#         BATCH_SIZE = 100
#         batches = [raw_chunks[i:i + BATCH_SIZE] for i in range(0, len(raw_chunks), BATCH_SIZE)]
        
#         all_embeddings = []
        
#         # 5. Process each batch through your updated function
#         for idx, batch_data in enumerate(batches):
#             # Call your optimized method passing the entire list of strings
#             batch_result = embedding_service.embed_text(batch_data)
            
#             if batch_result is None:
#                 return jsonify({
#                     "error": f"Embedding failed on batch {idx + 1} of {len(batches)}. Check console logs."
#                 }), 500
                
#             all_embeddings.extend(batch_result)
            
#         elapsed_time = time.time() - start_time
        
#         # Return summary stats to confirm it processed without triggering 429 limits
#         return jsonify({
#             "message": "PDF parsed and embedded successfully",
#             "filename": pdf_file.filename,
#             "total_pages": total_pages,
#             "total_chunks_processed": len(raw_chunks),
#             "batches_sent_to_api": len(batches),
#             "embeddings_generated": len(all_embeddings),
#             "embedding_dimension": len(all_embeddings[0]) if all_embeddings else 0,
#             "execution_time_seconds": round(elapsed_time, 2)
#         }), 200
        
#     except Exception as e:
#         return jsonify({
#             "error": "An exception occurred during PDF processing",
#             "detail": str(e)
#         }), 500