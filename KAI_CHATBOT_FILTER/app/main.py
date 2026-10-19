
from fastapi import FastAPI, Depends, File, UploadFile, Form
from app.keyvault import setallenv_variables
from app import schema
from fastapi.security.api_key import APIKey
import os
from threading import Thread
from fastapi import status, HTTPException
import time
import csv
# from app.applogging import logger
from app.logger import logger,get_caller_frame,extras,SERVICE_NAME,PROJECT_NAME
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.memory import MemoryJobStore
from app import config
from app.commonUtils import CommonUtils



import traceback


try:
    ENV = os.environ.get('CUSTOMCONNSTR_ENV')
    logger.info(f"Environment {ENV} fetched successfully.",extra=extras)
except Exception:
    logger.exception("Error in fetching Environment.",extra=extras)
try:
    ConfigManagerURL = os.environ.get('CUSTOMCONNSTR_ConfigManagerURL')
    logger.info(f"sensitive filter endpoints: Config Manager URL :{ConfigManagerURL} fetched successfully.",extra=extras)
except Exception:
    logger.exception("Error in fetching ConfigManager URL.",extra=extras)
try:
    ConfigManagerToken = os.environ.get('CUSTOMCONNSTR_ConfigManagerToken')
    logger.info("Config Manager Token fetched successfully.",extra=extras)
except Exception:
    logger.exception("Error in fetching ConfigManager Token.",extra=extras)


# ENV = 'DEV'
# # ConfigManagerURL ="https://chatbotconfigservice.azurewebsites.net/"
# ConfigManagerURL="https://chatbotconfigjavaservice.azurewebsites.net/"


# print(f"Environment: {ENV}")
# print(f"ConfigManagerURL: {ConfigManagerURL}")
# print(f"ConfigManagerToken: {ConfigManagerToken}")

# envthread = Thread(target=setallenv_variables, name = "envvariablessetter", args = (ENV,ConfigManagerURL,ConfigManagerToken ))
# envthread.start()
# time.sleep(60)

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
# HOST_NAME_ENV="AZURE"
if HOST_NAME_ENV == "AZURE":
    from app.keyvault import setallenv_variables
    setallenv_variables(ENV,ConfigManagerURL,ConfigManagerToken)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'
dbtype = os.getenv('DB_TYPE',"mongo")
CNT_MGMT_SERVICE_ENDPOINT=os.getenv('CNT_MGMT_SERVICE_ENDPOINT')
CNT_MGMT_COMM_TOKKEN = os.getenv("CNT-MGMT-COMM-TOKKEN")
logger.info(f"sensitive filter endpoints: 'CNT_MGMT_SERVICE_ENDPOINT':'{CNT_MGMT_SERVICE_ENDPOINT}'",extra=extras)

# print(CNT_MGMT_SERVICE_ENDPOINT,CNT_MGMT_COMM_TOKKEN)
from app import auth
from app.embedding_service import ServeOpenai
from app.sensitivesearch import *
from datetime import datetime,timezone
from app.mainqueries import *

_db = SQLFactory()

app = FastAPI(title = "Sensitive Search Service")
jobstores = {
    'default': MemoryJobStore()
}
scheduler = AsyncIOScheduler(jobstores=jobstores, timezone='Asia/Kolkata')

@scheduler.scheduled_job('interval', seconds=300)
def scheduled_job_1():
    if HOST_NAME_ENV == "AZURE":
        setallenv_variables(ENV,ConfigManagerURL,ConfigManagerToken)

@app.on_event("startup")
async def startup_event():
    scheduler.start()

@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown()

    
@app.get('/')
def test():
    return {"Status":"Sensitive Search Service is Up and Running: V 0.2"}

@app.post('/searchsensitive')
async def searchcontent(data: schema.SearchSchema, api_key: APIKey = Depends(auth.get_api_key)):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        # indices_boost_calculated,normalized_dict=get_indexdetails(CNT_MGMT_SERVICE_ENDPOINT,CNT_MGMT_COMM_TOKKEN,data.language_type,data.bot_type)
        # print(indices_boost_calculated)
        openai_obj = ServeOpenai(os.getenv("OPENAI_API_TYPE"),  os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"),  os.getenv("OPENAI_EMBEDDING_MODEL"))

    except:
        logger.exception('Error while creating openAI object.',extra=extras)

    try:
        content_obj = SensitiveSearch(os.getenv("ELASTIC_HOST"),os.getenv("ELASTIC_ID"), os.getenv("ELASTIC_APIKEY"), os.getenv("SENSITIVE_ELASTIC_INDEX_NAME"),openai_obj,data.bot_type)
        # content_obj = SensitiveSearch(os.getenv("ELASTIC_HOST"),os.getenv("ELASTIC_ID"), os.getenv("ELASTIC_APIKEY"), "dev.index_cibc_sensitive",openai_obj,data.bot_type)

    except:
        logger.exception('Error while creating sensitive search object.',extra=extras)

    try:
        logger.info("Starting content search.",extra=extras)
        commonUtils=CommonUtils()
        text=commonUtils.toLowerRemoveSpecialCharater(data.userquery)
        if data.language_type=='en':
            resp = content_obj.search(text, thresholdScore=os.getenv('SENSITIVESEARCH_THRESHOLD')) ## get the content from elastic search
        else:
            resp = content_obj.search(text, thresholdScore=os.getenv('SENSITIVESEARCH_THRESHOLD_FR')) ## get the content from elastic search

        # resp = content_obj.search(text=data.userquery, thresholdScore=0.9) ## get the content from elastic search
       
        logger.info("Sensitive search from vectordB completed successfully.",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return {"issensitive":resp}
        
    except Exception:
        logger.exception("Error performing sensitivesearch from vectordB",extra=extras)
        return {"issensitive":False}

@app.post('/searchsensitivepostgres')
async def searchcontentpostgres(data: schema.SearchSchemaPostgres, api_key: APIKey = Depends(auth.get_api_key)):
    xtras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    try:
        openai_obj = ServeOpenai(os.getenv("OPENAI_API_TYPE"),  os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"),  os.getenv("OPENAI_EMBEDDING_MODEL"))
    except:
        logger.exception('Error while creating openAI object.',extra=extras)
    
    try:
        content_obj = SensitiveSearchPostgres(openai_obj, data.bot_type, os.getenv('PG_DB'))
    except:
        logger.exception('Error while creating sensitive search object.',extra=extras)

    try:
        logger.info("Starting content search.",extra=extras)
        commonUtils=CommonUtils()
        query=commonUtils.toLowerRemoveSpecialCharater(data.userquery)
        resp = content_obj.search(query, thresholdScore=os.getenv('SENSITIVESEARCH_THRESHOLD'))
        logger.info("Sensitive search from vectordB completed successfully.",extra=extras)
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        return {"issensitive":resp}
        
    except Exception:
        logger.exception("Error performing sensitivesearch from vectordB",extra=extras)
        return {"issensitive":False}
    


# @app.post('/sensitiveindexer')
# async def indexer(data: schema.DataSearchSchema,api_key: APIKey = Depends(auth.get_api_key)):
#     extras['functionname'] = get_caller_frame().f_code.co_name
#     logger.info(f'Inside sensitiveindexer : {data}',extra=extras)
#     try:
#         openai_obj = ServeOpenai(os.getenv("OPENAI_API_TYPE"),  os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"),  os.getenv("OPENAI_EMBEDDING_MODEL"))
#     except Exception:
#         logger.exception('INDEXER_SERVICE : Error while creating openAI object.',extra=extras)
#     try:
        
#         if ENV == "DEV":                    
#             index_name=f"dev.index_{data.bot_type}_sensitive"
                          
#         elif ENV=="PRD":
#             index_name=f"prod.index_{data.bot_type}_sensitive"
                
#         elif ENV=="PRDNEW":
#             index_name=f"prod_new.index_{data.bot_type}_sensitive"          
#         obj_vectordb = Serve_vectordb(os.getenv("ELASTIC_HOST"), os.getenv("ELASTIC_ID"), os.getenv("ELASTIC_APIKEY"),index_name,config.ELASTIC_SCHEMA)
#     except Exception:
#         print(traceback.print_exc())
#         logger.exception('Sensitive Service- Error while creating elastic search object.',extra=extras)   
#     parsed_data=[]
#     csvpath='sensitive.csv'
#     try:
#         with open(csvpath,mode='r',newline='') as file:
#             csv_reader=csv.reader(file)
#             for row in csv_reader:
#                 row_string=', '.join(row)
#                 text_embedding = openai_obj.embed_text(row_string)              
#                 parsed_data.append({'sensitivetopic':row,'sensitivetopic_embeddings':text_embedding})
#             # parsed_data = {
#             #     "image_embeddings": image_vector.tolist(),
#             # }
#         resp=obj_vectordb.insert_data(parsed_data)
#         return {"status": resp,"index_name":index_name}
#     except Exception:  
#         logger.exception("Sensitve topic error while Indexing Content",extra=extras) 
#         print(traceback.print_exc())
#         raise HTTPException(
#                                 status_code=status.HTTP_417_EXPECTATION_FAILED,
#                                 detail='Senstive topic not indexed successfully',
#                             )    

@app.post('/sensitiveElasticIndexer')
async def sensitiveElasticIndexer(data: schema.DataSearchSchema,api_key: APIKey = Depends(auth.get_api_key)):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    ELASTIC_PREFIX = os.getenv('ELASTIC_PREFIX')
    index_name= f"{ELASTIC_PREFIX}.{data.bot_type}_sensitive"  
    conditions={"feedback_type":"sensitive","model_update_status":False,"approval_status":"approved"}  
    sensitive_topics=_db.find_all(UserFeedback,conditions=conditions,botname=data.bot_type)  
    if isinstance(sensitive_topics,list):    
        obj_vectordb = Serve_vectordb(os.getenv("ELASTIC_HOST"), os.getenv("ELASTIC_ID"), os.getenv("ELASTIC_APIKEY"),index_name,config.ELASTIC_SCHEMA)
        response=obj_vectordb.sensitiveIndexUpdate(sensitive_topics)
        if response.status_code==200:
            conditions={"model_update_status":False,"feedback_type":"sensitive"}
            update_value={"model_update_status":True}
            model_update=_db.update_many(UserFeedback,conditions,update_value,data.bot_type)
            return model_update
        else:
            return response
    else:
        return sensitive_topics

@app.post("/sensitivepostgresindexer")
async def sensitivePostgresIndexer(data: schema.filterschema, api_key: APIKey = Depends(auth.get_api_key)):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    print(data)
    obj_pgdb = Serve_pgdb(data.bot_type, data.feedback_flag)
    response = obj_pgdb.sensitiveIndexUpdate(data.question)
    return response

@app.post("/sensitivepostgresindexerbulk")
async def sensitivePostgresIndexerbulk(data: schema.bulkupdateschema, api_key: APIKey = Depends(auth.get_api_key)):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    obj_pgdb = Serve_pgdb(data.bot_type, data.feedback_flag)
    response = obj_pgdb.sensitiveIndexUpdateBulk()
    return response

@app.post("/sensitivepostgresindexerbulkcsv")
async def sensitivePostgresIndexercsv(
    bot_type: str = Form(...),
    feedback_flag: bool = Form(...),
    file: UploadFile = File(...), 
    api_key: APIKey = Depends(auth.get_api_key)
):
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
    if file.content_type not in [
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel"  # Sometimes CSV is detected as this
    ] and not file.filename.endswith('.csv'):
        return JSONResponse(
            content={"error": "File must be a CSV file (.csv)"},
            status_code=400
        )
    obj_pgdb = Serve_pgdb(bot_type, feedback_flag)
    response = await obj_pgdb.sensitiveIndexUpdateBulkcsv(file)
    return response