FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
COPY wheels/ wheels/

# Use a pre-built wheel if one is compatible with this platform, otherwise build from source
RUN pip install --no-cache-dir --find-links wheels -r requirements.txt

COPY . .

RUN mkdir -p /root/.cache/huggingface/hub

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
