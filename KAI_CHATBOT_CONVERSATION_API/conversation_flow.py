import re
import asyncio
from datetime import datetime, timezone
from chatapiresponsewithskinline import image_get_answer_gpt
from contextservice.token_tracker import TokenTracker
from conversationalservice.service_route_utils import  issensitive
from kernel_pooling import KernelPool
from logger import PROJECT_NAME, SERVICE_NAME, get_caller_frame,logger

image_embedd_pattern = r"<KUMARAN_GENERATED_IMAGE>(.*?)</KUMARAN_GENERATED_IMAGE>"

def image_conversation(query, conv_id, bot_type,PII_digit_count,kernel_pool:KernelPool,model,prompt="",temprature=0.5,max_tokens=4096):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    matches = False
    # matches=find_digits_in_string(query,PII_digit_count)
    augSrc=[]
    tokens_consumed = None
    response = None
    llm_response = None
    image_responses = None
    blob_object = kernel_pool.blob_object
    if matches:
        response = ""
        responseType = "PII"
        logger.info(f"PII response:::{response}", extra=extras)
        logger.info(f"Exiting PII data check at at {datetime.now(timezone.utc)}",extra=extras)
        return response, augSrc, tokens_consumed, responseType,None,None
        # substituting image_ids,image_responses,images_meta_data  for None

    elif issensitive(query, bot_type):
        response = None
        responseType = "sensitive-question"
    else:
        token_tracker = TokenTracker()
        llm_response = asyncio.run(image_get_answer_gpt(query, model = model,bot_type=bot_type,token_tracker=token_tracker, conv_id = conv_id,prompt=prompt,temprature=temprature,max_tokens=max_tokens,kernel_pool=kernel_pool))

        tokens_consumed = token_tracker.get_token_counts()

        if llm_response is None and not llm_response:
            responseType = "not-answered"
        else:
            response=str(llm_response.get('response'))
            augSrc.extend(llm_response.get('augSrc',[]))
            format_aug_src_content(aug_src=augSrc)
            responseType = "kumaran-questions"

        logger.info("Storing chat in Redis", extra=extras)
        cleaned_response =""
        image_responses = list()
        image_ids=list()
        try:

            logger.info(f"Extracted All Images Embeds",extra=extras)
            logger.info(f"Starting Image ", extra=extras) 
            image_ids = re.findall(string=response,pattern=image_embedd_pattern)
            cleaned_response = re.sub(string=response,repl="",pattern=image_embedd_pattern)
            del response
            if len(image_ids)>0:
                for x in image_ids:
                    if conv_id:
                        image_info = blob_object.get_image(conversation_id=conv_id,image_id=x)
                        if image_info:
                            image_responses.append({"image_name": image_info.get("image_name",None),"image_bytes": image_info.get("image_bytes",None),"mime_type":image_info.get("mime_type",None),"extension": image_info.get("extension",None)})

                        logger.info(f"fetched Images id : {x}",extra=extras)
                logger.info(f"fetched All Images Embeds",extra=extras)
            else:
                logger.info(f"No Images In this response",extra=extras)
        except Exception as e:
            logger.exception(f"Unknown Exception while Extracting Image Tag Exception : {e}",extra=extras)
    del llm_response
    return cleaned_response, augSrc, tokens_consumed, responseType,image_ids,image_responses


def format_aug_src_content(aug_src:list):
    for idx, d in enumerate(aug_src,1):
        if isinstance(d,dict):
            for key in list(d.keys()):
                if key.startswith("context"):
                    d[f"context_{idx}"] = d.pop(key)
                    break 




