import os
import io
import base64
from PIL import Image
from agent_framework import Message, Content, tool
from logger import logger, get_caller_frame
from custom_utils.azure_blob_service import Azure_blob
from custom_utils.sandbox_executor import HyperlightSandboxExecutor
from agent_pool_context_helper import current_conv_id, current_uploaded_filenames, current_generated_image_ids, current_generated_document_ids, current_model_name, current_aug_tables
SERVICE_NAME = 'KAI_CHATBOT_CONVERSATION_SERVICE'
PROJECT_NAME = 'KAI'

class PythonInterpreterPlugin:
    """
    MAF Tool Plugin implementing the CodeAct pattern for running sandboxed Python code
    in Hyperlight / isolated containers for numeric spreadsheet processing and visualization.
    """
    def __init__(self, conv_id: str, blob_object: Azure_blob):
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        self.blob_object = blob_object
        self.sandbox_executor = HyperlightSandboxExecutor()
        self.is_image_generated = False
        logger.info("initialising sandbox plugin",extra=extras)

    @tool(
        approval_mode="never_require",
        name="code_interpreter",
        description="""
        # Sandboxed Python Code Interpreter (CodeAct Pattern)
        Executes Python code blocks inside a Hyperlight isolated micro-sandbox environment to process spreadsheet files (.csv, .xlsx), perform complex numerical calculations with pandas/numpy/scipy, generate data visualization charts with matplotlib/seaborn, render architecture/flow diagrams using Python's `diagrams` library, and create/export Excel spreadsheets (.xlsx) or CSV files when requested.

        ## Instructions & Environment:
        - ALWAYS call this tool for ANY queries or follow-up questions related to .csv or .xlsx spreadsheet files uploaded in this conversation (e.g. data lookup, row filtering, averages, totals, statistics, summaries, plots, or exporting modified Excel files).
        - DO NOT use `document_search` for .csv or .xlsx spreadsheet data processing requests. Always use `code_interpreter`.
        - DO NOT call this tool when the user asks for a standard flowchart, sequence diagram, process flow, or specifically requests Mermaid code. Output markdown ```mermaid``` code directly in your text response.
        - Environment executes standalone Python scripts (NOT Jupyter Notebooks) with installed packages: `pandas>=2.0.0, numpy>=1.24.0, scipy>=1.10.0, matplotlib>=3.7.0, seaborn>=0.12.0, openpyxl>=3.1.0, pillow>=9.5.0, diagrams>=0.23.0` (with Graphviz `dot` engine). Note: `xlsxwriter` is NOT installed.
 
        ## General Script Rules:
        - Uploaded spreadsheet data files are in your current working directory. Load them directly using pandas: `df = pd.read_csv("filename.csv")` or `df = pd.read_excel("filename.xlsx")`.
        - Web search data tables (if any) have been saved to your working directory as CSVs (e.g., `table_1_1.csv`). Read them using pandas to generate the Excel file.
        - DO NOT prefix file paths with `./workspace/` or `workspace/`. Use plain basenames (e.g. `'data.xlsx'`).
        - Because this is a script, simply writing a variable name on the final line yields NO output. You MUST EXPLICITLY output your final result using `print()` statements (e.g., `print(df.to_string())`, `print("Total revenue:", total)`).
        - For creating or exporting Excel spreadsheets (.xlsx) or CSV files, save files directly to disk using `openpyxl` (e.g., `df.to_excel('output.xlsx', index=False)` or `df.to_excel('report.xlsx', engine='openpyxl')`). NEVER use `xlsxwriter` or specify `engine='xlsxwriter'`.
        - Ensure all columns and rows in generated tables are fully populated with complete, clean, non-null values unless missing entries are specifically requested.
        - For matplotlib/seaborn plots or charts, save images directly to disk (e.g. `plt.savefig('output.png')`) and print a confirmation message. DO NOT call `plt.show()`.
        - When generating diagrams using the `diagrams` library, always set `show=False` (e.g. `with Diagram("Title", filename="arch", show=False):`).
        - If code execution fails, the runtime error traceback will be returned as tool output so you can analyze the error, rewrite corrected Python code, and retry.
        """
    )
    async def execute_python_code(self, code: str) -> Message:
        """
        Executes Python code inside the session Hyperlight sandbox.

        Args:
            code (str): Multi-step Python code block to execute.
        """
        extras = {
            'servicename': SERVICE_NAME,
            'functionname': get_caller_frame().f_code.co_name,
            'projectname': PROJECT_NAME,
            'bot_name': 'kumaran'
        }
        logger.info(f"Starting Python Code Execution in Hyperlight Sandbox for Conv ID {current_conv_id.get()}", extra=extras)
        try:
            result = self.sandbox_executor.execute_python_code(
                conv_id=current_conv_id.get(), 
                code=code, 
                uploaded_filenames=current_uploaded_filenames.get(),
                blob_object=self.blob_object,
                aug_tables=current_aug_tables.get()
            )

            if result["success"]:
                stdout_text = result["stdout"] if result["stdout"] else "Execution completed successfully with no stdout."
                
                # Check for generated plot/chart images returned as base64 payloads
                generated_images = result.get("generated_images", [])
                if generated_images:
                    for img_item in generated_images:
                        try:
                            filename = img_item.get("filename", "plot.png")
                            content_b64 = img_item.get("content_b64", "")
                            if content_b64:
                                image_bytes = base64.b64decode(content_b64)
                                img = Image.open(io.BytesIO(image_bytes))
                                mime_type = Image.MIME.get(img.format, "image/png")
                                ext = filename.split(".")[-1] if "." in filename else "png"
                                
                                image_id = self.blob_object.save_image_to_blob(
                                    conversation_id=current_conv_id.get(),
                                    image_bytes=image_bytes,
                                    mime_type=mime_type,
                                    query="Generated Plot from Sandboxed Python Interpreter",
                                    extension=ext,
                                    token_usuage={"code_interpreter": True}
                                )
                                self.is_image_generated = True
                                current_generated_image_ids.get().append(image_id)
                                logger.info(f"Saved generated plot image '{filename}' to Blob ID {image_id}", extra=extras)
                        except Exception as img_err:
                            logger.exception(f"Error processing generated plot image: {img_err}", extra=extras)

                # Check for generated spreadsheet/data files (.xlsx, .csv, .pdf) returned as base64 payloads
                generated_data_files = result.get("generated_data_files", [])
                if generated_data_files:
                    for data_item in generated_data_files:
                        try:
                            filename = data_item.get("filename", "output.xlsx")
                            content_b64 = data_item.get("content_b64", "")
                            if content_b64:
                                ext = filename.split(".")[-1] if "." in filename else "xlsx"
                                doc_id = self.blob_object.save_generated_document(
                                    query="Generated Spreadsheet/Data File from Sandboxed Python Interpreter",
                                    conv_id=current_conv_id.get(),
                                    file_bytes=content_b64,
                                    extension=ext,
                                    tokens_consumed={"code_interpreter": True},
                                    model_name=current_model_name.get(),
                                    document_name=filename
                                )
                                current_generated_document_ids.get().append(doc_id)
                                logger.info(f"Saved generated data file '{filename}' to Blob ID {doc_id}", extra=extras)
                        except Exception as data_err:
                            logger.exception(f"Error processing generated data file: {data_err}", extra=extras)

                tool_response = f"Execution Output (stdout):\n{stdout_text}"
                if generated_images:
                    tool_response += f"\n\n[Plot chart generated and attached automatically]"
                if generated_data_files:
                    data_file_names = ", ".join([f"'{item.get('filename')}'" for item in generated_data_files if item.get('filename')])
                    tool_response += f"\n\n[Data file(s) generated and attached automatically: {data_file_names}]"

                return Message(role="tool", contents=[Content.from_text(text=tool_response)])

            else:
                # Phase 4 Self-Correction Loop: Return error traceback to LLM
                error_trace = result["stderr"] if result["stderr"] else "Unknown execution error."
                logger.warning(f"Python Sandbox Execution Error in Conv ID {current_conv_id.get()}: {error_trace}", extra=extras)
                
                tool_error_response = f"Execution Error (exit code {result['exit_code']}):\n{error_trace}"
                if result["stdout"]:
                    tool_error_response += f"\nPartial Stdout:\n{result['stdout']}"

                return Message(role="tool", contents=[Content.from_text(text=tool_error_response)])

        except Exception as e:
            logger.exception(f"Exception during Python Sandbox execution: {e}", extra=extras)
            return Message(role="tool", contents=[Content.from_text(text=f"Sandbox Tool Execution Failed: {str(e)}")])
