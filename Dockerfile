FROM node:20

SHELL ["/bin/bash", "-c"]

# Install required system dependencies using apt-get for Debian
RUN apt-get update && apt-get install -y jq curl

# Copy scripts and set up functions directory
COPY /docker /scripts
RUN mkdir -p /functions && /scripts/package-restore.sh

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=5s --timeout=10s --start-period=1s --retries=3 \
    CMD [ "sh", "-c", "exec curl -f http://localhost:${HASURA_CONNECTOR_PORT:-8080}/health" ]

# Start command
CMD [ "bash", "/scripts/start.sh" ]
