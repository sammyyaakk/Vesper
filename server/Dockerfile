# API image. Build: docker build -t vesper-api server
FROM node:26-slim AS base
# Prisma's query engine needs OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Full install (dev tools included): compiles the app. Also used as the one-off migration job, which needs the Prisma CLI.
FROM base AS build
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate
COPY . .
RUN npx tsc -p tsconfig.build.json

# Production dependencies only; the generated Prisma client is copied over from the build stage
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS runtime
ENV NODE_ENV=production PORT=5000
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:' + process.env.PORT + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/server.js"]
