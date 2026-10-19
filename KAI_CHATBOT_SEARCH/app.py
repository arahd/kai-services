from flask import Flask, jsonify, request,make_response
from datetime import datetime,timezone
from functools import wraps
from sqlalchemy import text
import os
import requests

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
SERVICE_NAME='KAI_AI_CHATBOT_SEARCH_SERVICE'
PROJECT_NAME='KAI'

from logger import logger,get_caller_frame,extras

logger.info(f"Environment:{ENV_NAME}", extra=extras)
properties = {'custom_dimensions': {'ENV': ENV_NAME}}

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
BUILD_VERSION = os.getenv('BUILD_VERSION',1)
APP_VERSION = os.getenv('APP_VERSION',1)
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

from smart_web_scraper import SmartWebScraper
from db import SessionLocal
from embeddings import get_embedding
app = Flask(__name__)

# Authorization token
AUTH_TOKEN = "token123"

smart_scrapper_obj = SmartWebScraper()
Auth_API_URl = os.getenv("AUTH_URL")
KAI_CHATBOT_DEV_USER = os.getenv('KAI_CHATBOT_DEV_USER','')

def require_auth(f):
    """Decorator to require token authorization"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check for Authorization header
        auth_header = request.headers.get('Authorization')
        
        if not auth_header:
            return jsonify({'error': 'Missing Authorization header'}), 401
        
        # Check if it's Bearer token format
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
        else:
            token = auth_header
        
        # Validate token
        if token != AUTH_TOKEN:
            return jsonify({'error': 'Invalid authorization token'}), 403
        
        return f(*args, **kwargs)
    
    return decorated_function


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
    response = requests.get(Auth_API_URl,headers={'Authorization': "Bearer "+Tok},data={'roles_required':roles_required})
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
                return func(*args, **kwargs)
        return wrapper
    return decorator


@app.route('/crawl', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def crawl():
    data = request.json or {}
    queries = data.get('queries', [])
    query = data.get('query', '')
    if query and not queries:
        queries = [query]
        
    allowed_domains = data.get('allowed_domains', None)
    restricted_domains = data.get('restricted_domains', None)
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        combined_result = {"augContent": "", "augSrc": [], "augTables": []}
        for q in queries:
            result = smart_scrapper_obj.fetch_context(question=q, allowed_domains=allowed_domains, restricted_domains=restricted_domains)
            if combined_result["augContent"]:
                combined_result["augContent"] += f"\n\n{result.get('augContent', '')}"
            else:
                combined_result["augContent"] = result.get('augContent', '')
                
            combined_result["augSrc"].extend(result.get("augSrc", []))
            if "augTables" in result:
                combined_result["augTables"].extend(result.get("augTables", []))
                
        get_aks_memory_usage()
        return jsonify(combined_result)
    except Exception as e:
        logger.exception(f'exception occured in search query for queries:{queries}',extra=extras)
        return {
                    "augContent": "No search results found. Please try a different question.",
                    "augSrc": [],
                    "augTables": []
                }



@app.route('/')
def home():
    return jsonify(response="Welcome to the FILE SEARCH API.",version=1.5)


@app.route('/memory')
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def get_memory():
    return get_aks_memory_usage()

def get_aks_memory_usage():
    try:
        # Try cgroups v2 first (newer K8s versions)
        with open('/sys/fs/cgroup/memory.current', 'r') as f:
            current = int(f.read())
        with open('/sys/fs/cgroup/memory.max', 'r') as f:
            limit_str = f.read().strip()
            limit = int(limit_str) if limit_str != 'max' else None
    except FileNotFoundError:
        try:
            # Fall back to cgroups v1
            with open('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'r') as f:
                current = int(f.read())
            with open('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'r') as f:
                limit = int(f.read())
        except FileNotFoundError:
            print("Cannot read cgroup memory stats")
            return None
    
    result = {
        'usage_bytes': current,
        'usage_mb': current / (1024**2),
        'usage_gb': current / (1024**3)
    }
    
    if limit:
        result['limit_bytes'] = limit
        result['limit_mb'] = limit / (1024**2)
        result['limit_gb'] = limit / (1024**3)
        result['usage_percent'] = (current / limit) * 100
    
    print(f"Memory Usage: {result['usage_mb']:.2f} MB")
    if 'limit_mb' in result:
        print(f"Memory Limit: {result['limit_mb']:.2f} MB")
        print(f"Usage: {result['usage_percent']:.2f}%")
    
    return result

# ---------------- /search ENDPOINT ----------------
@app.route('/search', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def search():
    """
    Perform semantic search on pdf_chunks table using pgvector.
    """
    payload = request.get_json(force=True)
    user_query = payload.get("userquery")
    conversation_id = payload.get("conversation_id")
    document_name = payload.get("document_name")

    if not user_query:
        return jsonify({"error": "Missing 'userquery' in request body"}), 400
    if not document_name:
        return jsonify({"error": "Missing 'document_name' in request body"}), 400

    result = run_search(user_query=user_query,conversation_id=conversation_id,document_name=document_name)
    return jsonify(result)


def run_search(user_query: str, conversation_id: str = None,document_name:str=None):
    """function to query pgvector and return top 5 results."""
    query_embedding = get_embedding(user_query)
    # Convert list → PostgreSQL vector string format
    query_embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
    text_results = []

    session = SessionLocal()

    text_results = None
    try:
        condition = document_name.split(".")[-1].lower() in ['csv','xlsx']
        if condition:
            limit = 300
        else:
            limit = 30
            
        if conversation_id:
            sql = text("""
                SELECT id, doc_id, source, content,
                    1 - (embedding <=> :query_emb) AS similarity
                FROM pdf_chunks
                WHERE conv_id = :conv_id AND embedding IS NOT NULL
                AND source = :source
                ORDER BY embedding <=> :query_emb
                LIMIT :limit
            """)
            params = {"query_emb": query_embedding_str, "conv_id": conversation_id,"source":document_name,"limit":limit}
        else:
            return {"augContent": "", "augSrc": [], "imageSrc": []}   # removed the old part because it searched for doc outside conv_id, normally it should not occur at all
        
        rows = session.execute(sql, params)
        text_results = rows.fetchall()

    except Exception as e:
        session.rollback()
        text_results = None
        image_results = None
        logger.exception(f"DB ERROR in /search endpoint :{ str(e)}", extra=extras)
    finally:
        session.close()

    if not text_results:
        return {"augContent": "", "augSrc": [], "imageSrc": []}

    markdown_blocks = list()
    augSrc = list()

    for i, r in enumerate(text_results, start=1):
        content_snippet = (r.content or "").strip()
        markdown_blocks.append(
            f"============================================================\n"
            f"File: {r.source}\n"
            f"Content Snippet:\n{content_snippet}\n"
            f"============================================================\n"
        )

        augSrc.append({
            f"context_{i}": r.content or "",
            "source": r.source or "",
            "type": "file_search"
        })

    # Combine markdown blocks with header
    markdown_summary = (
        f"Listed Below are the fetched chunks ranked based on your query :{user_query}"
        + "\n\n".join(markdown_blocks)
        if markdown_blocks else ""
    ) 

    #final out
    return {
        "augContent": markdown_summary,
        "augSrc": augSrc,
        "imageSrc": []
    }

# ---------------- /search ENDPOINT ----------------
@app.route('/restricted-search', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def fetch_document():
    """
    Perform semantic search on pdf_chunks table using pgvector.
    """
    payload = request.get_json(force=True)
    user_query = payload.get("userquery",None)
    conversation_id = payload.get("conversation_id",None)
    document_scope = payload.get("uploaded_document_ids",None)
    
    if not conversation_id:
        return jsonify({"error": "Missing 'conversation_id' in request body"}), 400
    if not document_scope:
        return jsonify({"error": "Missing 'document_scope' in request body"}), 400
    elif len(document_scope)==0:
        return jsonify({"error": "'document_scope' is empty in request body"}), 400
    elif len(document_scope)>=3:
        document_scope=document_scope[:3]
    

    result = run_fetch_document(user_query,conversation_id,document_scope)
    return jsonify(result)




def run_fetch_document(user_query: str, conversation_id: str = None, doc_ids: list[str] = list()):
    """
    Returns a single Chunk for each document
    """
    try:
        # CHANGE: This now returns empty if doc_ids is missing OR empty
        if not doc_ids: 
            return {"augContent": "", "augSrc": [], "imageSrc": []}
        
        image_results = []
        text_results = []
        session = SessionLocal()
        text_results = None
        image_results = None
        try:
                # --- Text Query: Exactly 1 chunk per unique doc_id ---
                # DISTINCT ON (doc_id) ensures we get one row per document.
                # ORDER BY doc_id, id ASC ensures we get the first chunk of that document.
            text_sql = text("""
                SELECT DISTINCT ON (doc_id) 
                    id, doc_id, source, content
                FROM pdf_chunks
                WHERE embedding IS NOT NULL
                AND doc_id = ANY(:doc_ids)
                AND (:conv_id IS NULL OR conv_id = :conv_id)
                ORDER BY doc_id, id ASC
            """)
            
            params = {
                "doc_ids": doc_ids,
                "conv_id": conversation_id
            }

            rows = session.execute(text_sql, params)
            text_results = rows.fetchall()

            # --- Image Query: Exactly 1 image per unique doc_id ---
            img_sql = text("""
                SELECT DISTINCT ON (doc_id) 
                    id, doc_id, source, image_data
                FROM pdf_chunks
                WHERE embedding IS NULL 
                AND image_data IS NOT NULL
                AND doc_id = ANY(:doc_ids)
                AND (:conv_id IS NULL OR conv_id = :conv_id)
                ORDER BY doc_id, id ASC
            """)
            
            image_rows = session.execute(img_sql, params)
            image_results = image_rows.fetchall()
            
        except Exception as e:
            session.rollback()
            logger.exception(f"DB ERROR in /restricted_search endpoint operation: {str(e)}", extra=extras)
            text_results = []
            image_results = []
        finally:
            session.close()

        if not text_results and not image_results:
            return {"augContent": "", "augSrc": [], "imageSrc": []}

        markdown_blocks = []
        augSrc = []
        
        # Format the text results (one per file)
        for i, r in enumerate(text_results, start=1):
            content_snippet = (r.content or "").strip()
            markdown_blocks.append(
                f"============================================================\n"
                f"File: {r.source}\n"
                f"Content Snippet:\n{content_snippet}\n"
                f"============================================================"
            )
            augSrc.append({
                f"context_{i}": r.content or "",
                "source": r.source or "",
                 "type": "file_search"
            })

        markdown_summary = "Here is information gathered from the uploaded file:\n\n" + "\n\n".join(markdown_blocks)
        imageContent = [img.image_data for img in image_results]
        imageSrc = [img.source for img in image_results]

        return {
            "augContent": markdown_summary,
            "augSrc": augSrc,
            "imageSrc": imageSrc,
            "imageContent":imageContent
        }
            
    except Exception as e:
        logger.info(f"Unknown Exception, when fetching documents in /fetch_documents endpoint, doc_id :{doc_ids}, Exception :{e}", extra=extras)
        return {"augContent": "", "augSrc": [], "imageSrc": [],"imageContent":[]}
    
# ---------------- /image-fetch ENDPOINT ----------------
@app.route('/image-fetch', methods=['POST'])
@requires_authorization(roles_required=[KAI_CHATBOT_DEV_USER])
def fetch_image():
    """
    Perform semantic search on pdf_chunks table using pgvector.
    """
    payload = request.get_json(force=True)
    image_name = payload.get("image_name",None)
    conversation_id = payload.get("conversation_id",None)
    
    if not conversation_id:
        return jsonify({"error": "Missing 'conversation_id' in request body"}), 400
    if not image_name:
        return jsonify({"error": "'image_name' is empty in request body"}), 400

    result = run_fetch_image(image_name=image_name,conversation_id=conversation_id)

    return jsonify(result)


def run_fetch_image(image_name: str, conversation_id: str = ''):
    """
    Returns a single Chunk for each document
    """
    try:
        # CHANGE: This now returns empty if doc_ids is missing OR empty
        if image_name=='': 
            return {"image_name":None,"imageSrc":None}
        
        image_results = []
        session = SessionLocal()
        image_results = None
        try:
            # --- Image Query: Exactly 1 image per unique doc_id ---
            img_sql = text("""
                SELECT id, doc_id, source, image_data
                FROM pdf_chunks
                WHERE embedding IS NULL 
                AND image_data IS NOT NULL
                AND source = :source
                AND (:conv_id IS NULL OR conv_id = :conv_id)
                LIMIT 1
            """)

            params = {
                "source": image_name,
                "conv_id": conversation_id
            }
            
            image_rows = session.execute(img_sql, params)
            image_results = image_rows.first()
            
        except Exception as e:
            session.rollback()
            logger.exception(f"DB ERROR in /fetch_image endpoint operation: {str(e)}", extra=extras)

            image_results = None
        finally:
            session.close()

        if not image_results:
            return {"image_name":None,"imageSrc":None}

        markdown_blocks = []
        augSrc = []

        imageSrc = image_results.image_data

        filenames = image_results.source

        return {
            "image_name": filenames,
            "imageSrc": imageSrc
        }
            
    except Exception as e:
        logger.info(f"Unknown Exception, when fetching documents in /fetch_image endpoint, image_name :{image_name}, Exception :{e}", extra=extras)
        return {"image_name":None,"imageSrc":None}
        
@app.teardown_request
def force_run_garbage_collector(exception=None):
    import gc
    gc.collect()

if __name__ == "__main__":
    app.run()