from pydantic import BaseModel

class bulkupdateschema(BaseModel):
    bot_type:str
    feedback_flag:bool

    class Config:
        json_schema_extra = {
            "example":{
                "bot_type":"kumaran",
                'feedback_flag':True         
            }
        }

class filterschema(BaseModel):
    question: str
    bot_type:str
    feedback_flag:bool

    class Config:
        json_schema_extra = {
            "example":{
                "question": "Search text",
                "bot_type":"kumaran",
                'feedback_flag':True         
            }
        }

class DataSearchSchema(BaseModel):
    bot_type:str

    class Config:
        json_schema_extra = {
            "example":{
                "bot_type":"cibc"
            }
        }

class SearchSchema(BaseModel):
    userquery: str
    bot_type:str
    language_type:str

    class Config:
        json_schema_extra = {
            "example":{
                "userquery": "Search text",
                "bot_type":"cibc",
                "language_type":"en"             
            }
        }

class SearchSchemaPostgres(BaseModel):
    userquery: str
    bot_type:str

    class Config:
        json_schema_extra = {
            "example":{
                "userquery": "Search text",
                "bot_type":"kumaran"          
            }
        }


# class DeleteIndexSchema(BaseModel):
#     index_name: str

#     class Config:
#         json_schema_extra = {
#             "example":{
#                 "index_name": "test_index"
#             }
#         }