FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY ui/package.json ui/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY ui/ .

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY ui/package.json ui/package-lock.json ./

# Install all dependencies (Nitro needs them to run)
RUN npm ci --omit=dev

# Copy built application output
COPY --from=builder /app/.output ./.output

# Copy migrations directory (needed for runtime migrations)
COPY migrations ./migrations

# Expose port
EXPOSE 3030

# Set NODE_ENV
ENV NODE_ENV=production
ENV PORT=3030
ENV HOST=0.0.0.0

# Start the application using Nitro
CMD ["node", ".output/server/index.mjs"]

