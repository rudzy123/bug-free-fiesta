# syntax=docker/dockerfile:1.7

# Production web image — Next.js standalone, provider-agnostic.
# Build: docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t esign/web:local .
# NEXT_PUBLIC_API_BASE_URL is a public build-time value (not a secret).

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
ARG NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NODE_ENV=production
RUN pnpm exec turbo build --filter=@esign/web...

FROM node:${NODE_VERSION}-alpine AS runner
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED=unknown
ARG NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
LABEL org.opencontainers.image.title="esign-web" \
  org.opencontainers.image.description="Electronic signature Next.js web UI" \
  org.opencontainers.image.source="https://github.com/rudzy123/bug-free-fiesta" \
  org.opencontainers.image.revision="${BUILD_REVISION}" \
  org.opencontainers.image.created="${BUILD_CREATED}" \
  org.opencontainers.image.licenses="UNLICENSED" \
  org.opencontainers.image.vendor="esign"
RUN apk add --no-cache ca-certificates libc6-compat \
  && apk upgrade --no-cache \
  && update-ca-certificates \
  && addgroup -S esign \
  && adduser -S -G esign -H -D esign \
  && mkdir -p /tmp/esign /app/apps/web/.next/cache \
  && chown -R esign:esign /tmp/esign /app \
  && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  TMPDIR=/tmp/esign \
  HOME=/tmp/esign \
  NEXT_TELEMETRY_DISABLED=1 \
  NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
# Standalone tracing output for this monorepo layout.
COPY --from=build --chown=esign:esign /app/apps/web/.next/standalone ./
COPY --from=build --chown=esign:esign /app/apps/web/.next/static ./apps/web/.next/static
USER esign
EXPOSE 3000
VOLUME ["/tmp/esign"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
