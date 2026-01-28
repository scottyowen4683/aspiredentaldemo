# Multi-stage Dockerfile for Aspire AI Services
# Stage 1: Build React frontend
# Stage 2: Run Node.js backend with built frontend

# ============================================
# Stage 1: Build the React Frontend
# ============================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy frontend source code
COPY frontend/ ./

# Build the React app (outputs to ../public which is /app/public)
RUN npm run build

# ============================================
# Stage 2: Production Node.js Backend
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy backend source code
COPY . .

# Remove frontend source (we only need the built files)
RUN rm -rf frontend public

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/public ./public

# Debug: List what's in public folder
RUN ls -la ./public/ || echo "Public folder created during build"

# Expose port (Fly.io sets PORT env var to 8080)
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["npm", "start"]
