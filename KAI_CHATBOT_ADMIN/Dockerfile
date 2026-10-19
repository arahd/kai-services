FROM python:3.11.5

WORKDIR /app
RUN chgrp -R 0 /app && \
    chmod -R g=u /app

ARG APP_VERSION

ENV BUILD_VERSION ${APP_VERSION} 

RUN echo ${BUILD_VERSION} ${APP_VERSION}

# Install necessary system dependencies
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

# Copy the Python requirements file and install dependencies
COPY requirements.txt requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt

# Download NLTK data
RUN python -m nltk.downloader stopwords punkt

COPY . /app

EXPOSE 5000

ENV FLASK_APP=app.py


# Set the command to run the Flask application
CMD [ "python3", "-m" , "flask", "run", "--host=0.0.0.0"]