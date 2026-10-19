FROM node:alpine AS builder

WORKDIR /usr/src/app

# Install Chromium for headless Karma unit test execution in Docker CI pipelines
RUN apk add --no-cache chromium fontconfig freetype nss
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_FLAGS="--no-sandbox --disable-gpu --disable-dev-shm-usage"

# Copy dependency specifications first to leverage Docker layer caching
COPY package*.json ./

# Install global Angular CLI and project dependencies
RUN npm install -g @angular/cli
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# -----------------------------------------------------------------------------
# PIPELINE UNIT TEST EXECUTION:
# Runs unit test suite targeting ONLY the active test files in:
#  - src/app/features/chatbot
#  - src/app/features/sidenav
# -----------------------------------------------------------------------------
RUN npm run test:ci

# Build production Angular distribution bundle
RUN npm run build


RUN pwd
RUN ls -ll

# ==========================================
# Stage 2: Production Web Server Stage (Nginx)
# ==========================================
FROM nginx:alpine

# Copy built Angular static assets from builder stage to Nginx web root
COPY --from=builder /usr/src/app/dist/kai/browser /usr/share/nginx/html

# Copy custom Nginx routing configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose HTTP port
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"]