FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY app.config.ts ./

# Install dependencies
# Using npm install to handle potential lock file version mismatches
RUN npm install --no-audit

# Copy patches directory if it exists and apply them
COPY patches ./patches/
RUN npm run postinstall || true

# Copy source code
COPY app ./app

# Build the application
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files from builder to ensure lock file matches
COPY --from=builder /app/package*.json ./

# Install production dependencies only
# Using npm install instead of npm ci to handle lock file inconsistencies
RUN npm install --omit=dev --prefer-offline --no-audit

# Copy built application output
COPY --from=builder /app/.output ./.output

# Copy config file (needed by vinxi)
COPY --from=builder /app/app.config.ts ./app.config.ts

# Expose port
EXPOSE 3010

# Set NODE_ENV
ENV NODE_ENV=production

# Start the application using vinxi
CMD ["npm", "start"]

