# syntax=docker/dockerfile:1

FROM node:26.7.0-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
ENV DATABASE_URL=postgresql://esign:esign_dev_password@localhost:5432/esign
ENV NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
RUN pnpm install --frozen-lockfile --prod=false
# Build @esign/api and all of its workspace dependencies in topological order.
RUN pnpm exec turbo build --filter=@esign/api

FROM node:26.7.0-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
