import logging
import logstash
import time
import inspect
import os
import uuid
import sys
import re
from functools import wraps
from contextlib import contextmanager
from contextvars import ContextVar
from opentelemetry import trace

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

extras = {
        'servicename': SERVICE_NAME,
        'functionname': '',
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }

class LogLevelFilter(logging.Filter):
    """Filter log records sent to App Insights based on boolean flags for each severity level."""
    def __init__(self, debug=False, info=False, warning=True, error=True):
        super().__init__()
        self.debug = debug
        self.info = info
        self.warning = warning
        self.error = error

    def filter(self, record):
        if record.levelno <= logging.DEBUG:
            return self.debug
        elif record.levelno == logging.INFO:
            return self.info
        elif record.levelno == logging.WARNING:
            return self.warning
        elif record.levelno >= logging.ERROR:
            return self.error
        return True

class LoggerFactory:
    @staticmethod
    def get_logger(logger_type, logger_name, debug=None, info=None, warning=None, error=None):
        if logger_type == 'ELK':
            elk=ELKLogger(logger_name)
            return elk.get()
        elif logger_type == 'AppInsights':
            app_insights_logger=AppInsightsLogger(logger_name, debug=debug, info=info, warning=warning, error=error)
            return app_insights_logger.get()
        else:
            raise NotImplementedError("Logger type {} not implemented".format(logger_type))


class ELKLogger():
    def __init__(self, logger_name):
        self.logger_name=logger_name
        self.log_stash_host = '23.98.158.192'
        self.log_stash_udp_port = 5960

    def get(self):
        logging.basicConfig(
            filename="conversational_sevice.log",
            filemode="a",
            format="%(asctime)s,%(msecs)d %(name)s %(levelname)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            level=logging.INFO,
        )
        self.stderrLogger = logging.StreamHandler()
        logging.getLogger().addHandler(self.stderrLogger)
        self.logger = logging.getLogger(self.logger_name)
        self.logger.addHandler(logstash.UDPLogstashHandler(
            self.log_stash_host,
            self.log_stash_udp_port,
            version=1
        ))
        return self.logger

class RequestIdFormatter(logging.Formatter):
    """Production-grade formatter that injects request-scoped fields
    and strips ANSI escape codes from log messages."""

    _ANSI_RE = re.compile(r'\x1b\[[0-9;]*m')

    def format(self, record):
        # Strip ANSI escape codes (e.g. from werkzeug startup/request messages)
        if record.msg:
            record.msg = self._ANSI_RE.sub('', str(record.msg))
        if not hasattr(record, 'request_id'):
            try:
                record.request_id = request_id.get()
            except (LookupError, NameError):
                record.request_id = "NO_REQ"
        if not hasattr(record, 'servicename'):
            record.servicename = SERVICE_NAME
        if not hasattr(record, 'functionname'):
            record.functionname = getattr(record, 'funcName', '') or ''
        return super().format(record)

class AppInsightsLogger():
    def __init__(self, logger_name, debug=None, info=None, warning=None, error=None):
        self.logger_name = logger_name
        self.debug = debug if debug is not None else (os.environ.get('APPINSIGHTS_LOG_DEBUG', 'true').lower() in ('true', '1', 'yes'))
        self.info = info if info is not None else (os.environ.get('APPINSIGHTS_LOG_INFO', 'false').lower() in ('true', '1', 'yes'))
        self.warning = warning if warning is not None else (os.environ.get('APPINSIGHTS_LOG_WARNING', 'true').lower() in ('true', '1', 'yes'))
        self.error = error if error is not None else (os.environ.get('APPINSIGHTS_LOG_ERROR', 'true').lower() in ('true', '1', 'yes'))
        self.logger = self.setup_logger()
        
    def setup_logger(self):
        logger = logging.getLogger(self.logger_name)
        logger.setLevel(logging.DEBUG)

        file_handler = logging.FileHandler("conversational_sevice.log", encoding="utf-8")
        formatter = RequestIdFormatter("%(asctime)s - %(name)s - %(levelname)s - %(request_id)s - %(message)s - %(servicename)s - %(functionname)s", "%Y-%m-%d %H:%M:%S")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        # APPLICATIONINSIGHTS_CONNECTION_STRING = os.getenv('APPLICATIONINSIGHTS_CONNECTION_STRING',"InstrumentationKey=b02f4bff-600c-400e-8556-69f85093c405;IngestionEndpoint=https://eastus-8.in.applicationinsights.azure.com/;LiveEndpoint=https://eastus.livediagnostics.monitor.azure.com/;ApplicationId=55c7f3ef-3e70-482a-8e49-1b8affa343b0") 
        APPLICATIONINSIGHTS_CONNECTION_STRING = os.environ.get('APPLICATIONINSIGHTS_CONNECTION_STRING')
        # ─── 1. Add Console Handler (NEW — with your custom formatter) ───
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)       # Uses RequestIdFormatter
        logger.addHandler(console_handler)
        logging.getLogger("azure").setLevel(logging.WARNING)
        # ─── Log Configuration Confirmation on Startup ───
        conn_str_status = "PRESENT" if APPLICATIONINSIGHTS_CONNECTION_STRING else "NOT SET / EMPTY"
        logger.info(f"[LOGGER CONFIG] AppInsights Connection String: {conn_str_status}")
        logger.info(f"[LOGGER CONFIG] Log Flags -> DEBUG={self.debug}, INFO={self.info}, WARNING={self.warning}, ERROR={self.error}")

        # ─── 2. Azure Monitor (No changes needed here) ───
        if APPLICATIONINSIGHTS_CONNECTION_STRING:
            os.environ["OTEL_SERVICE_NAME"] = SERVICE_NAME
            try:
                from azure.monitor.opentelemetry import configure_azure_monitor
                configure_azure_monitor(connection_string=APPLICATIONINSIGHTS_CONNECTION_STRING)
                
                app_insights_filter = LogLevelFilter(debug=self.debug, info=self.info, warning=self.warning, error=self.error)
                # Apply custom Formatter and Level Filter to OpenTelemetry log handlers
                for h in logging.getLogger().handlers:
                    h.setFormatter(formatter)
                    h.addFilter(app_insights_filter)
                logger.info("[LOGGER CONFIG] Azure OpenTelemetry Monitor successfully configured with LogLevelFilter.")
            except Exception as exc:
                logger.warning(f"Could not initialize OpenTelemetry: {exc}")

        return logger

    def get(self):
        return self.logger
            
logger_type=os.getenv('LOGGER_TYPE','AppInsights')
logger_env_name=os.getenv('CUSTOMCONNSTR_ENV','DEV')

logger = LoggerFactory.get_logger(logger_type=logger_type, logger_name=logger_env_name)
# ─── ContextVars for Request-Scoped Timing ───
request_timings = ContextVar("request_timings", default=None)
call_stack = ContextVar("call_stack", default=None)
request_start_time = ContextVar("request_start_time", default=None)
request_id = ContextVar("request_id", default="NO_REQ")
# ─── Logging Filter: Auto-inject request_id, servicename, functionname ───
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        try:
            record.request_id = request_id.get()
        except (LookupError, NameError):
            record.request_id = "NO_REQ"
        if not hasattr(record, 'servicename'):
            record.servicename = SERVICE_NAME
        if not hasattr(record, 'functionname'):
            record.functionname = getattr(record, 'funcName', '') or ''
        return True
request_id_filter = RequestIdFilter()
logger.addFilter(request_id_filter)
logging.getLogger().addFilter(request_id_filter)


def get_caller_frame():
    frame = inspect.currentframe()
    caller_frame = frame.f_back
    del frame
    return caller_frame

# ─── Reset at Start of Each Request ───
def start_request_timing():
    """Call this at the START of every HTTP request (e.g., @app.before_request)."""
    request_timings.set([])
    call_stack.set([])
    request_start_time.set(time.perf_counter())
    req_id = uuid.uuid4().hex[:12]
    request_id.set(req_id)
    
    # Inject request_id into OpenTelemetry span so it appears in App Insights customDimensions
    current_span = trace.get_current_span()
    if current_span and current_span.is_recording():
        current_span.set_attribute("custom.request_id", req_id)


# ─── Record a Timing Entry ───
def add_timing(function_name, duration, depth, start_time=None):
    timings = request_timings.get()          # No need to copy — we append in place
    timings.append({
        "name": function_name,
        "duration": duration,
        "depth": depth,
        "start_time": start_time if start_time is not None else time.perf_counter()
    })


# ─── Context Manager: Inline Code Block Timing ───
@contextmanager
def track_time(label: str):
    """
    Context manager to track execution time of any code block.
    """
    try:
        frame = inspect.currentframe().f_back.f_back
        caller_function = frame.f_code.co_name if frame else "unknown"
    except Exception:
        caller_function = "unknown"

    log_extras = {
        'servicename': extras.get('servicename', 'CONVERSATIONAL_AI_CHATBOT_CONVERSATIONAL_SERVICE'),
        'functionname': f"{caller_function} -> {label}",
        'projectname': extras.get('projectname', 'CHATBOT'),
        'bot_name': extras.get('bot_name', 'kumaran')
    }

    # Push onto call stack BEFORE starting timer
    stack = call_stack.get()
    depth = len(stack)
    stack.append(label)

    start_time = time.perf_counter()
    try:
        yield
    finally:
        duration = time.perf_counter() - start_time

        # Record timing THEN pop
        add_timing(label, duration, depth, start_time)
        stack.pop()

        # logger.info(
        #     f"[LATENCY] '{label}' took {duration:.4f} seconds",
        #     extra=log_extras
        # )


# ─── Decorator: Async Function Timing ───
def time_async_func(label: str = None):
    """
    Decorator for async functions.
    """
    def decorator(func):
        display_label = label or func.__name__
        log_extras = {
            'servicename': extras.get('servicename', 'CONVERSATIONAL_AI_CHATBOT_CONVERSATIONAL_SERVICE'),
            'functionname': func.__name__,
            'projectname': extras.get('projectname', 'CHATBOT'),
            'bot_name': extras.get('bot_name', 'kumaran')
        }

        @wraps(func)
        async def wrapper(*args, **kwargs):
            stack = call_stack.get()
            depth = len(stack)
            stack.append(display_label)

            start_time = time.perf_counter()
            try:
                return await func(*args, **kwargs)
            finally:
                duration = time.perf_counter() - start_time
                add_timing(display_label, duration, depth, start_time)
                stack.pop()
                # logger.info(
                #     f"[LATENCY] Async Function '{display_label}' took {duration:.4f} seconds",
                #     extra=log_extras
                # )
        return wrapper
    return decorator


# ─── Decorator: Sync Function Timing ───
def time_sync_func(label: str = None):
    """
    Decorator for synchronous functions.
    """
    def decorator(func):
        display_label = label or func.__name__
        log_extras = {
            'servicename': extras.get('servicename', 'CONVERSATIONAL_AI_CHATBOT_CONVERSATIONAL_SERVICE'),
            'functionname': func.__name__,
            'projectname': extras.get('projectname', 'CHATBOT'),
            'bot_name': extras.get('bot_name', 'kumaran')
        }

        @wraps(func)
        def wrapper(*args, **kwargs):
            stack = call_stack.get()
            depth = len(stack)
            stack.append(display_label)

            start_time = time.perf_counter()
            try:
                return func(*args, **kwargs)
            finally:
                duration = time.perf_counter() - start_time
                add_timing(display_label, duration, depth, start_time)
                stack.pop()
                # logger.info(
                #     f"[LATENCY] Sync Function '{display_label}' took {duration:.4f} seconds",
                #     extra=log_extras
                # )
        return wrapper
    return decorator

def log_request_summary():
    timings = request_timings.get()
    if not timings:
        return

    # Calculate total request duration
    start_t = request_start_time.get()
    total_duration = time.perf_counter() - start_t if start_t else None

    # Build request path label
    try:
        from flask import request as flask_request
        request_path = f"{flask_request.method} {flask_request.path}"
    except Exception:
        request_path = "UNKNOWN"

    sorted_timings = sorted(timings, key=lambda x: x.get("start_time", 0))

    column_width = 60
    req_id = request_id.get()
    lines = ["========== REQUEST TIMING TREE =========="]
    lines.append(f"Request-ID: {req_id}")
    if total_duration is not None:
        total_label = f"TOTAL ({request_path})"
        lines.append(f"{total_label:<{column_width}} {total_duration:.3f}s")
        lines.append(f"{'-' * (column_width + 10)}")
    for i, item in enumerate(sorted_timings):
        depth = item['depth']

        # Build ancestor prefix (│ or blank for each ancestor level)
        prefix_parts = []
        for d in range(depth):
            # Check if ancestor at depth d still has siblings after this item
            has_continuation = False
            for j in range(i + 1, len(sorted_timings)):
                if sorted_timings[j]['depth'] <= d:
                    has_continuation = (sorted_timings[j]['depth'] == d)
                    break
            prefix_parts.append("|   " if has_continuation else "    ")

        # Determine if this item is the last sibling at its depth
        is_last = True
        for j in range(i + 1, len(sorted_timings)):
            if sorted_timings[j]['depth'] < depth:
                break
            if sorted_timings[j]['depth'] == depth:
                is_last = False
                break

        connector = "\\-- " if is_last else "|-- "
        full_label = f"{''.join(prefix_parts)}{connector}{item['name']}"
        lines.append(f"{full_label:<{column_width}} {item['duration']:.3f}s  [D{item['depth']}]")
    lines.append("=" * (column_width + 10))

    log_extras = {
        'servicename': extras.get('servicename', 'CONVERSATIONAL_AI_CHATBOT_CONVERSATIONAL_SERVICE'),
        'functionname': 'log_request_summary',
        'projectname': extras.get('projectname', 'CHATBOT'),
        'bot_name': extras.get('bot_name', 'kumaran')
    }
    logger.debug("\n".join(lines), extra=log_extras)
    try:
        for handler in logger.handlers:
            handler.flush()
    except Exception:
        pass