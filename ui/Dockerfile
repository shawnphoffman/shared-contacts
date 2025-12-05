FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY app.config.ts ./

# Install dependencies
RUN npm ci

# Copy source code
COPY app ./app

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application
COPY --from=builder /app/.output ./.output

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", ".output/server/index.js"]

