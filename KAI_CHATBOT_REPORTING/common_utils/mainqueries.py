#abstract method imports
import os
import ast
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, func, cast, Float, desc,asc
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone, timedelta
from flask import jsonify, make_response
from sqlalchemy.exc import SQLAlchemyError
from common_utils.mainqueries import *
from models.tablemodels import *
from abc import ABC, abstractmethod
from sqlalchemy import inspect, and_, or_
from download_format.excel_formatter import excel_construction
import pandas as pd


SERVICE_NAME='CONVERSATIONAL_AI_REPORT'
PROJECT_NAME='CHATBOT'

db_type = os.getenv('DB_TYPE','sql')

#Abstract Class
class DataBaseFactory(ABC):

    @abstractmethod
    def create_connection(self):
        pass

    @abstractmethod
    def find_all(tableName,conditions, botname):
        pass

    @abstractmethod
    def find_one(tableName,conditions, botname):
        pass

    @abstractmethod
    def update_one(tableName,conditions,updateValues,botname):
        pass

    @abstractmethod
    def delete(tableName,conditions,botname):
        pass

    @abstractmethod
    def insert_one(tableName, data):
        pass

    @abstractmethod
    def insert_bulk(tableName, data):
        pass

    @abstractmethod
    def searchLike(tableName,column,likeString,botname):
        pass

    @abstractmethod
    def slice(tableName,pageNumber,page_size,botname):
        pass
    
    @abstractmethod
    def manage_roles(roles, username, botname, action):
        pass

class SQLConnection:
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

        logger.info("Entering PostgreSQL database......", extra=extras)

        connection_string = os.getenv("PGDBCONNSTR")

        self.engine = create_engine(
            connection_string,
            echo=False,
            pool_size=5,
            max_overflow=5,
            pool_timeout=30,
            pool_recycle=1800,
            pool_pre_ping=True
        )

        Session = sessionmaker(
            bind=self.engine,
            autoflush=False,
            autocommit=False
        )

        self.session = Session()

        if self.session:
            return self.session
        else:
            return "DB NOT CONNECTED"

        
    def check_and_create_tables(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            # Inspect existing tables
            inspector = inspect(self.engine)
            existing_tables = inspector.get_table_names()

            # List of models to be checked/created
            models = [BotType, Conversation, Questions, Rating, ResponseTime, ResponseType, UserDetails, DateInfo, Month, Year, Week, GPT_Model, LanguageType, BugReport,BugReportAttachment]

            # Determine which tables need to be created
            tables_to_create = []
            for model in models:
                if model.__tablename__ not in existing_tables:
                    tables_to_create.append(model.__tablename__)

            # Create tables
            if tables_to_create:
                Base.metadata.create_all(self.engine)
            else:
                logger.info("All tables already exist.")
        except Exception as e:
            logger.info(f"error in table creation {e}", extra=extras)
            return False

    def find_all(self, tableName, conditions, botname=None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            current_date = datetime.now()
            query = self.session.query(tableName)
            if 'username' in conditions and conditions['username']: 
                username = conditions['username']
                if tableName == UserDetails:
                    query = self.session.query(tableName).filter(UserDetails.value.startswith(username))
                if tableName == Projects:
                    query = self.session.query(tableName).filter(Projects.username.startswith(username))
            elif tableName==Week:
                _id = current_date.isocalendar()[1]
                query = self.session.query(tableName).filter(Week._id<=_id)
            elif tableName==Month:
                _id = current_date.month
                query = self.session.query(tableName).filter(Month._id<=_id)
            data = query.all()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return data
            data = [row.to_dict() for row in data]
            logger.info(f"sqldb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def search_query(self, tableName, query):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            starts_with = (
                self.session.query(tableName)
                .filter(func.lower(tableName.value).like(f"{query}%"))
                .limit(10)
                .all()
            )

            contains = (
                self.session.query(tableName)
                .filter(func.lower(tableName.value).like(f"%{query}%"))
                .limit(10)
                .all()
            )

            results = {u._id: u for u in starts_with + contains}.values()

            final_results = [u.to_dict() for u in list(results)]

            return jsonify(final_results)
        except SQLAlchemyError as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT:  Error occurred while searching from the {tableName}: {e}",extra=extras)
            return 500
        
    def find_one(self, tableName, conditions):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = self.session.query(tableName)
            for column, value in conditions.items():
                query = query.filter(getattr(tableName, column) == value)
            data = query.first()
            if not data:
                logger.error(f"CONVERSATIONAL-AI-REPORT: data not found in {tableName}",extra=extras)
                logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return 404
            data = data.to_dict()
            if tableName==Conversation:
                logger.info(f"CONVERSATIONAL-AI-REPORT: Successfully data fetched from the {tableName} for conversation_id {conditions['conversation_id']}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT:  Error occurred while fetch one document from the {tableName}: {e}",extra=extras)
            return 500
        

    def insert_bulk(self, tableName, data):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

        try:
            # Add all data at once
            self.session.bulk_insert_mappings(tableName, data)
            self.session.commit()
            logger.info(f"CONVERSATIONAL-AI-REPORT: Successfully inserted data into {tableName}", extra=extras)
            return True
        except SQLAlchemyError as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred while inserting data into {tableName}: {e}", extra=extras)
            return False
        
    def insert_one(self,  tableName, data):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:  
            logger.info(f"CONVERSATIONAL-AI-REPORT: : data {data} for tablename {tableName}",extra=extras)
            new_data = tableName(**data)
            self.session.add(new_data)
            self.session.commit()
            return True
        except Exception as e:
            self.session.rollback()
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred while inserting one document in {tableName}: {e}",extra=extras)
            return False
        
    def search_usernames(self, username):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            logger.info(
                f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
                extra=extras
            )
            result = (
                self.session.query(Projects)
                .filter(Projects.username.ilike(f"%{username}%"))
                .all()
            )
            if not result:
                return []
            data = [row.to_dict() for row in result]
            logger.info(
                f"Username search completed successfully",
                extra=extras
            )
            return data

        except Exception as e:
            logger.exception(
                f"Error while searching usernames: {e}",
                extra=extras
            )
            return []
        
    #this to create date entry's in new tbale
    def DateTableCreation(self, year):
        session = self.session
        start_date = datetime(year, 1, 1)
        end_date = datetime(year, 12, 31)
        existing_year = session.query(Year).filter_by(value=year).first()
        if existing_year:
            year_fk_key = existing_year._id
        else:
            new_year = Year(value=year)
            session.add(new_year)
            session.commit()
            year_fk_key = new_year._id
         # Insert dates into the table
        current_date = start_date
        while current_date <= end_date:
            exists = (
                self.session.query(DateInfo._id)
                .filter(DateInfo.date == current_date.date())
                .first()
            )

            # Create an instance of your model with the date
            if not exists:
                week_number = current_date.isocalendar()[1]
                month_number = current_date.month
                date_entry = DateInfo(date=current_date.date(),week_fk=week_number,month_fk=month_number,year_fk=year_fk_key)
            
                # Add to the session
                self.session.add(date_entry)
            
            # Move to the next day
            current_date += timedelta(days=1)
        self.session.commit()

    def construct_filter(self,filters, query_filters, joins, applied_filters):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            filter_mapping = {
                'usernames': (UserDetails, UserDetails.value),
                'ratings': (Rating, Rating.value),
                'response_types': (ResponseType, ResponseType.value),
                'year': (Year, Year.value),
                'week': (Week, Week.value),
                'month': (Month, Month.value),
                'language_type': (LanguageType, LanguageType.language_type),
                'model': (GPT_Model, GPT_Model.model_name)
            }
            
            for key, (model, column) in filter_mapping.items():
                if key in filters and filters[key]:
                    values = [value.strip() for value in filters[key]] if isinstance(filters[key][0], str) else filters[key]
                    query_filters.append(column.in_(values))
                    joins.add(model)
                    applied_filters[key] = filters[key]
            
            if 'response_time' in filters and filters['response_time']:
                response_time_ranges = filters['response_time']
                tuples_list = [ast.literal_eval(item) for item in response_time_ranges]
                range_conditions = []
                for item in tuples_list:
                    if isinstance(item, tuple) and len(item) == 2:
                        min_response_time, max_response_time = item
                        range_conditions.append(
                            and_(
                                ResponseTime.start_time >= min_response_time,
                                ResponseTime.end_time <= max_response_time
                            )
                        )
                    elif isinstance(item, int):
                        min_response_time = item
                        range_conditions.append(
                            ResponseTime.start_time >= min_response_time
                        )
                if range_conditions:
                    response_time_condition = or_(*range_conditions)
                    query_filters.append(response_time_condition)
                joins.add(ResponseTime)
                applied_filters['response_time'] = filters['response_time']
            
            if 'start_date' in filters and filters['start_date']:
                start_date = datetime.strptime(filters['start_date'], "%Y-%m-%d").date()
                query_filters.append(DateInfo.date >= start_date)
                joins.add(DateInfo)
                applied_filters['start_date'] = filters['start_date']
            
            if 'end_date' in filters and filters['end_date']:
                end_date = datetime.strptime(filters['end_date'], "%Y-%m-%d").date()
                query_filters.append(DateInfo.date <= end_date)
                joins.add(DateInfo)
                applied_filters['end_date'] = filters['end_date']
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: query constructing completed",extra=extras)
            return query_filters,joins,applied_filters
        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Error occured in query constructing {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="error in constructing filter"))
    
    def get_all_data(self, filters=None):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            question_table = Questions
            conversation_table = Conversation
            user_table = UserDetails
            response_type_table = ResponseType
            model_table = GPT_Model
            date_table = DateInfo
            query_filters = []

            
            if filters:
                query_filters = self.construct_transcript_filter(filters, query_filters)
            query = (
                self.session.query(question_table)
                .join(conversation_table, question_table.conversation_id == conversation_table._id)
                .join(user_table, conversation_table.username_id == user_table._id)
                .join(date_table, question_table.date_id == date_table._id)
                .outerjoin(model_table, question_table.model_id == model_table._id)
            )

            if query_filters:
                query = query.filter(*query_filters)


            totals = query.with_entities(
                func.count(question_table._id).label("total_questions"),
                func.count(func.distinct(question_table.conversation_id)).label("active_conversations"),
                func.avg(question_table.response_time).label("avg_response_time"),

                func.sum(question_table.total_token).label("total_tokens"),
                func.sum(question_table.input_token).label("total_input_tokens"),
                func.sum(question_table.output_token).label("total_output_tokens"),

                func.avg(question_table.total_token).label("avg_total_tokens"),
                func.avg(question_table.input_token).label("avg_input_tokens"),
                func.avg(question_table.output_token).label("avg_output_tokens")
            ).one()

            # conv_query = (
            #     self.session.query(conversation_table)
            #     .join(user_table, conversation_table.username_id == user_table._id)
            #     .join(date_table, conversation_table.date_id == date_table._id)
            # )
            # if query_filters:
            #     conv_query = conv_query.filter(*query_filters)

            # total_conversation = conv_query.count()
            
            top_models = (
                self.session.query(
                    model_table._id.label("model_id"),
                    model_table.model_name.label("model_name"),
                    func.count(question_table._id).label("question_count")
                )
                .join(question_table, question_table.model_id == model_table._id)
                .join(conversation_table, question_table.conversation_id == conversation_table._id)
                .join(user_table, conversation_table.username_id == user_table._id)
                .join(date_table, question_table.date_id == date_table._id)
                .filter(*query_filters)
                .group_by(model_table._id, model_table.model_name)
                .order_by(desc("question_count"))
                .all()
            )
            
            response_types = (
                self.session.query(
                    response_type_table.value.label("sensitive_type"),
                    func.count(question_table._id).label("question_count")
                )
                .outerjoin(question_table, question_table.response_type_id == response_type_table._id)
                .outerjoin(conversation_table, question_table.conversation_id == conversation_table._id)
                .outerjoin(user_table, conversation_table.username_id == user_table._id)
                .outerjoin(date_table, question_table.date_id == date_table._id)
                .outerjoin(model_table, question_table.model_id == model_table._id)
                .filter(*query_filters)
                .group_by(response_type_table.value)
                .order_by(func.count(question_table._id).desc())
                .all()
            )
        

            response = {
                "total_conversations": totals.active_conversations,
                "total_questions": totals.total_questions,
                "average_response_time": int(round(totals.avg_response_time)) if totals.avg_response_time else 0,

                "total_tokens": totals.total_tokens,
                "total_input_tokens": totals.total_input_tokens,
                "total_output_tokens": totals.total_output_tokens,

                "average_total_tokens": int(round(totals.avg_total_tokens)) if totals.avg_total_tokens else 0,
                "average_input_tokens": int(round(totals.avg_input_tokens)) if totals.avg_input_tokens else 0,
                "average_output_tokens": int(round(totals.avg_output_tokens)) if totals.avg_output_tokens else 0,
                "top_models_used": [
                        {
                            "model_id": m.model_id,
                            "model_name": m.model_name,
                            "conversation_count": m.question_count
                        }
                        for m in top_models
                    ],
                "reponse_types":
                    {
                        type: count for type, count in response_types
                    }
                
                }

            return response
        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Error occured in query constructing {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="error in data")),500
        

    def get_most(self, filters=None):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            question_table = Questions
            conversation_table = Conversation
            user_table = UserDetails
            response_type_table = ResponseType
            model_table = GPT_Model
            date_table = DateInfo

            totalUsers = self.session.query(
                func.count(user_table._id).label("total_users")).one()

            query_filters = []
            if filters:
                query_filters = self.construct_transcript_filter(filters, query_filters)
            

            most_tokens_query = (
                self.session.query(
                    user_table._id,
                    user_table.value,
                    func.sum(question_table.total_token).label("total_tokens_used")
                )
                .join(conversation_table, conversation_table.username_id == user_table._id)
                .join(question_table, question_table.conversation_id == conversation_table._id)
                .join(date_table, question_table.date_id == date_table._id)
                .outerjoin(model_table, question_table.model_id == model_table._id)
            )
            if query_filters:
                most_tokens_query = most_tokens_query.filter(*query_filters)
            most_tokens_users = (
                most_tokens_query
                .group_by(user_table._id, user_table.value)
                .order_by(desc("total_tokens_used"))
                .limit(5)
                .all()
            )

            most_conversations_query = (
                self.session.query(
                    user_table._id,
                    user_table.value,
                    func.count(func.distinct(conversation_table._id)).label("conversation_count")
                )
                .join(conversation_table, conversation_table.username_id == user_table._id)
                .join(question_table, question_table.conversation_id == conversation_table._id)
                .join(date_table, question_table.date_id == date_table._id)
            )
            if query_filters:
                most_conversations_query = most_conversations_query.filter(*query_filters)
            most_conversations_users = (
                most_conversations_query
                .group_by(user_table._id, user_table.value)
                .order_by(desc("conversation_count"))
                .limit(5)
                .all()
            )
            
            most_questions_query = (
                self.session.query(
                    user_table._id,
                    user_table.value,
                    func.count(question_table._id).label("questions_count")
                )
                .join(conversation_table, conversation_table.username_id == user_table._id)
                .join(question_table, question_table.conversation_id == conversation_table._id)
                .join(date_table, question_table.date_id == date_table._id)
            )
            if query_filters:
                most_questions_query = most_questions_query.filter(*query_filters)
            most_questions_users = (
                most_questions_query
                .group_by(user_table._id, user_table.value)
                .order_by(desc("questions_count"))
                .limit(5)
                .all()
            )

            most_sensitive_query = (
                self.session.query(
                    user_table._id,
                    user_table.value,
                    func.count(question_table._id).label("sensitive_questions_count")
                )
                .join(conversation_table, conversation_table.username_id == user_table._id)
                .join(question_table, question_table.conversation_id == conversation_table._id)
                .join(date_table, question_table.date_id == date_table._id)
                .join(response_type_table, question_table.response_type_id == response_type_table._id)
                .filter(response_type_table.value == "sensitive")
            )
            if query_filters:
                most_sensitive_query = most_sensitive_query.filter(*query_filters)
            most_sensitive_users = (
                most_sensitive_query
                .group_by(user_table._id, user_table.value)
                .order_by(desc("sensitive_questions_count"))
                .limit(5)
                .all()
            )

            
            response = {
                "total_registered_users": totalUsers.total_users,
                "most_tokens_user": [
                    {
                        "user_id": user._id,
                        "user_value": user.value,
                        "total_tokens_used": int(user.total_tokens_used)
                    }
                    for user in most_tokens_users
                ],
                "most_conversations_user": [
                    {
                        "user_id": user._id,
                        "user_value": user.value,
                        "conversation_count": int(user.conversation_count)
                    }
                    for user in most_conversations_users
                ],
                "most_questions_user": [
                    {
                        "user_id": user._id,
                        "user_value": user.value,
                        "questions_count": int(user.questions_count)
                    }
                    for user in most_questions_users
                ],
                "most_sensitive_questions_user": [
                    {
                        "user_id": user._id,
                        "user_value": user.value,
                        "sensitive_questions_count": int(user.sensitive_questions_count)
                    }
                    for user in most_sensitive_users
                ]
            }

            return response

        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Error occured in query constructing {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="error in data")),500

    def get_user_usage_report(self, report_type="weekly", report_period="current"):
        extras = {
            "servicename": SERVICE_NAME,
            "functionname": get_caller_frame().f_code.co_name,
            "projectname": PROJECT_NAME,
            "bot_name": "kumaran",
        }
        try:
            today = datetime.now(timezone.utc).date()
            rtype, rperiod = report_type.lower(), report_period.lower()

            if rtype == "weekly":
                monday = today - timedelta(days=today.weekday())
                if rperiod == "current":
                    period_start, period_end = monday, today
                elif rperiod == "previous":
                    period_start = monday - timedelta(days=7)
                    period_end = period_start + timedelta(days=4)
                else:
                    raise ValueError("Unsupported weekly report_period")

            elif rtype == "monthly":
                m_start = today.replace(day=1)
                if rperiod == "current":
                    period_start, period_end = m_start, today
                elif rperiod == "previous":
                    period_end = m_start - timedelta(days=1)
                    period_start = period_end.replace(day=1)
                else:
                    raise ValueError("Unsupported monthly report_period")
            else:
                raise ValueError("Unsupported report_type")

            users = (
                self.session.query(
                    UserDetails.value.label("username"),
                    func.sum(Questions.total_token).label("total_tokens_used"),
                    func.count(Questions._id).label("questions_raised"),
                    func.count(func.distinct(Conversation._id)).label("conversation_count"),
                )
                .join(Conversation, Conversation.username_id == UserDetails._id)
                .join(Questions, Questions.conversation_id == Conversation._id)
                .join(DateInfo, Questions.date_id == DateInfo._id)
                .filter(DateInfo.date >= period_start, DateInfo.date <= period_end)
                .group_by(UserDetails._id, UserDetails.value)
                .order_by(func.sum(Questions.total_token).desc())
                .all()
            )

            return {
                "report_type": report_type,
                "report_period": report_period,
                "period_start": str(period_start),
                "period_end": str(period_end),
                "users": [
                    {
                        "rank": r,
                        "username": u.username,
                        "total_tokens_used": int(u.total_tokens_used or 0),
                        "questions_raised": int(u.questions_raised or 0),
                        "conversation_count": int(u.conversation_count or 0),
                    }
                    for r, u in enumerate(users, start=1)
                ],
            }
        except Exception as e:
            logger.exception(f"Error generating usage report: {e}", extra=extras)
            return {
                "report_type": report_type,
                "report_period": report_period,
                "period_start": None,
                "period_end": None,
                "users": [],
            }
            
    def construct_transcript_filter(self, filters, query_filters):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

            if 'usernames' in filters and filters['usernames']:
                usernames = filters.get('usernames')
                query_filters.append(UserDetails.value.in_(usernames))

            if 'user_email' in filters and filters['user_email']:
                query_filters.append(UserDetails.value == filters['user_email'])

            if 'start_date' in filters and filters['start_date']:
                start_date = datetime.strptime(filters['start_date'], "%Y-%m-%d").date()
                query_filters.append(DateInfo.date >= start_date)

            
            if 'end_date' in filters and filters['end_date']:
                end_date = datetime.strptime(filters['end_date'], "%Y-%m-%d").date()
                query_filters.append(DateInfo.date <= end_date)

            if 'start_hour' in filters and filters.get('start_hour'):
                start_hour = filters.get('start_hour')
                query_filters.append(Hours.value >= start_hour)

            if 'end_hour' in filters and filters.get('end_hour'):
                end_hour = filters.get('end_hour')
                query_filters.append(Hours.value <= end_hour)
            
            if 'start_minute' in filters and filters.get('start_minute'):
                start_minute = filters.get('start_minute')
                query_filters.append(Minutes.value >= start_minute)

            if 'end_minute' in filters and filters.get('end_minute'):
                end_minute = filters.get('start_minute')
                query_filters.append(Minutes.value <= end_minute)
            
            if 'gpt_model' in filters and filters.get('gpt_model'):
                gpt_model = filters.get('gpt_model')
                query_filters.append(GPT_Model.model_name.in_(gpt_model)) 

            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: query constructing completed",extra=extras)
            return query_filters
        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Error occured in query constructing {e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="error in constructing filter"))
    
    def get_query(self,group_by_column,aggregation_type):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            aggregation_funcs = {
            'performance': (
                lambda: (
                    self.session.query(func.avg(cast(Questions.response_time, Float))).select_from(Questions)
                )
            ),
            'feedback': (
                lambda: (
                    self.session.query(func.avg(cast(Rating.value, Float))).select_from(Questions)
                )
            ),
            'tokenutilized': (
                lambda: (
                    self.session.query(
                        func.sum(Questions.input_token).label('total_input_tokens'),
                        func.sum(Questions.output_token).label('total_output_tokens')
                    ).select_from(Questions))
            ),
            'usage': (
                lambda: (
                    self.session.query(func.sum(Conversation.no_of_questions).label('question_count')).select_from(Conversation)                )
            ),
            'grouped_performance': (
                lambda: (
                    self.session.query(
                        group_by_column.label('group_by_value'),
                        func.avg(cast(Questions.response_time, Float)).label('average_response_time')
                    ).select_from(Questions))
            ),
            'grouped_feedback': (
                lambda: (
                    self.session.query(
                        group_by_column.label('group_by_value'),
                        func.avg(cast(Rating.value, Float)).label('average_rating')
                    ).select_from(Questions)
                )
            ),
            'grouped_tokenutilized': (
                lambda: (
                    self.session.query(
                        group_by_column.label('group_by_value'),
                        func.sum(Questions.input_token).label('total_input_tokens'),
                        func.sum(Questions.output_token).label('total_output_tokens')
                    ).select_from(Questions))
            ),
            'grouped_usage': (
                lambda: (
                    self.session.query(
                        group_by_column.label('group_by_value'),
                        func.sum(Conversation.no_of_questions).label('question_count')
                    ).select_from(Conversation)
                        )
                            )
                                }

            query_func = aggregation_funcs.get(aggregation_type)
            if query_func:
                return query_func()
            else:
                raise ValueError("Invalid aggregation type")

        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Error occured in getting query -{e}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Error occured in getting query"))
    
    def apply_group_by_joins(self,filters, query, joins):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            join_mapping = {
                'usernames': (UserDetails, Conversation.username_id == UserDetails._id),
                'ratings': (Rating, Questions.rating_id == Rating._id),
                'response_types': (ResponseType, Questions.response_type_id == ResponseType._id),
                'response_time': (ResponseTime, Questions.response_time_id == ResponseTime._id),
                'year': (Year, DateInfo.year_fk == Year._id),
                'month': (Month, DateInfo.month_fk == Month._id),
                'week': (Week, DateInfo.week_fk == Week._id),
                'language': (LanguageType, Conversation.language_type_id == LanguageType._id),
                'model': (GPT_Model, Conversation.gpt_model_id == GPT_Model._id)
            }
            group_by = filters.get('group_by')
            for filter_key in join_mapping:
                model, condition = join_mapping[filter_key]
                if group_by == filter_key or model in joins:
                    query = query.join(model, condition)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return query
        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"Exception in applying joins {e}", extra=extras)

    def apply_transcript_group_by_joins(self,filters, query, joins):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            join_mapping = {
                'usernames': (UserDetails, Conversation.username_id == UserDetails._id),

            }
            group_by = filters.get('group_by')
            for filter_key in join_mapping:
                model, condition = join_mapping[filter_key]
                if group_by == filter_key or model in joins:
                    query = query.join(model, condition)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return query
        except Exception as e:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"Exception in applying joins {e}", extra=extras)


    def get_main_query(self,query,aggregation_type):
        
        if aggregation_type == 'feedback':
            query = query.join(Conversation, Questions.conversation_id == Conversation._id)\
                            .join(Rating, Questions.rating_id == Rating._id)\
                            .join(DateInfo, Questions.date_id == DateInfo._id)
        elif aggregation_type == 'usage':
            query = query.join(Questions, Questions.conversation_id == Conversation._id)\
                    .join(DateInfo, Conversation.date_id == DateInfo._id)
        else:
            query = query.join(Conversation, Questions.conversation_id == Conversation._id)\
                    .join(DateInfo, Questions.date_id == DateInfo._id)
        return query

    def handle_query_result(self,query, data_df, report_type, group_by_column, extras, platform_language):
        result = query.all() 
        if not result or None in result[0]:
            return None
        field_translations = {
                                'en': {
                                    'Value': 'Value',
                                    'Average Response Time': 'Average Response Time',
                                    'Average Rating': 'Average Rating',
                                    'Input Token': 'Input Token',
                                    'Output Token': 'Output Token',
                                    'Question Count': 'Question Count'
                                },
                                'fr': {
                                    'Value': 'Valeur',
                                    'Average Response Time': 'Temps de Réponse Moyen',
                                    'Average Rating': 'Évaluation Moyenne',
                                    'Input Token': 'Jeton d\'Entrée',
                                    'Output Token': 'Jeton de Sortie',
                                    'Question Count': 'Nombre de Questions'
                                }
                            }
        translations = field_translations.get(platform_language, {})
        if group_by_column:
            for row in result:
                data_entry = {
                                translations.get("Value", "Value"): row.group_by_value
                            }
                if report_type == 'performance':
                    data_entry[translations.get("Average Response Time", "Average Response Time")] = f"{round(row.average_response_time)} seconds"
                elif report_type == 'feedback':
                    data_entry[translations.get("Average Rating", "Average Rating")] = f"{round(row.average_rating)}"
                elif report_type == 'tokenutilized':
                    data_entry[translations.get("Input Token", "Input Token")] = f"{round(row.total_input_tokens)}"
                    data_entry[translations.get("Output Token", "Output Token")] = f"{round(row.total_output_tokens)}"
                elif report_type == 'usage':
                    data_entry[translations.get("Question Count", "Question Count")] = f"{round(row.question_count)}"
                data_df.append(data_entry)
            return data_df
        else:
            data_entry = {
                            translations.get("Average Response Time", "Average Response Time"): f"{round(result[0][0])} seconds" if report_type == 'performance' else None,
                            translations.get("Average Rating", "Average Rating"): f"{round(result[0][0])}" if report_type == 'feedback' else None,
                            translations.get("Input Token", "Input Token"): f"{round(result[0][0])}" if report_type == 'tokenutilized' else None,
                            translations.get("Output Token", "Output Token"): f"{round(result[0][1])}" if report_type == 'tokenutilized' else None,
                            translations.get("Question Count", "Question Count"): f"{round(result[0][0])}" if report_type == 'usage' else None
                        }
            data_df.append({k: v for k, v in data_entry.items() if v is not None})
            logger.info(f"CONVERSATIONAL-AI-REPORT: Query execution completed for {report_type}", extra=extras)
            return data_df

    def generate_report(self, filters: dict, combination=False):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            # Prepare filters and joins based on the provided dictionary
            logger.info(f"CONVERSATIONAL-AI-REPORT: Inside generate report function with data {filters}", extra=extras)
            query_filters, joins, data_df, applied_filters = [], set(), [], {}
            # Define the mapping for group by columns
            platform_language = filters['platform_language']
            GROUP_BY_MAPPING = {
                    'usernames': UserDetails.value,
                    'response_types': ResponseType.value,
                    'ratings': Rating.value,
                    'response_time': ResponseTime._id,
                    'year': Year.value,
                    'week': Week.value,
                    'month': Month.value,
                    "language":LanguageType.language_type,
                    "model":GPT_Model.model_name,
                    "date":DateInfo.date
                }
            query_filters,joins,applied_filters = self.construct_filter(filters, query_filters, joins, applied_filters)
            
            group_by_column = GROUP_BY_MAPPING.get(filters['group_by'])

            logger.info(f"CONVERSATIONAL-AI-REPORT: applied filters are : {applied_filters} with group by column : {group_by_column}", extra=extras)
            
            if 'group_by' in filters and filters['group_by']:
                query = self.get_query(group_by_column=group_by_column,aggregation_type=f"grouped_{filters['report']}")
            else:
                query = self.get_query(group_by_column=group_by_column,aggregation_type=filters['report'])
            
            if group_by_column:
                logger.info(f"CONVERSATIONAL-AI-REPORT: Group will be performed",extra=extras)
                applied_filters['group_by'] = filters['group_by']
                
            #Getting main join query
            query = self.get_main_query(query,aggregation_type=filters['report'])
            
            #Joining needed the filter and group by table
            query = self.apply_group_by_joins(filters,query,joins)

            # Apply all filters
            if query_filters:
                query = query.filter(*query_filters)

            report_type = filters.get('report')
            if report_type not in ['performance', 'feedback', 'tokenutilized', 'usage']:
                return make_response(jsonify(error= 'Invalid Report Type'), 400)
            if group_by_column and report_type in ['performance', 'feedback', 'tokenutilized', 'usage']:
                query = query.group_by(group_by_column)
            data = self.handle_query_result(query, data_df, report_type, group_by_column, extras, platform_language)
            if data is None:
                # if data.status_code == 404:
                return data,applied_filters
            if filters['group_by'] == 'response_time':
                values = self.find_all(tableName=ResponseTime,conditions={})
                id_to_time = {item['_id']: (item['start_time'], item['end_time']) for item in values}
                for item in data:
                    value_id = item['Value']
                    if value_id in id_to_time:
                        item['Value'] = id_to_time[value_id]
            if combination:
                return pd.DataFrame(data),applied_filters
            df_data = pd.DataFrame(data)
            response = excel_construction(applied_filters=applied_filters,df_data=df_data,type=[filters['report']],platform_language=platform_language)
            return response,applied_filters
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data {filters}: {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)
        

    def get_transcript_data(self, filters: dict):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            # Prepare filters and joins based on the provided dictionary
            logger.info(f"CONVERSATIONAL-AI-REPORT: Inside generate report function with data {filters}", extra=extras)
            query_filters = []

            query_filters = self.construct_transcript_filter(filters, query_filters)
            query = self.session.query(Conversation.conversation_id,UserDetails.value,DateInfo.date).select_from(Conversation)\
                            .join(UserDetails, Conversation.username_id == UserDetails._id)\
                            .join(DateInfo, Conversation.date_id == DateInfo._id)\
                            .join(Hours, Conversation.hour_id == Hours._id )\
                            .join(Minutes,Conversation.minute_id == Minutes._id)
            

            if query_filters:
                query = query.filter(*query_filters)
            
            result = query.all() 
            result = [{
                    'conversationID':r[0],
                    'user_string':r[1],
                    'date_info': r[2],
                }
                for r in result]
            return result
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data {filters}: {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)
        
    def get_questions(self, filters: dict):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            # Prepare filters and joins based on the provided dictionary
            logger.info(f"CONVERSATIONAL-AI-REPORT: Inside generate report function with data {filters}", extra=extras)
            query_filters = []
            user_table = UserDetails
            question_table = Questions
            conversation_table = Conversation
            date_table = DateInfo

            query_filters = self.construct_transcript_filter(filters, query_filters)
            query = (
                self.session.query(
                    user_table.value.label("username"),
                    question_table.question.label("question"),
                    question_table.response.label("response"),
                    question_table.question_number,
                    conversation_table.conversation_id,
                    date_table.date.label("conversation_date"),
                    question_table.response_time.label("response_time"),
                    question_table.input_token.label("input_token"),
                    question_table.output_token.label("output_token"),
                )
                .join(
                    conversation_table,
                    question_table.conversation_id == conversation_table._id,
                )
                .join(date_table, question_table.date_id == date_table._id)
                .join(user_table, conversation_table.username_id == user_table._id)
            )

            if query_filters:
                query = query.filter(*query_filters)

            query = query.order_by(date_table.date, user_table.value, conversation_table.conversation_id, question_table.question_number)

            result = query.all()
            questions_list = []
            for row in result:
                questions_list.append(
                    {
                        "username": row.username,
                        "question": row.question,
                        "response": row.response,
                        "question_number": row.question_number,
                        "conversation_id": row.conversation_id,
                        "conversation_date": row.conversation_date.strftime(
                            "%Y-%m-%d"
                        ),
                        "response_time": f"{row.response_time}s",
                        "input_token": row.input_token,
                        "output_token": row.output_token,
                    }
                )
            return questions_list
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data {filters}: {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)
    
    def get_question_report_api_service(
            self,
            usernames=None,
            project_id=None,
            start_date=None,
            end_date=None,
            model_name=None
        ):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        try:
            logger.info(
                f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
                extra=extras
            )
            query = self.session.query(ProjectAPiCalls)
            if usernames:
                query = query.filter(ProjectAPiCalls.username.in_(usernames))
            if project_id:
                query = query.filter(ProjectAPiCalls.project_id == project_id)
            if model_name:
                query = query.filter(ProjectAPiCalls.model_name.in_(model_name))
            if start_date:
                start_date_obj = datetime.strptime(start_date,"%Y-%m-%d")
                query = query.filter(ProjectAPiCalls.date_and_time >= start_date_obj)
            if end_date:
                end_date_obj = datetime.strptime(end_date,"%Y-%m-%d") + timedelta(days=1)
                query = query.filter(ProjectAPiCalls.date_and_time < end_date_obj)
            results = query.order_by(ProjectAPiCalls.date_and_time.desc()).all()
            response = []
            for row in results:
                response.append({
                    "id": row.id,
                    "conversation_id": row.conv_id,
                    "username": row.username,
                    "project_id": row.project_id,
                    "model_name": row.model_name,
                    "date_and_time": row.date_and_time.isoformat() if row.date_and_time else None,
                    "question": row.user_query,
                    "response": row.response,
                    "response_time": row.response_time,
                    "input_tokens": row.input_tokens,
                    "output_tokens": row.output_tokens
                })
            logger.info(
                f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",
                extra=extras
            )
            return response
        except Exception as e:
            logger.exception(f"sqldb: Error in get_question_report_api_service: {e}",extra=extras)
            return make_response(jsonify(error="Unable to fetch data"),500)  

    def get_pending_users(self, page, limit):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

            offset = (page - 1) * limit
            pending_users = (
                    self.session.query(
                        UserRegDetails.email,
                        UserRegDetails.models,
                        UserRegDetails.approved
                    )
                    .filter(UserRegDetails.approved == "pending")
                    .all()
                    )
            

            pending_users_count = (
                self.session.query(func.count(UserRegDetails._id))
                .filter(UserRegDetails.approved == "pending")
                .scalar()
            )

            response = {
                "pending_count": pending_users_count,
                "pending_users": [
                    {
                        "email": email,
                        "models": models,
                        "approved": approved,
                    }
                    for email, models, approved in pending_users
                ]
            }

            return response
        
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data : {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)
        
    def get_model_usage(self, filters):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            model_table = GPT_Model
            question_table = Questions
            conversation_table = Conversation
            date_table = DateInfo
            query_filters = []
            query_filters = self.construct_transcript_filter(filters, query_filters)
            query = (
                self.session.query(
                    date_table.date.label("date"),
                    model_table.model_name.label("gpt_model"),
                    func.count(question_table._id).label("questions_count")
                )
                .join(conversation_table, question_table.conversation_id == conversation_table._id)
                .join(date_table, question_table.date_id == date_table._id)
                .outerjoin(model_table, question_table.model_id == model_table._id)
            )
            if query_filters:
                query = query.filter(*query_filters)
            
            query = query\
                .group_by(date_table.date, model_table.model_name)\
                .order_by(date_table.date, model_table.model_name)
            
            results = query.all()

            stats = [
                {
                    "date": row.date.strftime("%Y-%m-%d"),
                    "gpt_model": row.gpt_model,
                    "questions_count": row.questions_count
                }
                for row in results
            ]

            return stats
        
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data : {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)

###########----API User Queries----###########
    def get_api_user_summary(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            
            result = self.session.query(
                func.count(func.distinct(Projects.project_id)).label("total_projects"),
                func.sum(Projects.total_requests_used).label("total_requests_used"),
                func.sum(Projects.total_tokens_used).label("total_tokens_used"),
                func.sum(Projects.requests_used).label("requests_used_today"),
                func.sum(Projects.tokens_used).label("tokens_used_today"),
                func.sum(Projects.requests_per_day - Projects.requests_used).label("requests_remaining"),
                func.sum(Projects.tokens_per_day - Projects.tokens_used).label("tokens_remaining"),
            ).one()

            return jsonify({
                "total_projects": result.total_projects,
                "total_requests_used": result.total_requests_used,
                "total_tokens_used": result.total_tokens_used,
                "requests_used_today": result.requests_used_today,
                "tokens_used_today": result.tokens_used_today,
                "requests_remaining": result.requests_remaining,
                "tokens_remaining": result.tokens_remaining
            })
        
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data : {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_api_user_project_report(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            
            data = []
            projects = self.session.query(Projects).filter(Projects.is_revoked == False).all()
            for p in projects:
                data.append({
                    "id": p.id,
                    "username": p.username,
                    "project_id": p.project_id,
                    "client_secret": p.client_secret,
                    "requests_used_today": p.requests_used,
                    "requests_per_day": p.requests_per_day,
                    "requests_remaining_today": p.requests_per_day - p.requests_used,
                    "tokens_used_today": p.tokens_used,
                    "tokens_per_day": p.tokens_per_day,
                    "tokens_remaining_today": p.tokens_per_day - p.tokens_used,
                    "token_resetted_at": p.reset_at.isoformat(),
                    "overall_requests_used": p.total_requests_used,
                    "overall_tokens_used": p.total_tokens_used
                })

            return jsonify(data)
        
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data : {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_max_tokens_used_user(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.tokens_used
            ).order_by(Projects.tokens_used.desc()).first()

            return jsonify({
                "username": result.username if result else None,
                "project_id": result.project_id if result else None,
                "tokens_used": result.tokens_used if result else None
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_max_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)

    def get_min_tokens_used_user(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.tokens_used
            ).order_by(Projects.tokens_used.asc()).first()

            return jsonify({
                "username": result.username if result else None,
                "project_id": result.project_id if result else None,
                "tokens_used": result.tokens_used if result else None
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_min_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_overall_max_tokens_used_user(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.total_tokens_used
            ).order_by(Projects.total_tokens_used.desc()).first()

            return jsonify({
                "username": result.username if result else None,
                "project_id": result.project_id if result else None,
                "total_tokens_used": result.total_tokens_used if result else None
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_overall_max_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_overall_min_tokens_used_user(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.total_tokens_used
            ).order_by(Projects.total_tokens_used.asc()).first()

            return jsonify({
                "username": result.username if result else None,
                "project_id": result.project_id if result else None,
                "total_tokens_used": result.total_tokens_used if result else None
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_overall_min_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)

    def list_projects(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(Projects.project_id).distinct().all()

            return jsonify({
                "projects": [r.project_id for r in result]
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in list_projects: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)

    def list_usernames(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(Projects.username).distinct().all()

            return jsonify({
                "usernames": [r.username for r in result]
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in list_usernames: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)

    def list_revoked_users(self, page, limit):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            offset = (page - 1) * limit
            total_count = self.session.query(Projects)\
                .filter(Projects.is_revoked == True)\
                .count()
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.revoked_at
            ).filter(Projects.is_revoked == True)\
            .offset(offset)\
            .limit(limit)\
            .all()
            revoked_users = [{
                    "username": r.username,
                    "project_id": r.project_id,
                    "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None
                }
                for r in result
            ]
            return jsonify({
                "page": page,
                "limit": limit,
                "total": total_count,
                "total_pages": (total_count + limit - 1) // limit,
                "count": len(revoked_users),
                "data": revoked_users
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in list_revoked_users: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)

    def get_user_details_by_username(self, username):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(Projects).filter(
                Projects.username == username
            ).all()

            if not result:
                return jsonify({"error": "User not found"}), 404

            return jsonify({
                "user_details": [
                    {
                        "username": r.username,
                        "project_id": r.project_id,
                        "requests_used": r.requests_used,
                        "tokens_used": r.tokens_used,
                        "reset_at": r.reset_at
                    }
                    for r in result
                ]
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_user_details_by_username: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)


################################################################################################33
# NEW API SERVICE Related Queries
#################################################################################################3
    def get_user_summary_api_service(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            
            result = self.session.query(
                func.count(func.distinct(Projects.project_id)).label("total_projects"),
                func.sum(Projects.total_requests_used).label("total_requests_used"),
                func.sum(Projects.total_tokens_used).label("total_tokens_used"),
                func.sum(Projects.requests_used).label("requests_used_today"),
                func.sum(Projects.tokens_used).label("tokens_used_today"),
                func.sum(Projects.requests_per_day - Projects.requests_used).label("requests_remaining"),
                func.sum(Projects.tokens_per_day - Projects.tokens_used).label("tokens_remaining"),
            ).one()

            return jsonify({
                "total_projects": result.total_projects,
                "total_requests_used": result.total_requests_used,
                "total_tokens_used": result.total_tokens_used,
                "requests_used_today": result.requests_used_today,
                "tokens_used_today": result.tokens_used_today,
                "requests_remaining": result.requests_remaining,
                "tokens_remaining": result.tokens_remaining
            })
        
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data : {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_user_project_report_api_service(self, page, limit):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            offset = (page - 1) * limit
            total_count = self.session.query(Projects)\
                .filter(Projects.is_revoked == False)\
                .count()
            projects = self.session.query(Projects)\
                .filter(Projects.is_revoked == False)\
                .offset(offset)\
                .limit(limit)\
                .all()
            data = []
            for p in projects:
                model_wise_total_usuages = self.session.query(ProjectApiTokenUsuage)\
                    .filter(
                        ProjectApiTokenUsuage.username == p.username,
                        ProjectApiTokenUsuage.project_id == p.project_id
                    ).all()
                model_ususage_data = [
                    {"model_name":model.model_name,"total_input_tokens":model.total_input_tokens,"total_output_tokens":model.total_output_tokens}
                    for model in model_wise_total_usuages]
                data.append({
                    "id": p.id,
                    "username": p.username,
                    "project_id": p.project_id,
                    "client_secret": p.client_secret,
                    "requests_used_today": p.requests_used,
                    "requests_per_day": p.requests_per_day,
                    "requests_remaining_today": p.requests_per_day - p.requests_used,
                    "system_prompt":p.system_prompt,
                    "tokens_used_today": p.tokens_used,
                    "tokens_per_day": p.tokens_per_day,
                    "tokens_remaining_today": p.tokens_per_day - p.tokens_used,
                    "token_resetted_at": p.reset_at.isoformat(),
                    "model_wise_usuage":model_ususage_data
                })
            return jsonify({
                        "page": page,
                        "limit": limit,
                        "total": total_count,
                        "total_pages": (total_count + limit - 1) // limit,
                        "count": len(data),
                        "data": data
                    })
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data : {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_max_tokens_used_user_api_service(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.tokens_used
            ).order_by(Projects.tokens_used.desc()).first()

            return jsonify({
                "username": result.username if result else None,
                "project_id": result.project_id if result else None,
                "tokens_used": result.tokens_used if result else None
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_max_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)

    def get_min_tokens_used_user_api_user(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(
                Projects.username,
                Projects.project_id,
                Projects.tokens_used
            ).order_by(Projects.tokens_used.asc()).first()

            return jsonify({
                "username": result.username if result else None,
                "project_id": result.project_id if result else None,
                "tokens_used": result.tokens_used if result else None
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_min_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_overall_max_tokens_used_user_api_service(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            ranked_subq = (
            self.session.query(
                ProjectApiTokenUsuage.model_name,
                ProjectApiTokenUsuage.username,
                ProjectApiTokenUsuage.project_id,
                ProjectApiTokenUsuage.total_output_tokens, 
                func.row_number().over(
                    partition_by=ProjectApiTokenUsuage.model_name,       
                    order_by=desc(ProjectApiTokenUsuage.total_output_tokens) 
                ).label('rank')).subquery())
            result = (
            self.session.query(
                ranked_subq.c.model_name,ranked_subq.c.username,
                ranked_subq.c.project_id,ranked_subq.c.total_output_tokens
                ).filter(ranked_subq.c.rank == 1).all())
            top_users_by_model = list()
            for top_user in result:
                top_users_by_model.append({"username":top_user.username,
                                           "project_id":top_user.project_id,
                                           "model_name":top_user.model_name,
                                           "total_tokens":top_user.total_output_tokens})
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return jsonify(top_users_by_model)
        except Exception as e:
            logger.exception(f"sqldb: Error in get_overall_max_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def get_overall_min_tokens_used_user_api_service(self):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            ranked_subq = (
            self.session.query(
                ProjectApiTokenUsuage.model_name,
                ProjectApiTokenUsuage.username,
                ProjectApiTokenUsuage.project_id,
                ProjectApiTokenUsuage.total_output_tokens, 
                func.row_number().over(
                    partition_by=ProjectApiTokenUsuage.model_name,       
                    order_by=asc(ProjectApiTokenUsuage.total_output_tokens) 
                ).label('rank')).subquery())
            result = (
            self.session.query(
                ranked_subq.c.model_name,ranked_subq.c.username,
                ranked_subq.c.project_id,ranked_subq.c.total_output_tokens
                ).filter(ranked_subq.c.rank == 1).all())
            top_users_by_model = list()
            for top_user in result:
                top_users_by_model.append({"username":top_user.username,
                                           "project_id":top_user.project_id,
                                           "model_name":top_user.model_name,
                                           "total_tokens":top_user.total_output_tokens})
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return jsonify(top_users_by_model)

        except Exception as e:
            logger.exception(f"sqldb: Error in get_overall_min_tokens_used_user: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    
    def get_user_details_by_username_api_service(self, usernames=None, project_id=None,start_date=None,end_date=None,model_name=None):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            project_query = self.session.query(Projects)
            if isinstance(usernames, list):
                usernames = [u for u in usernames if u and u.strip()]
                if not usernames:
                    usernames = None
            if usernames:
                if isinstance(usernames, list):
                    project_query = project_query.filter(Projects.username.in_(usernames))
                else:
                    project_query = project_query.filter(Projects.username == usernames)
            if project_id:
                project_query = project_query.filter(Projects.project_id == project_id)
            result = project_query.all()
            user_usage_map = {}
            filtered_summary = []
            if start_date and end_date:
                start_date_obj = datetime.strptime(start_date, "%Y-%m-%d")
                end_date_obj = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
                query = self.session.query(ProjectAPiCalls.username,ProjectAPiCalls.project_id,ProjectAPiCalls.model_name,
                    func.date(ProjectAPiCalls.date_and_time).label("usage_date"),
                    func.count(ProjectAPiCalls.id).label("user_query"),
                    func.sum(ProjectAPiCalls.input_tokens).label("total_input_tokens"),
                    func.sum(ProjectAPiCalls.output_tokens).label("total_output_tokens")
                ).filter(ProjectAPiCalls.date_and_time >= start_date_obj,ProjectAPiCalls.date_and_time < end_date_obj)
                if usernames:
                    if isinstance(usernames, list):
                        query = query.filter(ProjectAPiCalls.username.in_(usernames))
                    else:
                        query = query.filter(ProjectAPiCalls.username == usernames)
                if project_id:
                    query = query.filter(ProjectAPiCalls.project_id == project_id)
                if model_name:
                    if isinstance(model_name, list):
                        model_name = [m for m in model_name if m and m.strip()]
                        if model_name:
                            query = query.filter(ProjectAPiCalls.model_name.in_(model_name))
                    elif isinstance(model_name, str):
                        query = query.filter(ProjectAPiCalls.model_name == model_name)
                model_wise_usuage = query.group_by(ProjectAPiCalls.username,ProjectAPiCalls.project_id,ProjectAPiCalls.model_name,func.date(ProjectAPiCalls.date_and_time)).all()
                filtered_summary_query = self.session.query(
                    ProjectAPiCalls.username,
                    ProjectAPiCalls.model_name,
                    ProjectAPiCalls.username,
                    func.count(ProjectAPiCalls.id).label("total_user_query"),
                    func.sum(ProjectAPiCalls.input_tokens).label("filtered_total_input_tokens"),
                    func.sum(ProjectAPiCalls.output_tokens).label("filtered_total_output_tokens")).filter(
                    ProjectAPiCalls.date_and_time >= start_date_obj,
                    ProjectAPiCalls.date_and_time < end_date_obj)
                if usernames:
                    if isinstance(usernames, list):
                        filtered_summary_query = filtered_summary_query.filter(
                            ProjectAPiCalls.username.in_(usernames)
                        )
                    else:
                        filtered_summary_query = filtered_summary_query.filter(
                            ProjectAPiCalls.username == usernames
                        )
                if project_id:
                    filtered_summary_query = filtered_summary_query.filter(ProjectAPiCalls.project_id == project_id)
                if model_name:
                    if isinstance(model_name, list):
                        model_name = [m for m in model_name if m and m.strip()]
                        if model_name:
                            filtered_summary_query = filtered_summary_query.filter(
                                ProjectAPiCalls.model_name.in_(model_name)
                            )
                    elif isinstance(model_name, str):
                        filtered_summary_query = filtered_summary_query.filter(
                            ProjectAPiCalls.model_name == model_name
                        )
                filtered_summary_query = filtered_summary_query.group_by(ProjectAPiCalls.username,ProjectAPiCalls.model_name).all()
                for record in model_wise_usuage:
                    username_key = record.username
                    if username_key not in user_usage_map:
                        user_usage_map[username_key] = {
                            "total_user_query": 0,
                            "model_wise_token_usuage": []
                        }
                    query_count = record.user_query or 0
                    user_usage_map[username_key]["model_wise_token_usuage"].append({
                        "usage_date": str(record.usage_date),
                        "project_id": record.project_id,
                        "model_name": record.model_name,
                        "user_query": query_count,
                        "total_input_tokens": record.total_input_tokens or 0,
                        "total_output_tokens": record.total_output_tokens or 0,
                        "overall_token_usage":
                            (record.total_input_tokens or 0) +
                            (record.total_output_tokens or 0)
                    })
                    user_usage_map[username_key]["total_user_query"] += query_count 
                for summary in filtered_summary_query:
                    filtered_summary.append({
                        "username": summary.username,
                        "total_user_query": summary.total_user_query or 0,
                        "model_name":summary.model_name,
                        "filtered_total_input_tokens":summary.filtered_total_input_tokens or 0,
                        "filtered_total_output_tokens":summary.filtered_total_output_tokens or 0,
                        "filtered_overall_tokens":(summary.filtered_total_input_tokens or 0) +(summary.filtered_total_output_tokens or 0)
                    })

            return jsonify({
                "filtered_summary":filtered_summary,
                "user_details": [
                    {
                        "username": r.username,
                        "project_id": r.project_id,
                        "requests_used": r.requests_used,
                        "tokens_used": r.tokens_used,                     
                        "total_user_query":
                            user_usage_map.get(r.username, {}).get("total_user_query", 0),
                        "model_wise_token_usuage":
                            user_usage_map.get(r.username, {}).get("model_wise_token_usuage", []),
                        "reset_at": r.reset_at
                    }
                    for r in result
                ]
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in get_user_details_by_username: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
   
    def get_overall_tokens_usage(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        try:
            logger.info("Fetching user-wise and model-wise token usage", extra=extras)
            # USER WISE
            user_result = (
                self.session.query(
                    ProjectApiTokenUsuage.username,
                    func.sum(ProjectApiTokenUsuage.total_input_tokens).label("total_input_tokens"),
                    func.sum(ProjectApiTokenUsuage.total_output_tokens).label("total_output_tokens"),
                    (
                        func.sum(ProjectApiTokenUsuage.total_input_tokens) +
                        func.sum(ProjectApiTokenUsuage.total_output_tokens)
                    ).label("total_tokens")
                )
                .group_by(ProjectApiTokenUsuage.username)
                .order_by(desc("total_tokens"))
                .all()
            )
            user_data = [
                {
                    "username": row.username,
                    "total_input_tokens": int(row.total_input_tokens or 0),
                    "total_output_tokens": int(row.total_output_tokens or 0),
                    "total_tokens": int(row.total_tokens or 0)
                }
                for row in user_result
            ]
            # MODEL WISE
            model_result = (
                self.session.query(
                    ProjectApiTokenUsuage.model_name,
                    func.sum(ProjectApiTokenUsuage.total_input_tokens).label("total_input_tokens"),
                    func.sum(ProjectApiTokenUsuage.total_output_tokens).label("total_output_tokens"),
                    (
                        func.sum(ProjectApiTokenUsuage.total_input_tokens) +
                        func.sum(ProjectApiTokenUsuage.total_output_tokens)
                    ).label("total_tokens")
                )
                .group_by(ProjectApiTokenUsuage.model_name)
                .order_by(desc("total_tokens"))
                .all()
            )
            model_data = [
                {
                    "model_name": row.model_name,
                    "total_input_tokens": int(row.total_input_tokens or 0),
                    "total_output_tokens": int(row.total_output_tokens or 0),
                    "total_tokens": int(row.total_tokens or 0)
                }
                for row in model_result
            ]
            return jsonify({
                "user_wise": user_data,
                "model_wise": model_data
            })
        except Exception as e:
            logger.exception(f"Error fetching combined token usage: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def list_users_by_project(self, project_id):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = self.session.query(Projects).filter(
                Projects.project_id == project_id
            ).all()

            return jsonify({
                "users": [
                    {
                        "username": r.username,
                        "requests_used": r.requests_used,
                        "tokens_used": r.tokens_used
                    }
                    for r in result
                ]
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in list_users_by_project: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch data"), 500)
        
    def list_documents_by_conversation(self, conv_id):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-APIUSERS-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            result = (
                    self.session.query(PDFChunk)
                    .filter(PDFChunk.conv_id == conv_id)
                    .distinct(PDFChunk.source)
                    .all()
                )

            return jsonify({
                "documents": [
                    {
                        "conversation_id": r.conv_id,
                        "doc_id": r.doc_id,
                        "source": r.source
                    }
                    for r in result
                ]
            })

        except Exception as e:
            logger.exception(f"sqldb: Error in list_documents_by_conversation: {e}", extra=extras)
            return make_response(jsonify(error="Unable to fetch documents data"), 500)
        
    def get_all_usernames_with_roles(self):
        result = self.session.query(UserDetails.value,User_Role.user_roles).join(User_Role, UserDetails.value == User_Role.username).all()
        return result
    
    def _apply_bug_filters(self, query, state=None, search=None):
        if state:
            query = query.filter(
                BugReport.state == state
            )
        if search:
            query = query.filter(
                or_(
                    BugReport.created_by.ilike(f"%{search}%"),
                    BugReport.description.ilike(f"%{search}%"),
                    BugReport.bug_name.ilike(f"%{search}%"),
                )
            )
        return query

    def get_bug_reports(self, page=1, limit=10, state=None, search=None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        try:
            logger.info(
                f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
                extra=extras
            )
            # TOTAL BUG COUNT (WITHOUT FILTER)
            total_bug_count = self.session.query(
                func.count(BugReport.id)
            ).scalar()
            # MAIN QUERY
            query = self.session.query(
                BugReport,
                func.count(BugReport.id).over().label("filtered_bug_count")
            )
            # APPLY FILTERS
            query = self._apply_bug_filters(
                query=query,
                state=state,
                search=search
            )
            # ORDERING
            query = query.order_by(
                BugReport.created_at.desc()
            )
            # PAGINATION
            rows = (
                query
                .offset((page - 1) * limit)
                .limit(limit)
                .all()
            )
            # BUG REPORT DATA
            data = [row[0].to_dict(include_file=False) for row in rows]
            # FILTERED COUNT
            if state or search:
                filtered_bug_count = rows[0][1] if rows else 0
            else:
                filtered_bug_count = 0
            # STATUS COUNTS
            status_counts = (
                self.session.query(
                    BugReport.state,
                    func.count(BugReport.id)
                )
                .group_by(BugReport.state)
                .all()
            )
            status_dict = {state: count for state, count in status_counts}
            logger.info(
                "CONVERSATIONAL-AI-REPORT: Bug reports fetched successfully",
                extra=extras
            )
            return data, total_bug_count, filtered_bug_count, status_dict

        except Exception as e:
            logger.exception(
                f"CONVERSATIONAL-AI-REPORT: Error fetching bug reports {e}",
                extra=extras
            )
            return [], 0, 0, {}
    def get_bug_attachment(self, attachment_id):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }

        try:
            logger.info(
                f"Fetching bug attachment {attachment_id}",
                extra=extras
            )

            attachment = (
                self.session.query(BugReportAttachment)
                .filter(BugReportAttachment.id == attachment_id)
                .first()
            )

            if not attachment:
                logger.info(
                    f"Attachment not found for id {attachment_id}",
                    extra=extras
                )
                return None

            logger.info(
                f"Attachment fetched successfully for id {attachment_id}",
                extra=extras
            )

            return attachment

        except Exception as e:
            logger.exception(
                f"Error fetching bug attachment: {e}",
                extra=extras
            )
            return None
        
    def update_bug_status(self, ticket_number, state):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        try:
            logger.info(
                f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",
                extra=extras
            )
            bug = (
                self.session.query(BugReport)
                .filter(BugReport.ticket_number == ticket_number)
                .first()
            )
            if not bug:
                return 404
            bug.state = state
            bug.updated_at = datetime.now(timezone.utc)
            self.session.commit()
            logger.info(
                f"CONVERSATIONAL-AI-REPORT: Bug status updated successfully for {ticket_number}",
                extra=extras
            )
            return True

        except Exception as e:
            self.session.rollback()
            logger.exception(
                f"CONVERSATIONAL-AI-REPORT: Error updating bug status {e}",
                extra=extras
            )
            return False