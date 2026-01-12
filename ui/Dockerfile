FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY ui/package.json ui/pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY ui/ .

# Build the application
RUN pnpm build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY ui/package.json ui/pnpm-lock.yaml ./

# Install all dependencies (Nitro needs them to run)
RUN pnpm install --frozen-lockfile --prod

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

