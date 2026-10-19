import uuid
from random import randint
from datetime import datetime,timezone, timedelta
import base64
import os
import json
from azure.communication.email import EmailClient
import pytz
from sqlalchemy import desc
from mongoservice.mongodb import MongoDB
from authservice.mainqueries import *
from authservice.auth import *
COMM_BASE_URL = os.getenv("COMM_BASE_URL")
COMM_KEY = os.getenv("COMM_KEY")
TOKEN_TEXT = os.getenv("TOKEN_TEXT")
RESET_TOKEN_EXPIRY = os.getenv("RESET_TOKEN_EXPIRY")
SENDER_ADDRESS = os.getenv("SENDER_ADDRESS")
USERNAME = "SSdtIHVzZXJuYW1l"

SERVICE_NAME='CONVERSATIONAL AI CHATBOT ADMIN SERVICE'
PROJECT_NAME='CHATBOT'

class PasswordReset():
    def __init__(self,db_type,bot_type) -> None:
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.dbtype = db_type
        self.bot_type = bot_type
        if db_type in ["sql",'pg']:
            self.db = SQLFactory()
            self.tablename = PasswordResetToken
            self.usertable = User
        else:
            self.db = MongoDBFactory()
            self.usertable = "users"
            self.tablename = "password_reset_tokens"
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    
    def generateEmail(self,encodeUser, username, token, bot_type):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        logger.info(f"Generating email for password reset for username: {username}",extra=extras)
        connection_string = f"endpoint={COMM_BASE_URL};accesskey={COMM_KEY}"
        email_client = EmailClient.from_connection_string(connection_string)
        if bot_type == "cibc":
            RESET_PAGE = os.getenv("RESET_PAGE")
        elif bot_type == "kumaran":
            RESET_PAGE = os.getenv("RESET_PAGE_KUMARAN")
        else:
            RESET_PAGE = os.getenv("RESET_PAGE_SCOTIA")

        message = {
            "content": {
                "subject": "Password Reset",
                "plainText": "This is the body",
                "html": f"<html><h4>Dear User,</h4></br><h4>Please click the <a href= \"{RESET_PAGE}?{TOKEN_TEXT}={token}&{USERNAME}={encodeUser}\">link </a>"+
                        "to reset the password.</br>"+
                        "Link will be active for next 6 hours.</h4>"+
                        "</br><b>Thanks,</br>Kumaran Systems</b></br></br><p> This is automated response from the system. Please do not reply to this mail</p>"+
                        "</html>"
            },
            "recipients": {
                "to": [
                    {
                        "address": username,
                        "displayName": "Kumaran Systems"
                    }
                ]
            },
            "senderAddress": SENDER_ADDRESS
        }

        poller = email_client.begin_send(message)
        result = poller.result()
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    def generate_random_token(self):
       extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
       logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
       logger.info("Generating random token",extra=extras)
       token = uuid.uuid1()
       #token = randint(10000000, 99999999)
       logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
       return token
        
    def saveTokenExpiry(self, username, token):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        present_time = datetime.now(timezone.utc) 
        expiry = ( datetime.now(timezone.utc) + timedelta( hours=int(RESET_TOKEN_EXPIRY) ))
        # if present_time < expiry:
        #     print('not expired')
        # else:
        #     print("expired")
        update_token = {
            "username": username,
            "token": token,
            "token_expiry": expiry 
            }
        if self.dbtype in ["sql","pg"]:
            bot = self.db.find_one(BotType, conditions={"bot_type": self.bot_type})
            if isinstance(bot, dict):
                update_token["bot_id"] = bot["_id"]
        elif self.dbtype == "mongo":
            update_token["bot_type"] = self.bot_type

        # db.password_reset_tokens.insert_one(update_token)
        result = self.db.insert_one(tableName=self.tablename,data=update_token)
        if result.status_code == 200:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error":"Updated Token Expiry"}), 200)
        elif result.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return "Failed to insert data"
            

    def checkTokenExpiry(self, encodedusername, encodeToken, password):
        print("Tok",self.decodeToken(encodeToken))
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        present_time = datetime.now(timezone.utc) 
      #  doc = db.password_reset_tokens.find_one({"username": username.lower()})
        username = self.decodeToken(encodeToken) 
        auth = Auth(encodedusername,password,"",self.dbtype,self.bot_type)
        old_pwd_check = auth.old_password_check(PasswordHistory,encodedusername,password) 
        if old_pwd_check:
            return make_response(jsonify({"msg": "Current password cannot be same as previous."}), 400)
        condition = {"username":encodedusername.lower()}
        data = self.db.find_all(tableName= self.tablename, conditions= condition, botname= self.bot_type)
        if isinstance(data, list):
            data =  list(data)
            print(data)
            if len(data) > 0:
                doc = data[-1] 
                print("From DB:",doc)
            if len(data) == 0:
                return make_response(jsonify({"msg":"User Not Available"}), 401)
                # return json.dumps({"msg":"User Not Available"}),401
        token = self.decodeToken(encodeToken) 
        # index = next((i for i, c in enumerate(token) if c.isdigit()), None)
        # token = token[index:]
        if doc is not None:
            tokenFromMongo = (doc["token"])
            tokenFromMongo = self.decodeToken(tokenFromMongo) 
            expiry = doc["is_used"]
            if expiry == "inactive":
                return make_response(jsonify({"msg":"Your token is expired.Please try again"}), 401)
                # return  json.dumps({"msg":"Your token is expired.Please try again"}),401

            if expiry == "used":
                    return make_response(jsonify({"msg":"Your token is already used"}), 401)
                    # return  json.dumps({"msg":"Your token is already used"}),401
            if tokenFromMongo == token:
                datetime_from_db = doc['token_expiry']
                if datetime_from_db.tzinfo is None:
                    datetime_from_db = datetime_from_db.replace(tzinfo=pytz.utc)
                present_time = datetime.now(pytz.utc)
                if present_time < datetime_from_db:                       
                    # myquery = { "username": username }
                    condition = { "_id": doc["_id"] }
                    newvalues = {"is_used": "used"} 
                    token_insert = self.db.update_one(tableName= self.tablename,updateValues=newvalues,conditions= condition,botname= self.bot_type)
                    if token_insert.status_code == 200:
                        logger.info("Token expiry check successful.",extra=extras)
                        return make_response(jsonify({"msg":"valid", "username": username}), 200)
                        # return json.dumps({"msg":"valid", "username": username}), 200
                else:
                    #  myquery = { "username": username }
                    myquery = { "_id": doc["_id"] }
                    newvalues = {"is_used": "inactive"}
                    update_token = self.db.update_one(tableName=self.tablename,conditions=myquery, updateValues=newvalues)
                    if update_token.status_code == 200:
                        logger.info("Token has been expiry",extra=extras)
                        return make_response(jsonify({"msg":"Token has expired. Please try again"}), 401)
                        # return  json.dumps({"msg":"Token has expired. Please try again"}),401
                        #raise Exception("Token has expired. Please try again")

                   
                   # raise Exception("Your token is not active")
           # raise Exception("Invalid Token")
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"msg":"Invalid Token"}), 401)
            # return json.dumps({"msg":"Invalid Token"}),401
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return make_response(jsonify({"msg":"Invalid User"}), 401)
        # return json.dumps({"msg":"Invalid User"}),401
        
    def encodeToken(self, token):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        encoded_token = token.encode("ascii")
        base64_bytes = base64.b64encode(encoded_token)
        base64_string = base64_bytes.decode("ascii")
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return base64_string


  
    # def decodeToken(self, encodedToken):  
    #     base64_string = encodedToken
    #     base64_bytes = base64_string.encode("ascii")
    #     decodeToken = base64.b64decode(base64_bytes)
    #     decoded = decodeToken.decode("ascii")
        
    #     print(f"Decoded string: {decoded}")
    #     return decoded

    def decodeToken(self, encodedToken):  
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        base64_bytes = encodedToken.encode("ascii")
        decodeToken = base64.b64decode(base64_bytes)
        decoded = decodeToken.decode("ascii", errors="ignore")  # Use "ignore" error handling
        
        print(f"Decoded string: {decoded}")
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return decoded


    def generateToken(self, username):
         try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            condition = {"username" : username}
            user_data = self.db.find_one(self.usertable, condition,botname= self.bot_type)
            if isinstance(user_data, dict):
                print("user",user_data)
                encodeToken = None
                encodeUser = None
                token = str(self.generate_random_token())
                print("token::",token)
                encodeToken = self.encodeToken(token)
                encodeUser = self.encodeToken(username)
                deco = self.decodeToken(encodeToken)
                user = self.decodeToken(encodeUser)
                print("deco",deco)
                print("user",user)
                print("encodeUser:::",encodeUser)
                # decodeToken = self.decodeToken(encodeToken) 
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return encodeToken, encodeUser
            elif user_data.status_code == 404 or user_data.status_code == 500:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "data not found"}),400)
         except Exception as e:
             print(e)


# t = PasswordReset()
# t.generateEmail("sangeetha.kadhirvel@kumaran.com")
#t.saveTokenExpiry("test")