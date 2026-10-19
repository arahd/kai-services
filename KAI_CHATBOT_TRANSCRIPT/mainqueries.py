#abstract method imports
from abc import ABC, abstractmethod
import os
import math
from flask import jsonify, make_response
from logger import logger,get_caller_frame,extras

#sqldb imports
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import create_engine,desc,asc,distinct,func
from tableModels import *

from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime,timezone
from urllib.parse import quote_plus


SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_CONTENT_MANAGEMENT_SERVICE'
PROJECT_NAME='CHATBOT'

Base = declarative_base()
#Abstract Class
class DataBaseFactory(ABC):

    @abstractmethod
    def create_connection(self):
        pass

    @abstractmethod
    def find_all(tableName, conditions, botname):
        pass

    @abstractmethod
    def find_one(tableName, conditions, botname):
        pass

class SQLFactory(DataBaseFactory):

    def __init__(self):
        super().__init__()
        self.create_connection()

    def create_connection(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        db_type = os.getenv("DB_TYPE", "pg")
        if db_type.upper() == "SQL":
            SQLUSERNAME = os.getenv("SQLUSERNAME")
            SQLPWD = os.getenv("SQLPWD")
            SQLHOST = os.getenv("SQLHOST") #"dev-mssql.kumaran.ai" #
            SQLPORT = os.getenv("SQLPORT") #1543 #
            SQLDBNAME = os.getenv("DB_NAME")
            # connection_string = 'mssql+pyodbc://chatidpdevadmin:1aayu3y38WW2%40%40%40@chatipddev.database.windows.net:1433/chatbot?driver=ODBC+Driver+18+for+SQL+Server'
            connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{SQLDBNAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
        if db_type.upper() == "PG":
            connection_string = os.getenv("PGDBCONNSTR")
        
        #FIXED: Hardcoded to "PG" to prevent local environment syntax typos from defaulting to SQL Server
        # db_type = "PG" 
        
        # if db_type.upper() == "SQL":
        #     SQLUSERNAME = os.getenv("SQLUSERNAME")
        #     SQLPWD = os.getenv("SQLPWD")
        #     SQLHOST = os.getenv("SQLHOST") 
        #     SQLPORT = os.getenv("SQLPORT") 
        #     SQLDBNAME = os.getenv("DB_NAME")
        #     connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{SQLDBNAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
            
        # if db_type.upper() == "PG":
        #     connection_string = os.getenv("PGDBCONNSTR")
            
        # # Fallback check: If your .env parser skips reading the connection string, we raise a clear warning
        # if not connection_string:
        #     raise ValueError("Database connection string (PGDBCONNSTR) is missing or could not be loaded from your .env file.")

        engine = create_engine(
                        connection_string,
                        echo=False,
                        pool_size=5,
                        max_overflow=5,
                        pool_timeout=30,
                        pool_recycle=1800,
                        pool_pre_ping=True
                    )
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(engine)
        self.SessionMaker = Session
        if self.SessionMaker:
            logger.info("Connection Established",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return self.SessionMaker
        else:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return "DB NOT CONNECTED"

        
    def find_all(self, tableName, conditions, botname= None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        session = self.SessionMaker()
        try:
            query = session.query(tableName)
            for column, value in conditions.items():
                if isinstance(value, list): 
                    query = query.filter(getattr(tableName, column).in_(value))
                else:
                    query = query.filter(getattr(tableName, column) == value)
            if botname:
                logger.info("Fetching bot type",extra=extras)
                query = query.join(tableName.bot_type).filter(BotType.bot_type == botname)
            data = query.all()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            data = [row.to_dict() for row in data]
            logger.info(f"sqldb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except Exception as e:
            session.rollback()
            logger.error(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "Unable to fetch data"), 500)
        finally:
            session.close()
        
    def find_one(self, tableName, conditions, botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        session = self.SessionMaker()
        try:
            query = session.query(tableName)
            for column, value in conditions.items():
                query = query.filter(getattr(tableName, column) == value)
            if botname:
                logger.info("Fetching bot type",extra=extras)
                query = query.join(tableName.bot_type).filter(BotType.bot_type == botname)
            data = query.first()
            if not data:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error":"Data not found"}), 404)
            data = data.to_dict()
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}",extra=extras)
            return make_response(jsonify({"error":"Unable to fetch data"}), 500)
        finally:
            session.close()
        
    def construct_transcript_filter(self,filters, query_filters):
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
                    }
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            
            query_filters.append(Conversation.is_deleted == False)

            if 'usernames' in filters and filters['usernames']:
                usernames = filters.get('usernames')
                if isinstance(usernames, str):
                    usernames = [usernames]
                # converting lower case because in some cases it is coming as uppercase from db and in some cases as lowercase, to maintain consistency converting it to lowercase before fetching from db
                query_filters.append(func.lower(UserDetails.value).in_([u.lower() for u in usernames]))
            if 'query' in filters and filters['query']:
                query  = filters.get('query')
                query_filters.append(Questions.question.ilike(f'%{query}%'))

            if 'start_date' in filters and filters['start_date'] and 'end_date' in filters and filters['end_date']:
                start_date = datetime.strptime(filters['start_date'], "%Y-%m-%d").date()
                end_date = datetime.strptime(filters['end_date'], "%Y-%m-%d").date()

                if 'final_start_date' in filters and filters.get('final_start_date') is not None and 'final_end_date' in filters and filters.get('final_end_date') is not None:
                    final_start_date = filters.get('final_start_date')
                    final_end_date = filters.get('final_end_date')
                    query_filters.append(
                        Conversation.date_timestamp.between(final_start_date,final_end_date))
                else:
                    query_filters.append(DateInfo.date.between(start_date, end_date))
            if 'conversation_id' in filters and filters['conversation_id']:
                conversation_id = filters.get('conversation_id')
                query_filters.append(Conversation.conversation_id.in_(conversation_id))
            
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: query constructing completed",extra=extras)
            return query_filters
        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Error occured in query constructing {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="error in constructing filter"))
    
    def get_transcript_data_db(self, filters: dict, chat_threshold, botname=None, page_number=1, page_size=10):
        try:
            extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name': 'kumaran'
            }
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Inside generate report function with data {filters}", extra=extras)
            query_filters = []
            conversation_limit_reached=False

            startIndex = abs(page_number - 1) * page_size
            endIndex = page_number * page_size

            session = self.SessionMaker()
            query_filters = self.construct_transcript_filter(filters, query_filters)
            query = session.query(
                Conversation.conversation_id, UserDetails.value, DateInfo.date, Conversation.is_pinned,Conversation.conversation_name,Conversation.created_at,Conversation.updated_at,Conversation.project_id
            ).select_from(Conversation)\
                .join(UserDetails, Conversation.username_id == UserDetails._id)\
                .join(DateInfo, Conversation.date_id == DateInfo._id)\
                .join(Hours, Conversation.hour_id == Hours._id)\
                .join(Minutes, Conversation.minute_id == Minutes._id)

            if query_filters:
                query = query.filter(*query_filters)

            if botname:
                logger.info("Fetching bot type", extra=extras)
                query = query.join(Conversation.bot_type).filter(BotType.bot_type == botname)

            print(str(query.statement.compile(compile_kwargs={"literal_binds": True})))
            total_count = query.count()
            
            if startIndex >= chat_threshold:
                result = None
                conversation_limit_reached=True
            else:
                result = query.order_by(
                    desc(Conversation.is_pinned),
                    desc(
                        func.coalesce(
                            Conversation.updated_at,
                            Conversation.date_timestamp
                        ))).slice(startIndex, endIndex).all()
                number_of_pages = math.ceil(total_count / page_size) 
            if result:
                formatted_list = [
                    [f"{email}/{record_date}/{uuid}.json", ispinned,conv_name,updated_at if updated_at else None, created_at if created_at else None,project_id]    
                    for uuid, email, record_date, ispinned, conv_name, created_at, updated_at,project_id in result

                ]
                return make_response(jsonify({"data": formatted_list, "total_no_of_pages": number_of_pages,"conversation_limit_reached":conversation_limit_reached}), 200)
            else:
                return make_response(jsonify(data=[]), 200)
        except Exception as e:
            session.rollback()
            logger.exception(f"sqldb: Error occurred while fetching data {filters}: {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)
        finally:
            session.close()
        

    def delete_conversation(self, conv_id):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        session = self.SessionMaker()
        try:
            conversation = session.query(Conversation).filter_by(conversation_id=conv_id).first()
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            if conversation.is_deleted:
                return jsonify({"message": "Conversation already deleted"}), 400
            
            conversation.is_deleted = True
            conversation.deleted_at = datetime.now()
        
            session.commit()
            return jsonify({
            "message": "Conversation deleted successfully",
            "conversation_id": conversation.conversation_id,
            "deleted_at": conversation.deleted_at.isoformat()
            }), 200
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}",extra=extras)
            return make_response(jsonify({"error":"Unable to delete Conversation"}), 500)
        finally:
            session.close()
    
    def restore_conversation(self, conv_id):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        session = self.SessionMaker()
        try:
            conversation = session.query(Conversation).filter_by(conversation_id=conv_id).first()
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            if not conversation.is_deleted:
                return jsonify({"message": "Conversation is not deleted"}), 400
            
            conversation.is_deleted = False
            conversation.deleted_at = None
        
            session.commit()
            return jsonify({
            "message": "Conversation restored successfully",
            "conversation_id": conversation.conversation_id
            }), 200
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}",extra=extras)
            return make_response(jsonify({"error":"Unable to restore Conversatoin"}), 500)
        finally:
            session.close()


    def toggle_pin_conversation(self, conv_id):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        session = self.SessionMaker()
        try:
            conversation = session.query(Conversation).filter_by(conversation_id=conv_id).first()
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404
            
            conversation.is_pinned = not conversation.is_pinned
            conversation.pinned_at = datetime.now() if conversation.is_pinned else None
        
            session.commit()
            return jsonify({
            "message": "Conversation pinned" if conversation.is_pinned else "Conversation unpinned",
            "conversation_id": conversation.conversation_id,
            "is_pinned": conversation.is_pinned,
            "pinned_at": conversation.pinned_at.isoformat() if conversation.pinned_at else None
            }), 200
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}",extra=extras)
            return make_response(jsonify({"error":"Unable to pin Conversatoin"}), 500)
        finally:
            session.close()


    def search_questions_by_user(self, user_string, query):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        session = self.SessionMaker()
        try:
            query_filters = []
            filters = {
                "usernames": [user_string],
                "query": query
            }
            query_filters = self.construct_transcript_filter(filters, query_filters)
            question_query = session.query(Conversation.conversation_id,UserDetails.value,DateInfo.date,Questions.question,Conversation.conversation_name)\
                .join(Conversation, Questions.conversation_id == Conversation._id)\
                .join(UserDetails, Conversation.username_id == UserDetails._id)\
                .join(DateInfo, Conversation.date_id == DateInfo._id)

            if query_filters:
                question_query = question_query.filter(*query_filters)

            question_results = question_query.order_by(Questions._id.desc())\
                .limit(10)\
                .all()

            question_results = [{
                'conversationID': r[0],
                'user_string': r[1],
                'date_info': r[2],
                'question': r[3],
                'conersationName': r[4]
            } for r in question_results]
            #CONVERSATION SEARCH
            conversation_filters = []
            conversation_filters.append(Conversation.is_deleted == False)
            conversation_filters.append(UserDetails.value == user_string)
            if query:
                conversation_filters.append(
                    Conversation.conversation_name.ilike(f'%{query}%')
                )
            conversation_query = session.query(
                distinct(Conversation.conversation_id),
                UserDetails.value,
                DateInfo.date,
                Conversation.conversation_name
            ).join(UserDetails, Conversation.username_id == UserDetails._id)\
            .join(DateInfo, Conversation.date_id == DateInfo._id)
            if conversation_filters:
                conversation_query = conversation_query.filter(*conversation_filters)

            conversation_results = conversation_query.order_by(DateInfo.date.desc())\
                .limit(10)\
                .all()

            conversation_results = [{
                'conversationID': r[0],
                'user_string': r[1],
                'date_info': r[2],
                'conersationName': r[3]
            } for r in conversation_results]
            #FINAL RESPONSE
            return {
                "question_search": question_results,
                "conversation_search": conversation_results
            }
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}",extra=extras)
            return make_response(jsonify({"error":"Unable to Search history"}), 500)
        


    def get_conversation_page(self, conversation_id, page_size=20):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': 'get_conversation_page',
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering get_conversation_page for {conversation_id}", extra=extras)
        try:
            session = self.SessionMaker()
            # 1. Find the conversation to get user and bot info
            conv = session.query(Conversation).filter_by(conversation_id=conversation_id).first()
            if not conv:
                return None, 404
           
            user_id = conv.username_id
            bot_type_id = conv.bot_type_id
           
            # 2. Get all conversations for this user/bot, sorted the same way as history
            query = session.query(Conversation.conversation_id)\
                .join(DateInfo, Conversation.date_id == DateInfo._id)\
                .filter(Conversation.username_id == user_id, Conversation.bot_type_id == bot_type_id, Conversation.is_deleted == False)\
                .order_by(
                    desc(Conversation.is_pinned),
                    asc(Conversation.pinned_at),
                    desc(DateInfo.date),
                    desc(Conversation.start_time)
                )
           
            all_ids = [r[0] for r in query.all()]
           
            # 3. Find index and calculate page
            try:
                index = all_ids.index(conversation_id)
                page = (index // page_size) + 1
                return page, 200
            except ValueError:
                return None, 404
               
        except Exception as e:
            logger.exception(f"Error in get_conversation_page: {e}", extra=extras)
            return None, 500
        


    def rename_conversation(self, conv_id, new_name):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        session = self.SessionMaker()
        try:
            conversation = session.query(Conversation).filter_by(conversation_id=conv_id).first()
            if not conversation:
                return jsonify({"error": "Conversation not found"}), 404

            conversation.conversation_name = new_name

            session.commit()
            return jsonify({
            "message": "Conversation renamed successfully",
            "conversation_id": conversation.conversation_id,
            "conversation_name": conversation.conversation_name
            }), 200
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}",extra=extras)
            return make_response(jsonify({"error":"Unable to rename Conversation"}), 500)
        finally:
            session.close()
            
    def list_conversation_projects(self, username=None, page=1, limit=10,is_pinned=None,created_at=None,updated_at=None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }

        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        session = self.SessionMaker()
        try:
            offset = (page - 1) * limit
            query = session.query(ConversationProject)
            if username:
                query = query.filter(ConversationProject.username == username)  
            if is_pinned is not None:
                query = query.filter(ConversationProject.is_pinned == is_pinned)
            if created_at:
                query = query.filter(func.date(ConversationProject.created_at) == created_at)
            if updated_at:
                query = query.filter(func.date(ConversationProject.updated_at) == updated_at)
            total_count = query.count()
            # projects = (query.order_by(desc(ConversationProject.created_at)).offset(offset).limit(limit).all())
            projects = query.order_by(desc(ConversationProject.is_pinned), desc(func.coalesce(ConversationProject.updated_at, ConversationProject.created_at))).offset(offset).limit(limit).all()
            return jsonify({
                "page": page,
                "limit": limit,
                "total": total_count,
                "data": [
                    {
                        "project_id": project.id,
                        "project_name": project.project_name,
                        "is_pinned": project.is_pinned,
                        "created_at": project.created_at,
                        "updated_at": project.updated_at,
                        "username": project.username
                    }
                    for project in projects
                ]
            }), 200

        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}", extra=extras)

            return make_response(
                jsonify({"error": "Unable to fetch projects"}),
                500
            )

        finally:
            session.close()

            
            
    def delete_project(self, project_id, username):
        session = self.SessionMaker()
        try:
            project = session.query(ConversationProject).filter(ConversationProject.id == project_id).first()
            if not project:
                return jsonify({"error": "Project not found"}), 404
            conversations = session.query(Conversation).filter(Conversation.project_id == project_id).all()
            logger.info(f"PROJECT ID: {project_id}")
            logger.info(f"CONVERSATIONS FOUND: {len(conversations)}")
            conversation_ids = [c._id for c in conversations]
            logger.info(f"CONVERSATION IDS: {conversation_ids}")
            question_count = session.query(Questions).filter(
                    Questions.conversation_id.in_(conversation_ids)
                ).count()
            logger.info(f"QUESTIONS FOUND: {question_count}")
            if conversation_ids:
                session.query(Questions).filter(Questions.conversation_id.in_(conversation_ids)).delete(synchronize_session=False)
            session.query(Conversation).filter(Conversation.project_id == project_id).delete(synchronize_session=False)
            session.delete(project)
            session.commit()
            return jsonify({
                "message": "Project deleted successfully",
                "project_id": project_id,
                "deleted_conversations": len(conversation_ids)
            }), 200

        except Exception as e:
            session.rollback()
            logger.exception(f"Delete Project Error: {e}")
            return make_response(jsonify(error=str(e)),500)
        finally:
            session.close()
        
    def pin_project(self, project_id, username):
        session = self.SessionMaker()
        try:
            project = session.query(ConversationProject).filter(ConversationProject.id == project_id).first()
            if not project:
                return jsonify({"error": "Project not found"}), 404
            project.is_pinned = not project.is_pinned
            project.updated_at = datetime.now(timezone.utc)
            session.commit()
            return jsonify({
                "message": "Project pin status updated",
                "project_id": project_id,
                "is_pinned": project.is_pinned
            }), 200

        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}")
            return make_response(jsonify(error="Unable to pin project"),500)
        finally:
            session.close()
        
    def share_conversation_project(self, conversation_ids, project_id):
        session = self.SessionMaker()
        try:
            count = session.query(Conversation).filter(Conversation.conversation_id.in_(conversation_ids)).update({"project_id": project_id},synchronize_session=False)
            if not count: return jsonify({"error": "Conversation not found"}), 404
            session.commit()
            return jsonify({"message": "Conversation shared successfully","project_id": project_id}), 200
        except SQLAlchemyError as e:
            session.rollback()
            logger.error(f"Error: {e}")
            return make_response(jsonify(error="Unable to share conversation"), 500)
        finally:
            session.close()
            
    
        
    def update_chat_like(self,message_id,current_user,is_like):
        extras={
            'servicename':SERVICE_NAME,
            'functionname':get_caller_frame().f_code.co_name,
            'projectname':PROJECT_NAME,
            'bot_name':'kumaran'
        }
        session=self.SessionMaker()
        try:
            rows=session.query(Questions._id,UserDetails.value).join(Conversation,Questions.conversation_id==Conversation._id).join(UserDetails,Conversation.username_id==UserDetails._id).filter(Questions.message_id==message_id).all()
            if not rows:return jsonify({"error":"Message not found"}),404
            # Make sure every matching row belongs to the current user
            for _,user_email in rows:
                logger.info(f"DB User:{user_email}, Current User:{current_user}",extra=extras)
                if user_email.strip().lower()!=current_user.strip().lower():
                    return jsonify({"error":"User mismatch"}),403
            question_ids=[r[0] for r in rows]
            count=session.query(Questions).filter(Questions._id.in_(question_ids)).update({"is_like":is_like,"liked_at":datetime.now(timezone.utc)},synchronize_session=False)
            if not count:return jsonify({"error":"Message not found"}),404
            session.commit()
            return jsonify({
                "message":"Feedback updated successfully",
                "message_id":message_id,
                "is_like":is_like
            }),200

        except Exception as e:
            session.rollback()
            logger.exception(f"Error:{e}",extra=extras)
            return make_response(jsonify({"error":"Unable to update feedback"}),500)

        finally:
            session.close()

    def get_likes_by_message_ids(self,message_ids):
        extras={
            'servicename':SERVICE_NAME,
            'functionname':get_caller_frame().f_code.co_name,
            'projectname':PROJECT_NAME,
            'bot_name':'kumaran'
        }
        if not message_ids:
            return {}
        session=self.SessionMaker()
        try:
            rows=session.query(Questions.message_id,Questions.is_like).filter(Questions.message_id.in_(message_ids)).all()
            likes={}
            for message_id,is_like in rows:
                # if duplicate rows exist, prefer the one that has a value
                if is_like is not None or message_id not in likes:
                    likes[message_id]=is_like
            return likes
        except Exception as e:
            logger.exception(f"Error fetching likes:{e}",extra=extras)
            return {}
        finally:
            session.close()


