import os
from dotenv import load_dotenv

load_dotenv()

AZURE_OPENAI_KEY = os.getenv("OPENAI_API_KEY")
AZURE_OPENAI_BASE = os.getenv("OPENAI_API_BASE")
EMBED_DEPLOYMENT = os.getenv("OPENAI_EMBEDDING_MODEL")
VECTOR_DIM = int(os.getenv("VECTOR_DIM", 1536))
CHUNK_WORD_SIZE = int(os.getenv("CHUNK_WORD_SIZE", 300))
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", 16))
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_FILE_SIZE_BYTES", 50 * 1024 * 1024))  # 10MB

PG_HOST = os.getenv("CHATBOT_PG_HOST")
PG_PORT = os.getenv("CHATBOT_PG_PORT")
PG_USER = os.getenv("CHATBOT_PG_USERNAME")
PG_PASSWORD = os.getenv("CHATBOT_PG_PWD")
PG_DB = os.getenv("CHATBOT_PG_DB_NAME")

missing = [name for name, v in (
    ("AZURE_OPENAI_API_KEY", AZURE_OPENAI_KEY),
    ("AZURE_OPENAI_BASE", AZURE_OPENAI_BASE),
    ("AZURE_OPENAI_DEPLOYMENT_EMBED", EMBED_DEPLOYMENT),
) if not v]
if missing:
    raise RuntimeError("Missing env: " + ", ".join(missing))

DATABASE_URL = os.getenv("PGDBCONNSTR")

