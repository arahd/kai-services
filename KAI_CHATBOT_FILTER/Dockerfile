FROM python:3.11.5


WORKDIR /usr/src/app

ARG APP_VERSION

ENV BUILD_VERSION ${APP_VERSION} 

ENV echo  BUILD_VERSION

COPY ./requirements.txt /usr/src/app

RUN apt-get update && apt-get install -y curl gcc libc-dev g++ libffi-dev libxml2 unixodbc-dev unixodbc pkg-config

RUN apt-get update && \
    apt-get install -y python3-dev default-libmysqlclient-dev build-essential

RUN curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc \
    && echo "deb [arch=amd64,arm64,armhf] https://packages.microsoft.com/debian/12/prod bookworm main" | tee /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc

RUN pip install -r requirements.txt
RUN python -m nltk.downloader stopwords punkt


EXPOSE 5000
COPY . /usr/src/app/
CMD uvicorn app.main:app --host 0.0.0.0 --port 5000