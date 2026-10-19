
# from base_logger import logger
from logger import logger,get_caller_frame,extras

import os
from datetime import datetime,timezone
from utils import *  
import json
from datetime import timedelta
import datetime as dt_module
from azure.storage.filedatalake import DataLakeServiceClient
from azure.core.exceptions import ResourceNotFoundError
from abc import ABC, abstractmethod
from flask import make_response,jsonify
from mainqueries import *



chat_threshold = int(os.getenv("chat_threshold",0))

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_TRANSCRIPT_SERVICE'
PROJECT_NAME='CHATBOT'

class ChatTranscriptStorage(ABC):
    @abstractmethod
    def create_storage(self):
        pass


# Concrete factory implementing ConversationPipelineFactory
class ChatTranscriptEndBlob(ChatTranscriptStorage):
    def create_storage(self):
        return BlobChatTranscipt()


class BlobChatTranscipt:
    def __init__(self) -> None:
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT = os.getenv("DATA_LAKE_CONNECTION_STRING")
        self.CONTAINER_NAME = os.getenv("conv_cont_name")
        dbtype = os.getenv('DB_TYPE',"pg")
        if dbtype in ["sql","pg"]:
            self.db = SQLFactory()
            self.response_template=ResponseTemplate
            self.conversation=Conversation
            self.bot_typr=BotType
        logger.info(f"Chat Transcipt Service: AZURE_STORAGE_CONNECTION_STRING_CHATBOT: {self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT}, CONTAINER_NAME: {self.CONTAINER_NAME}",extra=extras)

    def _select_directory_name(self,bot_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        directory_name = {
            'cibc':os.getenv("conv_directory_name"),
            'kumaran':os.getenv('conv_directory_name_kumaran'),
            'scotia':os.getenv('CONV_DIRECTORY_SCOTIA'),
        }
        logger.info(f'directory_name data:{directory_name},bot_type:{bot_type}',extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return directory_name.get(bot_type,os.getenv("conv_directory_name"))
    

    def blob_range(self,users,startdate,enddate,bot_type,file_system_client):
        try:
            extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            a = 0
            for user in users:
                current_date = startdate
                while current_date <= enddate:
                    directory_name = self._select_directory_name(bot_type=bot_type)
                    logger.info(f'fetched directory name for bot_type:{bot_type},directory_name:{directory_name} ',extra=extras)
                    file_path = f"{directory_name}/{user}/{current_date.strftime('%Y-%m-%d')}"
                    logger.info(f'File Path to be fetched for chat transcript fetch:{file_path}', extra=extras)
                    try:
                        directory_client = file_system_client.get_paths(file_path)
                        if directory_client:
                            for path in directory_client:
                                a+=1
                    except ResourceNotFoundError:
                        logger.warning(f'Path not found: {file_path}. Skipping processing.', extra=extras)
                    current_date += timedelta(days=1)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return a
        except Exception as e:
            logger.exception(f"Chat Transcript Service: Error in retreiving from blob : {e}",extra=extras)
            return {"message":"internal server error"},500

    def sorting_conversation(self, paginated_data):
        for item in paginated_data:
            start_time_str = item.get('startTime') or item.get('date_timestamp')
            if not start_time_str:
                continue
            try:
                # Standardise incoming strings to UTC objects
                clean_str = start_time_str.replace('Z', '+00:00')
                parsed_dt = datetime.fromisoformat(clean_str)
                item['startTime'] = parsed_dt.astimezone(timezone.utc)
            except Exception as e:
                logger.exception(
                    f"Failed to parse startTime: {e}",
                    extra=extras
                )
                continue
            
        # Sort using precise reverse-chronological UTC values
        sorted_data = sorted(paginated_data, key=lambda x: x.get('startTime', datetime.now(timezone.utc)), reverse=True)
        
        for item in sorted_data:
            if isinstance(item.get('startTime'), datetime):
                # Export clean standard UTC strings ending in 'Z'
                item['startTime'] = item['startTime'].isoformat().replace("+00:00", "Z")
                if 'date_timestamp' in item:
                    item['date_timestamp'] = item['startTime']
                    
        return sorted_data



    def retreive_from_blob(self,total_pages,file_paths,bot_type,conversation_limit_reached):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            response_template=self.db.find_all(self.response_template,conditions={})
            service_client = DataLakeServiceClient.from_connection_string(self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT)
            file_system_client = service_client.get_file_system_client(file_system=self.CONTAINER_NAME)
            json_list = []
            logger.info(f"Chat Trascript Service: {file_system_client}",extra=extras)

            for conv_path in file_paths:
                logger.info(f"conv_path={conv_path}", extra=extras)
                logger.info(f'File Path to be fetched for chat transcript fetch:{conv_path[0]}',extra=extras)
                try:
                    directory_name = self._select_directory_name(bot_type=bot_type)
                    file_client = file_system_client.get_file_client(f'{directory_name}/{conv_path[0]}')
                    file_contents = file_client.download_file().readall()
                    file_contents_str = file_contents.decode("utf-8")
                    # Parse string to dictionary (assuming JSON format)
                    file_contents_dict = json.loads(file_contents_str)
                    conversation = file_contents_dict.get('conversation', None)
                    conv_langunga_type=file_contents_dict.get("language_type")
                    if conversation is not None:
                        for augumented_content in conversation:
                            
                            
                            # FIXED GLOBAL TIMESTAMP CONVERSION (Standardized to clean UTC Z)
                           
                            raw_ts = augumented_content.get("timestamp")
                            if raw_ts:
                                try:
                                    # Handle custom format 'YYYY:MM:DD:HH:MM:SS'
                                    if ":" in raw_ts and len(raw_ts.split(":")) >= 6:
                                        parts = raw_ts.split(":")
                                        dt_utc = dt_module.datetime(int(parts[0]), int(parts[1]), int(parts[2]), 
                                                            int(parts[3]), int(parts[4]), int(parts[5]), 
                                                            tzinfo=dt_module.timezone.utc)
                                        augumented_content["timestamp"] = dt_utc.isoformat().replace("+00:00", "Z")
                                        logger.info(
                                            f"Converted timestamp: {augumented_content['timestamp']}",
                                            extra=extras
                                        )
                                    else:
                                        if raw_ts.endswith('Z'):
                                            raw_ts = raw_ts.replace('Z', '+00:00')
                                        parsed_dt = dt_module.datetime.fromisoformat(raw_ts)
                                        if parsed_dt.tzinfo is None:
                                            parsed_dt = parsed_dt.replace(tzinfo=dt_module.timezone.utc)
                                        augumented_content["timestamp"] = parsed_dt.astimezone(dt_module.timezone.utc).isoformat().replace("+00:00", "Z")
                                except Exception:
                                    pass  
                            # ====================================================================

                            aug_citation = []
                            if "augContent" in augumented_content and isinstance(augumented_content["augContent"],list):
                                aug_citation = augumented_content["augContent"]
                            if "augSrc" in augumented_content and isinstance(augumented_content["augSrc"],list):
                                aug_citation = augumented_content["augSrc"]

                            for index, content in enumerate(aug_citation[:]):
                                content_key = None
                                if "content" in content:
                                    content_key = "content"
                                elif "context_"+str(index+1) in content:
                                    content_key = "context_"+str(index+1)
                                elif "content_"+str(index+1) in content:
                                    content_key = "content_"+str(index+1)
                                if content_key:    
                                    content_value = content.pop(content_key)
                                    new_key = "context_" + str(index+1)
                                    content[new_key] = content_value
                            response_template_result = [response for response in response_template if response['response_type'] == augumented_content["responseType"]]
                            logger.info(f"Result:{response_template_result} response_type:{augumented_content['responseType']}",extra=extras)
                            if response_template_result!=[]:
                                logger.info(f"Result is fetched: {response_template_result}",extra=extras)
                                if conv_langunga_type=="en":
                                    augumented_content["response"]=response_template_result[0]["response_english"]
                                    logger.info(f"Assigning response, response type: {augumented_content['responseType']},response:{augumented_content['response']}, en",extra=extras)
                                elif conv_langunga_type=="fr":
                                    augumented_content["response"]=response_template_result[0]["response_french"]
                                    logger.info(f"Assigning response, response type: {augumented_content['responseType']},response:{augumented_content['response']}, fr",extra=extras)
                            else:
                                logger.info(f"Else response_template_result : {response_template_result}, response template type: {type(response_template_result)} response_type:{augumented_content['responseType']}, ",extra=extras)
                        
                        if file_contents_dict.get('conversation') is not None: 
                            
                            # Helper function to convert DB elements to standardized UTC strings with Z
                            def parse_to_utc_iso(val):
                                if not val:
                                    return None
                                if isinstance(val, dt_module.datetime):
                                    if val.tzinfo is None:
                                        val = val.replace(tzinfo=dt_module.timezone.utc)
                                    return val.astimezone(dt_module.timezone.utc).isoformat().replace("+00:00", "Z")
                                try:
                                    # This cleans up and parses any incoming raw text dates like "Thu, 10 Sep..." or "GMT"
                                    if isinstance(val, str):
                                        # If it's already an ISO string format, reuse it cleanly
                                        if "T" in val and ("Z" in val or "+" in val):
                                            return val.replace('Z', '+00:00')
                                        
                                        # Parse generic HTTP or database timestamp strings safely
                                        import email.utils
                                        parsed_tuple = email.utils.parsedate_to_datetime(val)
                                        return parsed_tuple.astimezone(dt_module.timezone.utc).isoformat().replace("+00:00", "Z")
                                except:
                                    pass
                                return str(val)
                            
                            logger.info(f"conversationID={file_contents_dict.get('conversationID')}, project_id={file_contents_dict.get('project_id')}, conv_path={conv_path}",extra=extras)
                            file_contents_dict['is_pinned'] = conv_path[1] if len(conv_path) > 1 else False
                            file_contents_dict['conversationName'] = conv_path[2] if len(conv_path) > 2 else None
                            
                           
                            
                            # FIXED: Parent wrapper strings are now converted into matching UTC Z structures
                            file_contents_dict['updated_at'] = parse_to_utc_iso(conv_path[3]) if len(conv_path) > 3 else None
                            file_contents_dict['created_at'] = parse_to_utc_iso(conv_path[4]) if len(conv_path) > 4 else None
                            file_contents_dict['project_id'] = conv_path[5] if len(conv_path) > 5 else None
                      
                            # FIXED: Synchronize startTime directly to eliminate client parsing skews
                            file_contents_dict['startTime'] = file_contents_dict['created_at'] or file_contents_dict['updated_at']
                            logger.info(
                                f"ConversationID:{file_contents_dict.get('conversationID')} "
                                f"created_at:{file_contents_dict.get('created_at')} "
                                f"startTime:{file_contents_dict.get('startTime')}",
                                extra=extras
                            )
                            json_list.append(file_contents_dict)

                except ResourceNotFoundError:
                    logger.exception(f'exception occured in retreival of blob path:{conv_path[0]}',extra=extras)
                    continue
            total_items = len(json_list)
            if total_items == 0:
                return json_list,200
            
            result = json_list
            logger.info(f"Chat Transcript Service: Total length of data is {total_items}",extra=extras)
            result.append({"totalPages":total_pages})
            result.append({"conversation_limit_reached":conversation_limit_reached})
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return result,200
        except Exception as e:
            logger.exception(f"Chat Transcript Service: Error in retreiving from blob : {e}",extra=extras)
            return {"message":"internal server error"},500



    def fetch_transcript_data(self, data, bot_type, page_number, page_size):
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
                    }
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            user_string = data.get('user_string','').lower()
            usernames = [user_id.strip() for user_id in user_string.split(',') if user_id]
            
            filters = {"usernames":usernames}
            ## 
            if data.get("conversationID", None):
                filters['conversation_id'] = [data['conversationID']]
            
                
            logger.info(f"CONVERSATIONAL-AI-REPORT: data passed for fetching data :{data}",extra=extras)

            response = self.db.get_transcript_data_db(filters, chat_threshold,bot_type, page_number, page_size)
            if response.status_code ==200:
                result_data = response.json
                result = result_data.get('data')
                # converting the first element of each item in result to lowercase because in some cases it is coming as uppercase from db and in some cases as lowercase, to maintain consistency converting it to lowercase before fetching from blob storage
                for item in result:
                    item[0] = item[0].lower()
                total_pages = result_data.get('total_no_of_pages')
                conversation_limit_reached=result_data.get('conversation_limit_reached')
                response_data,status_code = self.retreive_from_blob(total_pages=total_pages,file_paths=result,bot_type=bot_type,conversation_limit_reached=conversation_limit_reached)
                if status_code==200:
                    return make_response(jsonify(response_data),200)
                else:
                    return make_response(jsonify(response),status_code)
            else:
                return response
            
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Error in fetching data"), 500)
        
    def retriveConversationFromBlob(self,bot_type,conversation_id):
        response_template=self.db.find_all(self.response_template,conditions={})
        conversation_details=self.db.get_transcript_data_db(filters={"conversation_id":[conversation_id]},chat_threshold=1,botname=bot_type)
        if conversation_details.status_code ==200:
                result_data = conversation_details.json
                if len(result_data.get('data'))>0:
                    conv_path = result_data.get('data')[0]
                    service_client = DataLakeServiceClient.from_connection_string(self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT)
                    file_system_client = service_client.get_file_system_client(file_system=self.CONTAINER_NAME)
                    directory_name = self._select_directory_name(bot_type=bot_type)
                    file_client = file_system_client.get_file_client(f'{directory_name}/{conv_path}')
                    if not file_client.exists():
                        return make_response(jsonify(error='The requested conversation is not available in the storage.'), 404)
                    file_contents = file_client.download_file().readall()
                    file_contents_str = file_contents.decode("utf-8")
                    # Parse string to dictionary (assuming JSON format)
                    file_contents_dict = json.loads(file_contents_str)
                    conversation = file_contents_dict.get('conversation', None)
                    conv_langunga_type=file_contents_dict.get("language_type")
                    if conversation is not None:
                        for augumented_content in conversation:
                            aug_citation = []
                            if "augContent" in augumented_content and isinstance(augumented_content["augContent"],list):
                                aug_citation = augumented_content["augContent"]
                            if "augSrc" in augumented_content and isinstance(augumented_content["augSrc"],list):
                                aug_citation = augumented_content["augSrc"]

                            for index, content in enumerate(aug_citation[:]):
                                content_key = None
                                if "content" in content:
                                    content_key = "content"
                                elif "context_"+str(index+1) in content:
                                    content_key = "context_"+str(index+1)
                                elif "content_"+str(index+1) in content:
                                    content_key = "content_"+str(index+1)
                                content_value = content.pop(content_key)
                                new_key = "context_" + str(index+1)
                                content[new_key] = content_value
                            response_template_result = [response for response in response_template if response['response_type'] == augumented_content["responseType"]]
                            logger.info(f"Result:{response_template_result} response_type:{augumented_content['responseType']}",extra=extras)
                            if response_template_result!=[]:
                                logger.info(f"Result is fetched: {response_template_result}",extra=extras)
                                if conv_langunga_type=="en":
                                    augumented_content["response"]=response_template_result[0]["response_english"]
                                    logger.info(f"Assigning response, response type: {augumented_content['responseType']},response:{augumented_content['response']}, en",extra=extras)
                                elif conv_langunga_type=="fr":
                                    augumented_content["response"]=response_template_result[0]["response_french"]
                                    logger.info(f"Assigning response, response type: {augumented_content['responseType']},response:{augumented_content['response']}, fr",extra=extras)
                            else:
                                logger.info(f"Else response_template_result : {response_template_result}, response template type: {type(response_template_result)} response_type:{augumented_content['responseType']}, ",extra=extras)
                        if file_contents_dict.get('conversation') is not None: 
                            return file_contents_dict
                else:
                    return make_response(jsonify(error='The requested conversation is not available in the storage.'), 404) 
        else:
            return conversation_details
       
    def get_sinle_conv_from_blob(self, conv_path, bot_type):
        service_client = DataLakeServiceClient.from_connection_string(self.AZURE_STORAGE_CONNECTION_STRING_CHATBOT)
        file_system_client = service_client.get_file_system_client(file_system=self.CONTAINER_NAME)
        directory_name = self._select_directory_name(bot_type=bot_type)
        file_client = file_system_client.get_file_client(f'{directory_name}/{conv_path}')
        file_contents = file_client.download_file().readall()
        file_contents_str = file_contents.decode("utf-8")
        # Parse string to dictionary (assuming JSON format)
        file_contents_dict = json.loads(file_contents_str)
        return file_contents_dict
    
    def get_project_conversations(self, project_id):
        session = self.db.SessionMaker()

        try:
            project = session.query(ConversationProject).filter(ConversationProject.id == int(project_id)).first()
            if not project:
                return jsonify({"error": "Project not found"}), 404
            conversations = session.query(Conversation).filter(Conversation.project_id == int(project_id)).all()
            result = []
            for conversation in conversations:
                result.append({
                    "conversation_id": conversation.conversation_id,
                    "conversation_name": conversation.conversation_name,
                    "created_at": str(conversation.created_at)
                })

            return jsonify({
                "project_id": project.id,
                "project_name": project.project_name,
                "username": project.username,
                "conversation_count": len(conversations),
                "conversations": result
            }), 200

        except Exception as e:
            logger.exception(f"Error fetching project conversations: {e}")
            return make_response(jsonify(error="Unable to fetch project conversations"),500)

        finally:
            session.close()




    
class Client:
    def __init__(self, ChatTranscriptEndBlob, user_string, page_number, page_size,bot_type) -> None:
        self.ChatTranscriptEndBlob = ChatTranscriptEndBlob
        self.username = user_string
        self.page_number = page_number
        self.page_size = page_size
        self.bot_type = bot_type
    
    
    def use_blob(self, data, bot_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        blob_storage = self.ChatTranscriptEndBlob.create_storage()
        result = blob_storage.fetch_transcript_data(data, bot_type,self.page_number,self.page_size)
        # result = blob_storage.retreive_from_blob(self.username,self.startdate,self.end_date,self.bot_type,language_type,self.page_number,self.page_size)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return result
    
    
