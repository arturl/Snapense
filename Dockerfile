FROM node:20-slim AS base
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
RUN npm ci

# Copy source
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
COPY packages/web ./packages/web

# Build shared first, then api and web
RUN npm run build --workspace=packages/shared

ARG VITE_ENTRA_CLIENT_ID
ENV VITE_ENTRA_CLIENT_ID=${VITE_ENTRA_CLIENT_ID}
RUN npm run build --workspace=packages/web

RUN npm run build --workspace=packages/api

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "packages/api/dist/index.js"]
