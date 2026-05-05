FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
COPY wheels/ wheels/

# Install dependencies. When running via docker-compose, llama-cpp-python is
# not needed (models are served by separate llama.cpp containers). It is still
# listed in requirements.txt for local/native installs.
RUN pip install --no-cache-dir --find-links wheels -r requirements.txt

COPY . .

RUN mkdir -p /root/.cache/huggingface/hub

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
