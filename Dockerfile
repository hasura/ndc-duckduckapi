FROM node:24.22.1-bookworm

SHELL ["/bin/bash", "-c"]

# Install required system dependencies using apt-get for Debian
RUN apt-get update && apt-get install -y jq curl ca-certificates \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' ca-certificates)" ge 20250419~deb12u2

# Copy scripts and set up functions directory
# Patched Node and the OS store are independent trust inputs; retain OS trust selection.
ENV NODE_OPTIONS="--no-experimental-strip-types --use-openssl-ca --max-old-space-size=4096" \
    SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \
    SSL_CERT_DIR=/etc/ssl/certs

COPY /docker /scripts
RUN mkdir -p /functions && /scripts/package-restore.sh

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=5s --timeout=10s --start-period=1s --retries=3 \
    CMD [ "sh", "-c", "exec curl -f http://localhost:${HASURA_CONNECTOR_PORT:-8080}/health" ]

# Start command
CMD [ "bash", "/scripts/start.sh" ]
