# syntax=docker/dockerfile:1.7

# Production worker image — provider-agnostic.
# Build: docker build -f apps/worker/Dockerfile --target runner -t esign/worker:local .

ARG NODE_VERSION=22.14.0
ARG PNPM_VERSION=9.15.9

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN apk add --no-cache ca-certificates libc6-compat openssl \
  && update-ca-certificates \
  && corepack enable \
  && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

FROM base AS deps
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
ENV NODE_ENV=production
RUN pnpm exec turbo build --filter=@esign/worker... \
  && pnpm --filter @esign/worker --prod deploy /deploy/worker \
  && find /deploy/worker -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete

FROM node:${NODE_VERSION}-alpine AS runner
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED=unknown
LABEL org.opencontainers.image.title="esign-worker" \
  org.opencontainers.image.description="Electronic signature background worker" \
  org.opencontainers.image.source="https://github.com/rudzy123/bug-free-fiesta" \
  org.opencontainers.image.revision="${BUILD_REVISION}" \
  org.opencontainers.image.created="${BUILD_CREATED}" \
  org.opencontainers.image.licenses="UNLICENSED" \
  org.opencontainers.image.vendor="esign"
RUN apk add --no-cache ca-certificates libc6-compat openssl \
  && update-ca-certificates \
  && addgroup -S esign \
  && adduser -S -G esign -H -D esign \
  && mkdir -p /tmp/esign \
  && chown -R esign:esign /tmp/esign
WORKDIR /app
ENV NODE_ENV=production \
  WORKER_HEALTH_HOST=0.0.0.0 \
  WORKER_HEALTH_PORT=4100 \
  TMPDIR=/tmp/esign \
  HOME=/tmp/esign
COPY --from=build --chown=esign:esign /deploy/worker/ ./
USER esign
EXPOSE 4100
VOLUME ["/tmp/esign"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
