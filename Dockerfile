# AuditOps production image for GitHub web uploads (source bundled in auditops-source.zip)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY auditops-source.zip /tmp/auditops-source.zip
RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip \
    && unzip -q /tmp/auditops-source.zip -d /app \
    && rm -f /tmp/auditops-source.zip \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --no-audit --no-fund
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    AUDITOPS_DB_PATH=/app/data/auditops.sqlite
RUN groupadd --system --gid 10001 auditops \
    && useradd --system --uid 10001 --gid auditops --home-dir /app --shell /usr/sbin/nologin auditops \
    && mkdir -p /app/data \
    && chown auditops:auditops /app/data \
    && chmod 0700 /app/data
COPY --from=build --chown=auditops:auditops /app/.output ./.output
USER auditops
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
