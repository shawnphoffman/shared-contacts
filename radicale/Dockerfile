# Using the official Radicale Docker image
# This Dockerfile is kept for potential customizations
FROM ghcr.io/kozea/radicale:latest

# Switch to root to create init script
USER root

# Copy custom config if needed
COPY config/config /config/config

# Copy init script to handle users file creation
COPY scripts/init-radicale.sh /init-radicale.sh
RUN chmod +x /init-radicale.sh

# Switch back to the original user (radicale image typically uses a non-root user)
# Check what user the base image uses and switch back if needed
# For now, we'll stay as root to ensure permissions work

