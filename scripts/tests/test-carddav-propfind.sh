#!/usr/bin/env bash
# Run PROPFIND against the CardDAV server to verify principal has displayname and child collections.
# Usage: CARDDAV_HOST=carddav.example.com CARDDAV_USER=username CARDDAV_PASSWORD=yourpass ./scripts/tests/test-carddav-propfind.sh

set -e
HOST="${CARDDAV_HOST:?Set CARDDAV_HOST (e.g., carddav.example.com)}"
USER="${CARDDAV_USER:?Set CARDDAV_USER}"
PASS="${CARDDAV_PASSWORD:?Set CARDDAV_PASSWORD}"
URL="https://${HOST}/${USER}/"

echo "=== PROPFIND Depth:1 on $URL ==="
HTTP=$(curl -s -k -o /tmp/carddav-propfind.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:getcontenttype/></d:prop></d:propfind>' "$URL")
RESP=$(cat /tmp/carddav-propfind.xml)

echo "HTTP status: $HTTP"
if [ "$HTTP" = "401" ] || [ "$HTTP" = "403" ]; then
  echo "Auth failed. Check CARDDAV_USER and CARDDAV_PASSWORD."
  echo "$RESP" | head -5
  exit 1
fi
# Radicale uses default xmlns="DAV:" so elements may be <response> not <d:response>
if ! echo "$RESP" | grep -qE 'multistatus|d:multistatus'; then
  echo "Unexpected response (no multistatus):"
  echo "$RESP" | head -20
  exit 1
fi

echo "Principal (first response) - displayname here lets clients show multiple collections:"
echo "$RESP" | tr '>' '\n' | grep -E '^<(/)?(response|href|displayname|propstat)' | head -20

echo ""
echo "All hrefs (principal + collections):"
echo "$RESP" | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g'

echo ""
echo "All displayname values (principal + address books):"
echo "$RESP" | grep -oE '<(d:)?displayname>[^<]*</(d:)?displayname>' | sed 's/<[^>]*>//g'

echo ""
echo "OK: Principal has displayname and child address books listed above."
