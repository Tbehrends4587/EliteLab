FROM python:3.12-slim

LABEL org.opencontainers.image.title="EliteLab" \
      org.opencontainers.image.description="Self-hosted, modular live dashboard for Elite Dangerous with an AI-facing API" \
      org.opencontainers.image.source="https://github.com/MaverickArcane/EliteLab"

WORKDIR /app
COPY elitelab ./elitelab
COPY modules ./modules
COPY web ./web

# Journals are mounted read-only at /journals; persistent data (wishlists) at /data (see docker-compose.yml).
ENV ELITELAB_HOST=0.0.0.0 \
    ELITELAB_PORT=8766 \
    ELITELAB_JOURNAL_DIR=/journals \
    ELITELAB_DATA_DIR=/data \
    ELITELAB_INSTANCE_DIR=/tmp/elitelab-instance \
    PYTHONUNBUFFERED=1

# nobody has no writable home; the desktop instance lock needs its own directory.
RUN mkdir -p /data /tmp/elitelab-instance && chown nobody /data /tmp/elitelab-instance
EXPOSE 8766
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8766/api/health', timeout=4).status==200 else 1)"

USER nobody
CMD ["python", "-m", "elitelab", "serve"]
