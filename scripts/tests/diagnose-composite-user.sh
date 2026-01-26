#!/usr/bin/env bash
# Comprehensive diagnostic script for composite user issues
# Usage: CARDDAV_HOST=carddav.example.com CARDDAV_USER=username-bookid CARDDAV_PASSWORD=yourpass ./scripts/tests/diagnose-composite-user.sh

set -e
HOST="${CARDDAV_HOST:?Set CARDDAV_HOST (e.g., carddav.example.com)}"
USER="${CARDDAV_USER:?Set CARDDAV_USER}"
PASS="${CARDDAV_PASSWORD:?Set CARDDAV_PASSWORD}"
BASE_URL="https://${HOST}"

# Extract base username and book ID
if [[ ! "$USER" =~ ^(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$ ]]; then
  echo "Error: USER must be a composite username (username-bookid format)"
  exit 1
fi

BASE_USERNAME="${BASH_REMATCH[1]}"
BOOK_ID="${BASH_REMATCH[2]}"
COMPOSITE_PATH="/${USER}/"

echo "=== Comprehensive Composite User Diagnostic ==="
echo "Composite user: $USER"
echo "Base username: $BASE_USERNAME"
echo "Book ID: $BOOK_ID"
echo "Expected path: $COMPOSITE_PATH"
echo ""

# Test 1: Collection exists and is accessible
echo "--- Test 1: Collection Accessibility ---"
HTTP=$(curl -s -k -o /tmp/diag-collection.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 0" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/><c:supported-address-data/></d:prop></d:propfind>' \
  "${BASE_URL}${COMPOSITE_PATH}")
echo "HTTP status: $HTTP"
if [ "$HTTP" = "207" ]; then
  DISPLAYNAME=$(xmllint --format /tmp/diag-collection.xml 2>/dev/null | grep -oE '<(d:)?displayname>[^<]*</(d:)?displayname>' | sed 's/<[^>]*>//g' | head -1)
  HAS_PRINCIPAL=$(xmllint --format /tmp/diag-collection.xml 2>/dev/null | grep -c 'principal' || echo "0")
  HAS_ADDRESSBOOK=$(xmllint --format /tmp/diag-collection.xml 2>/dev/null | grep -c 'addressbook' || echo "0")
  echo "  Displayname: $DISPLAYNAME"
  echo "  Has principal tag: $HAS_PRINCIPAL"
  echo "  Has addressbook tag: $HAS_ADDRESSBOOK"
else
  echo "  ✗ Collection not accessible"
fi
echo ""

# Test 2: vCard files in collection
echo "--- Test 2: vCard Files in Collection ---"
HTTP=$(curl -s -k -o /tmp/diag-depth1.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>' \
  "${BASE_URL}${COMPOSITE_PATH}")
if [ "$HTTP" = "207" ]; then
  VCF_COUNT=$(xmllint --format /tmp/diag-depth1.xml 2>/dev/null | grep -c '\.vcf' || echo "0")
  echo "  vCard files found: $VCF_COUNT"
  if [ "$VCF_COUNT" -gt "0" ]; then
    echo "  Sample vCard files:"
    xmllint --format /tmp/diag-depth1.xml 2>/dev/null | grep -oE '<(d:)?href>[^<]*\.vcf</(d:)?href>' | sed 's/<[^>]*>//g' | head -5
  fi
else
  echo "  ✗ Cannot list collection contents"
fi
echo ""

# Test 3: Compare with base user
echo "--- Test 3: Compare with Base User ($BASE_USERNAME) ---"
HTTP_BASE=$(curl -s -k -o /tmp/diag-base.xml -w "%{http_code}" -u "${BASE_USERNAME}:${PASS}" -X PROPFIND -H "Depth: 1" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
  "${BASE_URL}/${BASE_USERNAME}/")
if [ "$HTTP_BASE" = "207" ]; then
  BASE_COLLECTIONS=$(xmllint --format /tmp/diag-base.xml 2>/dev/null | grep -c 'addressbook' || echo "0")
  echo "  Base user collections: $BASE_COLLECTIONS"
  echo "  Base user collection paths:"
  xmllint --format /tmp/diag-base.xml 2>/dev/null | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | grep -v '^/$' | head -5
fi
echo ""

# Test 4: Web UI discovery (PROPFIND on /)
echo "--- Test 4: Web UI Collection Discovery (PROPFIND on /) ---"
HTTP_ROOT=$(curl -s -k -o /tmp/diag-root.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
  "${BASE_URL}/")
if [ "$HTTP_ROOT" = "207" ]; then
  ROOT_ADDRESSBOOKS=$(xmllint --format /tmp/diag-root.xml 2>/dev/null | grep -B 5 'addressbook' | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | grep -v '^/$' || echo "")
  echo "  Addressbook collections visible from root:"
  echo "$ROOT_ADDRESSBOOKS" | head -10
  echo ""
  USER_COLLECTION_VISIBLE=$(echo "$ROOT_ADDRESSBOOKS" | grep -c "$USER" || echo "0")
  echo "  Composite user collection visible: $USER_COLLECTION_VISIBLE"
fi
echo ""

# Test 5: Principal and addressbook-home-set
echo "--- Test 5: Principal Discovery ---"
curl -s -k -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 0" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:current-user-principal/><c:addressbook-home-set/></d:prop></d:propfind>' \
  "${BASE_URL}/" | xmllint --format - 2>/dev/null | grep -A 2 -E 'current-user-principal|addressbook-home-set' | head -10
echo ""

# Summary
echo "=== Diagnostic Summary ==="
echo "Collection accessible: $([ "$HTTP" = "207" ] && echo "YES" || echo "NO")"
echo "vCard files present: $([ "$VCF_COUNT" -gt "0" ] && echo "YES ($VCF_COUNT)" || echo "NO")"
echo "Visible in web UI discovery: $([ "$USER_COLLECTION_VISIBLE" -gt "0" ] && echo "YES" || echo "NO")"
echo ""
echo "Expected behavior:"
echo "  - Collection should be accessible: YES"
echo "  - Collection should have vCard files: YES"
echo "  - Web UI may not show it (Radicale limitation with principal=addressbook)"
echo "  - CardDAV clients (Apple Contacts) should work via direct path"
