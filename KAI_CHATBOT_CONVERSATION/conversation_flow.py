import re
import asyncio
from datetime import datetime, timezone
import json

from flask import jsonify

from contextservice.token_tracker import TokenTracker
from conversationalservice.service_route_utils import fetch_augcontent, issensitive, restricted_fetch_augcontent
from custom_utils.async_utils import AsyncTimeouts, run_async_function
from custom_utils.document_db_helper import budget_and_fetch_uploaded_docs
from logger import PROJECT_NAME, SERVICE_NAME, get_caller_frame, logger, time_sync_func

from agent_framework.exceptions import ChatClientException

from llm_helpers import TokenCounter
from agent_pool_context_helper import current_conv_id,current_generated_document_ids,current_generated_image_ids
from agent_pooling import AgentPool

from chatservice_llm_call import image_get_answer_gpt

image_embedd_pattern = r"<KUMARAN_GENERATED_IMAGE>(.*?)</KUMARAN_GENERATED_IMAGE>"#no longer needed
generated_document_embedd_pattern = r"<KUMARAN_GENERATED_DOCUMENT>(.*?)</KUMARAN_GENERATED_DOCUMENT>"#no longer needed
markdown_link_or_image_embedd_pattern = r'(!?)\[([^\]]+)\]\(([^)]*)\)'
@time_sync_func('image_conversation')
def image_conversation(query, conv_id, bot_type, is_from_upload, cache_check, uploaded_document_ids, allow_sensitive,
                       uploaded_filenames, model: str, agent_pool: AgentPool, stage_summary=None,
                       uploaded_docs=list(), exceeds_threshold=None, existing_docs=list(),
                       existing_doc_ids=list(), existing_filenames=list(), existing_threshold=None,
                       implement_diagram: bool = False):
 
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    matches = False
    augContent=''
    augSrc=[]
    tokens_consumed = None
    response = None
    imgSrc=[]
    generation_plugin_used = dict()
    cleaned_response =""
    image_info=None
    blob_object = agent_pool.blob_object
 
    
    imgContent = list()
    image_responses = list()
    images_metadata = dict()
    image_ids=list()
    generated_docuemnt_ids= list()
    generated_document_response = list()
    generated_document_metadata= dict()
    doc_pii_mapping = {}
    if matches:
        response = ""
        responseType = "PII"
        logger.info(f"Exiting PII data check at at {datetime.now(timezone.utc)}",extra=extras)
        return response, augSrc, augContent, tokens_consumed, responseType, [], [], {}, [], [], {}, doc_pii_mapping
    elif issensitive(query, bot_type) and allow_sensitive:
        response = None
        responseType = "sensitive-question"
    else:
        token_counter = TokenCounter()
        conversation_data = cache_check.get("conversation", [])
        # NOTE: history trimming is now handled by apply_context_window()
        # inside get_answer_gpt / image_get_answer_gpt (3-stage context window)

        direct_docs, rag_doc_ids, rag_filenames = budget_and_fetch_uploaded_docs(
            uploaded_docs=uploaded_docs,
            uploaded_doc_ids=uploaded_document_ids,
            uploaded_filenames=uploaded_filenames,
            exceeds_threshold=exceeds_threshold,
            existing_docs=existing_docs,
            existing_doc_ids=existing_doc_ids,
            existing_filenames=existing_filenames,
            existing_threshold=existing_threshold,
            conv_id=conv_id
        )

        if direct_docs:
            for doc in direct_docs:
                m = doc.get("pii_mapping")
                if m and isinstance(m, dict):
                    doc_pii_mapping.update(m)

        if is_from_upload and len(rag_doc_ids) > 0:
            augContent, augSrc, imgSrc, imgContent = restricted_fetch_augcontent(
                query=query,
                conversation_id=conv_id,
                uploaded_document_ids=rag_doc_ids
            )
        try:                            
            llm_response = asyncio.run(image_get_answer_gpt(
                query, model=model, bot_type=bot_type, augcontent=augContent, is_from_upload=is_from_upload,
                conversation_data=conversation_data, token_counter=token_counter, conv_id=conv_id,
                imgSrc=imgSrc, uploaded_filenames=uploaded_filenames, existing_filenames=existing_filenames,
                imgContent=imgContent, agent_pool=agent_pool, stage_summary=stage_summary,
                direct_docs=direct_docs, rag_filenames=rag_filenames, implement_diagram=implement_diagram
            ))
        except ChatClientException as ce:
            raise

        except Exception as e:
            logger.exception(f"Error during image_get_answer_gpt  exception {e}", extra=extras)
            raise

        tokens_consumed = {"total_input_tokens":token_counter.total_input_tokens,"total_output_tokens":token_counter.total_output_tokens}

        if llm_response is None and not llm_response:
            responseType = "not-answered"
        else:
            response=llm_response.get('response')
            augSrc.extend(llm_response.get('augSrc',[]))
            format_aug_src_content(aug_src=augSrc)
            augContent =augContent +' '+llm_response.get('augContent','') if llm_response.get('augContent','') else augContent
            responseType = "kumaran-questions"
        response = str(response)
        try:
            image_ids = current_generated_image_ids.get()
            generated_docuemnt_ids = current_generated_document_ids.get()
            if len(image_ids)>0 or len(generated_docuemnt_ids)>0:

                response = re.sub(markdown_link_or_image_embedd_pattern, "", response)
                
                logger.info(f"Extracted All Images Embeds",extra=extras)

                if len(image_ids)>0:
                    for image_id in image_ids:
                        if conv_id:
                            image_info = blob_object.get_image(conversation_id=conv_id,image_id=image_id)
                            if image_info:
                                image_responses.append({"image_name": "kai_image","image_bytes": image_info.get("image_bytes",None),"mime_type":image_info.get("mime_type",None),"extension": image_info.get("extension",None)})
                                images_metadata={"image_prompt":image_info.get("image_prompt",None),"image_tokens_usuage":image_info.get("tokens_used",None)}
                            logger.info(f"fetched Images id : {image_id}",extra=extras)
                    logger.info(f"fetched All Images Embeds",extra=extras)
                else:
                    logger.info(f"No Generated Images In this response",extra=extras)

                if len(generated_docuemnt_ids)>0:
                    for document_id in generated_docuemnt_ids:
                        if conv_id:
                            generated_document_info = blob_object.get_generated_document(conversation_id=conv_id,generated_document_id=document_id)
                            if generated_document_info:
                                generated_document_response.append({"generated_document_name":generated_document_info.get("generated_document_name",None),"generated_document_bytes": generated_document_info.get("generated_file_bytes",None),"mime_type":generated_document_info.get("mime_type",None),"extension": generated_document_info.get("extension",None)})
                                generated_document_metadata={"generated_document_prompt":generated_document_info.get("generated_document_prompt",None),"document_generation_tokens_usuage":generated_document_info.get("tokens_used",None)}
                            logger.info(f"fetched Images id : {document_id}",extra=extras)
                    logger.info(f"fetched All Generated Document Embeds",extra=extras)
                else:
                    logger.info(f"No Generated Documents In this response",extra=extras)
            else:
                logger.info(f"NO DOCUMENT/IMAGE GENERATION HAS BEEN TRIGGERED IN THIS CONVERSATION",extra=extras)
        except ChatClientException as ce:
            raise

        except Exception as e:
            logger.exception(f"Unknown Exception while Extracting Image Tag Exception : {e}",extra=extras)

    return response, augSrc, augContent, tokens_consumed, responseType,image_ids,image_responses,images_metadata,generated_docuemnt_ids,generated_document_response,generated_document_metadata, doc_pii_mapping

def format_aug_src_content(aug_src:list):
    for idx, d in enumerate(aug_src,1):
        if isinstance(d,dict):
            for key in list(d.keys()):
                if key.startswith("context"):
                    d[f"context_{idx}"] = d.pop(key)
                    break 




