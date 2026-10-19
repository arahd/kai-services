#abstract method imports
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from urllib.parse import quote_plus

from flask import jsonify, make_response
from pymongo.errors import PyMongoError
from sqlalchemy import create_engine, func
from sqlalchemy.exc import SQLAlchemyError
#sqldb imports
from sqlalchemy.orm import declarative_base, joinedload, sessionmaker

from logger import extras, get_caller_frame, logger
#mongoDb imports
from mongodb import MongoDB
from tableModels import *

SQLUSERNAME = os.getenv("SQLUSERNAME")
SQLPWD = os.getenv("SQLPWD")
SQLHOST = os.getenv("SQLHOST")
# SQLHOST = 'dev-mssql.kumaran.ai'
SQLPORT = os.getenv("SQLPORT")
# SQLPORT = '1543'
DB_NAME = os.getenv("SQLDBNAME")

# print(f'{SQLUSERNAME},{SQLPWD},{SQLHOST},{SQLPORT},{DB_NAME}')

# SQLUSERNAME = "chatidpdevadmin"
# SQLPWD = "1aayu3y38WW2%40%40%40"
# SQLHOST = "chatipddev"
# SQLPORT = "1433"
# DB_NAME = "chatbot_sandbox"

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_CONFIG_JAVA_SERVICE'
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
    def insert_one(tableName, data, botname):
        pass

    @abstractmethod
    def searchLike(tableName,column,likeString,botname):
        pass

    @abstractmethod
    def slice(tableName,pageNumber,page_size,botname):
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
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            logger.info(f"mongodb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return doc
        except PyMongoError as e:
            logger.error(f"mongodb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
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
            logger.error(f"mongodb: Error occurred while fetch one document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        
    def update_one(self, tableName, conditions, updateValues, botname = None):
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
            logger.error(f"mongodb: Error occurred while updating one document in {tableName}: {e}",extra=extras)
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
            logger.error(f"mongodb: Error occurred while deleting one document in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to delete data"), 500)

    def insert_one(self, tableName, data, botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if botname:
                data.update({"bot_type": botname})
            collection = self.db[tableName]
            collection.insert_one(data)
            logger.info(f"mongodb: Successfully data inserted in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(message = "data inserted successfully"), 200)
        except PyMongoError as e:
            logger.error(f"mongodb: Error occurred while inserting one document in {tableName}: {e}",extra=extras)
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
            logger.error(f"mongodb: Error occurred while searching documents in {tableName}: {e}", extra=extras)
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
            logger.error(f"mongodb: Error occurred while slicing documents in {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)
        
class SQLFactory(DataBaseFactory):
    def __init__(self):
        super().__init__()
        self.create_connection()

    def create_connection(self):
        if DB_TYPE.upper()=='SQL':
            connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{DB_NAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
        if DB_TYPE.upper()=='PG':
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
        Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        self.session = Session()
        if self.session:
            return self.session
        else:
            return "DB NOT CONNECTED"

    def find_all(self, tableName, conditions, botname= None):
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
                query = query.join(Bot_Config.bot_type).filter(BotType.bot_type == botname)
            data = query.all()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            data = [row.to_dict() for row in data]
            logger.info(f"sqldb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            logger.exception(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return make_response(jsonify(error = "unable to fetch data"), 500)

    def find_one(self, tableName, conditions, botname= None):
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
                query = query.join(Bot_Config.bot_type).filter(BotType.bot_type == botname)
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

    def update_one(self, tableName, conditions, updateValues, botname = None):
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
                query = query.join(Bot_Config.bot_type).filter(BotType.bot_type == botname)
            data = query.first()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify(error = "data not found"), 404)
            for column, value in updateValues.items():
                setattr(data, column, value)
            self.session.commit()
            logger.info(f"sqldb: Successfully data updated in the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error = "data updated"), 200)
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
                query = query.join(Bot_Config.bot_type).filter(BotType.bot_type == botname)
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
    
    def insert_one(self, tableName, data, botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            if botname:
                bot = self.session.query(BotType).filter(BotType.bot_type == botname).first()
                data.update({"bot_id": bot._id})
            new_data = tableName(**data)
            self.session.add(new_data)
            self.session.commit()
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"message": "config inserted successfully"}), 200)
        except SQLAlchemyError as e:
            logger.exception(f"sqldb: Error occurred while deleting one document in {tableName}: {e}",extra=extras) 
            self.session.rollback()
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
            column_obj = getattr(tableName, column)
            query = self.session.query(tableName).filter(column_obj.like(f"%{likeString}%"))
            if botname:
                query = query.join(Bot_Config.bot_type).filter(BotType.bot_type == botname)
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
            
    def slice(self, tableName, pageNumber, page_size, botname=None):
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
            query = base_query.order_by(tableName._id).slice(startIndex, endIndex)
            if botname:
                query = query.join(Bot_Config.bot_type).filter(BotType.bot_type == botname)
            data = query.all()
            total_count_query = self.session.query(func.count(tableName._id))
            total_count = total_count_query.scalar()
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