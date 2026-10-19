import os
import json
from datetime import datetime,timezone

from agent_framework import Agent,Content,Message

from logger import track_time,get_caller_frame,logger
from llm_helpers import load_prompt_from_file_absoulute_path
from simple_agent_pool import SimpleAgentPool

PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATION"

#TODO: Replace the semantic kernel chathistory object with a list of Dicts,
#TODO: Add Document Generation Context to prepare chat - DONE

def prepare_chat_history(conversation_data:list,max_chat_retain=None,question_required=True,response_required=True)->list[dict]:

    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    chat_history:list[dict]=list()
    last_n_conversations = conversation_data[-max_chat_retain:] if max_chat_retain else conversation_data
    for item in last_n_conversations:
        question = item.get("question", "")
        try:
            if len(item.get("generated_image_ids",None))>0 and item.get("image_prompt",None):
                response = str(item.get("response", "")) + f"\nIMAGE GENRERATION TOOL CALL USED WITH PROMPT : {item.get('image_prompt',None)}"
            if len(item.get("generated_document_ids",[]))>0 and item.get("generated_document_prompt",None):
                response = str(item.get("response", "")) + f"\DOCUMENT GENRERATION TOOL CALL USED WITH PROMPT : {item.get('generated_document_prompt',None)}"
            else:
                response = item.get("response", "")
        except Exception as e:
            logger.exception(f"Unknown Exception during Image Context insertion Exception :{e}",extra=extras)
            response = item.get("response", "")

        if isinstance(response, dict):
            if "response" in response:
                response = response["response"]
            else:
                response = json.dumps(response, ensure_ascii=False)

        if isinstance(question, dict):
            question = json.dumps(question, ensure_ascii=False)

        if question and str(question).strip() and response and str(response).strip():
            if question_required:
                 chat_history.append(
                                     {"user":str(question)}
                                    )

            if response_required:
                chat_history.append(
                    {"assistant":str(response)}
                    )

    return chat_history

async def suggested_follow_ups_new(conversation_data, agent_pool:SimpleAgentPool,model_name:str,language_type="en"):
  
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'
    }
    try:
        start_time = datetime.now(timezone.utc)
        logger.info(f"Entering {extras['functionname']} at {start_time}", extra=extras)

        with track_time("initialising kernel and chat object"):
        # Initialize the Semantic Kernel instance
            agent = agent_pool.agent_pool.get(model_name,None)
            if not agent:
                agent = agent_pool.agent_pool.get("gpt-4o-mini")

            prompt = os.getenv("SUGGESTED_FOLLOW_UP_QUESTIONS_PROMPT", "")

            chat_history_final = prepare_chat_history(conversation_data,3,)
            prompt=prompt.replace("$user_chat_history",str(chat_history_final))

            system_message = Message(role="system",
                                     contents=[
                                         Content.from_text(text=prompt), 
                                         ],)


        # Invoke the LLM
        with track_time("Primary LLM call"):
            response = await agent.run(messages=system_message)
            response=str(response)


        with track_time("validation and parsing"):
            formatted_response = json.loads(f"{response}")
       
        logger.info(f"{SERVICE_NAME}: Formatted follow-up list: {formatted_response}", extra=extras)

        end_time = datetime.now(timezone.utc)
        logger.info(f"{SERVICE_NAME}: Execution time for {extras['functionname']} = {end_time - start_time}", extra=extras)
        return formatted_response

    except Exception as e:
        logger.exception(f"{SERVICE_NAME}: Error during follow-up question generation", extra=extras)
        return {"follow_up_questions": []}

