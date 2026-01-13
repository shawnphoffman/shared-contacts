# Using the official Radicale Docker image
# This Dockerfile is kept for potential customizations
FROM ghcr.io/kozea/radicale:latest

# Switch to root to create init script
USER root

# Copy custom config if needed
COPY config/config /config/config

# Create init script to handle users file creation
RUN cat > /init-radicale.sh << 'EOF' && chmod +x /init-radicale.sh
#!/bin/sh
if [ ! -f /data/users ]; then
  echo "Creating empty users file..."
  touch /data/users 2>/dev/null || true
  chmod 666 /data/users 2>/dev/null || chmod 644 /data/users 2>/dev/null || true
  echo "Users file created. Add users with: docker exec -it shared-contacts-radicale htpasswd -B /data/users username"
fi
exec /app/bin/python /app/bin/radicale --config /config/config
EOF

# Switch back to the original user (radicale image typically uses a non-root user)
# Check what user the base image uses and switch back if needed
# For now, we'll stay as root to ensure permissions work

