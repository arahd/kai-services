from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone
import os
from common_utils.mainqueries import *
from models.tablemodels import *
from cache_storage.redis_storage import *
import json
import pandas as pd
from download_format.excel_formatter import *
import base64
from io import BytesIO
from flask import send_file, jsonify

SERVICE_NAME='CONVERSATIONAL_AI_REPORT'
PROJECT_NAME='CHATBOT'

class Helpers:
    
    def __init__(self, bot_type, db_type) -> None:
            self.bot_type = bot_type 
            if db_type in ["sql","pg"]:
                self.db = SQLConnection()
                self.cache = CacheStorage(self.bot_type)
    

    def _select_directory_name(self):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        directory_name = {
        'cibc':os.getenv("conv_directory_name"),
        'kumaran':os.getenv('conv_directory_name_kumaran'),
        'scotia':os.getenv('CONV_DIRECTORY_SCOTIA'),
        }
        logger.info(f'CONVERSATIONAL-AI-REPORT: directory_name data:{directory_name},bot_type:{self.bot_type}',extra=extras)
        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return directory_name.get(self.bot_type,os.getenv(f"conv_directory_name_{self.bot_type}"))

    def get_user_id(self, username, cached_data):
        user_id = [r for r in cached_data['user_name'] if r['value'] == username]
        return user_id
    
    def get_date(self, date, cached_data):
        date_id = [r for r in cached_data['dateinfo'] if datetime.strptime(r['date'], "%Y-%m-%d").date() == date]
        return date_id
    
    def get_hour(self, hour, cached_data):
        hour_id = [r for r in cached_data['hours_info'] if r['value'] == hour]
        return hour_id
    
    def get_minute(self, minute, cached_data):
        minute_id = [r for r in cached_data['minutes_info'] if r['value'] == minute]
        return minute_id
    
    def get_bot_type(self, bot_type, cached_data):
        bot_type = [r for r in cached_data['bot_type'] if r['bot_type'] == bot_type]
        return bot_type
    
    def get_rating(self, rating, cached_data):
        rating = [r for r in cached_data['rating'] if r['value'] == rating]
        return rating
    
    def get_response_type(self, response_type, cached_data):
        response_type = [r for r in cached_data['response_type'] if r['value']== response_type]
        return response_type
    
    def get_response_time(self, response_time, cached_data):
        response_time = [r for r in cached_data['response_time'] if r['start_time'] <= response_time and (r['end_time'] is None or r['end_time'] >= response_time)]
        return response_time
    
    def get_language_type(self,language_type, cached_data):
        language_type = [r for r in cached_data['language_type'] if r['language_type'] == language_type]
        return language_type
    
    def gpt_model_name(self,gpt_model, cached_data):
        gpt_model = [r for r in cached_data['gpt_model_name'] if r['model_name'] == gpt_model]
        return gpt_model
    
    def get_username(self,username):
        conditions = {"username":username}
        data = {}
        getting_user = self.db.find_all(tableName=UserDetails,conditions=conditions)
        if not getting_user:
            return getting_user
        extracted_data = [item['value'] for item in getting_user]
        data["username"] = extracted_data
        return data 
       
    def get_all_username(self, timezone_offset):
        result = self.db.get_all_usernames_with_roles()
        username_list = list()
        roles_list = list()
        for row in result:
            username_list.append(row[0])
            roles_list.append(row[1])
        data = excel_formatter(data = {"username":username_list,"roles":roles_list}, name ='users', timezone_offset = timezone_offset)
        return data
    
    def search(self, query):
        tableName = UserDetails
        data = self.db.search_query(tableName=tableName, query=query)
        return data

    def get_details(self):
        data = {}
        tablename = [Rating,ResponseTime,ResponseType,LanguageType,GPT_Model,Year,Week,Month]
        for table in tablename:
            get_data = self.db.find_all(conditions={},tableName=table,botname=self.bot_type)
            if table == ResponseTime:
                values = [(item['start_time'],item['end_time']) for item in get_data]
                data[table.__tablename__] = values
            elif table == LanguageType:
                values = [item['language_type'] for item in get_data]
                data[table.__tablename__] = values
            elif table == GPT_Model:
                values = [item['model_name'] for item in get_data]
                data[table.__tablename__] = values
            else:
                values = [item['value'] for item in get_data]
                data[table.__tablename__] = values
        return data

    def getAllData(self):
        dataAll =  self.db.get_all_data()
        dataMost = self.db.get_most()
        response = dataAll | dataMost
        return jsonify(response)

    
    def getUserData(self, data):
        dataAll =  self.db.get_all_data(filters=data)
        if 'usernames' not in data:
            dataMost = self.db.get_most(filters=data)
            response = dataAll | dataMost
            return response
        return jsonify(dataAll)
    
    def getUserReg(self, page, limit):
        response = self.db.get_pending_users(page, limit)
        return jsonify(response)
    
    def getQuestions(self, data, timezone_offset):
        result =  self.db.get_questions(filters=data)
        data = excel_formatter(data=result, name="Questions",timezone_offset=timezone_offset,start_date=data.get("start_date"),end_date=data.get("end_date"))
        return data

    def getModelUsage(self, data):
        result = self.db.get_model_usage(filters=data)
        return jsonify(result)

    def getdetails(self, tablename):
        data = {}
        for table in tablename:
            get_data = self.db.find_all(conditions={},tableName=table,botname=self.bot_type)
            if table == ResponseTime:
                values = [(item['start_time'],item['end_time']) for item in get_data]
                data[table.__tablename__] = values
            elif table == LanguageType:
                values = [item['language_type'] for item in get_data]
                data[table.__tablename__] = values
            elif table == GPT_Model:
                values = [
                    {
                        "value": item['model_name'],
                        "displayName": item['display_name'] or item['model_name'],
                        "description": item['description'] or "",
                        "isDefault": item['is_default'] or False,
                        "isEnabled": item['is_enabled'] if item['is_enabled'] is not None else True
                    }
                    for item in get_data
                ]
                data[table.__tablename__] = values
            else:
                values = [item['value'] for item in get_data]
                data[table.__tablename__] = values
        return data
        
    def username(self, user_name):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            condition = {"value":user_name}
            user_check = self.db.find_one(UserDetails, condition)
            if isinstance(user_check, dict):
                logger.info(f"CONVERSATIONAL-AI-REPORT: check username for insertion {user_name}", extra=extras)
                logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return user_check
            elif user_check==404:
                logger.info(f"CONVERSATIONAL-AI-REPORT: username not found :{user_name}", extra=extras)
                user_entry = self.db.insert_one(UserDetails, condition)
                if not user_entry:
                    logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return False
                else:
                    user_check = self.db.find_one(UserDetails, condition)
                    if isinstance(user_check, dict):
                        logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                        logger.info(f"CONVERSATIONAL-AI-REPORT: after insertion finding username {user_name}", extra=extras)
                        return user_check
                    elif user_check==404:
                            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                            return 404
                    logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                    return 500
            elif user_check == 500:
                logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return 500
        except Exception as e:
                logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
                logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                return 500
        
    def convert_time_to_seconds(self,time_str):
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: time string {time_str}",extra=extras)
            hours, minutes, seconds = map(int, time_str.split(':'))
            total_seconds = hours * 3600 + minutes * 60 + seconds
            logger.info(f"CONVERSATIONAL-AI-REPORT: Time Difference is {total_seconds}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return total_seconds
    
    def get_week_info(self,input_date):
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: getting week number for date {input_date}",extra=extras)
            # Calculate the week number of the year
            week_number = input_date.isocalendar()[1]    
            logger.info(f"CONVERSATIONAL-AI-REPORT: week number {week_number}",extra=extras)
            logger.info(f"CONVERSATIONAL-AI-REPORT: Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return week_number
        
    def month_number_to_name(self, month_number):
        month_map = {1: "January", 2: "February", 3: "March", 4: "April",
                    5: "May", 6: "June", 7: "July", 8: "August",
                    9: "September", 10: "October", 11: "November", 12: "December"}
        return month_map.get(month_number)

    
    def get_date_id(self,input_date):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"CONVERSATIONAL-AI-REPORT: Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            fetched_date_id = self.db.find_one(tableName=DateInfo, conditions={"date":input_date})
            if isinstance(fetched_date_id, dict):
                logger.info(f"Fetched date id for the input date-{input_date} and id - {fetched_date_id}",extra=extras)
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)              
                return fetched_date_id
            else:
                logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)              
                return make_response(jsonify(error="Unable to find date"), 500)
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Unable to find data"), 500)
        
    def fetch_id_from_db(self,table_name, value):
        result = self.db.find_one(tableName=table_name, conditions={"value": value})
        return result['_id'] if isinstance(result, dict) else result


    def fetch_data(self, data):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            filters = {"usernames":data.get('username'), "ratings":data.get('rating'), "response_types":data.get('response_type'), "response_time":data.get('response_time'), "year": data.get('year'),"week":data.get('week'),"month":data.get('month'),"start_date":data.get('start_date'),"end_date":data.get("end_date"),"group_by":data.get('group_by'),
            "language_type":data.get("language_type"), "model" : data.get("model_name"),"platform_language":data.get("platform_language")}
            logger.info(f"CONVERSATIONAL-AI-REPORT: data passed for fetching data :{data}",extra=extras)
            report_types_list = data.get('report')
            platform_language = data.get('platform_language')
            valid_report_types = ['performance', 'feedback', 'tokenutilized', 'usage']
            invalid_report_types = all(rt in valid_report_types for rt in report_types_list)
            
            if not invalid_report_types:
                return make_response(jsonify({'error': 'Unprocessable Entity'}), 422)
            
            all_df = []
            for report in report_types_list:
                filters['report'] = report
                if len(report_types_list) >1:
                    combination = True
                    data,applied_filters = self.db.generate_report(filters=filters,combination=combination)
                    if data is not None:
                        all_df.append(data)
                else:
                    data,response = self.db.generate_report(filters=filters)
                    if not data:
                        return make_response(jsonify({'error': 'No Data Available'}), 404)
                    return data
            if all_df:
                if "group_by" in applied_filters and applied_filters["group_by"]:
                    column_names = {'en': 'Value', 'fr': 'Valeur'}
                    columns = [column_names.get(platform_language, 'Value')]
                    first_df = all_df[0][columns]
                    other_dfs = [df.drop(columns=columns) for df in all_df[0:]]
                    merged_df = pd.concat([first_df] + other_dfs, axis=1)
                else:
                    first_df = pd.concat(all_df, ignore_index=True)
                    print(first_df)
                    combined_data = first_df.apply(lambda x: ' '.join(str(i) for i in x if pd.notna(i)), axis=0)
                    merged_df = pd.DataFrame([combined_data], columns=first_df.columns)
            else:
                return make_response(jsonify({'error': 'No Data Available'}), 404)
            response = excel_construction(applied_filters=applied_filters,df_data=merged_df,type=report_types_list,platform_language=platform_language)
            return response
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Error in fetching data"), 500)
        
    def fetch_transcript_data(self, data):
        extras = {
                'servicename': SERVICE_NAME,
                'functionname': get_caller_frame().f_code.co_name,
                'projectname': PROJECT_NAME,
                'bot_name':'kumaran'
            }
        try:
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            filters = {"usernames":data.get('username'), "start_date":data.get('start_date'),"end_date":data.get("end_date"),"start_hour":data.get("start_hour"),"end_hour":data.get("end_hour")}
            logger.info(f"CONVERSATIONAL-AI-REPORT: data passed for fetching data :{data}",extra=extras)
            data = self.db.get_transcript_data(filters)
            return data
            
        except Exception as e:
            logger.exception(f"CONVERSATIONAL-AI-REPORT: Error occurred {e}", extra=extras)
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            return make_response(jsonify(error="Error in fetching data"), 500)
        
    def conversation_tracking(self,conv_id,status):
        try:
            today_date = datetime.now()
            file_path = f"{today_date.date()}.txt"
            if not os.path.exists(file_path):
                with open(file_path, 'w') as file:
                    json.dump([], file)
            with open(file_path, 'r') as file:
                file_data = json.load(file)
                file_data.append({f"{status}": conv_id})
            with open(file_path, 'w') as file:
                json.dump(file_data, file, indent=4)
            return True
        except Exception as e:
            return False
        
    def get_config_value(self, key_name, default=None):
        try:
            result = self.db.find_one(
                tableName=ConfigData,
                conditions={"key": key_name}
            )
            if isinstance(result, dict):
                return result.get("value")
            return default
        except Exception:
            return default
        
########-----API Users Helpers-----###########
    def getApiUserSummary(self):
        result = self.db.get_api_user_summary()
        return result
    
    def getApiUserProjectReport(self):
        result = self.db.get_api_user_project_report()
        return result
    
    def getMaxTokensUsedUser(self):
        result = self.db.get_max_tokens_used_user()
        return result

    def getMinTokensUsedUser(self):
        result = self.db.get_min_tokens_used_user()
        return result
    
    def getOverallMaxTokensUsedUser(self):
        result = self.db.get_overall_max_tokens_used_user()
        return result
    
    def getOverallMinTokensUsedUser(self):
        result = self.db.get_overall_min_tokens_used_user()
        return result

###################################3#########################################33
# API-SERVICE Related HELPERS
##############################################################################3

    def getUserSummary_apiService(self):
        result = self.db.get_user_summary_api_service()
        return result
    
    def getUserProjectReport_apiService(self, page, limit):
        result = self.db.get_user_project_report_api_service(page, limit)
        return result
    
    def getMaxTokensUsedUser_apiService(self):
        result = self.db.get_max_tokens_used_user_api_service()
        return result

    def getMinTokensUsedUser_apiService(self):
        result = self.db.get_min_tokens_used_user_api_user()
        return result
    
    def getOverallMaxTokensUsedUser_apiService(self):
        result = self.db.get_overall_max_tokens_used_user_api_service()
        return result
    
    def getOverallMinTokensUsedUser_apiService(self):
        result = self.db.get_overall_min_tokens_used_user_api_service()
        return result

    def getUserDetailsByUsername_apiService(self, usernames=None,  project_id=None,start_date=None, end_date=None,model_name=None):
        result = self.db.get_user_details_by_username_api_service(usernames, project_id, start_date, end_date,model_name)
        return result

    def getQuestionReport_apiService(self,usernames=None,project_id=None,start_date=None,end_date=None,model_name=None,timezone_offset=None):
        result = self.db.get_question_report_api_service(
            usernames,
            project_id,
            start_date,
            end_date,
            model_name,
        )
        data = excel_formatter(
                data=result,
                name="Question_Report",
                timezone_offset=timezone_offset
            )
        return data
    def getOverallTokensUsage(self):
        result = self.db.get_overall_tokens_usage()
        return result
    
    def getUserUsageReport(self, report_type="weekly", report_period="current"):
        
        return jsonify(
            self.db.get_user_usage_report(
                report_type=report_type, report_period=report_period
            )
        )

##############################################################################
    def listProjects(self):
        result = self.db.list_projects()
        return result

    def listUsernames(self,username):
        conditions = {"username":username}
        data = {}
        result = self.db.find_all(tableName=Projects,conditions=conditions)
        if not result:
            return result
        extracted_data = [item['username'] for item in result]
        data["username"] = extracted_data
        return data
    
    def SearchUsernames(self, username):
        result = self.db.search_usernames(username)
        if not result:
            return {"username": []}
        extracted_data = [item['username'] for item in result]
        return {
            "username": extracted_data
        }

    def listRevokedUsers(self, page, limit):
        result = self.db.list_revoked_users(page, limit)
        return result

    def getUserDetailsByUsername(self, username):
        result = self.db.get_user_details_by_username(username)
        return result

    def listUsersByProject(self, project_id):
        result = self.db.list_users_by_project(project_id)
        return result
    
    def listDocsByConv(self, conv_id):
        result = self.db.list_documents_by_conversation(conv_id)
        return result
    
    def create_bug_record(self, bug_data, related_files=None):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
        }
        try:
            bug_report = BugReport(**bug_data)
            self.db.session.add(bug_report)
            # IMPORTANT
            self.db.session.flush()
            # SAVE MULTIPLE FILES
            if related_files:
                for related_file in related_files:
                    if related_file and related_file.filename:
                        file_content = related_file.read()
                        attachment = BugReportAttachment(
                            bug_report_id=bug_report.id,
                            file_name=related_file.filename,
                            file_type=related_file.content_type or 'application/octet-stream',
                            file_size=len(file_content),
                            file_data=base64.b64encode(
                                file_content
                            ).decode('utf-8')
                        )
                        self.db.session.add(attachment)
            self.db.session.commit()
            logger.info(f"New bug record created successfully!",extra=extras)
            return True
        except Exception:
            self.db.session.rollback()
            raise
    
    def getBugReports(self, page, limit, state=None, search=None):
        result, total_bug_count, filtered_bug_count, status_counts = self.db.get_bug_reports(
            page=page,
            limit=limit,
            state=state,
            search=search
        )
        return jsonify({
            "message": "Bug reports fetched successfully",
            "total_bug_count": total_bug_count,
            "open_bug_count": status_counts.get("open", 0),
            "investigation_bug_count": status_counts.get("Investigation", 0),
            "closed_bug_count": status_counts.get("closed", 0),
            "page": page,
            "limit": limit,
            "data": result,
            "filtered_bug_count": filtered_bug_count,  
        })

    def getBugAttachment(self, attachment_id):

        result = self.db.get_bug_attachment(
            attachment_id=attachment_id
        )

        if not result:
            return make_response(
                jsonify(error="Attachment not found"),
                404
            )

        decoded_file = base64.b64decode(
            result.file_data
        )

        return send_file(
            BytesIO(decoded_file),
            mimetype=result.file_type,
            download_name=result.file_name,
            as_attachment=False
        )
        
    def updateBugStatus(self, data):
        ticket_number = data.get("ticket_number")
        state = data.get("state")
        result = self.db.update_bug_status(
            ticket_number=ticket_number,
            state=state
        )
        if result == 404:
            return make_response(
                jsonify(error="Bug report not found"),
                404
            )
        if not result:
            return make_response(
                jsonify(error="Unable to update bug status"),
                500
            )
        return jsonify({
            "message": "Bug status updated successfully"
        })