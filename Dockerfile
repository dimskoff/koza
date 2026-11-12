# koza web — Next.js standalone image
# build:  docker build -t koza-web .
FROM oven/bun:1.2-alpine AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=2048"
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S koza && adduser -S koza -G koza

COPY --from=build --chown=koza:koza /app/.next/standalone ./
COPY --from=build --chown=koza:koza /app/.next/static ./.next/static
COPY --from=build --chown=koza:koza /app/public ./public

USER koza
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/policy >/dev/null || exit 1

CMD ["node", "server.js"]
