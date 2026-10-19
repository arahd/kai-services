#abstract method imports
from abc import ABC, abstractmethod
from http import client
from urllib.parse import quote_plus
import json
import os
from app.logger import logger,get_caller_frame,extras,SERVICE_NAME,PROJECT_NAME

#sqldb imports
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine, func
from app.tableModels import *

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

#mongoDb imports
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime,timezone

db_type = os.getenv("DB_TYPE", "sql")
SQLUSERNAME = os.getenv("SQLUSERNAME")
SQLPWD = os.getenv("SQLPWD")
SQLHOST = os.getenv("SQLHOST")
SQLPORT = os.getenv("SQLPORT")
SQLDBNAME = os.getenv("DB_NAME")

# SQLUSERNAME = "chatidpdevadmin"
# SQLPWD = "1aayu3y38WW2%40%40%40"
# SQLHOST = "chatipddev"
# SQLPORT = "1433"
# DB_NAME = "chatbot"

MONGOUSERNAME = os.getenv("MONGOUSERNAME")
MONGOPWD = os.getenv("MONGOPWD")
MONGOHOST = os.getenv("MONGOHOST")
MONGOPORT = os.getenv("MONGOPORT")
MONGODBNAME = os.getenv("MONGO_DB_DATABASE")


class DataBaseFactory(ABC):

    @abstractmethod
    def create_connection(self):
        pass

    @abstractmethod
    def find_all(tableName, conditions, botname):
        pass

    @abstractmethod
    def update_many(self, tableName, conditions, updateValues, botname):
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
        if db_type.upper() == "SQL":
            # connection_string = 'mssql+pyodbc://chatidpdevadmin:1aayu3y38WW2%40%40%40@chatipddev.database.windows.net:1433/chatbot?driver=ODBC+Driver+18+for+SQL+Server'
            connection_string = f"mssql+pyodbc://{SQLUSERNAME}:{quote_plus(SQLPWD)}@{SQLHOST}:{SQLPORT}/{SQLDBNAME}?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
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
        Session = sessionmaker(bind=engine)
        self.session = Session()
        if self.session:
            logger.info("Connection Established",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return self.session
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
        try:
            query = self.session.query(tableName)
            for column, value in conditions.items():
                if isinstance(value, list): 
                    query = query.filter(getattr(tableName, column).in_(value))
                else:
                    query = query.filter(getattr(tableName, column) == value)
            if botname:
                logger.info("Fetching bot type",extra=extras)
                query = query.join(tableName.bot_type).filter(BotType.bot_type == botname)
            # if tableName==UserFeedback:
            #     query = query.distinct(getattr(tableName, "question"))
            data = query.all()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return JSONResponse(status_code=404, content={"error":"Data not found"})
            data = [row.to_dict() for row in data]
            logger.info(f"sqldb: Successfully data fetched from the {tableName}",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except Exception as e:
            logger.error(f"sqldb: Error occurred while fetch multiple document from the {tableName}: {e}",extra=extras)
            return HTTPException(status_code=500, detail="Unable to fetch data")
        finally:
            self.session.close()
        
    def find_one(self, tableName, conditions, botname = None):
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
                logger.info("Fetching bot type",extra=extras)
                query = query.join(tableName.bot_type).filter(BotType.bot_type == botname)
            data = query.first()
            if not data:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return JSONResponse(status_code=404, content={"error":"Data not found"})
            data = data.to_dict()
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return data
        except SQLAlchemyError as e:
            logger.error(f"Error: {e}",extra=extras)
            return HTTPException(status_code=500, detail="Unable to fetch data")
        finally:
            self.session.close()
        

    def update_many(self, tableName, conditions, updateValues, botname=None):
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
            if botname:
                logger.info("Fetching bot type", extra=extras)
                query = query.join(tableName.bot_type).filter(BotType.bot_type == botname)
            data = query.all()
            if not data:
                logger.error(f"sqldb: data not found in {tableName}", extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                return JSONResponse(status_code=404, content={"error": "Data not found"})
            for record in data:
                for column, value in updateValues.items():
                    setattr(record, column, value)
            self.session.commit()
            logger.info(f"sqldb: Successfully updated data in {tableName}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return JSONResponse(status_code=200, content={"message": "Data updated"})
        except SQLAlchemyError as e:
            self.session.rollback()
            logger.error(f"sqldb: Error occurred while updating documents in {tableName}: {e}", extra=extras)
            return HTTPException(status_code=500, detail="Unable to fetch data")
        finally:
            self.session.close()

