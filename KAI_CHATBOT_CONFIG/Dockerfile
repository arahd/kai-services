FROM python:3.11.5-slim

WORKDIR /app
RUN chgrp -R 0 /app && \
    chmod -R g=u /app

# RUN apt-get update && apt-get install -y curl gcc libc-dev g++ libffi-dev libxml2 unixodbc-dev unixodbc
RUN apt-get update && \
    apt-get install --reinstall -y zlib1g && \
    apt-get install -y curl gcc libc-dev g++ libffi-dev libxml2 unixodbc-dev unixodbc && \
    rm -rf /var/lib/apt/lists/*

RUN curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc \
    && echo "deb [arch=amd64,arm64,armhf] https://packages.microsoft.com/debian/12/prod bookworm main" | tee /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc

ARG APP_VERSION

ENV BUILD_VERSION ${APP_VERSION} 

COPY requirements.txt requirements.txt

RUN pip3 install -r requirements.txt
COPY app.py app.py
COPY vault.py vault.py
COPY mongodb.py mongodb.py
COPY tableModels.py tableModels.py
COPY mainqueries.py mainqueries.py
COPY structure.py structure.py
# COPY base_logger.py base_logger.py
COPY logger.py logger.py

ENV FLASK_APP=app.py
EXPOSE 5000
CMD [ "python3", "-m" , "flask", "run", "--host=0.0.0.0"]