from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import os

app = FastAPI()

APP_VERSION = "1.0.0"

@app.get("/")
def home():
    return {
        "message": "Filter service for K-AI", 
        "version": APP_VERSION
        }

@app.post("/getenv")
async def get_env_value(request: Request):
    data = await request.json()
    key = data.get('key')
    value = os.getenv(key, None)
    return JSONResponse(content={'key':key, 'value':value})