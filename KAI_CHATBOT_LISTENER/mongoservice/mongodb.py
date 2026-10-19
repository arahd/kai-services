import os
import sys

import pymongo
from bson.binary import UuidRepresentation
from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone


# MONGOPWD = "JfkCCkuHHYFVX9ZCs5IopZtRC98tz8RMMIkZGk8vRV5317jCBBqSCAEs5EctdmwtH6OUdSJE4Ex8ACDbBHyXEQ=="
# MONGOUSERNAME = "kumaranchatbotcosmosdb"
# MONGOHOST = "kumaranchatbotcosmosdb.mongo.cosmos.azure.com"
# MONGOPORT = 10255
# DB_NAME = "chatbot"

MONGOUSERNAME = os.getenv("MONGOUSERNAME")
MONGOPWD = os.getenv("MONGOPWD")
MONGOHOST = os.getenv("MONGOHOST")
MONGOPORT = os.getenv("MONGOPORT")
DB_NAME = os.getenv("MONGO_DB_DATABASE")
print("DB_NAME::::",DB_NAME)

SERVICE_NAME='CONVERSATIONAL AI CHATBOT AUTH SERVICE'
PROJECT_NAME='CHATBOT'

class MongoDB():
    def __init__(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.HOST = "localhost"
      #  self.CONNECTION_STRING = "mongodb://kumaranchatbotcosmosdb:JfkCCkuHHYFVX9ZCs5IopZtRC98tz8RMMIkZGk8vRV5317jCBBqSCAEs5EctdmwtH6OUdSJE4Ex8ACDbBHyXEQ==@kumaranchatbotcosmosdb.mongo.cosmos.azure.com:10255/?ssl=true&retrywrites=false&replicaSet=globaldb&maxIdleTimeMS=120000&appName=@kumaranchatbotcosmosdb@"
        self.CONNECTION_STRING = "mongodb://"+MONGOUSERNAME+":"+MONGOPWD+"@"+MONGOHOST+":"+str(MONGOPORT)+"/?ssl=true&retrywrites=false&replicaSet=globaldb&maxIdleTimeMS=120000&appName=@"+MONGOUSERNAME+"@"
        self.DB_NAME = DB_NAME
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        
    def connect(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        #DB_NAME = "chatbot"
        DB_NAME = self.DB_NAME
        print(self.CONNECTION_STRING)
        client = pymongo.MongoClient(self.CONNECTION_STRING, uuidRepresentation='standard')
        logger.info('DBConnected',extra=extras)
        db = client[DB_NAME]
        if DB_NAME not in client.list_database_names():
            # Create a database with 400 RU throughput that can be shared across
            # the DB's collections
            db.command({"customAction": "CreateDatabase", "offerThroughput": 400})
            logger.info("Created db '{}' with shared throughput.\n".format(DB_NAME),extra=extras)
        else:
            logger.info("Using database: '{}'.\n".format(DB_NAME),extra=extras)

    # Create collection if it doesn't exist

        COLLECTION_NAME = "password_reset_tokens"
        collection = db[COLLECTION_NAME]
        if COLLECTION_NAME not in db.list_collection_names():
            # Creates a unsharded collection that uses the DBs shared throughput
            db.command(
                {"customAction": "CreateCollection", "collection": COLLECTION_NAME}
            )
            logger.info("Created collection '{}'.\n".format(COLLECTION_NAME),extra=extras)
        else:
            logger.info("Using collection: '{}'.\n".format(COLLECTION_NAME),extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return db


#mdb = MongoDB()
#d = mdb.connect()
#print(d)
#print('done')
