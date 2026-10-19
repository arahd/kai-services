from elasticsearch import Elasticsearch
import numpy as np
import pandas
from io import StringIO
from typing import TypeAlias
# from keybert import KeyBERT
# from app.applogging import logger
from app.logger import logger,get_caller_frame,extras,SERVICE_NAME,PROJECT_NAME
import traceback
from datetime import datetime,timezone
import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from app.embedding_service import ServeOpenai
from app.commonUtils import CommonUtils
from app.pgconnection import engine, SensitiveTopic, session
from sqlalchemy.sql import select, text
import csv

import os
from concurrent.futures import ThreadPoolExecutor

sensitive_file = 'sensitive.csv'
class Serve_pgdb:
    def __init__(self, bot_type:str, feedback_flag:bool):
        self.bot_type = bot_type
        self.feedback_flag = feedback_flag


    def sensitiveIndexUpdate(self, question):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        try:
            # if not self.es_client.indices.exists(index=self.index_name):
            #     self.es_client.indices.create(index=self.index_name, body=self.schema)
            
            openai_obj = ServeOpenai(os.getenv("OPENAI_API_TYPE"), os.getenv("OPENAI_API_KEY"),
                                     os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"),
                                     os.getenv("OPENAI_EMBEDDING_MODEL"))
            commonUtils=CommonUtils()
            

            question=commonUtils.toLowerRemoveSpecialCharater(question)

            existing = (
                session.query(SensitiveTopic)
                .filter(
                    SensitiveTopic.bot_type == self.bot_type,
                    SensitiveTopic.question == question
                )
                .first()
            )
            if existing:
                logger.info(f"Question already indexed: {question}", extra=extras)
                return JSONResponse(status_code=200, content={"status": "Indexing is alreday exists."})

            embeddings = openai_obj.embed_text(question)  
            
            SENSITIVE_MODEL_UPDATE_THRESHOLD= os.getenv('SENSITIVE_MODEL_UPDATE_THRESHOLD')

            logger.info(f"Embedding generated for question:{question}",extra=extras)
            doc = {
                "sensitivetopic": question,
                "sensitivetopic_embeddings": embeddings
            }
            
            embedding = np.array(embeddings)  # Should be a list/np.array
            try:
                topic = SensitiveTopic(
                bot_type=self.bot_type,
                question=question,
                feedback_flag=self.feedback_flag,
                sensitivetopic_embeddings=embedding,
                )
                session.add(topic)
                session.commit()
            except Exception as e:
                logger.error(f'{e}')
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return JSONResponse(status_code=200, content={"status": "Sensitive Topic Indexed Successfully"})
        except Exception as e:
            session.rollback()
            logger.error(f"Error occurred in sensitiveIndexUpdate: {e}", extra=extras)
            raise HTTPException(status_code=500, detail="An error occurred during indexing.")
        finally:
            session.close()
        
    def sensitiveIndexUpdateBulk(self):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        try:
            # if not self.es_client.indices.exists(index=self.index_name):
            #     self.es_client.indices.create(index=self.index_name, body=self.schema)
            
            openai_obj = ServeOpenai(
                os.getenv("OPENAI_API_TYPE"), 
                os.getenv("OPENAI_API_KEY"),
                os.getenv("OPENAI_API_BASE"), 
                os.getenv("OPENAI_API_VERSION"),
                os.getenv("OPENAI_EMBEDDING_MODEL")
            )
            commonUtils=CommonUtils()
            
            with open(sensitive_file, mode='r', encoding='utf-8') as file:
                sensitive_topics = csv.reader(file)
                next(sensitive_topics)

                for questions in sensitive_topics:
                    for question in questions[1:]:
                        question = question.strip()

                        question=commonUtils.toLowerRemoveSpecialCharater(question)

                        existing = (
                            session.query(SensitiveTopic)
                            .filter(
                            SensitiveTopic.bot_type == self.bot_type,
                            SensitiveTopic.question == question
                            )
                            .first()
                        )
                        if existing:
                            logger.info(f"Question already indexed: {question}", extra=extras)
                            continue

                        embeddings = openai_obj.embed_text(question)  
                
                        SENSITIVE_MODEL_UPDATE_THRESHOLD= os.getenv('SENSITIVE_MODEL_UPDATE_THRESHOLD')

                        logger.info(f"Embedding generated for question:{question}",extra=extras)
                        doc = {
                            "sensitivetopic": question,
                            "sensitivetopic_embeddings": embeddings
                        }
                        
                        embedding = np.array(embeddings) 
                        try:
                            topic = SensitiveTopic(
                            bot_type=self.bot_type,
                            question=question,
                            feedback_flag=self.feedback_flag,
                            sensitivetopic_embeddings=embedding,
                            )
                            session.add(topic)
                            session.commit()
                        except Exception as e:
                            logger.error(f'{e}')
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return JSONResponse(status_code=200, content={"status": "Sensitive Topic Indexed Successfully"})
        except Exception as e:
            session.rollback()
            logger.error(f"Error occurred in sensitiveIndexUpdate: {e}", extra=extras)
            raise HTTPException(status_code=500, detail="An error occurred during indexing.")
        finally:
            session.close()

    async def sensitiveIndexUpdateBulkcsv(self, file):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        try:
            # if not self.es_client.indices.exists(index=self.index_name):
            #     self.es_client.indices.create(index=self.index_name, body=self.schema)
            
            openai_obj = ServeOpenai(
                os.getenv("OPENAI_API_TYPE"), 
                os.getenv("OPENAI_API_KEY"),
                os.getenv("OPENAI_API_BASE"), 
                os.getenv("OPENAI_API_VERSION"),
                os.getenv("OPENAI_EMBEDDING_MODEL")
            )
            commonUtils=CommonUtils()
            contents =  await file.read() 
            decoded_content = contents.decode('utf-8')  # Decode bytes to string
            questions = csv.reader(StringIO(decoded_content))  # Create CSV reader

            for question in questions:
                question = question[0].strip()

                question=commonUtils.toLowerRemoveSpecialCharater(question)

                existing = (
                    session.query(SensitiveTopic)
                    .filter(
                    SensitiveTopic.bot_type == self.bot_type,
                    SensitiveTopic.question == question
                    )
                    .first()
                )
                if existing:
                    logger.info(f"Question already indexed: {question}", extra=extras)
                    continue

                embeddings = openai_obj.embed_text(question)  
                
                SENSITIVE_MODEL_UPDATE_THRESHOLD= os.getenv('SENSITIVE_MODEL_UPDATE_THRESHOLD')

                logger.info(f"Embedding generated for question:{question}",extra=extras)
                doc = {
                    "sensitivetopic": question,
                    "sensitivetopic_embeddings": embeddings
                }
                        
                embedding = np.array(embeddings) 
                try:
                    topic = SensitiveTopic(
                    bot_type=self.bot_type,
                    question=question,
                    feedback_flag=self.feedback_flag,
                    sensitivetopic_embeddings=embedding,
                    )
                    session.add(topic)
                    session.commit()
                except Exception as e:
                    logger.error(f'{e}')
            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return JSONResponse(status_code=200, content={"status": "Sensitive Topics Indexed Successfully"})
        except Exception as e:
            session.rollback()
            logger.error(f"Error occurred in sensitiveIndexUpdate: {e}", extra=extras)
            raise HTTPException(status_code=500, detail="An error occurred during indexing.")
        finally:
            session.close()


class Serve_vectordb:
    
    def __init__(self, elastic_host: str, elastic_id: str, elastic_secret: str, index_name: str, schema: dict):
        self.elastic_host = elastic_host # for vectordb
        self.elasticsearch_url = f"https://{elastic_host}:9243"
        self.es_client = Elasticsearch(self.elasticsearch_url, api_key=(elastic_id, elastic_secret)) # for vectordb
        self.index_name = index_name
        self.schema = schema

    # def insert_data(self, data: list) -> None:
    #     """_summary_

    #     Args:
    #         data (list): _description_
    #     """        
    #     extras['functionname'] = get_caller_frame().f_code.co_name
     
    #     try:
    #         logger.info(f"INDEXER_SERVICE : Indexing to {self.index_name} started.",extra=extras)
    #         if not self.es_client.indices.exists(index=[self.index_name]):
    #             self.es_client.indices.create(
    #                 index=self.index_name,
    #                 settings=self.schema["settings"],
    #                 mappings=self.schema["mappings"],
    #             )

    #         actions = []
           
    #         for i, d in enumerate(data):
    #             # self.es_client(index_name=self.index_name,id=1,body=d)
    #             action = {"index": {"_index": self.index_name}}
    #             actions.append(action)
    #             # actions.append(item['image_embeddings'])
    #             actions.append(d)
           
    #         res = self.es_client.bulk(index=self.index_name, operations=actions, request_timeout=int(os.getenv("ELASTIC_REQUEST_TIMEOUT")))
    #         # res =  self.es_client.index(index=self.index_name, body=data[0])

    #         logger.info(f"INDEXER_SERVICE : Indexing Response {res}", extra=extras)
    #         logger.info(f"INDEXER_SERVICE : Sensitive Topic Indexing to {self.index_name} completed successfully.",extra=extras)
    #         return 0
    #     except Exception:
    #         print(traceback.print_exc())
    #         logger.exception(f"INDEXER_SERVICE : Error in Sensitive Topic Indexing {self.index_name}.",extra=extras)
    #         return -1

    def sensitiveIndexUpdate(self, data: list):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
        try:
            if not self.es_client.indices.exists(index=self.index_name):
                self.es_client.indices.create(index=self.index_name, body=self.schema)
            
            openai_obj = ServeOpenai(os.getenv("OPENAI_API_TYPE"), os.getenv("OPENAI_API_KEY"),
                                     os.getenv("OPENAI_API_BASE"), os.getenv("OPENAI_API_VERSION"),
                                     os.getenv("OPENAI_EMBEDDING_MODEL"))
            commonUtils=CommonUtils()
            

            for topic in data:
                text=commonUtils.toLowerRemoveSpecialCharater(topic['question'])
                question = text
                feedback_flag = topic['feedback_flag']
                embeddings = openai_obj.embed_text(question)  
                
                SENSITIVE_MODEL_UPDATE_THRESHOLD= os.getenv('SENSITIVE_MODEL_UPDATE_THRESHOLD')

                logger.info(f"Embedding generated for question:{question}",extra=extras)
                doc = {
                    "sensitivetopic": question,
                    "sensitivetopic_embeddings": embeddings
                }

                query = {
                    "query": {
                        "script_score": {
                            "query": {
                                "match_all": {}
                            },
                            "script": {
                                "source": "cosineSimilarity(params.query_vector, 'sensitivetopic_embeddings')",
                                "params": {
                                    "query_vector": embeddings
                                }
                            }
                        }
                    }
                }
                logger.info(f"Search query generated for question:{question}",extra=extras)
                res = self.es_client.search(index=self.index_name, body=query)
                logger.info(f"Index search done for question:{question}",extra=extras)
                exists = True if len(res['hits']['hits']) and float(res['hits']['hits'][0]['_score']) > float(SENSITIVE_MODEL_UPDATE_THRESHOLD) else False
                logger.info(f"Sensitive model update score {res['hits']['hits'][0]['_score']} question:{question}",extra=extras)

                if feedback_flag:
                    if not exists:
                        self.es_client.index(index=self.index_name, document=doc)
                else:
                    if exists:
                        self.es_client.delete(index=self.index_name, id=res['hits']['hits'][0]['_id'])

            logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}", extra=extras)
            return JSONResponse(status_code=200, content={"status": "Sensitive Topic Indexed Successfully"})
        except Exception as e:
            logger.error(f"Error occurred in sensitiveIndexUpdate: {e}", extra=extras)
            raise HTTPException(status_code=500, detail="An error occurred during indexing.")

class SensitiveSearchPostgres:

    def __init__(self, openai_obj:object, bot_type:str, db_name_forsensitivetopic:str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self.openai_obj = openai_obj
        self.bot_type=bot_type   
        self.index_name_forsensitivetopic = db_name_forsensitivetopic
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)

    def search(self, query:str, thresholdScore: float):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        try:
            logger.info(f"Sensitive search from indices started.",extra=extras)
            # text = remove_stop_words(text)
            token_count = CommonUtils.get_token_count(query)
            logger.info(f"Token Count: {token_count}",extra=extras)
            if token_count <= 8000:
                query_embedding = self.openai_obj.embed_text(query)
                if query_embedding is None:
                    return False
            else:
                chunks = CommonUtils.split_into_chunks(query,chunk_size=7000,overlap=500)
                logger.info(f"Large query detected. Chunks={len(chunks)}",extra=extras)
                MAX_PARALLEL_EMBEDDINGS = 5
                with ThreadPoolExecutor(
                    max_workers=min(
                        len(chunks),
                        MAX_PARALLEL_EMBEDDINGS
                    )
                ) as executor:
                    results = list(
                        executor.map(
                            lambda chunk: self.process_chunk(
                                chunk,
                                thresholdScore
                            ),
                            chunks
                        )
                    )
                return any(results)
              # Search for documents that are similar to a given vector
            stmt = (
                    select(
                        SensitiveTopic.question,
                        text("1 - (sensitivetopic_embeddings <=> CAST(:embedding AS vector)) AS score")
                    )
                    .where(SensitiveTopic.bot_type == self.bot_type)
                    .where(SensitiveTopic.feedback_flag.is_(True))
                    .order_by(text("sensitivetopic_embeddings <=> CAST(:embedding AS vector)"))
                    .limit(10)
                )
            
            results = session.execute(stmt, {"embedding": query_embedding}).all()
            logger.info(f"Sensitive topics returned results: {(results)}",extra=extras)
            if not results:
                return False
            resp = [{"topic": row[0], "score": row[1]} for row in results]
            logger.info(f"Result for sensitive question : {len(resp)}",extra=extras)
            if results:
                matched = [r for r in resp
                    if r.get("score") is not None
                    and float(r["score"]) >= float(thresholdScore)
                ]
                return bool(matched)                                       
            else:
                logger.exception(f"No indices available {self.index_name_forsensitivetopic}.",extra=extras)
                return False
        except Exception:
            session.rollback()
            print(traceback.print_exc())
            logger.exception(f"Error in sensitive search from {self.index_name_forsensitivetopic}.",extra=extras)
            return False
        
    def process_chunk(self, chunk, thresholdScore):
            extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name':'kumaran'
            }
            query_embedding = self.openai_obj.embed_text(chunk)
            logger.info(f"Processing chunk. Chunk length={len(chunk)}",extra=extras)
            if query_embedding is None:
                return False
            stmt = (
                select(
                    SensitiveTopic.question,
                    text(
                        "1 - (sensitivetopic_embeddings <=> CAST(:embedding AS vector)) AS score"
                    )
                )
                .where(SensitiveTopic.bot_type == self.bot_type)
                .where(SensitiveTopic.feedback_flag.is_(True))
                .order_by(
                    text(
                        "sensitivetopic_embeddings <=> CAST(:embedding AS vector)"
                    )
                )
                .limit(10)
            )
            results = session.execute(
                stmt,
                {"embedding": query_embedding}
            ).all()
            if not results:
                return False
            resp = [
                {"topic": row[0], "score": row[1]}
                for row in results
            ]
            matched = [
                r for r in resp
                if r.get("score") is not None
                and float(r["score"]) >= float(thresholdScore)
            ]
            return bool(matched)
    
class SensitiveSearch:
    
    # def __init__(self, elastic_host: str, elastic_id: str, elastic_secret: str, index_name: str, openai_obj:object):
    def __init__(self, elastic_host: str, elastic_id: str, elastic_secret: str, index_name_forsensitivetopic: str,openai_obj,bot_type:str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f"Entering {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
        self. elastic_host = elastic_host # for vectordb
        self. elasticsearch_url = f"https://{elastic_host}:9243"
        self.es_client = Elasticsearch(self.elasticsearch_url, api_key=(elastic_id, elastic_secret)) # for vectordb
        # self.index_name = index_name
        self.index_name_forsensitivetopic = index_name_forsensitivetopic       
        self.openai_obj = openai_obj
        self.bot_type=bot_type      
        logger.info(f"Exiting {extras['functionname']} at {datetime.now(timezone.utc)}",extra=extras)
                          
    def search(self, text:str, thresholdScore:float):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }       
        """Returns the search

        Args:
            text (str): text to be used for search
            thresholdScore (float): minimum score to filter the returned documents from elastc search

        Returns:
            resp: Sensitive match
        """
        try:
            logger.info(f"Sensitive search from indices started.",extra=extras)
            # text = remove_stop_words(text)
            text_embedding = self.openai_obj.embed_text(text)
            logger.info(f"Embedding generated for question:{text}",extra=extras)
              # Search for documents that are similar to a given vector
            data = {
                "query": {
                        "script_score":{
                        "query": {"match_all": {}},
                        "script": {
                            "source": "cosineSimilarity(params.queryVector,'sensitivetopic_embeddings')",
                            "params": {"queryVector": text_embedding}
                        }
                    }
                }
            }

            logger.info(f"Search query generated for question:{text}",extra=extras)

            res = self.es_client.search(index=self.index_name_forsensitivetopic, body=data,source=["sensitivetopic"])
            logger.info(f"Index search done for question:{text}",extra=extras)

            # print('alll_response')
            resp = res.get('hits').get('hits')
            # print(resp)

            logger.info(f"Result for sensitive question : {resp}",extra=extras)

            if resp:
                resp = [r for r in resp if r.get('_score')>=float(thresholdScore)]
                if resp:
                    return True
                else:
                    return False                                          
            else:
                logger.exception(f"No indices available {self.index_name_forsensitivetopic}.",extra=extras)
                return False
        except Exception:
            print(traceback.print_exc())
            logger.exception(f"Error in sensitive search from {self.index_name_forsensitivetopic}.",extra=extras)
            return False
        



    