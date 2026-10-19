import httpx
import numpy as np
from config import AZURE_OPENAI_BASE, AZURE_OPENAI_KEY, EMBED_DEPLOYMENT

# Global persistent client to reuse connections
_http_client = httpx.Client(timeout=60)

def get_embedding(text: str):
    """Fetch text embedding from Azure OpenAI."""
    url = f"{AZURE_OPENAI_BASE}/openai/deployments/{EMBED_DEPLOYMENT}/embeddings?api-version=2023-05-15"
    headers = {"api-key": AZURE_OPENAI_KEY, "Content-Type": "application/json"}
    
    resp = _http_client.post(url, headers=headers, json={"input": [text]})
    resp.raise_for_status()
    data = resp.json()
    return np.array(data["data"][0]["embedding"], dtype=np.float32)
