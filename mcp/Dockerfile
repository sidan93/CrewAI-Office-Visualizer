FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=18900
ENV MCP_PATH=/mcp
ENV OFFICE_VISUALIZER_API_URL=http://backend:8000
ENV OFFICE_UI_BASE_URL=http://localhost:17300
ENV OFFICE_VISUALIZER_HTTP_TIMEOUT=10

EXPOSE 18900

CMD ["python", "server.py"]
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

CMD ["python", "server.py"]
