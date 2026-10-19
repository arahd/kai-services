#abstract method imports
from abc import ABC, abstractmethod
import os
from flask import jsonify, make_response
from urllib.parse import quote_plus
#sqldb imports
from sqlalchemy.orm import  sessionmaker
from sqlalchemy import create_engine, or_
from authservice.tableModels import User_Role
from authservice.tableModels import *

#mongoDb imports
from sqlalchemy.exc import SQLAlchemyError
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone

SERVICE_NAME='CONVERSATIONAL AI CHATBOT AUTH SERVICE'
PROJECT_NAME='CHATBOT'

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
    def searchLike(tableName,column,likeString,botname):
        pass

    @abstractmethod
    def slice(tableName,pageNumber,page_size,botname):
        pass
    
    @abstractmethod
    def manage_roles(roles, username, botname, action):
        pass
        
db_type = os.getenv("DB_TYPE", "sql")

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
        if db_type.upper() == "SQL":
            SQLUSERNAME = os.getenv("SQLUSERNAME")
            SQLPWD = os.getenv("SQLPWD")
            SQLHOST = os.getenv("SQLHOST")
            # SQLHOST="20.84.105.168"
            SQLPORT = os.getenv("SQLPORT")
            DB_NAME = os.getenv("DB_NAME")
            logger.info(f'db credentials: SQLUSERNAME:{SQLUSERNAME},SQLPWD:{SQLPWD},SQLHOST:{SQLHOST},DB_NAME:{DB_NAME},SQLPORT:{SQLPORT}',extra=extras)
            connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{DB_NAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
        if db_type.upper() == "PG":
            connection_string = os.getenv("PGDBCONNSTR")
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
        self.session = Session()
        if self.session:
            return self.session
        else:
            return "DB NOT CONNECTED"

    def find_all(self, tableName, conditions,botname= None):
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
            if botname and tableName == User:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            elif botname and tableName == PasswordResetToken:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            elif botname and tableName == PasswordHistory:
                query = query.join(BotType).filter(BotType.bot_type == botname)
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
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        finally:
            self.session.close()

    def find_all_with_limit(self, tableName, conditions, botname=None, page=1, limit=20):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }

        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

        try:
            query = self.session.query(tableName)
            for column, value in conditions.items():
                query = query.filter(getattr(tableName, column) == value)
            if botname and tableName == User:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            elif botname and tableName == PasswordResetToken:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            elif botname and tableName == PasswordHistory:
                query = query.join(BotType).filter(BotType.bot_type == botname)

            total_count = query.count()

            offset = (page - 1) * limit
            data = query.offset(offset).limit(limit).all()

            data = [row.to_dict() for row in data] if data else []

            total_pages = (total_count + limit - 1) // limit
            user_count = self.session.query(UserTokens).filter(UserTokens.tokens_used > 0).count()

            response = {
                "page": page,
                "limit": limit,
                "active_user_count": user_count,
                "total_count": total_count,
                "total_pages": total_pages,
                "data": data
            }

            logger.info(f"sqldb: Pagination fetch success from {tableName}", extra=extras)
            return response

        except Exception as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while fetch multiple document from {tableName}: {e}", extra=extras)
            return {
                "error": "unable to fetch data"
            }
        finally:
            self.session.close()

    def find_all_product_users_with_limit(self, tableName, conditions, botname=None, page=1, limit=20):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        try:
            query = self.session.query(tableName)
            if conditions:
                or_filters = [
                    getattr(tableName, column) == value
                    for column, value in conditions.items()
                ]
                query = query.filter(or_(*or_filters))
            
            total_count = query.count()
            offset = (page - 1) * limit
            data = query.offset(offset).limit(limit).all()

            data = [row.to_dict() for row in data] if data else []

            total_pages = (total_count + limit - 1) // limit
            response = {
                "page": page,
                "limit": limit,
                "total_count": total_count,
                "total_pages": total_pages,
                "data": data
            }
            logger.info(f"Pagination fetch success from {tableName}", extra=extras)
            return response

        except Exception as e:
            self.session.rollback()
            logger.exception(f"Error occurred while fetch multiple document from {tableName}: {e}", extra=extras)
            return {
                "error": "unable to fetch data"
            }
        finally:
            self.session.close()

    def find_one(self, tableName, conditions,botname= None):
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
            if botname and tableName == User:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            elif botname and tableName == PasswordResetToken:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            data = query.first()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            data = data.to_dict()
            logger.info(f"sqldb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while fetch one document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        finally:
            self.session.close()

    def update_one(self, tableName, updateValues, conditions,botname = None):
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
            if botname and tableName == User:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            elif botname and tableName == PasswordResetToken:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            data = query.first()
            if not data:
                return make_response(jsonify(error = "data not found"), 404)
            for column, value in updateValues.items():
                setattr(data, column, value)
            self.session.commit()
            logger.info(f"sqldb: Successfully data updated in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(mesage = "data updated"), 200)
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while updating one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to update data"),500)
        finally:
            self.session.close()
        
    def update_all(self, tableName, values):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }

        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)

        try:
            # Perform bulk update
            updated_rows = self.session.query(tableName).update(values, synchronize_session=False)
            self.session.commit()
            logger.info(f"sqldb: Successfully updated records in {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return make_response(jsonify(message=f"{updated_rows} records updated successfully"), 200)

        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while updating records in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error="unable to update data"), 500)
        finally:
            self.session.close()

        
    def delete(self, tableName, conditions, botname = None):
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
            if botname:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            data = query.first()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            self.session.delete(data)
            self.session.commit()
            logger.info(f"sqldb: Successfully data deleted in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "data deleted"), 200) 
        except Exception as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while deleting one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to delete data"), 500)
        finally:
            self.session.close()
    
    def insert_one(self, tableName, data):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if tableName == PasswordHistory:
                length = self.session.query(tableName).filter_by(user_id=data['user_id']).count()
                if length == 7:
                    oldest_entry = self.session.query(PasswordHistory).filter_by(user_id=data['user_id']).order_by(PasswordHistory.changed_at.asc()).first()
                    if oldest_entry:
                        self.session.delete(oldest_entry)
                        self.session.commit()
                
                bot = self.session.query(BotType).filter(BotType.bot_type == data['bot_type_id']).first()
                data.update({"bot_type_id": bot._id})    
            new_data = tableName(**data)
            self.session.add(new_data)
            self.session.commit()
            logger.info(f"sqldb: Successfully data inserted in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "data inserted successfully"), 200)
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while inserting one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to insert data"), 500)
        finally:
            self.session.close()

    def searchLike(self, tableName, column, likeString, botname=None,condition=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            column_obj = getattr(tableName, column)
            query = self.session.query(tableName).filter(column_obj.like(f"%{likeString}%"))
            if condition:
                query=query.filter(tableName.is_deleted==False)
            if botname:
                query = query.join(BotType).filter(BotType.bot_type == botname)
            data = query.all()
            data = [obj.to_dict() for obj in data] 
            if len(data)<1:
                logger.info(f"sqldb: no similar data found {tableName} search string: {likeString}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(data = []), 200)
            logger.info(f"sqldb: Successfully data found in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while searching documents in {tableName}: {e}", extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        finally:
            self.session.close()
            
    def slice(self, tableName, pageNumber, page_size, botname=None,condition=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            startIndex = (pageNumber - 1) * page_size
            endIndex = pageNumber * page_size
            base_query = self.session.query(tableName)
            if condition:
                base_query=base_query.filter(tableName.is_deleted==False)
            if botname:
                base_query = base_query.join(BotType).filter(BotType.bot_type == botname)
            count=base_query.all()
            total_count=len(count)
            
            query = base_query.order_by(tableName._id).slice(startIndex, endIndex)
            data = query.all()
            data = [row.to_dict() for row in data],total_count
            if data:
                logger.info(f"sqldb: Successfully fetched data from documents in {tableName} from page_number = {pageNumber} page_size = {page_size}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return data, total_count
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return [], 0
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while slicing documents in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        finally:
            self.session.close()

    def manage_roles(self, username, roles, botname, action):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            conditions = {'username': username,"is_deleted":False} 
            query = self.session.query(User)
            for column, value in conditions.items():
                query = query.filter(getattr(User, column) == value)
            query = query.join(BotType).filter(BotType.bot_type == botname)
            data = query.first()
            if data:
                user =  data.to_dict()
                if user:
                    logger.info(f"sqldb: user details fetched from the users collection",extra=extras)
                    user_roles = user.get("roles", [])
                    if action == "add":
                        if user_roles == roles:
                            logger.info(f"sqldb: no role to update for that user",extra=extras)
                            return make_response(jsonify(message = f"no roles to {action}"), 200)
                        roles_to_process = [role for role in roles if role not in user_roles]
                        if roles_to_process:
                            for role in roles_to_process:
                                role_object = self.session.query(Role).filter_by(role=role).first()
                                user_role = UserRole(user=data, role=role_object)
                                self.session.add(user_role) 
                            self.session.commit()
                            logger.info(f"sqldb: user roles added for the user: {username}",extra=extras)
                            return make_response(jsonify(message = "roles added successfully"), 200)
                        else:
                            return make_response(jsonify(data = "no roles to add"), 200) 
                    elif action == "delete":
                        roles_to_process = [role for role in roles if role in user_roles]
                        if roles_to_process:
                            for role_name in roles_to_process:
                                role_object = self.session.query(Role).filter_by(role=role_name).first()
                                if role_object:
                                    user_role = self.session.query(UserRole).filter_by(user=data, role=role_object).first()
                                    if user_role:
                                        self.session.delete(user_role)
                            self.session.commit()
                            logger.info(f"sqldb: user roles deleted for the user: {username}",extra=extras)
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify(message = "roles deleted successfully"), 200)
                        else:
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify(data = "no roles to delete"), 200) 
            else:
                logger.error(f"sqldb: user data not found",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "user not found"), 404)
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while managing roles for user {username}: {e}", extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        finally:
            self.session.close()
        
    def add_role(self,username:str,roles_list:list):
        conditions = {'username': username}
        try:
            user = self.session.query(User_Role).filter_by(**conditions).first()
            if user:
                user.user_roles = roles_list
                self.session.commit()
                return "User Role Updated"
            else:
                if username=="":
                    raise Exception(f"Invalid Username passed")
                elif type(roles_list)==list:
                    new_user_role = User_Role(username=username,user_roles=roles_list)
                    self.session.add(new_user_role)
                    self.session.commit()
                    return "User Role Added"
                else:
                    raise Exception(f"Invalid Type {type(roles_list)} passed in add_role for roles_list when list type is expected")
        except Exception as e:
            self.session.rollback()
            raise Exception(str(e))
        finally:
            self.session.close()

    def search_like_index(self, tableName, column, value, limit=20, botname=None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        
        try:
            query = self.session.query(tableName)
            query = query.filter(getattr(tableName, column).ilike(f"{value}%"))
            data_list = query.limit(limit).all()
            results = [data.to_dict() for data in data_list]
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return results
            
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while searching {tableName}: {e}", extra=extras)
            return make_response(jsonify(error="unable to fetch data"), 500)
        finally:
            self.session.close()

    def get_sorted(self, tableName, sort_column: str, direction: str = "asc", page: int=1, limit: int = 20, botname=None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        
        try:
            if not hasattr(tableName, sort_column):
                logger.error(f"sqldb: Invalid sort column {sort_column} for table {tableName}", extra=extras)
                return make_response(jsonify(error=f"Invalid sort column: {sort_column}"), 400)
                
            query = self.session.query(tableName)
            total_count = query.count()
            col_attr = getattr(tableName, sort_column)
            if direction.lower() == "desc":
                query = query.order_by(col_attr.desc())
            else:
                query = query.order_by(col_attr.asc())
                
            offset = (page - 1) * limit
            data_list = query.offset(offset).limit(limit).all() 
            results = [data.to_dict() for data in data_list]
            total_pages = (total_count + limit - 1) // limit
            response = {
                            "page": page,
                            "limit": limit,
                            "total_count": total_count,
                            "total_pages": total_pages,
                            "data": results
                        }
            logger.info(f"sqldb: Successfully fetched {len(results)} sorted records from {tableName}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return response
            
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.exception(f"sqldb: Error occurred while fetching sorted data from {tableName}: {e}", extra=extras)
            return make_response(jsonify(error="unable to fetch data"), 500)
        finally:
            self.session.close()

            


