# koza api — redirects, room registry, signaling & relay in one small process
FROM node:22-alpine
WORKDIR /app

RUN addgroup -S koza && adduser -S koza -G koza

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./

ENV PORT=8787 \
    KOZA_DATA_DIR=/data \
    NODE_ENV=production

RUN mkdir -p /data && chown -R koza:koza /data /app
VOLUME /data
EXPOSE 8787

USER koza
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/healthz >/dev/null || exit 1

CMD ["node", "server.js"]
