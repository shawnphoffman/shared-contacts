#!/usr/bin/env bash
# Detailed PROPFIND to check all CardDAV properties Apple Contacts might need
# Usage: CARDDAV_USER=shawn CARDDAV_PASSWORD=yourpass [CARDDAV_HOST=carddav.lan.goober.house] ./scripts/test-carddav-detailed.sh

set -e
HOST="${CARDDAV_HOST:-carddav.lan.goober.house}"
USER="${CARDDAV_USER:?Set CARDDAV_USER}"
PASS="${CARDDAV_PASSWORD:?Set CARDDAV_PASSWORD}"
URL="https://${HOST}/${USER}/"

echo "=== Detailed PROPFIND Depth:1 on $URL ==="
echo "Requesting: displayname, resourcetype, getcontenttype, supported-address-data, addressbook-description"
echo ""

HTTP=$(curl -s -k -o /tmp/carddav-detailed.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <d:getcontenttype/>
    <c:supported-address-data/>
    <c:addressbook-description/>
  </d:prop>
</d:propfind>' "$URL")

RESP=$(cat /tmp/carddav-detailed.xml)

echo "HTTP status: $HTTP"
if [ "$HTTP" != "207" ]; then
  echo "Unexpected status. Response:"
  echo "$RESP" | head -10
  exit 1
fi

echo ""
echo "=== Formatted XML Response ==="
echo "$RESP" | xmllint --format - 2>/dev/null || echo "$RESP"

echo ""
echo "=== Summary ==="
echo ""
echo "Principal (/shawn/):"
echo "$RESP" | xmllint --xpath '//response[1]' - 2>/dev/null | xmllint --format - 2>/dev/null || echo "Could not parse principal"

echo ""
echo "Address Book Collections:"
for i in 2 3 4; do
  echo ""
  echo "Collection $((i-1)):"
  echo "$RESP" | xmllint --xpath "//response[$i]" - 2>/dev/null | xmllint --format - 2>/dev/null || echo "Could not parse collection $i"
done
