ARG BASE_IMAGE=shipsec/mcp-stdio-proxy:latest
FROM ${BASE_IMAGE}

RUN apk add --no-cache python3 py3-pip \
  && pip install --no-cache-dir uv

ENV MCP_COMMAND=uvx
ENV MCP_ARGS='["awslabs-cloudwatch-mcp-server"]'
