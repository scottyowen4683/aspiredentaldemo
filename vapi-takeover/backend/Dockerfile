# Multi-stage Dockerfile for Aspire AI Platform
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

# Build arguments for Supabase config (passed at build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Set environment variables for Vite build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

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

# Remove the frontend source and any existing public folder
RUN rm -rf frontend public

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/public ./public

# Debug: List what's in public folder
RUN ls -la ./public/ && head -20 ./public/index.html

# Expose port (Fly.io sets PORT env var to 8080)
EXPOSE 8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["npm", "start"]
