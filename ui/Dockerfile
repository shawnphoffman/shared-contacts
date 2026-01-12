FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (Nitro needs them to run)
RUN pnpm install --frozen-lockfile --prod

# Copy built application output
COPY --from=builder /app/.output ./.output

# Expose port
EXPOSE 3030

# Set NODE_ENV
ENV NODE_ENV=production
ENV PORT=3030
ENV HOST=0.0.0.0

# Start the application using Nitro
CMD ["node", ".output/server/index.mjs"]

