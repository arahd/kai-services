import os
import time
import json
import threading
import requests
from requests.adapters import HTTPAdapter
from logger import logger, extras

# Global persistent Session with Connection Pooling
_http_session = None
_session_lock = threading.Lock()

def get_http_session() -> requests.Session:
    """
    Returns a global thread-safe requests.Session configured with urllib3 connection pooling.
    Reuses TCP connection pools and SSL/TLS handshakes across all HTTP requests.
    """
    global _http_session
    if _http_session is None:
        with _session_lock:
            if _http_session is None:
                session = requests.Session()
                pool_connections = int(os.getenv("HTTP_POOL_CONNECTIONS", 25))
                pool_maxsize = int(os.getenv("HTTP_POOL_MAXSIZE", 100))
                
                adapter = HTTPAdapter(
                    pool_connections=pool_connections,
                    pool_maxsize=pool_maxsize,
                    max_retries=1
                )
                session.mount("http://", adapter)
                session.mount("https://", adapter)
                _http_session = session
                logger.info(f"Initialized HTTP Connection Pool (connections={pool_connections}, maxsize={pool_maxsize})", extra=extras)
    return _http_session

class CachedAuthResponse:
    """
    Lightweight wrapper mirroring requests.Response for cached token responses.
    """
    def __init__(self, status_code: int, content: bytes):
        self.status_code = status_code
        self.content = content

    @property
    def text(self) -> str:
        return self.content.decode('utf-8', errors='replace')

    def json(self):
        return json.loads(self.text)

class AuthTokenCache:
    """
    Thread-safe in-memory TTL Cache for Bearer Token validation responses.
    """
    def __init__(self):
        self._cache = {}
        self._lock = threading.Lock()
        self._ttl_sec = int(os.getenv("AUTH_TOKEN_CACHE_TTL_SEC", 300))

    def _make_key(self, token: str, auth_type: str, roles_required: list) -> str:
        roles_str = ",".join(sorted(roles_required)) if isinstance(roles_required, list) else str(roles_required)
        return f"{token}:{auth_type}:{roles_str}"

    def get(self, token: str, auth_type: str, roles_required: list):
        key = self._make_key(token, auth_type, roles_required)
        now = time.time()
        with self._lock:
            if key in self._cache:
                resp_data, expire_time = self._cache[key]
                if now < expire_time:
                    logger.info(f"Auth Token Cache HIT for token key prefix: {key[:15]}...", extra=extras)
                    return CachedAuthResponse(resp_data['status_code'], resp_data['content'])
                else:
                    del self._cache[key]
        return None

    def set(self, token: str, auth_type: str, roles_required: list, status_code: int, content: bytes):
        # Only cache successful 200 responses to prevent caching transient auth failures
        if status_code != 200:
            return
        key = self._make_key(token, auth_type, roles_required)
        expire_time = time.time() + self._ttl_sec
        with self._lock:
            self._cache[key] = ({'status_code': status_code, 'content': content}, expire_time)
            logger.info(f"Auth Token Cache SET for token key prefix: {key[:15]}... (TTL: {self._ttl_sec}s)", extra=extras)

auth_cache = AuthTokenCache()
