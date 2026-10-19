from app.logger import logger,get_caller_frame,extras
import traceback
from datetime import datetime,timezone
import tiktoken
class CommonUtils:

    def toLowerRemoveSpecialCharater(self,text:str):
        text=text.lower()
        cleaned_text = text.replace("?", "")
        return cleaned_text
    
    @staticmethod
    def get_token_count(text):
        enc = tiktoken.get_encoding(
            "cl100k_base"
        )
        return len(enc.encode(text))
    
    @staticmethod
    def split_into_chunks(text, chunk_size=7000, overlap=500):
        enc = tiktoken.get_encoding("cl100k_base")
        tokens = enc.encode(text)
        chunks = []
        start = 0
        while start < len(tokens):
            end = start + chunk_size
            chunks.append(
                enc.decode(tokens[start:end])
            )
            start += chunk_size - overlap
        return chunks
