import json

import pymongo.cursor
from vault import get_values
from pymongo import MongoClient
import pymongo
# from base_logger import logger
import os
import datetime
from flask import Response, jsonify, make_response,request
import requests
import jwt
from datetime import datetime,timezone

# myclient = pymongo.MongoClient("mongodb://localhost:27017/")
# url = 'mongodb://kumaranchatbotcosmosdb:JfkCCkuHHYFVX9ZCs5IopZtRC98tz8RMMIkZGk8vRV5317jCBBqSCAEs5EctdmwtH6OUdSJE4Ex8ACDbBHyXEQ==@kumaranchatbotcosmosdb.mongo.cosmos.azure.com:10255/?ssl=true&replicaSet=globaldb&retrywrites=false&maxIdleTimeMS=120000&appName=@kumaranchatbotcosmosdb@'
# myclient = MongoClient(url)
# mydb = myclient['chatbot']
# mycol = mydb['chatbot_config']
# Auth_API_URl = "https://chatbotauthservice.azurewebsites.net/auth"


# ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
# MONGOUSERNAME = os.environ.get('CUSTOMCONNSTR_MDBUSERNAME')
# MONGOPWD = os.environ.get('CUSTOMCONNSTR_MDBPWD')
# MONGOHOST = os.environ.get('CUSTOMCONNSTR_MDBDBHOST')
# MONGOPORT = os.environ.get('CUSTOMCONNSTR_MDBDBPORT')
# DB_NAME = os.environ.get('CUSTOMCONNSTR_MDBDB')
# Auth_API_URl = os.getenv('CUSTOMCONNSTR_AUTH_LOGIN_URL')

# ENV_NAME = 'DEV'
ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
# setallenv_variables(ENV_NAME)
get_values(ENV_NAME)

# Auth_API_URl = "https://chatbotauthservice.azurewebsites.net/auth"

from mainqueries import MongoDBFactory, SQLFactory
from tableModels import Bot_Config, BotType, Config, ConfigData,ConfigOCP,ConfigDataOCP,Bot_ConfigOCP,UserSessionDetails
from logger import logger,get_caller_frame,extras

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_CONFIG_JAVA_SERVICE'
PROJECT_NAME='CHATBOT'

logger.info(f"Config Service : ENV Name {ENV_NAME}",extra=extras)

class Configuration():
    def __init__(self,db_type,env_name):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.dbtype= db_type
        if db_type in ['sql', 'pg']:
            self.db = SQLFactory()
            if env_name.lower()=='ocp':
                self.config = ConfigOCP
                self.configdata = ConfigDataOCP
                self.bot_config = Bot_ConfigOCP
            else:
                self.config = Config
                self.configdata = ConfigData
                self.bot_config = Bot_Config
            self.bot = BotType
        else:
            self.db = MongoDBFactory()
            self.config = "config"
            self.bot_config = "bot_specific_configurations"
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    def find_all_config(self, envName):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = {'environmentName':envName}
            # find_all = mycol.find(query)
            find_all = self.db.find_all(self.config, query)
            response = []
            if isinstance(find_all, (list, pymongo.cursor.Cursor)):
                logger.info("all config retrived from the db",extra=extras)
                for i in find_all:
                    config_data = {
                        "environmentName": i.get("environmentName"),
                        "applicationName": i.get("applicationName"),
                        "createdTime": i.get("createdTime"),
                        "modifiedTime": i.get("modifiedTime")
                    }
                    data = []
                    for doc in i.get("data"):
                        config = {
                            "key": doc.get("key"),
                            "value": doc.get("value"),
                            "config_description": doc.get("config_description",'')
                        }
                        data.append(config)
                    config_data.update({"data": data})
                    response.append(config_data)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return response            
            elif find_all.status_code == 404:
                logger.info(f"No config data found for the {envName}", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return {"Message":"No Config Found"}
            elif find_all.status_code == 500:
                logger.error("unable to find the config from the db", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to find the config from the db"}), 500)
        except Exception as e:
            logger.exception(f"error in the find_all_config method :: {e}",  extra= extras)
            return make_response(jsonify({"error": "unable to find all config"}), 500)

    def find_one_config(self,envName,appName):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = {'environmentName': envName, "applicationName": appName}
            # find_all = mycol.find_one(query)
            find_all = self.db.find_one(self.config, query)
            if isinstance(find_all, (dict, pymongo.cursor.Cursor)):
                logger.info(f"{appName} config data retrived",extra=extras)
                config_data = {
                    "environmentName": find_all.get("environmentName"),
                    "applicationName": find_all.get("applicationName"),
                    "createdTime": find_all.get("createdTime"),
                    "modifiedTime": find_all.get("modifiedTime")
                }
                data = []
                for doc in find_all.get("data"):
                    config = {
                        "key": doc.get("key"),
                        "value": doc.get("value"),
                        "config_description": doc.get("config_description",'')
                    }
                    data.append(config)
                config_data.update({"data": data})
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return config_data
            elif find_all.status_code == 404:
                logger.info(f"No config data found for the {envName}", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return {"message":"No Application Found"}
            elif find_all.status_code == 500:
                logger.error("unable to find the config from the db", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to find the config from the db"}), 500)
        except Exception as e:
            logger.exception(f"error in the find_one_config method :: {e}",  extra= extras)
            return make_response(jsonify({"error": "unable to find all config"}), 500)

    def find_bot_config(self, env,uiConfigValues=False, botname = None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            condition= {"environmentName": env}
            if botname:
                logger.info(f"finding all bot config by bot specific :: {botname} enviroinment :: {env}", extra= extras)
                bot_config = self.db.find_all(self.bot_config, condition, botname)
            else:
                logger.info(f"finding all bot config enviroinment :: {env}", extra= extras)
                bot_config = self.db.find_all(self.bot_config, condition)
            formated_bot_config = []
            if isinstance(bot_config, (list, pymongo.cursor.Cursor)):
                logger.info(f"bot config data retrived from the db", extra= extras)
                if not uiConfigValues:
                    for doc in bot_config:
                        key = doc.get("key")
                        if not botname:
                            bot_name = doc.get("bot_type")
                            key = key+"_"+bot_name
                        config_data = {
                            "key": key,
                            "value": doc.get("value")
                            }
                        if botname:
                            config_data.update({
                                    "input_options": doc.get("input_options"),
                                    "input_type": doc.get("input_type"),
                                    "label": doc.get("label"),
                                    "description":doc.get("description")
                                    })
                        formated_bot_config.append(config_data)
                    data = {"data": formated_bot_config}
                else:
                    data = {item.get('key'):item.get('value') for item in bot_config}
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return data
            elif bot_config.status_code == 404:
                logger.info(f"no data found for the bot config", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "No bot config"}), 404)
            elif bot_config.status_code == 500:
                logger.error("unable to fetch bot config from the db", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to fetch bot config"}), 500)
        except Exception as e:
            logger.exception(f"error in the find_bot_config method :: {e}", extra= extras)
            return make_response(jsonify({"error": "unable to find bot config"}), 500)
        
    def check_new_application(self,envName,appName,key,value,config_description):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = {'environmentName':envName,'applicationName':appName}
            # collection = mycol.find_one(query)
            collection = self.db.find_one(self.config, query)
            logger.info("checking whether the application is already exist", extra= extras)
            if isinstance(collection, (dict, pymongo.cursor.Cursor)):
                logger.info("Application already exists", extra= extras)
                response = {"message": 'Application already Exists'}
                status_code = 400
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return jsonify(response), status_code
            elif collection.status_code == 404:
                logger.info(f"no application exist with this {appName} and {envName}", extra= extras)
                new_query={
                    "environmentName":envName,
                    "applicationName":appName,
                    "createdTime":datetime.now(timezone.utc),
                    "modifiedTime":datetime.now(timezone.utc),
                    "data":[
                        {'key':key,
                        'value':value,
                        'config_description':config_description}
                    ]
                }
                # create_application = mycol.insert_one(new_query)
                if self.dbtype in ['pg', 'sql']:
                    new_query.pop("data")
                    app = self.db.insert_one(tableName= Config,data= new_query)
                    if app.status_code == 200:
                        logger.info("appliction data inserted in the config table ", extra= extras)
                        condition={"environmentName":envName,"applicationName":appName}
                        config = self.db.find_one(tableName= Config,conditions= condition)
                        if isinstance(config, dict):
                            newdata = {"key" : key, "value" : value,"config_id" : config['_id'],'config_description':config_description }
                            config_data = self.db.insert_one(tableName=ConfigData,data= newdata)
                            if config_data.status_code == 200:
                                logger.info("config data inserted", extra= extras)
                                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                                return {"message":f"{appName} Added Successfully"}
                            else:
                                logger.error("unable to add the config data", extra= extras)
                                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                                return make_response(jsonify({"error": "unable to add key"}), 500)
                        elif config.status_code == 404:
                            logger.error(f"unable to find the config id for the application {appName}", extra= extras)
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify({"error": f"unable to find the config id for the application {appName}"}), 404)
                    elif app.status_code == 500:
                        logger.error("unable to add the application in the db", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"message": "unable to add the application"}), 500)
                elif self.dbtype == "mongo":
                    insert = self.db.insert_one(tableName=self.config, data= new_query)
                    if insert.status_code == 200:
                        logger.info("new config add in the mongodb", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return {"message":f"{appName} Added Successfully"}
                    else:
                        logger.error("unable to add the configuration in the mongodb", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"message": "unable to add the application"}), 500)
            elif collection.status_code == 500:
                logger.error("unable to add the new application", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to add new application"}), 500)
        except Exception as e:
            logger.exception(f"error in the check_new_application method :: {e}", extra= extras)
            return make_response(jsonify({"error": "unable to find bot config"}), 500)
        
    def add_update(self,envName,appName,key,value,config_description):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            query = {'environmentName':envName,'applicationName':appName}
            # collection = mycol.find_one(query)
            update_value={'key':key,'value':value}
            collection = self.db.find_one(tableName= self.config, conditions= query)
            update = None
            insert = None
            if isinstance(collection, (dict, pymongo.cursor.Cursor)):
                logger.info(f"application data retrived from the db", extra= extras)
                data = collection['data']
                key_found = False
                for item in data:
                    if item['key'] == key:
                        key_found = True
                        config_key_id = item['_id']
                        break
                if key_found:
                    if self.dbtype in ['sql', 'pg']:
                        valueupdate_condition = {"_id":config_key_id,"key": key, "config_id": collection.get("_id")}
                        update_value = {"value": value,"config_description":config_description}
                        update = self.db.update_one(tableName=ConfigData,conditions=valueupdate_condition,updateValues= update_value)
                    elif self.dbtype == 'mongo':
                        item["value"] = value
                        update = self.db.update_one(tableName='config',conditions=query,updateValues= {"data": data}) 
                    if update.status_code == 200:
                        logger.info("config data updated successfully", extra= extras)
                    elif update.status_code == 500:
                        logger.info("unable to update the config data", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"error": "unable to update the "}), 500)
                elif not key_found:
                    logger.info("add new config data", extra=extras)
                    new_pair = {"key": key, "value": value,"config_description":config_description}
                    data.append(new_pair)
                    updatevalue = {
                        'data': data,
                    }
                    if self.dbtype in ['sql', 'pg']:
                        new_pair.update({"config_id" : collection['_id']})
                        insert = self.db.insert_one(tableName=ConfigData,data= new_pair)
                    else:
                        # tableName,conditions,updateValues
                        insert = self.db.update_one(tableName="config",conditions=query,updateValues = updatevalue)
                    if insert.status_code == 500:
                        logger.error("unable to add new config data", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"error": "unable to add the key"}), 500)
                if (update is None or update.status_code == 200) or (insert is None or insert.status_code == 200):
                    logger.info("new config data added successfully", extra= extras)
                    timeUpdate = {'modifiedTime': datetime.now(timezone.utc)}
                    time = self.db.update_one(self.config, query, timeUpdate )
                    if time.status_code == 200:
                        logger.info("config data updated timestamp updated", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return {"message":'Updated'} if key_found else {"message":'Added'}
                    else:
                        logger.error("new config data inserted, unable to update the updated timestamp", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"message": "unable to update the modified time"}), 200)
            elif collection.status_code == 404:
                logger.error(f"application not found {appName}", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return {"Error":'App not founded'}
            elif collection.status_code == 500:
                logger.error(f"unable to find the application from the db", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to update the key for this application"}), 500)
        except Exception as e:
            logger.exception(f"error in the add_update method :: {e}", extra= extras)
            return make_response(jsonify({"error": "unable to add or update the config data"}), 500)
                #         update = {
                #     "$set": {
                #         'data': data,
                #         'modifiedTime': datetime.datetime.now(timezone.utc)
                #     }
                # }
                #         mycol.update_one(query, update)

    def add_bot_config(self, env, data, botname):
        #  env, key, value, botname, options, options_type, label
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            update_count = 0
            add_count = 0
            for i in data:
                options = i["input_options"]
                if isinstance(options, list):
                    options = ','.join(options)
                else:
                    options = str(options)
                input_options = options
                input_type = i["input_type"]
                key = i["key"]
                label = i["label"]
                value = i["value"]
                condition = {"key": key, "environmentName": env}
                key_check = self.db.find_one(self.bot_config, condition, botname)
                if isinstance(key_check, (dict, pymongo.cursor.Cursor)):
                    logger.info(f"bot config found", extra= extras)
                    # options = str(key_check['input_options'])
                    # old_value = key_check["value"]
                    # options = options.replace(value, old_value)
                    if key_check["value"] != value:
                        update_value = {"value": value
                                        # , "input_options": options
                                        }
                        update = self.db.update_one(self.bot_config, condition, update_value, botname)
                        if update._status_code == 200:
                            logger.info("config value update successfully", extra= extras)
                            update_count += 1
                        elif update.status_code == 500:
                            logger.error("unable to update the bot config", extra= extras)
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify({"error": "unable to update the value"}), 500)
                elif key_check.status_code == 404:
                    new_bot_config = {
                        "key": key,
                        "value": value,
                        "environmentName": env,
                        "input_options": str(input_options),
                        "input_type": input_type,
                        "label": label
                    }
                    insert = self.db.insert_one(self.bot_config, new_bot_config, botname)
                    if insert.status_code == 200:
                        add_count +=1
                        logger.info("new bot config added successfully", extra= extras)
                    elif insert.status_code == 500:
                        logger.error("unable to insert the new bot Config", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"error": "unable to insert new key"}), 500)
                elif key_check.status_code == 500:
                    logger.error("unable to check the bot config exist or not", extra= extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error": "unable the add the key"}), 500)
            if len(data) == 1 and add_count==1:
                logger.info("new bot config inserted successfully", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": "key inserted successfully"}), 200)
            elif update_count>=0:
                logger.info(f"{update_count} were updated", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": f"{update_count} keys updated"}), 200)
        except Exception as e:
            logger.exception(f"error in the add_bot_config method :: {e}", extra= extras)
            return make_response(jsonify({"error": "unable to add or update the bot config"}), 500)
                
    def delete_key(self,envName,appName,key):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        query = {'environmentName':envName,'applicationName':appName}
        result = None
        delete = None
        # existing_document = mycol.find_one(query)
        existing_document = self.db.find_one(tableName= self.config, conditions= query)
                # The key exists in the 'data' array
                # update = {'$pull': {'data': {'key': key}}}
                # result = mycol.update_one(query, update)
        if isinstance(existing_document, (dict, pymongo.cursor.Cursor)):
            logger.info("config found from the db", extra= extras)
            data_array = list(existing_document.get('data', []))
            if any(item.get('key') == key for item in data_array):
                if self.dbtype in ['sql', 'pg']:
                    config_id = {"key": key,"config_id": existing_document.get("_id")}
                    result = self.db.delete(tableName=ConfigData, conditions=config_id)
                else:
                    data_array = [item for item in data_array if item.get('key') != key]
                    if len(data_array) > 0:
                        value = {'data': data_array}
                        result = self.db.update_one(tableName="config", conditions=query, updateValues=value)
                        if result.status_code == 200:
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify({"messsage": "config deleted successfully"}), 200)
                        elif result.status_code == 500:
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify({"error": "unable to update the config"}), 500)
                existing_document = self.db.find_one(tableName= self.config, conditions= query)
                data_array = list(existing_document.get('data', []))
                if len(data_array)<1:
                    delete = self.db.delete(self.config, query)
                    if delete.status_code == 200:
                        logger.info(f"application deleted :: {appName}", extra= extras)
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"message": "application deleted"}), 200)
                else:
                    logger.info(f"key deleted successfully {key}", extra= extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message": "Key deleted"}), 200)
            else:
                logger.info(f"key doesn't exist in this application {key}", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return {"message":'Key not found'}
        elif existing_document.status_code == 404:
            logger.error("application not found", extra= extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error":'Document not found'}), 404)
        elif existing_document.status_code == 500:
            logger.error("unable to found the application", extra= extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error":'unable to find the document'}), 500)
            

    def delete_Bot_config(self, env, key, botname):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        condition = {"key": key, "environmentName": env}
        check_key = self.db.find_one(self.bot_config, condition, botname)
        if isinstance(check_key, (dict, pymongo.cursor.Cursor)):
            logger.info("bot config data fetched from the db", extra= extras)
            delete = self.db.delete(self.bot_config, condition, botname)
            if delete.status_code == 200:
                logger.info("bot configuration deleted successfully", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": "Bot config deleted successfully"}), 200)
            elif delete.status_code == 500:
                logger.error(f"unable to delete the bot config {key}, {botname}", extra= extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to delete the bot config"}), 500)
        elif check_key.status_code == 404:
            logger.error("bot config doesn't exist in the db", extra= extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error": "config not found"}), 404)
        elif check_key.status_code == 500:
            logger.error("unable to find the bot config", extra= extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error": "unable to delete the question"}), 500)

    # def validate_bearer_token(bearer_token):
    #     response = requests.get(Auth_API_URl,headers={'Authorization':bearer_token})
    #     return response.status_code == 200


    def validate_bearer_token(self,bearer_token, required_role = None) -> Response:
        # return 401 if token is not passed
        # bearer_token = None
        # JWT token is passed in the request header
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        headers = request.headers
        if 'Authorization' in request.headers:
            bearer = headers.get('Authorization')    # Bearer YourTokenHere
            bearer_token = bearer.split()[1]
            # print(bearer_token) 
        # return False if token is not passed

        if not bearer_token:
            logger.error("Access denied. Bearer token is not passed", extra= extras)
            return make_response(jsonify({"error":"Unauthorized access"}),401)

        try:
            # print("here***************")
            # decoding the payload to fetch the stored details
            data = jwt.decode(bearer_token, "KumaranSystemsSecretCode", algorithms=['HS256'])
            sessionID = data.get('sessionID')
            current_user =  data['userID']
            bot_type = data.get('bot_type','cibc')
            user_table_id = data.get('user_table_id')
            sessionCheck = Authentication(username=current_user,db_type=self.dbtype, sessionID=sessionID, bot_type=bot_type)
            if sessionID and user_table_id:
                response = sessionCheck.checkSessionStatus(user_table_id)
                if response.status_code == 200:
                    logger.info("Token decoded and session verification successfully",extra=extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                else:   
                    return response
            # print(current_user)
            if required_role is None or required_role in data['roles']:
                return make_response(jsonify({"message":"Successfully authenticated"}),200)
            else:
                logger.error("Access denied. User doesn't have required role.",extra=extras)
                return make_response(jsonify({"error":"Unauthorized access"}), 401)
        except jwt.ExpiredSignatureError:
            logger.exception("Access denied. User token has been expired", extra=extras)
            return make_response(jsonify({"error":'Unauthorized access'}), 401)  # Token has expired
        except jwt.DecodeError:
            logger.exception("Access denied. User token is invalid !!", extra=extras)
            return make_response(jsonify({"error":"Unauthorized access"}, 401))
        finally:
            sessionCheck.db.session.close()
        # returns the current logged in users context to the routes       
class Authentication():
    def __init__(self,db_type,username,bot_type=None,sessionID=None):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.username = username
        self.bot_type = bot_type
        self.dbtype = db_type
        if db_type in ["sql", "pg"]:
            self.db = SQLFactory()
            self.bot = BotType
            self.usersession = UserSessionDetails
        else:
            self.db = MongoDBFactory()
            self.bot = 'bot_types'
            self.usersession = 'user_session_details'
        self.sessionID = sessionID
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    def checkSessionStatus(self,user_table_id):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        conditions= {"user_id": user_table_id,"session_id":self.sessionID,'is_active':True}
        user_session_data = self.db.find_one(self.usersession, conditions,botname= self.bot_type)
        if isinstance(user_session_data, dict):
            user_session_id = user_session_data.get('session_id') 
            if user_session_id==self.sessionID:
                return make_response(jsonify({"message":"login verification successfull"}),200)
            else:
                return make_response(jsonify({'message' : 'session has expired'}),409)
        elif user_session_data.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({'error' : 'session has expired'},), 500)
        elif user_session_data.status_code == 404:
            logger.error(f'User not found , username: {self.username}',extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({'message' : 'session has expired'}), 409)