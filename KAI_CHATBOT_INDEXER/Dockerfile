FROM python:3.11.5-slim

WORKDIR /app

RUN apt update && apt install default-jdk -y && apt install tidy -y

RUN chgrp -R 0 /app && \
    chmod -R g=u /app

RUN apt-get update && apt-get install -y \
    default-jre \
    && apt-get clean

COPY . /app

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Expose po
EXPOSE 5000

# Set environment variable for Flask
ENV PYTHONUNBUFFERED=1 \
    FLASK_APP=app.py \
    FLASK_ENV=development

# Use Gunicorn with async workers
CMD ["gunicorn", "-w", "1", "--threads", "4", "-b", "0.0.0.0:5000", "--timeout", "300", "--max-requests", "500", "--max-requests-jitter", "50", "app:app"]
# CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:5000", "app:app"]
