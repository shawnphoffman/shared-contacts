#!/bin/sh
if [ ! -f /data/users ]; then
  echo "Creating empty users file..."
  touch /data/users 2>/dev/null || true
  chmod 666 /data/users 2>/dev/null || chmod 644 /data/users 2>/dev/null || true
  echo "Users file created. Add users with: docker exec -it shared-contacts-radicale htpasswd -B /data/users username"
fi
exec /app/bin/python /app/bin/radicale --config /config/config
