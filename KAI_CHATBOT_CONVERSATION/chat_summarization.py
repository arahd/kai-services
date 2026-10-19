import os
import asyncio
import tiktoken
from typing import Dict, List


from agent_framework import Agent,Message,Content

from logger import logger,get_caller_frame
from simple_agent_pool import SimpleAgentPool

from conversationalservice.transcript import ChatTranscript




STAGE1_TOKEN_LIMIT  = int(os.getenv("STAGE1_TOKEN_LIMIT"))
STAGE2_TOKEN_LIMIT  = int(os.getenv("STAGE2_TOKEN_LIMIT"))
STAGE2_MAX_TURNS    = int(os.getenv("STAGE2_MAX_TURNS"))
STAGE3_RECENT_TURNS = int(os.getenv("STAGE3_RECENT_TURNS"))
  

PROJECT_NAME = "KAI"
SERVICE_NAME = "KAI_CHATBOT_CONVERSATION"
    
def _count_tokens_in_message(message: Dict, model_name: str = "gpt-4o-mini") -> int:
    try:
        encoding = tiktoken.encoding_for_model(model_name)
    except KeyError:
        encoding = tiktoken.get_encoding("cl100k_base") # Fallback for unknown models

    # OpenAI's cookbook recommendations for counting chat message tokens
    tokens_per_message = 3  # for role, content, and the message separator
    tokens_per_name = 1     # if name is present
    
    num_tokens = 0
    num_tokens += tokens_per_message
    for key, value in message.items():
        if key == "name":
            num_tokens += tokens_per_name
        if isinstance(value, str):
            num_tokens += len(encoding.encode(value))
    return num_tokens

def _count_tokens_in_conversation(conversation_data: List[Dict], model_name: str = "gpt-4o-mini") -> int:
    if not conversation_data:
        return 0
    total_tokens = 0
    for message in conversation_data:
        total_tokens += _count_tokens_in_message(message, model_name)
    return total_tokens

async def summarize_incrementally(existing_summary: str | None, new_turns: list,agent_pool:SimpleAgentPool,model_name:str, bot_type: str) -> str:
    try:

        extras = {
        'servicename': SERVICE_NAME,
        'functionname':get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name': 'kumaran'}

        agent = agent_pool.agent_pool.get(model_name,None)
        if not agent:
            agent = agent_pool.agent_pool.get("gpt-4o-mini")

        if existing_summary and len(existing_summary) > STAGE2_TOKEN_LIMIT:
            try:
                compaction_system_msg = (
                    "You are an expert copyeditor. Your job is to compress the provided conversation summary "
                    "by 30-50% without losing critical business identifiers (like account IDs, names, or active issues). "
                    "Combine related bullet points, remove conversational history that is no longer relevant, "
                    "and streamline the narrative to be highly concise."
                )
                compaction_user_msg = (
                    f"Please compact the following summary, preserving only high-value facts (names, accounts, active issues) "
                    f"and key status information. Merge similar items and streamline the text.\n\n"
                    f"Summary to compact:\n\"\"\"\n{existing_summary}\n\"\"\""
                )
                
                user_message = Message( role="user",
                                           contents=[
                                               Content.from_text(text=compaction_system_msg)
                                               ],)
                
                system_message = Message( role="system",
                                           contents=[
                                               Content.from_text(text=compaction_user_msg)
                                               ],)
                
                compact_response = agent.run(messages=[user_message,system_message])

                existing_summary = str(compact_response).strip()
            except Exception as comp_exc:

                logger.warning(f"Summary compaction step failed, falling back to original summary: {comp_exc}",extra=extras)

        lines = []
        for turn in new_turns:
            q = turn.get("question", "")
            r = turn.get("response", "")
            if q: lines.append(f"User: {q}")
            if r: lines.append(f"Assistant: {r}")
        conv_text = "\n".join(lines)

        system_msg = (
            "You are a helpful assistant that maintains and updates a running summary of a customer conversation. "
            "Your top priority is to retain key persistent details, unique identifiers (like IDs or accounts), and active user preferences. "
            "To prevent the summary from growing uncontrollably, you must actively consolidate duplicate or redundant points, "
            "overwrite outdated facts with the latest updates from the user, and omit transient conversational filler "
            "(such as polite greetings, trivial back-and-forth remarks, or intermediate troubleshooting steps that are no longer relevant)."
        )

        if existing_summary:
            user_msg = (
                f"Here is the existing summary of the conversation so far:\n"
                f"\"\"\"\n{existing_summary}\n\"\"\"\n\n"
                f"Here are the new conversation turns that have occurred since that summary was written:\n"
                f"\"\"\"\n{conv_text}\n\"\"\"\n\n"
                f"Please update the summary to incorporate the new conversation turns using the following rules:\n"
                f"1. In PART 1, merge overlapping or redundant bullets.\n"
                f"2. If a new turn updates or contradicts an older fact (e.g., a changed preference or a resolved problem), "
                f"replace the old fact with the updated one.\n"
                f"3. Remove minor conversational points or status updates that do not impact the ongoing context.\n"
                f"4. Keep the narrative in PART 2 concise and focused on the active issues and overall progress.\n\n"
                f"Your output must follow this two-part structure:\n\n"
                f"PART 1 — Key Facts & Details:\n"
                f"[Updated, consolidated bulleted list of persistent facts, preferences, and identifiers]\n\n"
                f"PART 2 — Topic Overview:\n"
                f"[Updated 2-3 sentence narrative overview of the current status and discussion flow]\n\n"
                f"Updated Consolidated Summary:"
            )
        else:
            user_msg = (
                f"Summarize the following conversation. Focus strictly on extracting high-value persistent facts "
                f"and active preferences while ignoring transient conversational filler (greetings, polite agreements, etc.).\n\n"
                f"Conversation:\n{conv_text}\n\n"
                f"Please format your output using this two-part structure:\n\n"
                f"PART 1 — Key Facts & Details:\n"
                f"List only concrete facts, identifiers, and user preferences as concise bullet points. "
                f"Do not include casual conversational remarks or intermediate steps.\n\n"
                f"PART 2 — Topic Overview (2-3 sentences):\n"
                f"Provide a brief, focused narrative overview summarizing the main purpose and status of the discussion.\n\n"
                f"Summary:"
            )

        user_message = Message( role="user",
                                    contents=[
                                        Content.from_text(text=system_msg)
                                        ],)
        
        system_message = Message( role="system",
                                    contents=[
                                        Content.from_text(text=user_msg)
                                        ],)
        
        response = agent.run(messages=[user_message,system_message])

        return str(response).strip()

    except Exception as exc:
        logger.exception(f"Incremental summarization LLM call failed: {exc}")
        return ""
 

async def run_summarization_workflow(conv_id, bot_type, master_document,agent_pool:SimpleAgentPool,model_name:str):

    if master_document == "Data Not Available" or not isinstance(master_document, dict):
        return {"status": "skipped", "reason": "no_conversation_data"}

    turns_list = master_document.get("conversation", [])
    if not isinstance(turns_list, list) or not turns_list:
        return {"status": "skipped", "reason": "no_turns"}

    total_tokens = _count_tokens_in_conversation(turns_list)
    if total_tokens < STAGE1_TOKEN_LIMIT:
        return {"status": "skipped", "reason": "below_token_threshold", "tokens": total_tokens}

    existing_summary = master_document.get("summary")
    summarized_up_to_index = master_document.get("summary_index", 0)

    minimum_recent_index = max(0, len(turns_list) - STAGE3_RECENT_TURNS)
    all_eligible_old_turns = turns_list[:minimum_recent_index]
    new_turns_to_summarize = all_eligible_old_turns[summarized_up_to_index:]

    if not new_turns_to_summarize:
        return {"status": "skipped", "reason": "no_new_turns"}

    new_summary = await summarize_incrementally(
        existing_summary=existing_summary,
        new_turns=new_turns_to_summarize,
        bot_type=bot_type,agent_pool=agent_pool,model_name=model_name
    )

    if not new_summary:
        return {"status": "failed", "reason": "llm_error"}

    master_document["summary"] = new_summary
    master_document["summary_index"] = len(all_eligible_old_turns)

    transcript = ChatTranscript(conv_id, "", False)
    await asyncio.to_thread(transcript.createChatSession, conv_id, master_document)

    return {"status": "success", "summary_length": len(new_summary)}