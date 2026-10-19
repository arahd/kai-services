import os
import ast
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, func, cast, Float
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone, timedelta
from flask import jsonify, make_response
from sqlalchemy.exc import SQLAlchemyError
from common_utils.mainqueries import *
from models.tablemodels import *
from abc import ABC, abstractmethod
from mongoservice.mongodb import MongoDB
from pymongo.errors import PyMongoError
from sqlalchemy import inspect, and_, or_
from download_format.excel_formatter import excel_construction
import pandas as pd
from urllib.parse import quote_plus

SERVICE_NAME='KAI_CHATBOT_LISTENER_SERVICE'
PROJECT_NAME='KAI'

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
        # self.check_and_create_tables()

    def create_connection(self):
        db_type = os.getenv("DB_TYPE", "sql")
        if db_type.upper() == "SQL":
            SQLUSERNAME = os.getenv("SQLUSERNAME")
            SQLPWD = os.getenv("SQLPWD")
            SQLHOST = os.getenv("SQLHOST")
            SQLPORT = os.getenv("SQLPORT")
            DB_NAME = os.getenv("DB_NAME")
            connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{DB_NAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
        if db_type.upper() == "PG":
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
        Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = Session()
        if self.session:
            return self.session
        else:
            return "DB NOT CONNECTED"
        
    def check_and_create_tables(self):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            # Inspect existing tables
            inspector = inspect(self.engine)
            existing_tables = inspector.get_table_names()

            # List of models to be checked/created
            models = [BotType, Conversation, Questions, Rating, ResponseTime, ResponseType, UserDetails, DateInfo, Month, Year, Week, GPT_Model, LanguageType]

            # Determine which tables need to be created
            tables_to_create = []
            for model in models:
                if model.__tablename__ not in existing_tables:
                    tables_to_create.append(model.__tablename__)

            # Create tables
            if tables_to_create:
                Base.metadata.create_all(self.engine)
            else:
                logger.info(f"All tables already exist.", extra=extras)
        except Exception as e:
            logger.info(f"error in table creation {e}", extra=extras)
            return False

    def find_all(self, tableName, conditions,botname=None):
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
                query = self.session.query(tableName).filter(UserDetails.value.startswith(username))
            elif tableName==Week:
                _id = current_date.isocalendar()[1]
                query = self.session.query(tableName).filter(Week._id<=_id)
            elif tableName==Month:
                _id = current_date.month
                query = self.session.query(tableName).filter(Month._id<=_id)
            data = query.all()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            data = [row.to_dict() for row in data]
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        
    def find_one(self, tableName, conditions):
        extras = {
                    'servicename': SERVICE_NAME,
                    'functionname': get_caller_frame().f_code.co_name,
                    'projectname': PROJECT_NAME,
                    'bot_name':'kumaran'
                }
        logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = self.session.query(tableName)
            for column, value in conditions.items():
                query = query.filter(getattr(tableName, column) == value)
            data = query.first()
            if not data:
                logger.error(f"KAI_CHATBOT_LISTENER_SERVICE: data not found in {tableName}",extra=extras)
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return 404
            data = data.to_dict()
            if tableName==Conversation:
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Successfully data fetched from the {tableName} for conversation_id {conditions['conversation_id']}",extra=extras)
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            logger.exception(f"KAI_CHATBOT_LISTENER_SERVICE:  Error occurred while fetch one document from the {tableName}: {e}",extra=extras)
            return 500
        

    def insert_bulk(self, tableName, data):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

        try:
            # Add all data at once
            self.session.bulk_insert_mappings(tableName, data)
            self.session.commit()
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Successfully inserted data into {tableName}", extra=extras)
            return True
        except SQLAlchemyError as e:
            logger.exception(f"KAI_CHATBOT_LISTENER_SERVICE: Error occurred while inserting data into {tableName}: {e}", extra=extras)
            return False
    
    def insert_one(self,  tableName, data):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:  
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: : data {data} for tablename {tableName}",extra=extras)
            if data.get('conversation_id', None):
                existing = self.session.query(tableName).filter_by(conversation_id=data['conversation_id']).first()
                if existing:
                    count = existing.no_of_questions
                    existing.no_of_questions = data['no_of_questions']
                    self.session.commit()
                    return count
            new_data = tableName(**data)
            self.session.add(new_data)
            self.session.commit()
            return True
        except Exception as e:
            self.session.rollback()
            logger.exception(f"KAI_CHATBOT_LISTENER_SERVICE: Error occurred while inserting one document in {tableName}: {e}",extra=extras)
            return False
        
    def update_one(self, tableName, updateValues, conditions):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = self.session.query(tableName)
            for column, value in conditions.items():
                query = query.filter(getattr(tableName, column) == value)
            data = query.first()
            if not data:
                return make_response(jsonify(error = "data not found"), 404)
            for column, value in updateValues.items():
                setattr(data, column, value)
            self.session.commit()
            logger.info(f"sqldb: Successfully data updated in the {tableName}",extra=extras)
            return True
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while updating one document in {tableName}: {e}",extra=extras)
            return False
        finally:
            self.session.close()

    def DateTableCreation(self):
        start_date = datetime(2024, 1, 1)
        end_date = datetime(2024, 12, 31)

        # Insert dates into the table
        current_date = start_date
        while current_date <= end_date:
            # Create an instance of your model with the date
            week_number = current_date.isocalendar()[1]
            month_number = current_date.month
            date_entry = DateInfo(date=current_date.date(),week_fk=week_number,month_fk=month_number,year_fk=1)
            
            # Add to the session
            self.session.add(date_entry)
            
            # Move to the next day
            current_date += timedelta(days=1)
        try:
            self.session.commit()
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"KAI_CHATBOT_LISTENER_SERVICE: Error occurred while DataTableCreation: {e}",extra=extras)
            return False

    def construct_filter(self,filters, query_filters, joins, applied_filters):
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
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
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: query constructing completed",extra=extras)
            return query_filters,joins,applied_filters
        except Exception as e:
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Error occured in query constructing {e}",extra=extras)
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="error in constructing filter"))
        
    def construct_transcript_filter(self,filters, query_filters):
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

            if 'usernames' in filters and filters['usernames']:
                usernames = filters.get('usernames')
                query_filters.append(UserDetails.value.in_(usernames))
            
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

            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return query_filters
        except Exception as e:
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Error occured in query constructing {e}",extra=extras)
            return make_response(jsonify(error="error in constructing filter"))
    
    def get_query(self,group_by_column,aggregation_type):
        try:
            extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
                    }
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
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Error occured in getting query -{e}",extra=extras)
            return make_response(jsonify(error="Error occured in getting query"))
    
    def apply_group_by_joins(self,filters, query, joins):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
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
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return query
        except Exception as e:
            logger.info(f"Exception in applying joins {e}", extra=extras)

    def apply_transcript_group_by_joins(self,filters, query, joins):
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            join_mapping = {
                'usernames': (UserDetails, Conversation.username_id == UserDetails._id),
            }
            group_by = filters.get('group_by')
            for filter_key in join_mapping:
                model, condition = join_mapping[filter_key]
                if group_by == filter_key or model in joins:
                    query = query.join(model, condition)
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return query
        except Exception as e:
            logger.info(f"Exception in applying joins {e}", extra=extras)

    def get_main_query(self,query,aggregation_type):
        if aggregation_type == 'feedback':
            query = query.join(Conversation, Questions.conversation_id == Conversation._id)\
                            .join(Rating, Questions.rating_id == Rating._id)\
                            .join(DateInfo, Conversation.date_id == DateInfo._id)
        elif aggregation_type == 'usage':
            query = query.join(Questions, Questions.conversation_id == Conversation._id)\
                    .join(DateInfo, Conversation.date_id == DateInfo._id)
        else:
            query = query.join(Conversation, Questions.conversation_id == Conversation._id)\
                    .join(DateInfo, Conversation.date_id == DateInfo._id)
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
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Query execution completed for {report_type}", extra=extras)
            return data_df

    def generate_report(self, filters: dict, combination=False):
        try:
            extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            # Prepare filters and joins based on the provided dictionary
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Inside generate report function with data {filters}", extra=extras)
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
            if 'group_by' in filters and filters['group_by']:
                query = self.get_query(group_by_column=group_by_column,aggregation_type=f"grouped_{filters['report']}")
            else:
                query = self.get_query(group_by_column=group_by_column,aggregation_type=filters['report'])
            
            if group_by_column:
                logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Group will be performed",extra=extras)
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
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"KAI_CHATBOT_LISTENER_SERVICE: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
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
            return result
        except Exception as e:
            logger.exception(f"sqldb: Error occurred while fetching data {filters}: {e}", extra=extras)
            return make_response(jsonify(error="Unable to download data"), 500)