FROM python:3.11.5-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    build-essential \
    curl \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

ENV FLASK_APP=app.py
EXPOSE 5000

CMD ["flask", "run", "--host=0.0.0.0", "--port=5000"]