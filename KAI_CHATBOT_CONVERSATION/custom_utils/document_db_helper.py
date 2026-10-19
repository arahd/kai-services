import json
from sqlalchemy import or_
from logger import logger, get_caller_frame
from tableModels import Session, ParsedDocument

SERVICE_NAME = "KAI_CHATBOT_CONVERSATIONAL_SERVICE"
PROJECT_NAME = "KAI"

def budget_and_fetch_uploaded_docs(
    uploaded_docs: list = None,
    uploaded_doc_ids: list = None,
    uploaded_filenames: list = None,
    exceeds_threshold=None,
    existing_docs: list = None,
    existing_doc_ids: list = None,
    existing_filenames: list = None,
    existing_threshold=None,
    conv_id: str = None
) -> tuple[list[dict], list[str], list[str]]:
    """
    Process current and existing turn uploaded documents based on indexer threshold classification:
    - Documents with `exceeds_threshold == False` were NOT chunked in vector DB; their full text or
      structural summary is stored in `parsed_documents` SQL table. They are fetched from DB and injected
      directly into the LLM system prompt.
    - Documents with `exceeds_threshold == True` WERE chunked in vector DB. They are routed to
      vector search RAG microservice / tool calling.

    Returns:
        (direct_docs, rag_doc_ids, rag_filenames)
        - direct_docs: list of dicts [{'doc_id': str, 'filename': str, 'content': str, 'token_count': int}]
        - rag_doc_ids: list of doc_ids assigned to Vector Search (RAG)
        - rag_filenames: list of filenames assigned to Vector Search (RAG)
    """
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }

    def _normalize_group(docs, doc_ids_list, filenames_list, thresh):
        norm = []
        if docs and isinstance(docs, list) and len(docs) > 0 and isinstance(docs[0], dict):
            for d in docs:
                norm.append({
                    "doc_id": d.get("doc_id"),
                    "filename": d.get("filename", d.get("file_name", "")),
                    "exceeds_threshold": d.get("exceeds_threshold", False),
                    "token_count": d.get("token_count", 0)
                })
        else:
            ids = doc_ids_list if isinstance(doc_ids_list, list) else []
            fnames = filenames_list if isinstance(filenames_list, list) else []
            
            if isinstance(thresh, bool):
                threshold_list = [thresh] * len(ids)
            elif isinstance(thresh, list):
                threshold_list = thresh
            else:
                threshold_list = [None] * len(ids)

            for i, did in enumerate(ids):
                fn = fnames[i] if i < len(fnames) else f"document_{i+1}"
                ex = threshold_list[i] if i < len(threshold_list) else None
                norm.append({
                    "doc_id": did,
                    "filename": fn,
                    "exceeds_threshold": ex,
                    "token_count": 0
                })
        return norm

    current_norm = _normalize_group(uploaded_docs, uploaded_doc_ids, uploaded_filenames, exceeds_threshold)
    existing_norm = _normalize_group(existing_docs, existing_doc_ids, existing_filenames, existing_threshold)

    # Deduplicate normalized docs by doc_id
    seen_ids = set()
    combined_docs = []
    for doc in (current_norm + existing_norm):
        did = doc.get("doc_id")
        if did and did not in seen_ids:
            seen_ids.add(did)
            combined_docs.append(doc)
        elif not did:
            combined_docs.append(doc)

    logger.info(f"Normalised current and existing turn uploaded docs: {combined_docs}", extra=extras)

    direct_candidates = []
    rag_doc_ids = []
    rag_filenames = []

    # 2. Classify files by indexer threshold
    for doc in combined_docs:
        doc_id = doc.get("doc_id")
        filename = doc.get("filename", "")
        exceeds = doc.get("exceeds_threshold")

        if exceeds is True:
            rag_doc_ids.append(doc_id)
            rag_filenames.append(filename)
            logger.info(f"Doc {filename} ({doc_id}) has exceeds_threshold=True -> Routed to Vector RAG.", extra=extras)
        elif exceeds is False:
            direct_candidates.append(doc)
            logger.info(f"Doc {filename} ({doc_id}) has exceeds_threshold=False -> Scheduled for SQL DB fetch & direct prompt injection.", extra=extras)
        else:
            # If threshold is unknown/None, default candidate to direct fetch from SQL
            direct_candidates.append(doc)

    # 3. Clean SQL Query for unchunked documents & summaries by conv_id or candidate doc_ids
    direct_docs = []
    session = Session()
    try:
        candidate_ids = [c["doc_id"] for c in direct_candidates if c.get("doc_id")]
        query = session.query(ParsedDocument).filter(ParsedDocument.is_deleted == False)
        if conv_id:
            query = query.filter(ParsedDocument.conv_id == conv_id)
        elif candidate_ids:
            query = query.filter(ParsedDocument.doc_id.in_(candidate_ids))
        else:
            query = None

        if query is not None:
            records = query.order_by(ParsedDocument.created_at.asc()).all()
            found_doc_ids = set()
            for rec in records:
                found_doc_ids.add(rec.doc_id)
                pii_map = {}
                if getattr(rec, "pii_mapping", None):
                    try:
                        pii_map = json.loads(rec.pii_mapping) if isinstance(rec.pii_mapping, str) else rec.pii_mapping
                    except Exception as parse_err:
                        logger.warning(f"Failed to parse pii_mapping for doc {rec.doc_id}: {parse_err}", extra=extras)
                direct_docs.append({
                    "doc_id": rec.doc_id,
                    "filename": rec.filename,
                    "content": rec.content,
                    "token_count": rec.token_count,
                    "pii_mapping": pii_map
                })

            # Check candidates with unknown threshold: if not in parsed_documents, route to RAG
            for cand in direct_candidates:
                cand_id = cand.get("doc_id")
                cand_fname = cand.get("filename", "")
                if cand_id and cand_id not in found_doc_ids and cand.get("exceeds_threshold") is None:
                    if cand_id not in rag_doc_ids:
                        rag_doc_ids.append(cand_id)
                        rag_filenames.append(cand_fname)
                        logger.info(f"Doc {cand_fname} ({cand_id}) not found in parsed_documents -> Fallback routed to Vector RAG.", extra=extras)

    except Exception as e:
        session.rollback()
        logger.exception(f"DB Error fetching parsed documents: {str(e)}", extra=extras)
    finally:
        session.close()

    logger.info(f"Final Processing Output: {len(direct_docs)} direct docs (SQL DB), {len(rag_doc_ids)} RAG docs (Vector DB).", extra=extras)
    return direct_docs, rag_doc_ids, rag_filenames
