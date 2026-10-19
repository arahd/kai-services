import gc

from agent_pool_context_helper import current_conv_id

from agent_framework import Message,Content,tool
from logger import logger,get_caller_frame,extras
from sqlalchemy import text
from tableModels import Session

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'



class UploadedFilenames:
    last_search = None
    def __init__(self, conv_id:str,max_results: int = 1):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        #self.conv_id = conv_id
        self.max_results = max_results
        self.aug_source = []
        self.aug_content = ''

    @tool(approval_mode="never_require",
        name="get_uploaded_file_names",
        description="""
        # Uploaded File names list
        This tool gives names of all files uploaded by user

        ###ONLY USE this tool when you want to know names of all files uploaded by user in this conversationt this tool does not give content of the files, just the names
        ### Use this tool sparingly and only when needed
        """
    )
    async def get_uploaded_filenames(self, query: str) -> Message:
        """
        This Returns the names of all files uploaded by user in this conversation as a list
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        logger.info(f'Image Generation Started',extra=extras)

        document_names = list()
        result = None
        session = Session()
        try:
            # --- Image Query: Exactly 1 image per unique doc_id ---
            sql_query = text("""
                SELECT DISTINCT source
                FROM pdf_chunks
                WHERE conv_id = :conv_id
            """)

            params = {
                "conv_id":current_conv_id.get()
            }
            
            result = session.execute(sql_query, params).scalars()
            document_names = result.all()
            return Message( role="tool", contents=[
                Content.from_text(text=str(document_names))])
            
        except Exception as e:
            session.rollback()
            logger.exception(f"DB ERROR in get_uploaded_filenames plugin : {str(e)}", extra=extras)
            return Message(  role="tool", contents=[
                Content.from_text(text="Document names for documents in this conversation was not found")])

        finally:
            if result:
                del result
            session.close()
            gc.collect()
        