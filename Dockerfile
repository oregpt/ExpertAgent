# =============================================================================
# Agent-in-a-Box Dockerfile
# =============================================================================
# Multi-stage build for production deployment

# -----------------------------------------------------------------------------
# Stage 1: Build the web frontend
# -----------------------------------------------------------------------------
FROM node:20-alpine AS web-builder

WORKDIR /app/web

# Copy web package files
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy web source
COPY web/ ./

# Build the frontend (outputs to dist/)
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Build the server
# -----------------------------------------------------------------------------
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# Copy server package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy server source
COPY server/ ./

# Build TypeScript (outputs to dist/)
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Production image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies for server
COPY server/package*.json ./
RUN npm ci --only=production

# Copy built server
COPY --from=server-builder /app/server/dist ./dist

# Copy built web frontend (server will serve these)
COPY --from=web-builder /app/web/dist ./public

# Copy server public files (widget.js, etc.) - these override/extend the web build
COPY server/public/ ./public/
# Create uploads directory
RUN mkdir -p uploads/kb

# Set environment
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Run the server
CMD ["node", "dist/index.js"]
