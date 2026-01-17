FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY sync-service/package*.json ./
COPY sync-service/tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY sync-service/src ./src

# Copy migrations directory (needed for runtime migrations)
COPY migrations ./migrations

# Build TypeScript
RUN npm run build

# Expose port (if needed in future)
# EXPOSE 3001

# Start the service
CMD ["npm", "start"]

