FROM python:3.11.9


WORKDIR /chatbot
RUN chgrp -R 0 /chatbot && \
    chmod -R g=u /chatbot 
    
RUN apt-get update && apt-get install -y curl gcc libc-dev g++ libffi-dev libxml2 unixodbc-dev unixodbc pkg-config

RUN apt-get update && \
    apt-get install -y python3-dev default-libmysqlclient-dev build-essential

RUN curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc \
    && echo "deb [arch=amd64,arm64,armhf] https://packages.microsoft.com/debian/12/prod bookworm main" | tee /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc

ARG APP_VERSION

ENV BUILD_VERSION ${APP_VERSION} 

COPY requirements.txt requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt


COPY . /chatbot

EXPOSE 5000

ENV FLASK_APP=app.py

CMD ["gunicorn","--config", "gunicorn_config.py","--preload", "app:app"]