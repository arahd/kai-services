import cProfile
import pstats
import io
import os
import time

PROFILE_DIR = "profiler_report"
os.makedirs(PROFILE_DIR, exist_ok=True)


class FlaskProfilerMiddleware:
    """
    WSGI Middleware that profiles every request and saves reports.
    """

    def __init__(self, app, profile_dir=PROFILE_DIR, enabled=True):
        self.app = app
        self.profile_dir = profile_dir
        self.enabled = enabled

    def __call__(self, environ, start_response):
        if not self.enabled:
            return self.app(environ, start_response)

        profiler = cProfile.Profile()
        profiler.enable()

        response = self.app(environ, start_response)

        profiler.disable()

        # Generate a unique filename based on endpoint and timestamp
        path = environ.get("PATH_INFO", "unknown").replace("/", "_").strip("_")
        method = environ.get("REQUEST_METHOD", "GET")
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"{method}_{path}_{timestamp}"

        # Save .prof file (binary - for visualization tools)
        prof_path = os.path.join(self.profile_dir, f"{filename}.prof")
        profiler.dump_stats(prof_path)

        # Save human-readable text report
        txt_path = os.path.join(self.profile_dir, f"{filename}.txt")
        stream = io.StringIO()
        stats = pstats.Stats(profiler, stream=stream)
        stats.sort_stats("cumulative")
        stats.print_stats(50)
        with open(txt_path, "w") as f:
            f.write(stream.getvalue())

        return response