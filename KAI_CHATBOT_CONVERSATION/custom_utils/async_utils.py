import asyncio
from logger import logger,get_caller_frame,extras
from concurrent.futures import ThreadPoolExecutor

SERVICE_NAME='KAI_CHATBOT_CONVERSATIONAL_SERVICE'
PROJECT_NAME='KAI'

_executor = ThreadPoolExecutor(max_workers=4)

def run_async_function(async_func, timeout=420, *args, **kwargs):
    """
    Helper function to run async functions in synchronous contexts (like Flask)
    
    Args:
        async_func: The async function to execute
        timeout: Maximum execution time in seconds (default: 420 = 7 minutes)
        *args, **kwargs: Arguments to pass to the async function
    
    Returns:
        Result of the async function execution
        
    Raises:
        TimeoutError: If execution exceeds the timeout
        RuntimeError: If there are event loop issues
    """
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    
    try:
        # Try to get existing event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If loop is running, use thread pool with timeout
            future = _executor.submit(asyncio.run, async_func(*args, **kwargs))
            return future.result(timeout=timeout)
        else:
            # If no loop is running, create new one
            return asyncio.run(async_func(*args, **kwargs))
    except RuntimeError:
        # If no loop exists, create new one
        return asyncio.run(async_func(*args, **kwargs))
    except Exception as e:
        logger.exception(f"Error in run_async_function: {e}", extra=extras)
        raise

def shutdown_async_executor():
    """Cleanup function to shutdown the thread pool executor"""
    extras = {
        'servicename': SERVICE_NAME,
        'functionname': get_caller_frame().f_code.co_name,
        'projectname': PROJECT_NAME,
        'bot_name':'kumaran'
    }
    global _executor
    if _executor:
        _executor.shutdown(wait=True)
        logger.info("Async executor shutdown completed", extra=extras)

# Timeout constants for different operations
class AsyncTimeouts:
    DEFAULT_TIMEOUT = 420  # 7 minutes default
    CHAT_TIMEOUT = 420  # 7 minutes for chat operations
    FOLLOWUP_TIMEOUT = 420  # 7 minutes for follow-up questions

