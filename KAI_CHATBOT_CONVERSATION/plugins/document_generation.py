from agent_framework import Content,Message,tool

from logger import logger,get_caller_frame,extras

from agent_pool_context_helper import current_conv_id,current_model_name,current_generated_document_ids

from custom_utils.azure_blob_service import Azure_blob
from document_generation.document_generation_ppt import generate_ppt_file
from document_generation.document_generation_docx import generate_docx_file
from simple_agent_pool import SimpleAgentPool
from agent_pool_context_helper import current_aug_content
SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'


class DocumentGenerationPlugin:
    last_search = None
    def __init__(self, conv_id:str,blob_object:Azure_blob,simple_agent_pool:SimpleAgentPool,model_name:str='gpt-4o-mini'):
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
        #self.conv_id = current_conv_id.get()
        #self.model_name = current_model_name.get()
        
        self.aug_source = [] # keeping this here for now because eventuall it should contain sources used by llm to generate the ppt
        self.aug_content = ''
        self.blob_object = blob_object
        self.total_input_tokens_consumed=0
        self.total_output_tokens_consumend = 0
        self.simple_agent_pool=simple_agent_pool
        # self.is_pptx_generated = False
        # self.generated_pptx_ids=list()

    
    @tool(approval_mode="never_require",
        name="document_generator",
        description="""
        #Document Generator
        Generates either a .pptx , .docx , .pdf document based on document_type passed

        # Rules
        - ONLY use this function when the user's query requires specifically asks to generate an Document and asks it as a downloadable file, DO NOT assume an user asked for document was asked unless user explicitly asks for it, 
        - Ensure that the Query given to this tool is descriptive and contains information like the theme of the Document and any part of the topic which needs to be focused more on,Tone of the Document like formal or casual and styling details
        - pass the correct document format to document_type, valid values are `pdf` , `pptx` and `docx`

        ## Response Handling
        - This tool returns "DOCUMENT Generation Successful" or "DOCUMENT Generation Failed".
        - On success, the generated document is automatically attached at the end of your output — structure your response accordingly.
        - On failure, acknowledge the failure gracefully

        # **DO NOT use this function for:**
        - anything other than generating a Document (only for .pptx , .docx  and .pdf) if explicitly asked by user,
        """
    )
    async def generate_document(self, query: str,document_type:str) -> Message:
        """
        Generates a Document based on the query and document_type you pass to it
        - Only call this tool once, do not call it multiple times

        Args:
            query (str): The user's query.
            document_type(str): Document type for the document to be generated , accepted values are `pdf`,`pptx` and `docx`
        """
        extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
        }
        logger.info(f'DOCX Generation Started',extra=extras)
        try:

            if document_type == 'docx':
                data = await generate_docx_file(model_name=current_model_name.get(),user_query=query,simple_agent_pool=self.simple_agent_pool,output_format='docx', web_search_context=current_aug_content.get())
                logger.info(f'DOCX Generation Complete',extra=extras)
                b64_file_bytes = data["docx_file_bytes"]
                filename = data["filename"]
                input_tokens = data["input_tokens"]
                output_tokens = data["output_tokens"]
                pptx_embed = self.blob_object.save_generated_document(extension="docx",file_bytes=b64_file_bytes,document_name=filename,model_name=current_model_name.get(),query=query,conv_id=current_conv_id.get(),tokens_consumed={"input_token":input_tokens,"output_token":output_tokens})
                self.total_input_tokens_consumed+=input_tokens
                self.total_output_tokens_consumend+=output_tokens
                current_generated_document_ids.get().append(pptx_embed)
                return Message( role="tool", contents=[
                    Content.from_text(text="DOCX Generation Successful")])
            elif document_type == 'pdf':
                data = await generate_docx_file(model_name=current_model_name.get(),user_query=query,simple_agent_pool=self.simple_agent_pool,output_format='pdf', web_search_context=current_aug_content.get())
                logger.info(f'PDF Generation Complete',extra=extras)
                b64_file_bytes = data["pdf_file_bytes"]
                filename = data["filename"]
                input_tokens = data["input_tokens"]
                output_tokens = data["output_tokens"]
                pptx_embed = self.blob_object.save_generated_document(extension="pdf",file_bytes=b64_file_bytes,document_name=filename,model_name=current_model_name.get(),query=query,conv_id=current_conv_id.get(),tokens_consumed={"input_token":input_tokens,"output_token":output_tokens})
                self.total_input_tokens_consumed+=input_tokens
                self.total_output_tokens_consumend+=output_tokens
                current_generated_document_ids.get().append(pptx_embed)
                return Message( role="tool", contents=[
                    Content.from_text(text="PDF Generation Successful")])
            elif document_type == 'pptx':
                data = await generate_ppt_file(model_name=current_model_name.get(),user_query=query,simple_agent_pool=self.simple_agent_pool, web_search_context=current_aug_content.get())
                logger.info(f'PPTX Generation Complete',extra=extras)
                b64_file_bytes = data["ppt_file_bytes"]
                filename = data["filename"]
                input_tokens = data["input_tokens"]
                output_tokens = data["output_tokens"]
                pptx_embed = self.blob_object.save_generated_document(extension="pptx",file_bytes=b64_file_bytes,document_name=filename,model_name=current_model_name.get(),query=query,conv_id=current_conv_id.get(),tokens_consumed={"input_token":input_tokens,"output_token":output_tokens})
                self.total_input_tokens_consumed+=input_tokens
                self.total_output_tokens_consumend+=output_tokens
                current_generated_document_ids.get().append(pptx_embed)
                return Message( role="tool", contents=[
                    Content.from_text(text="PPT Generation Successful")])
            else:
                return Message( role="tool", contents=[
                Content.from_text(text=f"DOCUMENT Generation Failed,{document_type} is not supported,supported values are `pptx`,`docx` and `pdf`")])

        except Exception as e:
            return Message( role="tool", contents=[
                Content.from_text(text="DOCUMENT Generation Failed")])