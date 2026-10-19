FROM python:3.11.5-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y curl gcc libc-dev g++ libffi-dev libxml2 unixodbc-dev unixodbc pkg-config

RUN apt-get update && \
    apt-get install -y python3-dev default-libmysqlclient-dev build-essential

RUN curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc \
    && echo "deb [arch=amd64,arm64,armhf] https://packages.microsoft.com/debian/12/prod bookworm main" | tee /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc
 
 

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