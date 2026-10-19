import requests
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter
import logging

logger = logging.getLogger(__name__)


class HttpClient:
    """
    Singleton HTTP client with connection pooling and retry logic.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_session()
        return cls._instance

    def _init_session(self):
        self.session = requests.Session()

        retry_strategy = Retry(
            total=3,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
        )

        adapter = HTTPAdapter(
            pool_connections=10,
            pool_maxsize=20,
            max_retries=retry_strategy
        )

        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

        # ✅ 1. Set default timeout to prevent hanging requests
        self.default_timeout = 30

    def request(self, method, url, raise_on_error=True, **kwargs):
        """Central request handler with timeout & logging."""
        # ✅ 2. Apply default timeout if not provided
        kwargs.setdefault("timeout", self.default_timeout)

        try:
            response = self.session.request(method, url, **kwargs)
            if raise_on_error:
                response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            # ✅ 3. Log errors instead of silently failing
            logger.error(f"HTTP {method} {url} failed: {e}")
            raise

    def get(self, url, raise_on_error=True, **kwargs):
        return self.request("GET", url, raise_on_error=raise_on_error, **kwargs)

    def post(self, url, raise_on_error=True, **kwargs):
        return self.request("POST", url, raise_on_error=raise_on_error, **kwargs)

    def put(self, url, raise_on_error=True, **kwargs):
        return self.request("PUT", url, raise_on_error=raise_on_error, **kwargs)

    def delete(self, url, raise_on_error=True, **kwargs):
        return self.request("DELETE", url, raise_on_error=raise_on_error, **kwargs)

    def patch(self, url, raise_on_error=True, **kwargs):
        return self.request("PATCH", url, raise_on_error=raise_on_error, **kwargs)


http_client = HttpClient()