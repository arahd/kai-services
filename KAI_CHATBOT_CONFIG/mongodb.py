import os
import sys

import pymongo
from bson.binary import UuidRepresentation


# MONGOPWD = "JfkCCkuHHYFVX9ZCs5IopZtRC98tz8RMMIkZGk8vRV5317jCBBqSCAEs5EctdmwtH6OUdSJE4Ex8ACDbBHyXEQ=="
# MONGOUSERNAME = "kumaranchatbotcosmosdb"
# MONGOHOST = "kumaranchatbotcosmosdb.mongo.cosmos.azure.com"
# MONGOPORT = 10255
# DB_NAME = "chatbot_prod"

MONGOUSERNAME = os.getenv("MONGOUSERNAME")
MONGOPWD = os.getenv("MONGOPWD")
MONGOHOST = os.getenv("MONGOHOST")
MONGOPORT = os.getenv("MONGOPORT")
DB_NAME = os.getenv("MONGO_DB_DATABASE")
# print("DB_NAME::::",DB_NAME)




class MongoDB():
    def __init__(self):
        self.HOST = "localhost"
        # self.CONNECTION_STRING = "mongodb://kumaranchatbotcosmosdb:bjglBtwMl7nwqAN1lImodIy1DV5nUO0T851lMRQUWLoQpDZBwbdxoXBO2Syh1CkEEKj8qrUCaM8JACDbcJVekA%3D%3D@kumaranchatbotcosmosdb.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@kumaranchatbotcosmosdb@"
        self.CONNECTION_STRING = "mongodb://"+MONGOUSERNAME+":"+MONGOPWD+"@"+MONGOHOST+":"+str(MONGOPORT)+"/?ssl=true&retrywrites=false&replicaSet=globaldb&maxIdleTimeMS=120000&appName=@"+MONGOUSERNAME+"@"
        self.DB_NAME = DB_NAME
    def connect(self):
        #DB_NAME = "chatbot"
        DB_NAME = self.DB_NAME
        print(self.CONNECTION_STRING)
        client = pymongo.MongoClient(self.CONNECTION_STRING, uuidRepresentation='standard')
        print('DBConnected')
        db = client[DB_NAME]
        return db
