# ---------- Stage 1: Build the frontend ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests first for better layer caching
COPY playllm/package.json playllm/package-lock.json ./

# Install dependencies (lockfile is slightly out of sync, so use install)
RUN npm install --no-audit --no-fund

# Copy the rest of the frontend source
COPY playllm/ ./

# Build the frontend (tsc && vite build) -> outputs to ./dist
RUN npm run build

# ---------- Stage 2: Runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy the Node.js server (serves static files + /api endpoints)
COPY --from=builder /app/server/index.mjs ./server/

# Copy the built frontend assets
COPY --from=builder /app/dist ./dist/

# Create a directory for persistent graph/user data
RUN mkdir -p server-data/users server-data/graphs

# Bind to all interfaces so the container is reachable from the host
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Persist user/graph data across container restarts
VOLUME ["/app/server-data"]

# Start the unified Node.js server (static + API)
CMD ["node", "server/index.mjs"]
