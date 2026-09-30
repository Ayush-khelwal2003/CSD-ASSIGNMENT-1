FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY python_server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY python_server/ ./

ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
