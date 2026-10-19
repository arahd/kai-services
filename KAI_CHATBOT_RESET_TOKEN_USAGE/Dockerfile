FROM python:3.11.5
WORKDIR /app

# Copy your application code
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port (if needed)
EXPOSE 5000

# Run Python unbuffered for immediate log visibility
CMD ["python", "-u", "app.py"]
