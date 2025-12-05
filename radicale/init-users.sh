#!/bin/sh
# Initialize Radicale users file if it doesn't exist

USERS_FILE="/data/users"

if [ ! -f "$USERS_FILE" ]; then
  echo "Creating empty users file at $USERS_FILE"
  touch "$USERS_FILE"
  chmod 644 "$USERS_FILE"
  echo "Users file created. You can add users with: htpasswd -B $USERS_FILE username"
fi

exec "$@"

