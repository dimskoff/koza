# koza server — one tiny container: api + redirects + signaling
FROM node:22-alpine

WORKDIR /app

RUN addgroup -S koza && adduser -S koza -G koza

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY server.js ./

ENV PORT=8787 \
    KOZA_DATA_DIR=/data \
    NODE_ENV=production

RUN mkdir -p /data && chown -R koza:koza /data /app
VOLUME /data
EXPOSE 8787

USER koza
CMD ["node", "server.js"]
