# Use Bun image as base
FROM oven/bun:1.2-slim AS base

# Prisma engines need OpenSSL at install/runtime on slim images
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY bun.lock* ./

RUN bun install --frozen-lockfile

# Build stage — generate Prisma + Zod only (do not bundle: Prisma cannot run inside a bun bundle)
FROM base AS build

COPY prisma ./prisma
COPY zod.config.json ./
COPY src ./src
COPY tsconfig.json* ./

RUN bun run db:generate

# Production — run TypeScript with real node_modules so Prisma native engine loads correctly
FROM oven/bun:1.2-slim AS production

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunjs

COPY --from=build /app/package.json ./
COPY --from=build /app/bun.lock* ./
RUN bun install --frozen-lockfile --production && chown -R bunjs:bunjs /app

COPY --from=build --chown=bunjs:bunjs /app/src ./src
COPY --from=build --chown=bunjs:bunjs /app/tsconfig.json ./
COPY --from=build --chown=bunjs:bunjs /app/prisma ./prisma

USER bunjs

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "bun run db:deploy && bun src/index.ts"]
