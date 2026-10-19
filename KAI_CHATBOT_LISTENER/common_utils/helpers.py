from logger import logger,get_caller_frame,extras
from datetime import datetime,timezone
import os
from common_utils.mainqueries import *
from models.tablemodels import *
from cache_storage.redis_storage import *
import json
import pandas as pd

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
        # if self.bot_type in ["cibc","scotia","kumaran"]:
        return directory_name.get(self.bot_type,os.getenv(f"conv_directory_name_{self.bot_type}"))
        # else:
        #     return os.getenv(f"conv_directory_name_{self.bot_type}")
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
        extracted_data = [item['value'] for item in getting_user]
        data["username"] = extracted_data
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


    # def get_details(self,tablename):
    #     data = {}
    #     for table in tablename:
    #         get_data = self.db.find_all(conditions={},tableName=table,botname=self.bot_type)
    #         if table == ResponseTime:
    #             values = [(item['start_time'],item['end_time']) for item in get_data]
    #             data[table.__tablename__] = values
    #         elif table == LanguageType:
    #             values = [item['language_type'] for item in get_data]
    #             data[table.__tablename__] = values
    #         elif table == GPT_Model:
    #             values = [item['model_name'] for item in get_data]
    #             data[table.__tablename__] = values
    #         else:
    #             values = [item['value'] for item in get_data]
    #             data[table.__tablename__] = values
    #     return data
        
    def username(self, user_name):
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
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
        try:
            extras = {
                        'servicename': SERVICE_NAME,
                        'functionname': get_caller_frame().f_code.co_name,
                        'projectname': PROJECT_NAME,
                        'bot_name':'kumaran'
                    }
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
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
                    }
            logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
            filters = {"usernames":data.get('username'), "ratings":data.get('rating'), "response_types":data.get('response_type'), "response_time":data.get('response_time'), "year": data.get('year'),"week":data.get('week'),"month":data.get('month'),"start_date":data.get('start_date'),"end_date":data.get("end_date"),"group_by":data.get('group_by'),
            "language_type":data.get("language_type"), "model" : data.get("model_name"),"platform_language":data.get("platform_language")}
            logger.info(f"CONVERSATIONAL-AI-REPORT: data passed for fetching data :{data}",extra=extras)
            report_types_list = data.get('report')
            platform_language = data.get('platform_language')
            # report_types_list = [report.strip() for report in report_type.split(',')]
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
                    # Extract other columns (excluding 'Value') from the remaining DataFrames
                    other_dfs = [df.drop(columns=columns) for df in all_df[0:]]
                    merged_df = pd.concat([first_df] + other_dfs, axis=1)
                else:
                    first_df = pd.concat(all_df, ignore_index=True)
                    print(first_df)
                    # first_df_clean = first_df.dropna()
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
        try:
            extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
                    }
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
        