import pyexcel as pe
from flask import send_file,jsonify
import json
from bs4 import BeautifulSoup
# from base_logger import logger
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone
import pytz

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_TRANSCRIPT_SERVICE'
PROJECT_NAME='CHATBOT'

def resp_to_ods(json_data,bot_type,timezone_offset,start_date,end_date,language_type):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    if not isinstance(json_data,list):
        json_data = json.loads(json_data)
    # Define the ODS header
    headers_augContent = getAugContentLength(json_data=json_data)
    target_timezone = pytz.timezone(timezone_offset)
    now = datetime.now(target_timezone)
    timezone_offset_str = now.strftime('%Z')  # Get timezone abbreviation
    if timezone_offset_str == '':
        timezone_offset_str = target_timezone.utcoffset(datetime.now()).total_seconds() // 3600  # Get offset in hours
    
    if language_type=="en":
        ods_header = [
            "Sl. No.",
            f"Conversation Start Time ({timezone_offset_str})",
            "Conversation ID",
            "User ID",
            "Questions",
            "Response",
            "Rating",
            "Feedback / Comments",
            "Additional Comment",
            "Response From"
        ]
    elif language_type=="fr":
        ods_header = [
            "Sl. Non.",
            f"Heure de début de la conversation ({timezone_offset_str})",
            "Identifiant de la conversation",
            "ID de l'utilisateur",
            "Questions",
            "Réponse",
            "Notation",
            "Commentaires / Commentaires",
            "Commentaire supplémentaire",
            "Réponse de"
        ]
    for i in range(1, headers_augContent + 1):
        if language_type=="en":
            ods_header.append(f"Content {i}")
        elif language_type=="fr":
            ods_header.append(f"Contenu {i}")
    # Create a list to store the ODS data
    ods_data = [ods_header]

    # Iterate through the JSON data and extract the relevant information
    for index, conversation in enumerate(json_data):
        if "startTime" in conversation:
            try:
                # existing_time = datetime.strptime(conversation["startTime"], "%Y-%m-%dT%H:%M:%S.%f%z")
                existing_time = datetime.fromisoformat(conversation["startTime"])
                target_timezone = pytz.timezone(timezone_offset)
                converted_time = existing_time.astimezone(target_timezone)
                formatted_time = converted_time.strftime('%Y-%m-%d %H:%M:%S')
                not_first = False
                ods_row = [
                    index + 1,  # Sl. No.
                    formatted_time,  # Conversation Start Time
                    conversation["conversationID"],  # Conversation ID
                    conversation["userID"],  # User ID
                ]

                for message in conversation["conversation"]:
                    soup = BeautifulSoup(message["response"], 'html.parser')
                    plain_text = soup.get_text()
                    if not plain_text :
                        if message["responseType"] == 'sensitive-question':
                            plain_text = "I apologize, I am not allowed to answer this question"
                        elif message["responseType"] == 'out-of-scope':
                            plain_text = "Apologize, I don't see any relevant content in my knowledge base to answer this question"
                        elif message["responseType"] == 'no-content':
                            plain_text = "Kindly rephrase the question and check"

                    if not_first:
                        ods_row = [
                            '',  # Sl. No.
                            '',  # Conversation Start Time
                            '',  # Conversation ID
                            '',  # User ID
                        ]
                    ods_row.extend(
                        [
                            message["question"],  # Questions
                            plain_text,  # Response
                            message["feedback"],  # Rating (empty for now)
                            message["feedbackComment"], # Feedback / Comments (empty for now)
                            message.get('additionalComment',''), # additional comment (empty for now)
                            message["responseType"]
                        ]
                    )

                    # Extract content information (up to 5 items)
                    # if message["augContent"] and message["responseType"] == f"{bot_type}-questions":
                    aug_citation = []
                    if "augContent" in message and isinstance(message["augContent"],list):
                        aug_citation = message["augContent"]
                    if "augSrc" in message and isinstance(message["augSrc"],list):
                        aug_citation = message["augSrc"]
                    for index, content in enumerate(aug_citation[:]):
                        content_key = None
                        if "content" in content:
                            content_key = "content"
                        elif "context_"+str(index+1) in content:
                            content_key = "context_"+str(index+1)
                        elif "content_"+str(index+1) in content:
                            content_key = "content_"+str(index+1)
                        with_citation = f"{content[content_key]} \n \n URL:{content['url']} \n Page No:{content['pageno']} \n Section Heading: {content['sec_title']}"
                        logger.info(with_citation,extra=extras)
                        ods_row.extend([with_citation])

                    # Ensure there are enough empty fields if there are less than 5 content items
                    while len(ods_row) < 19:
                        ods_row.extend(["", ""])

                    ods_data.append(ods_row)
                    ods_row = []
                    not_first = True
                    logger.info("Data has been formated",extra=extras)
            except Exception as e:
                logger.exception(f'exception occured in resp_to_ods {e}',extra=extras)
                pass


    # Write the data to an ODS file
    pe.save_as(array=ods_data, dest_file_name="chat_transcript.csv")
    response = send_file("chat_transcript.csv", as_attachment=True)
    response.headers["Content-Disposition"] = f"attachment; filename=chat_transcript.csv"
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return response


def getAugContentLength(json_data):
    Aug_list = []
    for index,conversation in enumerate(json_data):
        if "conversation" in conversation:
            for message in conversation["conversation"]:
                # if message['responseType'] != "cache":
                if "augContent" in message and isinstance(message["augContent"],list) and len(message["augContent"]) > 0:
                    aug_citation = message["augContent"]
                    Aug_list.append(len(aug_citation))
                if "augSrc" in message and isinstance(message["augSrc"],list) and len(message["augContent"]) > 0:
                    aug_citation = message["augSrc"]
                    Aug_list.append(len(aug_citation))
    if Aug_list:
        max_augContent = max(Aug_list)
        return max_augContent
    else:
        max_augContent = 3
        return max_augContent

        