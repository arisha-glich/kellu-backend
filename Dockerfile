# Use Bun image as base
FROM oven/bun:1.2-slim AS base

# Prisma engines need OpenSSL at install/runtime on slim images
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and lockfile for dependency installation
COPY package.json ./
COPY bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Build stage
FROM base AS build

# Prisma + Zod generator config
COPY prisma ./prisma
COPY zod.config.json ./

# App source first — prisma generate writes into src/generated and src/zod
COPY src ./src
COPY tsconfig.json* ./

# Generate Prisma client + Zod schemas (must run after src is present)
RUN bun run db:generate

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1.2-slim AS production

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunjs

# Copy only the built application
COPY --from=build --chown=bunjs:bunjs /app/dist ./dist

# Switch to non-root user
USER bunjs

# Expose port (adjust if your app uses a different port)
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run the bundled application
CMD ["bun", "dist/index.js"]
