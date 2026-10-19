import os

import jwt
import yaml
from flask import Flask, g, jsonify, request, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# from base_logger import logger
from logger import get_caller_frame, logger

# CONTENT_MANAGER_ROLE = os.getenv("CONTENT_MANAGER")
BOT_ADMIN = os.getenv("BOT_ADMIN")
dbtype=os.getenv("DB_TYPE","pg")

# CONTENT_MANAGER_ROLE = "contentmanager"
# BOT_ADMIN = 'botadmin'
# dbtype = "sql"

from datetime import datetime, timezone

from structure import Configuration

app = Flask(__name__)
CORS(app)

SERVICE_NAME='CONVERSATIONAL_AI_CHATBOT_CONFIG_JAVA_SERVICE'
PROJECT_NAME='CHATBOT'

@app.before_request
def decode_token():
    token = request.headers.get('Authorization')
    if token:
        token = token.split()[1]

        if not token:
            return jsonify({"error":"Unauthorized access"}),401
            
        data = jwt.decode(token, "KumaranSystemsSecretCode", algorithms=['HS256'])
        current_user =  data['userID']
        response = current_user
        # print(response)
        g.user_name = response
    else:
        g.user_name = "System"

@app.route('/', methods=['GET'])
def home():
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    logger.info("Config Service : Working",extra=extras)
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return "it is working v0.1.3"


@app.route('/<env>', methods=["POST"])
def check(env):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    bearer_token = request.headers.get('Authorization')
    env = env.upper()
    logger.info(f"Config Service : {env}",extra=extras)
    #if not validate_bearer_token(bearer_token):
    #    return jsonify({"error":"Unauthorized access"}),401
    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    return f'{env}'


@app.route('/<env>/chatbotconfig/findAllConfig', methods=['GET'])
def findAllConfig(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        env = env.upper()
        #data = request.get_json()
        #env_name = data['envName']
        bearer_token = request.headers.get('Authorization')
        config = Configuration(db_type=dbtype,env_name=env)
        response = config.validate_bearer_token(bearer_token = bearer_token)
        if response.status_code == 200:
            logger.info(f"Config Service : {env}",extra=extras)
        else:
            logger.info(f"Config Service : findAllConfig Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : findAllConfig Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.find_all_config(env)
    except Exception as e:
            logger.exception(f"Error in findAllConfig : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatbotconfig/findAllConfig/yaml', methods=['GET'])
def findAllConfigYaml(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now()}",extra=extras)
        env = env.upper()
        bearer_token = request.headers.get('Authorization')
        config = Configuration(db_type=dbtype,env_name=env)
        response = config.validate_bearer_token(bearer_token = bearer_token)
        if response.status_code == 200:
            logger.info(f"Config Service : {env}",extra=extras)
        else:
            logger.info(f"Config Service : findAllConfig Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now()}",extra=extras)
            return response
        
        all_application_config_data = config.find_all_config(env)


        yaml_data = yaml.dump(all_application_config_data, sort_keys=False)
        
        # Write YAML to a file
        yaml_file_path = 'output.yaml'
        with open(yaml_file_path, 'w') as yaml_file:
            yaml_file.write(yaml_data)

        # Send the file as a download
        return send_file(yaml_file_path, as_attachment=True, download_name='output.yaml')
    except Exception as e:
            logger.exception(f"Error in findAllConfigYaml : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()
    


@app.route('/<env>/chatbotconfig/updateAllConfig/yaml', methods=['POST'])
def allAllConfigYaml(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now()}",extra=extras)
        env = env.upper()
        bearer_token = request.headers.get('Authorization')
        config = Configuration(db_type=dbtype,env_name=env)
        response = config.validate_bearer_token(bearer_token = bearer_token)
        if response.status_code == 200:
            logger.info(f"Config Service : {env}",extra=extras)
        else:
            logger.info(f"Config Service : findAllConfig Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now()}",extra=extras)
        
        yaml_content = request.get_data()
        json_data = yaml.safe_load(yaml_content)
        print(json_data)
        for i in json_data:
            app_name = i['applicationName']
            for j in i['data']:
                config.add_update(env,app_name,j['key'],j['value'],j['config_description'])
        return json_data
    except Exception as e:
            logger.exception(f"Error in allAllConfigYaml : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()
    

@app.route('/chatBotConfig/getConfigurations/<env>/<app_name>', methods=['GET'])
def getConfigurations(env,app_name):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        env = env.upper()
        config = Configuration(db_type=dbtype,env_name=env)
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token)
        if response.status_code == 200:
            logger.info(f"Config Service : getConfigurations Token validation success",extra=extras)
        else:
            logger.info(f"Config Service : getConfigurations Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : getConfigurations Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.find_one_config(env, app_name)
    except Exception as e:
            logger.exception(f"Error in getConfigurations : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatBotConfig/findAllBotConfig', methods=['GET'])
def getBotAllConfigurations(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        env = env.upper()
        config = Configuration(db_type=dbtype,env_name=env)
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token, BOT_ADMIN)
        if response.status_code == 200:
            logger.info(f"Config Service : findAllBotConfig Token validation success",extra=extras)
        else:
            logger.info(f"Config Service : getConfigurations Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : getConfigurations Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.find_bot_config(env=env)
    except Exception as e:
            logger.exception(f"Error in getBotAllConfigurations : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatBotConfig/getbotConfigurations/<botname>', methods=['GET'])
def getBotConfigurations(env,botname):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        env = env.upper()
        config = Configuration(db_type=dbtype,env_name=env)
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token, BOT_ADMIN)
        if response.status_code == 200:
            logger.info(f"Config Service : getBotConfigurations Token validation success",extra=extras)
        else:
            logger.info(f"Config Service : getConfigurations Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : getConfigurations Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.find_bot_config(env=env, botname=botname)
    except Exception as e:
            logger.exception(f"Error in getBotConfigurations : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()


@app.route('/<env>/chatbotconfig/addNewApplication', methods = ["POST"])
def addNewApplication(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        env = env.upper()
        data = request.get_json()
        #env_name = data['envName']
        app_name = data['appName']
        config = Configuration(db_type=dbtype,env_name=env)
        if 'data' not in data and not data.get("data",[]):
            return {"message":"No Data Found"}
        
        entry_data = data['data'][0]

        if 'key' not in entry_data or 'value' not in entry_data:
            return {"message":"No key & Value Found"}
        
        if not entry_data['key'] or not entry_data['value']:
            return {"message":"Values Missing"}
        
        key = entry_data['key']
        value = entry_data['value']
        config_description = entry_data.get("config_description",'')

        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token)
        if response.status_code == 200:
            logger.info(f"Config Service : addNewApplication Token validation passed",extra=extras)
        else:
            logger.info(f"Config Service : addNewApplication Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : addNewApplication Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.check_new_application(env,app_name,key,value,config_description)
    except Exception as e:
            logger.exception(f"Error in addNewApplication : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()


@app.route('/<env>/chatbotconfig/addUpdate', methods = ['POST'])
def addUpdate(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        config = Configuration(db_type=dbtype,env_name=env)
        env = env.upper()
        data = request.get_json()
        #env_name = data['envName']
        app_name = data['appName']
        config_data = data.get('data',[])
        if "data" not in data or not config_data :
            return jsonify(error="missing config data values"),400
        if config_data:
            key = data['data'][0]['key']
            value = data['data'][0]['value']
            config_description = data['data'][0].get('config_description','')
            bearer_token = request.headers.get('Authorization')
            response = config.validate_bearer_token(bearer_token)
            if response.status_code == 200:
                logger.info(f"Config Service : addUpdate Token validation passed",extra=extras)
            else:
                logger.info(f"Config Service : addUpdate Token validation failed",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return response
            logger.info(f"Config Service : addUpdate Returned",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return config.add_update(env,app_name,key,value,config_description)
    except Exception as e:
        logger.exception(f"Error in addUpdate : {e}",extra=extras)
        logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatbotconfig/addBotConfig/<botname>', methods = ['POST'])
def addBotConfig(env, botname):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        config = Configuration(db_type=dbtype,env_name=env)
        env = env.upper()
        data = request.get_json()
        key = data["data"]
        #env_name = data['envName']time
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token, BOT_ADMIN)
        if response.status_code == 200:
            logger.info(f"Config Service : addBotConfig Token validation passed",extra=extras)
        else:
            logger.info(f"Config Service : addUpdate Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : addUpdate Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.add_bot_config(env, key, botname)
    except Exception as e:
            logger.exception(f"Error in addBotConfig : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatbotconfig/delete', methods = ['POST'])
def delete(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        config = Configuration(db_type=dbtype,env_name=env)
        env = env.upper()
        data = request.get_json()
        #env_name = data['envName']
        app_name = data['appName']
        key = data['data'][0]['key']
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token)
        if response.status_code == 200:
            logger.info(f"Config service:delete token validation passed",extra=extras)
        else:
            logger.info(f"Config Service : delete Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : delete Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.delete_key(env,app_name,key)
    except Exception as e:
            logger.exception(f"Error in delete : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatbotconfig/delete_bot_config', methods = ['POST'])
def deletebotConfig(env):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        config = Configuration(db_type=dbtype,env_name=env)
        env = env.upper()
        data = request.get_json()
        key = data['key']
        botname = data["bot_type"]
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token, BOT_ADMIN)
        if response.status_code == 200:
            logger.info(f"Config service:delete token validation passed",extra=extras)
        else:
            logger.info(f"Config Service : delete Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : delete Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.delete_Bot_config(env, key, botname)
    except Exception as e:
            logger.exception(f"Error in deletebotConfig : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()

@app.route('/<env>/chatBotUIConfig/getbotConfigurations/<botname>', methods=['GET'])
def getBotConfigurationsForUI(env,botname):
    try:
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        env = env.upper()
        config = Configuration(db_type=dbtype,env_name=env)
        bearer_token = request.headers.get('Authorization')
        response = config.validate_bearer_token(bearer_token)
        if response.status_code == 200:
            logger.info(f"Config Service : getBotConfigurations Token validation success",extra=extras)
        else:
            logger.info(f"Config Service : getConfigurations Token validation failed",extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return response
        logger.info(f"Config Service : getConfigurations Returned",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return config.find_bot_config(env=env,uiConfigValues=True ,botname=botname)
    except Exception as e:
            logger.exception(f"Error in getBotConfigurationsForUI : {e}",extra=extras)
            logger.info(f"Config Service :  Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
    finally :
        config.db.session.close()


if __name__ == '__main__':
    app.run()
