#abstract method imports
from abc import ABC, abstractmethod
import os
from flask import jsonify, make_response
from urllib.parse import quote_plus
#sqldb imports
from sqlalchemy.orm import declarative_base,  sessionmaker
from sqlalchemy import create_engine, func
from authservice.tableModels import *
from sqlalchemy.orm import joinedload

#mongoDb imports
from mongoservice.mongodb import MongoDB
from sqlalchemy.exc import SQLAlchemyError
from pymongo.errors import PyMongoError
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone

db_type = os.getenv("DB_TYPE", "sql")

# SQLUSERNAME = os.getenv("SQLUSERNAME")
# SQLPWD = os.getenv("SQLPWD")
# SQLHOST = os.getenv("SQLHOST")
# SQLPORT = os.getenv("SQLPORT")
# DB_NAME = os.getenv("DB_NAME")

# SQLUSERNAME = "chatidpdevadmin"
# SQLPWD = "1aayu3y38WW2%40%40%40"
# SQLHOST = "chatipddev"
# SQLPORT = "1433"
# DB_NAME = "chatbot"

SERVICE_NAME='CONVERSATIONAL AI CHATBOT ADMIN SERVICE'
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
    
#MongoDBQuerries
class MongoDBFactory(DataBaseFactory):
    def __init__(self):
        self.create_connection()

    def create_connection(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        db = MongoDB()
        self.db = db.connect()
        logger.info("Connection Established",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return db
    
    def find_all(self, tableName, conditions, botname= None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if botname != None:
                conditions.update({"bot_type": botname})
            doc = self.db[tableName].find(conditions)
            if not doc:
                logger.error(f"mongodb: data not found in {tableName}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            logger.info(f"mongodb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return doc
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def find_one(self, tableName, conditions, botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if botname != None:
                conditions.update({"bot_type": botname})
            doc = self.db[tableName].find_one(conditions)
            if not doc:
                logger.error(f"mongodb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            logger.info(f"mongodb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return doc
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while fetch one document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        
    def update_one(self, tableName, conditions, updateValues,botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if botname != None:
                conditions.update({"bot_type": botname})  
            doc = self.db[tableName].find_one(conditions)
            if not doc:
                logger.error(f"mongodb: data found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"),404)          
            collection = self.db[tableName]
            collection.update_one(conditions, {'$set': updateValues})
            logger.info(f"mongodb: Successfully data updated in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error = "data updated"), 200)
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while updating one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to update data"),500)

    def delete(self, tableName, conditions,botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if botname != None:
                conditions.update({"bot_type": botname})  
            doc = self.db[tableName].find_one(conditions)            
            if not doc:
                logger.error(f"mongodb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            collection = self.db[tableName]
            collection.delete_one(conditions)
            logger.info(f"mongodb: Successfully data deleted in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "data deleted"), 200) 
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while deleting one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to delete data"), 500)

    def insert_one(self, tableName, data):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            collection = self.db[tableName]
            collection.insert_one(data)
            logger.info(f"mongodb: Successfully data inserted in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "data inserted successfully"), 200)
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while inserting one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to insert data"), 500)

    def searchLike(self, tableName, column, likeString, botname=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            collection = self.db[tableName]
            query = {column: {"$regex": likeString}}
            if botname:
                query["bot_type"] = botname  
            data =list(collection.find(query)) 
            if len(data)<1:
                logger.info(f"mongodb: no similar data found {tableName} search string: {likeString}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return data
            logger.info(f"mongodb: Successfully data found in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while searching documents in {tableName}: {e}", extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def slice(self, tableName, pageNumber, page_size, botname=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            collection = self.db[tableName]
            skip_count = (pageNumber - 1) * page_size
            query = {}
            if botname:
                query["bot_type"] = botname
            data = list(collection.find(query).skip(skip_count).limit(page_size))
            total_count = collection.count_documents(query)
            if data:
                logger.info(f"mongodb: Successfully fetched data from documents in {tableName} from page_number = {pageNumber} page_size = {page_size}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return data, total_count
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return [], 0
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while slicing documents in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def manage_roles(self, roles, username, botname, action):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            doc = self.db.users.find_one({"username": username, "bot_type": botname})
            if doc:
                logger.info(f"mongodb: user details fetched from the users collection",extra=extras)
                roles_ = doc.get('roles', [])
                if isinstance(roles_, list):
                    updated_roles = roles_.copy()  
                    if action == "add":
                        for role in roles:
                            if role not in roles_:
                                updated_roles.append(role)
                    elif action == "delete":
                        for role in roles:
                            if role in roles_:
                                updated_roles.remove(role)
                if updated_roles == roles_:
                    logger.info(f"mongodb: no role to update for that user",extra=extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify(message = f"no roles to {action}"), 200)
                if updated_roles:
                    myquery = {"username": username,"bot_type": botname}
                    update = {"$set": {"roles": updated_roles}}
                    self.db.users.update_one(myquery, update)
                    if action == "add":
                        logger.info(f"mongodb: user roles added for the user: {username}",extra=extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify(message = "roles added successfully"), 200)
                    elif action == "delete":
                        logger.info(f"mongodb: user roles deleted for the user: {username}",extra=extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify(message = "roles deleted successfully"), 200)
            else:
                logger.error(f"mongodb: user data not found",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "user not found"), 404)
        except PyMongoError as e:
            logger.exception(f"mongodb: Error occurred while managing roles for user {username}: {e}", extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        
class SQLFactory(DataBaseFactory):
    def __init__(self):
        super().__init__()
        self.create_connection()

    def create_connection(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
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
                pool_size=10,
                max_overflow=20,
                pool_timeout=30,
                pool_recycle=600,
                pool_pre_ping=True
            )
        Session = sessionmaker(bind=engine)
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
        'bot_name':'CIBC'
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
            logger.exception(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def find_one(self, tableName, conditions,botname= None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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
            logger.exception(f"sqldb: Error occurred while fetch one document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def update_one(self, tableName, updateValues, conditions,botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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
        
    def delete(self, tableName, conditions, botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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
    
    def insert_one(self, tableName, data):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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

    def searchLike(self, tableName, column, likeString, botname=None,condition=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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
            logger.exception(f"sqldb: Error occurred while searching documents in {tableName}: {e}", extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
            
    def slice(self, tableName, pageNumber, page_size, botname=None,condition=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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
            # total_count_query = self.session.query(func.count(tableName._id))
            # if botname:
            #     total_count_query = total_count_query.join(BotType).filter(BotType.bot_type == botname)
            # total_count = total_count_query.scalar()
            data = [row.to_dict() for row in data],total_count
            if data:
                logger.info(f"sqldb: Successfully fetched data from documents in {tableName} from page_number = {pageNumber} page_size = {page_size}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return data, total_count
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return [], 0
        except SQLAlchemyError as e:
            logger.exception(f"sqldb: Error occurred while slicing documents in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def manage_roles(self, username, roles, botname, action):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
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
