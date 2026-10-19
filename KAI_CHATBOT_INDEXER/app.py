from flask import Flask
from flask_cors import CORS
import logging
import os
from logger import logger,extras

ENV_NAME = os.environ.get('CUSTOMCONNSTR_ENV')
SERVICE_NAME='KAI_AI_CHATBOT_INDEXER_SERVICE'
PROJECT_NAME='KAI'

logger.info(f"Environment:{ENV_NAME}", extra=extras)
properties = {'custom_dimensions': {'ENV': ENV_NAME}}

HOST_NAME_ENV = os.getenv("HOST_NAME_ENV")
BUILD_VERSION = os.getenv('BUILD_VERSION',1)
APP_VERSION = os.getenv('APP_VERSION',1)
# HOST_NAME_ENV='AZURE'
if HOST_NAME_ENV == "AZURE":
    from keyvault import setallenv_variables
    setallenv_variables(ENV_NAME)
    if int(os.getenv('IS_LOCAL_DEVELOPMENT',0)):
        os.environ['SQLHOST'] = 'dev-mssql.kumaran.ai'
        os.environ['SQLPORT'] = '1543'

from routes import bp

app = Flask(__name__)
CORS(app)
app.register_blueprint(bp)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("flask_indexer")

@app.route("/")
def home():
    return {"status": "Indexer Service Running","version":0.1}

@app.teardown_request
def force_run_garbage_collector(exception=None):
    import gc
    gc.collect()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
