# koza web — Next.js standalone image
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

USER koza
EXPOSE 3000

CMD ["node", "server.js"]
