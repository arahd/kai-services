import os

workers = int(os.environ.get('GUNICORN_PROCESSES', '4'))
threads = int(os.environ.get('GUNICORN_THREADS', '8'))
bind = os.environ.get('GUNICORN_BIND', '0.0.0.0:5000')
loglevel = 'debug'
errorlog = '-'  # Direct error logs to stdout
accesslog = '-'  # Direct access logs to stdout
forwarded_allow_ips = '*'
secure_scheme_headers = { 'X-Forwarded-Proto': 'https' }