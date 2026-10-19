import os
from dotenv import load_dotenv

load_dotenv()

PG_HOST = os.getenv("CHATBOT_PG_HOST")
PG_PORT = os.getenv("CHATBOT_PG_PORT")
PG_USER = os.getenv("CHATBOT_PG_USERNAME")
PG_PASSWORD = os.getenv("CHATBOT_PG_PWD")
PG_DB = os.getenv("CHATBOT_PG_DB_NAME")

AZURE_OPENAI_KEY = os.getenv("OPENAI_API_KEY")
AZURE_OPENAI_BASE = os.getenv("OPENAI_API_BASE")
EMBED_DEPLOYMENT = os.getenv("OPENAI_EMBEDDING_MODEL")
VECTOR_DIM = int(os.getenv("VECTOR_DIM", 1536))

# validate env
missing = [name for name, v in (
    ("AZURE_OPENAI_API_KEY", AZURE_OPENAI_KEY),
    ("AZURE_OPENAI_BASE", AZURE_OPENAI_BASE),
    ("AZURE_OPENAI_DEPLOYMENT_EMBED", EMBED_DEPLOYMENT),
) if not v]
if missing:
    raise RuntimeError("Missing env: " + ", ".join(missing))

DATABASE_URL = os.getenv("PGDBCONNSTR")
DB_TYPE = os.getenv('DB_TYPE')