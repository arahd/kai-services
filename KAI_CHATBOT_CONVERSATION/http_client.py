import os
import requests
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

class HttpClient:
    """
    Singleton HTTP client with connection pooling and retry logic.
    Reuses SSL connections across all API calls.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_session()
        return cls._instance

    def _init_session(self):
        """Initialize session ONCE with connection pooling."""
        self.session = requests.Session()

        # retry_strategy = Retry(
        #     total=3,
        #     backoff_factor=0.5,
        #     status_forcelist=[429, 500, 502, 503, 504],
        #     allowed_methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
        # )

        adapter = HTTPAdapter(
            pool_connections= int(os.getenv("HTTP_POOL_CONNECTIONS", 25)),
            pool_maxsize= int(os.getenv("HTTP_POOL_MAXSIZE", 100)),
            max_retries= 0 #retry_strategy
        )

        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def get(self, url, **kwargs):
        """GET request."""
        response = self.session.get(url, **kwargs)
        # response.raise_for_status()
        return response

    def post(self, url, **kwargs):
        """POST request."""
        response = self.session.post(url, **kwargs)
        # response.raise_for_status()
        return response

    def put(self, url, **kwargs):
        """PUT request."""
        response = self.session.put(url, **kwargs)
        # response.raise_for_status()
        return response

    def delete(self, url, **kwargs):
        """DELETE request."""
        response = self.session.delete(url, **kwargs)
        # response.raise_for_status()
        return response

    def patch(self, url, **kwargs):
        """PATCH request."""
        response = self.session.patch(url, **kwargs)
        # response.raise_for_status()
        return response

http_client = HttpClient()