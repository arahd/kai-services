FROM python:3.11.5
WORKDIR /app
ARG APP_VERSION

ENV BUILD_VERSION ${APP_VERSION} 
RUN apt-get update && \
    apt-get install -y libgl1-mesa-glx libglib2.0-0 unixodbc unixodbc-dev && \
    rm -rf /var/lib/apt/lists/*

RUN apt-get update && \
    apt-get install -y python3-dev default-libmysqlclient-dev build-essential
 
RUN curl https://packages.microsoft.com/keys/microsoft.asc | tee /etc/apt/trusted.gpg.d/microsoft.asc \
    && echo "deb [arch=amd64,arm64,armhf] https://packages.microsoft.com/debian/12/prod bookworm main" | tee /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc
RUN odbcinst -q -d
COPY . /app
RUN pip3 install -r requirements.txt

EXPOSE 5000

CMD [ "python3", "-m" , "flask", "run", "--host=0.0.0.0"]