import jwt
import json
import bcrypt
 
import base64
from datetime import datetime,timezone, timedelta
 
from sqlalchemy import desc
from flask import jsonify , make_response
from bson import ObjectId
import math
import numpy as np
 
from sqlalchemy.exc import IntegrityError
import imghdr
 
import numpy as np
from bson.binary import Binary
import cv2
import imghdr
from authservice.tableModels import  *  
from authservice.mainqueries import *
from logger import logger,get_caller_frame,extras
 
SERVICE_NAME='CONVERSATIONAL AI CHATBOT ADMIN SERVICE'
PROJECT_NAME='CHATBOT'
 
SESSION_EXPIRY_TIME = int(os.getenv("SESSION_EXPIRY_TIME"))
class Auth():
    def __init__(self, username, password, roles,db_type,bot_type=None,sessionID = None,force_login=False):
        extras
        {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.username = username
        self.password = password
        self.roles = roles
        self.dbtype= db_type
        self.bot_type = bot_type
        self.SECRET_KEY = os.getenv("ENCRYPTION_CODE")
        if db_type in ["sql","pg"]:
            self.db = SQLFactory()
            self.usertable = User
            self.bottable = BotType
            self.usersession = UserSessionDetails
            self.passwordhistory = PasswordHistory
        elif db_type == "mongo":
            self.db = MongoDBFactory()
            self.usertable = "users"
            self.usersession = "user_session_details"
        self.sessionID = sessionID
        self.force_login = force_login
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
 
    def encryptpassword(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        password = self.password
        bytes = password.encode('utf-8')
        salt = bcrypt.gensalt()
        hash = bcrypt.hashpw(bytes, salt)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return hash
 
    def decryptpassword(self, encryptpwd):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        password = self.password
        userBytes = password.encode('utf-8')
        result = bcrypt.checkpw(userBytes, encryptpwd)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return result
   
    def resize_profile_picture(self, image_file, size):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        image_np = np.frombuffer(image_file.read(), np.uint8)
        img = cv2.imdecode(image_np, cv2.IMREAD_COLOR)
        img_resized = cv2.resize(img, size)
        _, img_bytes_resized = cv2.imencode('.jpg', img_resized)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return img_bytes_resized.tobytes()
    
    def checkBotAccess(self):
        condition = {"bot_type":self.bot_type}
        bot_check = self.db.find_all(self.bottable, condition ,self.bot_type)
        if isinstance(bot_check, list):
            return True
        else:
            return False
        
    def CheckRoles(self,roles=None,get_role=False):
        condition = {}
        bot_check = self.db.find_all(Role, condition ,self.bot_type)
        role_check = [role['role'] for role in bot_check]
        if not get_role:
            if not isinstance(roles, list):
                roles = [roles]
            roles_set = set(roles)
            return roles_set.issubset(role_check)
        else:
            return role_check
        
    def login(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        if not self.username or not self.password:
            logger.error('Username or password is missing.',extra=extras)
            return json.dumps(
                {'WWW-Authenticate1' : 'Basic realm ="Login required !!"'}
            ), 401
        condition = {"username" : self.username,"is_deleted":False}
        user_data = self.db.find_one(self.usertable, condition,botname= self.bot_type)
        if isinstance(user_data, dict):
            if (self.decryptpassword(encryptpwd= user_data.get("password"))):
                # if not self.force_login and user_data.get('current_sessionID'):
                #     return make_response(jsonify({"message": "Active session already exists. Do you want to log out the previous session?"}), 409)
                user_table_id = user_data.get('_id')
                token = jwt.encode({
                    'exp' : datetime.utcnow() + timedelta(days=SESSION_EXPIRY_TIME),
                    'user_table_id': user_table_id,
                    'userID' : self.username.lower(),
                    'roles' : user_data.get("roles", []),
                    "sessionID" : self.sessionID,
                    'bot_type': self.bot_type,
                }, self.SECRET_KEY)
 
                if "profile_picture" not in user_data or user_data['profile_picture'] == None or user_data['profile_picture'] == "":
                    picture = ""
                else:
                    dp = user_data['profile_picture']
                    picture = base64.b64encode(dp).decode('utf-8')
                   
                response_data = {
                    'token' : token.decode(),
                    'username': self.username.lower(),
                    'roles': user_data.get("roles", []),
                    'profile_picture': picture,
                    'language':user_data.get("language", ""),
                    'bot_type':user_data.get("bot_type", ""),
                    'is_default_password':user_data.get("is_default_password")
                    }
                if self.sessionID:
                    return self.addSessionDetails(user_table_id=user_table_id,response_data=response_data)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return json.dumps(response_data)
            else:
                logger.error('Incorrect password, username: {self.username}',extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": "Invalid credentials"}), 404)
        elif user_data.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({'error' : 'Unable to fetch data from db'},), 500)
        elif user_data.status_code == 404:
            logger.error(f'User not found , username: {self.username}',extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({'WWW-Authenticate2' : 'Basic realm ="User does not exist !!"'},), 401)
    

    def addUser(self, firstname, lastname, profile_picture, default_password = False):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        condition = {"username": self.username,"is_deleted":False}
        user_data = self.db.find_one(tableName= self.usertable,conditions= condition,botname=self.bot_type)
        if isinstance(user_data, dict):
            logger.error(f'User already exists, username: {self.username}',extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error": "User Already Exists"}), 404)
        elif user_data.status_code == 500:
            logger.error(f'unable to insert new user',extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"error": "unable to find user"}), 404)
        elif user_data.status_code  == 404:
            encryptpwd = self.encryptpassword()
            if profile_picture != "empty":
                allowed_formats = {'jpeg', 'jpg', 'png'}
                file_format = imghdr.what(profile_picture)
                if file_format is None or file_format not in allowed_formats:
                    logger.error("Invalid image format.", extra=extras)
                    return make_response(jsonify({"error": "Invalid image format"}), 404)
                resized_image = self.resize_profile_picture(profile_picture, (100, 100))
                binary_picture = Binary(resized_image)
            else:
                binary_picture = None
            user = {"username": self.username.lower(),"password": encryptpwd,
                "profile_picture": binary_picture,"firstname": firstname,
                "lastname": lastname,"roles": self.roles,"bot_type": self.bot_type,"language" : "en","is_deleted":False,"is_default_password":default_password}
            if self.dbtype in ["sql","pg"]:
                user.pop("roles")
                user.pop("bot_type")
                user.pop("language")
                bot_type_id = self.db.find_one(self.bottable, {"bot_type":self.bot_type}).get("_id")
                user.update({"bot_type_id":bot_type_id})
                newuser = self.db.insert_one(self.usertable, user)
                if newuser.status_code == 200:
                    last_user = self.db.session.query(User).filter((User.username == self.username) & (User.is_deleted == False)).order_by(desc(User._id)).first()
                    user = last_user.to_dict()
                    # bot = self.db.find_one(BotType, conditions={"bot_type": self.bot_type})
                   
                    preference = {
                        "user_id": user["_id"]
                    }
                    pref = self.db.insert_one(UserPreference, data=preference)
                    if pref.status_code == 200:
                        addrole = self.db.manage_roles(self.username, self.roles, self.bot_type, "add")
                    if addrole.status_code != 404 and addrole.status_code != 500:
                        logger.info(f'User role added successfully, username: {self.username}', extra=extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message": "User registered successfully"}), 200)
                elif newuser.status_code == 500:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error": "unable to register new user"},500))
                   
            elif self.dbtype == "mongo":  
                user = self.db.insert_one(self.usertable,user)
                if user.status_code == 200:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message": "User registered successfully"}), 200)
                elif user.status_code == 500:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error": "unable to register new user"},500))
 
    def Roles(self, action):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        roles = self.roles
        try:
            result = self.db.manage_roles(roles=roles, username=self.username, botname=self.bot_type, action=action)
            logger.info(f'{result}', extra=extras)
            if result.status_code == 500:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": result}), 500)
            elif result.status_code == 404:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": result}), 404)
            elif result.status_code == 200:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return result
        except Exception as e:
            logger.error(f'Error in manage_role method: {str(e)}', extra=extras)
            return make_response(jsonify({"error": "unable to update the roles"}), 500)
       
    def resetPassword(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        cond = {"username":self.username.lower()}
        get_pwd = self.db.find_one(User, conditions=cond, botname=self.bot_type)
        pwd = get_pwd.get("password")
        user_id = get_pwd.get('_id')
        print(type(get_pwd))
        data = {"user_id":user_id, "old_password":pwd, "changed_at":datetime.now(timezone.utc), "bot_type_id":self.bot_type}
        resp = self.db.insert_one(PasswordHistory,data=data)
        username = self.username.lower()
        password = self.password
        encryptpwd = self.encryptpassword()
        print("username::", username)
        print("password::", password)
        logger.info(f"Resetting password for user: {username}",extra=extras)
        conditions = {"username" : self.username,"is_deleted":False}
        value =  {"password": encryptpwd}
        update_status = self.db.update_one(self.usertable,conditions= conditions,updateValues=value,botname= self.bot_type)
        if update_status.status_code == 200:          
            logger.info(f"Password updated successfully for user: {username}",extra=extras)      
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"msg": "Password Updated Successfully"}), 200)
        elif update_status.status_code == 404:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return update_status
        elif update_status.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return update_status
       
    def deleteUser(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            result = None
            conditions = {"username": self.username,"is_deleted":False}
            logger.info(f"Deleting user: {self.username}",extra=extras)
            updateValues={"is_deleted":True}
            result = self.db.update_one(self.usertable,updateValues, conditions,botname= self.bot_type)            
            if result.status_code == 200:
                logger.info(f"User deleted successfully: {self.username}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": "User deleted successfully"}), 200)
            elif result.status_code == 404:
                logger.warning(f"No user found matching the specified username: {self.username}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": "No user found matching the specified username"}), 404)
            elif result.status_code == 500:
                logger.error(f"{result}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": result}), 500)
        except IntegrityError as e:
            logger.error(f"Error deleting user: {e}",extra=extras)
            return make_response(jsonify({"error": "Error deleting user"}), 500)
       
    def fetchUsers(self, page_number, page_size):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            result = self.db.slice(self.usertable, page_number, page_size, botname=self.bot_type,condition={"is_deleted":False})  
            if isinstance(result, tuple) and len(result) == 2:
                data, count_db = result
                number_of_pages = math.ceil(count_db / page_size)
                all_users = []
                for doc in data[0]:
                    username = doc.get('username')
                    roles = doc.get('roles', [])
                    profile_picture = doc.get('profile_picture', '')
                    if profile_picture:
                        profile_picture = base64.b64encode(profile_picture).decode('utf-8')
                    user_info = {
                        "username": username,
                        "roles": roles,
                        "profile_picture": profile_picture
                    }
                    all_users.append(user_info)
            response_data = {
                "all_users": all_users,
                "total_no_of_pages": number_of_pages
            }
            logger.info('User data fetched successfully.',extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return jsonify(response_data)
 
        except Exception as e:
            logger.error(f'Error in fetchUsers method: {str(e)}',extra=extras)
            return make_response(jsonify({"error": "Error in fetchUsers method"}), 500)
   
    def searchUser(self, userString):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            userString = userString.lower()
            searchcolumn = "username"
            data = self.db.searchLike(tableName= self.usertable, column=searchcolumn, likeString=userString, botname= self.bot_type,condition={"is_deleted":False})
            if isinstance(data, list):
                users_data = []
                for doc in data:
                    if doc is not None:
                        profile_picture = doc.get('profile_picture', '')
                        if "profile_picture" not in doc or doc['profile_picture'] == None or doc['profile_picture'] == "":
                            profile_picture = ""
                        elif profile_picture:
                            profile_picture = base64.b64encode(profile_picture).decode('utf-8')
                        # profile_picture = doc.get('profile_picture', '')
                   
                        # if profile_picture != '':
                        #     # Handle binary data in 'profile_picture'
                        #     profile_picture = base64.b64encode(profile_picture).decode('utf-8')
                        users_data.append({
                            "username":doc['username'],
                            "roles":doc['roles'],
                            "profile_picture": profile_picture
                                        })
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                logger.info('User search successful.',extra=extras)
                return {"matching_user_list":users_data}
            elif data.status_code == 500:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error":"unable to search the user"}), 500)
        except Exception as e:
            logger.error(f'Error in searchUser method: {str(e)}',extra=extras)
            return make_response(jsonify({"error": "Error in searchUser method"}),500)
       
    def changePassword(self, new_password):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            username = self.username
            condition = {"username": username,"is_deleted":False}
            user_doc = None
            user_doc = self.db.find_one(self.usertable, condition,botname=self.bot_type)
            if isinstance(user_doc, dict):
                oldpassword = user_doc.get("password")
                if self.decryptpassword(encryptpwd= oldpassword):
                    user_id = user_doc.get("_id")
                    old_pwd_check = self.old_password_check(PasswordHistory,user_id,new_password) 
                    if old_pwd_check:
                        return make_response(jsonify({"message": "Current password cannot be same as previous."}), 400)
                    data = {"user_id":user_id, "old_password":oldpassword, "changed_at":datetime.now(timezone.utc), "bot_type_id":self.bot_type}
                    resp = self.db.insert_one(PasswordHistory,data=data)
                    if resp.status_code == 200:
                        self.password = new_password
                        new_encrypted_password = self.encryptpassword()
                        value = {"password": new_encrypted_password}
                        update_status = self.db.update_one(self.usertable, conditions=condition, updateValues=value,botname=self.bot_type)            
                        def_pwd = user_doc.get("is_default_password")
                        if update_status.status_code == 200 and update_status.status_code != 500 and update_status.status_code != 404:
                            value = {"is_default_password":False}
                            def_pwd_check = self.db.update_one(self.usertable, conditions=condition, updateValues=value,botname=self.bot_type)
                            logger.info(f'Password updated successfully, username: {username}',extra=extras)
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return make_response(jsonify({"message": "Password updated successfully."}), 200)
                        elif update_status.status_code == 500:
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return update_status
                        elif update_status.status_code == 404:
                            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return update_status
                    else:
                        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        return make_response(jsonify({"error": user_doc}), 404)  
                else:
                    logger.error(f'Current password is incorrect, username: {username}',extra=extras)
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message": "Current password is incorrect."}), 401)
            elif user_doc.status_code == 404:
                logger.error('User not found.',extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": user_doc}), 404)
            elif user_doc.status_code == 500:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": user_doc}), 500)
        except Exception as e:
            logger.error(f'Error in changePassword method: {str(e)}',extra=extras)
            return make_response(jsonify({"error":str(e)}), 500)
    
    def old_password_check(self, tablename, user_id, new_password):
        if isinstance(user_id, str):
            condition = {"username": user_id,"is_deleted":False}
            user_doc = self.db.find_one(self.usertable, condition,botname=self.bot_type)
            user_id = user_doc.get("_id")
        condition = {"user_id":user_id}
        get_old_password = self.db.find_all(tablename, condition, self.bot_type)
        if isinstance(get_old_password, list):
            for password in get_old_password:
                userBytes = new_password.encode('utf-8')
                old_pwd = password['old_password']
                print(type(old_pwd))
                print(type(password.get("old_password")))
                result = bcrypt.checkpw(userBytes, old_pwd)
                if result == True:
                    return True
            return False
        elif get_old_password.status_code == 404:
            return False




    def updateUser(self, new_profile_picture):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            condition = {"username": self.username,"is_deleted":False}
            user_data = self.db.find_one(self.usertable, condition, botname=self.bot_type)
            if isinstance(user_data, dict):
                profile_updated = False
                if new_profile_picture != "empty":
                    picture = new_profile_picture
                    allowed_formats = {'jpeg', 'jpg', 'png'}
                    if imghdr.what(picture) not in allowed_formats:
                        logger.error("Invalid image format.", extra=extras)
                        return make_response(jsonify({"error": "Invalid image format."}), 400)
                    resized_image = self.resize_profile_picture(picture, (100, 100))
                    binary_picture = Binary(resized_image)
                    value = {"profile_picture": binary_picture}
                    update_result = self.db.update_one(self.usertable, updateValues=value, conditions=condition, botname=self.bot_type)
                    if update_result.status_code == 200:
                        profile_updated = True
                elif new_profile_picture == "empty":
                    profile_updated = True
                existing_roles = user_data.get("roles")
                new_roles = self.roles
                role_updated = False
                if sorted(new_roles) != sorted(existing_roles):
                    roles_to_delete = [role for role in existing_roles if role not in new_roles]
                    roles_to_add = [role for role in new_roles if role not in existing_roles]
                    if roles_to_delete:
                        deleterole = self.db.manage_roles(roles=roles_to_delete, username=self.username, botname=self.bot_type, action="delete")
                        if deleterole.status_code == 200:
                            role_updated = True
                    if roles_to_add:
                        addrole = self.db.manage_roles(roles=roles_to_add, username=self.username, botname=self.bot_type, action="add")
                        if addrole.status_code == 200:
                            role_updated = True
                else:
                    role_updated = True
                if sorted(new_roles) == sorted(existing_roles) and new_profile_picture == "empty":
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message": "No data to update."}), 200)
                if profile_updated and role_updated:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"message": "Data updated successfully."}), 200)
                else:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error": "unable to update data"}), 400)
            elif user_data.status_code == 500:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({'error': 'Unable to fetch user data.'}), 500)
            elif user_data.status_code  == 404:
                logger.error(f'User not found, username: {self.username}', extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({'error': 'User does not exist.'}), 401)
        except Exception as e:
            logger.error(f"An error occurred in updateUser method: {str(e)}", extra=extras)
            return make_response(jsonify({"error": "Unable to update data due to an internal server error."}), 500)
 
    def uploadPicture(self,dp):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        try:
            picture = dp
            condition = {"username":self.username,"is_deleted":False}
            doc = self.db.find_one(self.usertable, condition,botname=self.bot_type)
            if isinstance(doc, dict):
                allowed_formats = {'jpeg', 'jpg', 'png'}
                if imghdr.what(picture) not in allowed_formats:
                    logger.error("Invalid image format.",extra=extras)
                    return make_response(jsonify({"error": "Invalid image format"}), 400)
                resized_image = self.resize_profile_picture(picture, (100, 100))
                binary_picture = Binary(resized_image)
                value = {"profile_picture": binary_picture}
                update = self.db.update_one(self.usertable, updateValues= value,conditions= condition,botname= self.bot_type)
                if update.status_code == 200:
                    return_dp = base64.b64encode(binary_picture).decode('utf-8')
                    json_response = json.dumps({"profile_picture": return_dp})  
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return json_response
                elif update.status_code == 404 or update.status_code == 500:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error": "unable to update the profile picture"}),400)
            elif doc.status_code == 404:
                logger.error("User not found",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error":"user not found"}), 404)
            elif doc.status_code == 500:
                logger.error("unable to find the user",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error":"unable to find the user"}), 500)
        except Exception as e:
            logger.error(f"An error occurred in uploadPicture method: {str(e)}",extra=extras)
            return make_response(jsonify({"error":str(e)}),500)
 
    def removePicture(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        try:
            condition = {"username": self.username,"is_deleted":False}
            doc = self.db.find_one(self.usertable, condition, botname=self.bot_type)
            if isinstance(doc, dict):
                if not doc.get("profile_picture"):
                    logger.error("No profile picture found.", extra=extras)
                    return make_response(jsonify({"error": "No profile picture to remove"}), 400)
               
                # Update profile_picture field to None
                value = {"profile_picture": None}
                update_response = self.db.update_one(self.usertable, updateValues=value, conditions=condition, botname=self.bot_type)
                if update_response.status_code == 200:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                    return make_response(jsonify({"message": "Profile picture removed successfully"}), 200)
                elif update_response.status_code == 404 or update_response.status_code == 500:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                    return make_response(jsonify({"error": "Unable to remove the profile picture"}), 400)
            elif doc.status_code == 404:
                logger.error("User not found", extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                return make_response(jsonify({"error": "User not found"}), 404)
            elif doc.status_code == 500:
                logger.error("Unable to find the user", extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
                return make_response(jsonify({"error": "Unable to find the user"}), 500)
        except Exception as e:
            logger.exception(f"An error occurred in removePicture method: {str(e)}", extra=extras)
            return make_response(jsonify({"error": "Unable to remove profile picture"}), 500)
 
    def addPreference(self,language):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'CIBC'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        condition = {"username": self.username,"is_deleted":False}
        user_data = self.db.find_one(tableName=self.usertable,conditions=condition,botname=self.bot_type)
        if isinstance(user_data, dict):
            if self.dbtype in ["sql","pg"]:
                languagecondition = {"language_type": language}
                language = self.db.find_one(tableName= LanguageType,conditions= languagecondition)
                if isinstance(user_data, dict):
                    value = {"language_id": language["_id"]}
                    update = self.db.update_one(tableName=UserPreference,conditions={"user_id":user_data["_id"]},updateValues=value)
                elif language.status_code == 404 or language.status_code == 500:
                    logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return make_response(jsonify({"error": "unkown language type"}), 500)
            elif self.dbtype == "mongo":
                update = self.db.update_one(tableName=self.usertable,updateValues={"language": language},conditions= {"username": self.username},botname= self.bot_type)
            if update.status_code == 200:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"message": "Preference add"}),200)
            elif update.status_code == 500:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return make_response(jsonify({"error": "unable to update preference"}),500)
        elif user_data.status_code == 404:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.error(f'User does not exist, username: {self.username}',extra=extras)
            return make_response(jsonify(
                {'WWW-Authenticate2' : 'Basic realm ="User does not exist !!"'},
            ), 401)
        elif user_data.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(
                {'error' : 'Unable to fetch data from db'},
            ), 500)
 
 
    def checkSessionStatus(self,user_table_id,sessionID):
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
            if user_session_id==sessionID:
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
        
    def addSessionDetails(self,user_table_id,response_data):
        conditions = {"user_id":user_table_id,"is_active":True}
        update_value = {"is_active":False}
        update_result = self.db.update_one(tableName=self.usersession,conditions=conditions,updateValues=update_value)
        logger.info(f'existing session id removal status for username :{self.username}, status: {update_result.status_code}',extra=extras)
        
        value = {"user_id" : user_table_id, "session_id" : self.sessionID, "is_active" : True,"created_at": datetime.now(timezone.utc)}
        insert_result = self.db.insert_one(tableName=self.usersession,data=value)
        logger.info(f'session id update status for username :{self.username}, status: {insert_result.status_code}',extra=extras)
        if insert_result.status_code == 200:              
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return json.dumps(response_data)
        elif insert_result.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"message": 'login unsuccessfull'}), 500)
        else:
            return make_response(jsonify(error="add sesssion details falied"),400)
       
    def removeSessionID(self,user_table_id):
        
        conditions= {"user_id": user_table_id,"is_active":True}
        value = {"is_active":False}
        update_status = self.db.update_one(tableName=self.usersession,conditions=conditions,updateValues=value)
        if update_status.status_code == 200:          
            logger.info(f"Password updated successfully for user: {self.username}",extra=extras)      
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"message": "SessionID Reset Successfully"}), 200)
        elif update_status.status_code == 404:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"message": update_status}), 404)
        elif update_status.status_code == 500:
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify({"message": update_status}), 500)
        
    def findUserExist(self):
        conditon={"username":self.username}
        finduser=self.db.find_one(self.usertable,conditon,self.bot_type)
        if isinstance(finduser, dict):
            return make_response(jsonify({"message":"User Found"}),200)
        return finduser
 