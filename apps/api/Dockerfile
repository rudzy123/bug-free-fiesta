# syntax=docker/dockerfile:1.7

# Production API image — provider-agnostic.
# Build: docker build -f apps/api/Dockerfile --target runner -t esign/api:local .
# Migrate one-shot: docker build -f apps/api/Dockerfile --target migrate -t esign/migrate:local .

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
# Prisma generate during install/build needs a URL shape only — never a real secret.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile --prod=false

FROM deps AS build
ENV NODE_ENV=production
RUN pnpm exec turbo build --filter=@esign/api... \
  && pnpm --filter @esign/api --prod deploy /deploy/api \
  && find /deploy/api -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete

# One-shot migration image (not the default runtime target).
FROM deps AS migrate
RUN addgroup -S esign && adduser -S -G esign -H -D esign \
  && chown -R esign:esign /app
USER esign
ENV NODE_ENV=production
WORKDIR /app
ENTRYPOINT ["pnpm", "--filter", "@esign/database", "exec", "prisma", "migrate", "deploy"]

FROM node:${NODE_VERSION}-alpine AS runner
ARG BUILD_REVISION=unknown
ARG BUILD_CREATED=unknown
LABEL org.opencontainers.image.title="esign-api" \
  org.opencontainers.image.description="Electronic signature HTTP API" \
  org.opencontainers.image.source="https://github.com/rudzy123/bug-free-fiesta" \
  org.opencontainers.image.revision="${BUILD_REVISION}" \
  org.opencontainers.image.created="${BUILD_CREATED}" \
  org.opencontainers.image.licenses="UNLICENSED" \
  org.opencontainers.image.vendor="esign"
# Runtime needs only the Node binary. Strip the image's bundled npm/corepack
# (source of tar/minimatch/glob CVEs) and upgrade Alpine packages (musl/zlib).
RUN apk add --no-cache ca-certificates libc6-compat openssl \
  && apk upgrade --no-cache \
  && update-ca-certificates \
  && addgroup -S esign \
  && adduser -S -G esign -H -D esign \
  && mkdir -p /tmp/esign \
  && chown -R esign:esign /tmp/esign \
  && rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/corepack
WORKDIR /app
ENV NODE_ENV=production \
  API_HOST=0.0.0.0 \
  API_PORT=4000 \
  TMPDIR=/tmp/esign \
  HOME=/tmp/esign
COPY --from=build --chown=esign:esign /deploy/api/ ./
USER esign
EXPOSE 4000
VOLUME ["/tmp/esign"]
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
