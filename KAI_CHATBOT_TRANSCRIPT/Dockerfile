FROM python:3.11.5


WORKDIR /app
RUN chgrp -R 0 /app && \
    chmod -R g=u /app

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

RUN pip3 install -r requirements.txt

COPY chat_transcript.py chat_transcript.py
COPY chat.py chat.py
COPY keyvault.py keyvault.py
COPY azure_blob_service.py azure_blob_service.py
COPY logger.py logger.py
COPY ods.py ods.py
COPY utils.py utils.py
COPY tableModels.py tableModels.py
COPY mainqueries.py mainqueries.py
COPY gunicorn_config.py gunicorn_config.py
COPY flags.py flags.py

ENV FLASK_APP=chat_transcript.py

EXPOSE 5000

CMD ["gunicorn","--config", "gunicorn_config.py", "chat_transcript:app"]