from agent_framework import Message,Content,tool

from logger import logger,get_caller_frame,extras
from agent_pool_context_helper import current_conv_id
from conversationalservice.service_route_utils import fetch_augcontent

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'


class DocumentVectorSearchPlugin:
    last_search = None
    def __init__(self, conv_id:str):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        self.conv_id = conv_id
        self.aug_source = set()
        self.aug_content = ''

    @tool(approval_mode="never_require",
        name="document_search",
        description="""
        # Document Search
        Retrieves raw text snippets from the document database related to the query. 

        **IMPORTANT:** This tool returns fragmented information. You must analyze, summarize, and synthesize the retrieved data to provide a natural, conversational response to the user. Do not repeat the tool output verbatim.

        **CRITICAL RESTRICTION FOR SPREADSHEET / TABULAR FILES (.csv, .xlsx, .xls):**
        - DO NOT use this tool for .csv, .xlsx, or tabular spreadsheet data files uploaded in this conversation.
        - For ANY questions, data queries, calculations, aggregations, row lookups, summaries, or charts related to .csv or .xlsx files, ALWAYS call the `code_interpreter` tool instead.

        **HOW TO USE:**
        - ONLY use this function when the user asks for something related to text/PDF documents which you do not have context about.
        - ONLY give query to this tool in ENGLISH. If user's Query is not in english, translate it before calling this tool.
        - Ensure the Query is descriptive and contains all relevant keywords.
        - You can mention the document name in the query to improve results, but it is not required.
        - This Tool will return upto contents of 30 text chunk from a single document who's name you should pass, if you need information from multiple documents call this tool for each document you need context from.
        - This Tool does NOT have access to images/videos; do not use it for visual context.
        - For Document Summaries: Execute multiple calls to this tool to retrieve all available chunks before synthesizing the final summary to ensure full document coverage.

        **DO NOT use this function when:**
        - The query is about .csv, .xlsx, or spreadsheet/tabular data files (use `code_interpreter` instead).
        - You are not sure if the user is referring to a document/file.

         **Error handling**
        - If the tool fails or returns inconsistent data, acknowledge briefly and propose next steps (e.g., refine keywords, confirm document title, provide a link).""")
    async def document_vector_search(self, query: str, document_name: str) -> Message:
        """
        Search for specific information within a document using vector similarity. Returns up to 30 relevant chunks.
        
        Args:
            query (str): A precise search string targeting specific facts, figures, or sections. 
            document_name (str): The exact name of the document to search with.
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'}
        logger.info(f'Vector search Started',extra=extras)
        try:
            aug_content,aug_source = fetch_augcontent(query=query,conversation_id=current_conv_id.get(),document_name=document_name)
    
            aug_content = f"""
                CONTENT: {aug_content}
                ---
                INSTRUCTION: Use the context above to answer the user's request. Do not mention the file name unless relevant."""
            return Message(  role="tool", contents=[
                Content.from_text(text=aug_content if aug_content else "no relavent information found in documents uploaded by user")])
            
        
        except Exception as e:
            logger.info(f"unknown Exception during Vector Search : {e}",extra=extras)
            return Message(  role="tool", contents=[
                Content.from_text(text="no relavent information found in documents uploaded by user")])
            
            


