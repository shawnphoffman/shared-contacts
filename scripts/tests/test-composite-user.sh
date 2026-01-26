#!/usr/bin/env bash
# Test composite user CardDAV access and collection discovery
# Usage: CARDDAV_HOST=carddav.example.com CARDDAV_USER=username-bookid CARDDAV_PASSWORD=yourpass ./scripts/tests/test-composite-user.sh

set -e
HOST="${CARDDAV_HOST:?Set CARDDAV_HOST (e.g., carddav.example.com)}"
USER="${CARDDAV_USER:?Set CARDDAV_USER (composite username in format username-bookid)}"
PASS="${CARDDAV_PASSWORD:?Set CARDDAV_PASSWORD}"
BASE_URL="https://${HOST}"

# Extract base username and book ID from composite username
if [[ ! "$USER" =~ ^(.+)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$ ]]; then
  echo "Error: USER must be a composite username (username-bookid format)"
  echo "Example: username-12345678-1234-1234-1234-123456789012"
  exit 1
fi

BASE_USERNAME="${BASH_REMATCH[1]}"
BOOK_ID="${BASH_REMATCH[2]}"
COMPOSITE_PATH="/${USER}/"

echo "=== Testing Composite User: $USER ==="
echo "Base username: $BASE_USERNAME"
echo "Book ID: $BOOK_ID"
echo "Expected path: $COMPOSITE_PATH"
echo ""

# Test 1: PROPFIND on root (should show principal)
echo "--- Test 1: PROPFIND on / (root) ---"
HTTP=$(curl -s -k -o /tmp/test-root.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 0" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/><d:current-user-principal/></d:prop></d:propfind>' \
  "${BASE_URL}/")
echo "HTTP status: $HTTP"
if [ "$HTTP" = "207" ]; then
  echo "Response:"
  cat /tmp/test-root.xml | xmllint --format - 2>/dev/null | head -30 || cat /tmp/test-root.xml | head -20
else
  echo "Response:"
  cat /tmp/test-root.xml | head -10
fi
echo ""

# Test 2: PROPFIND on composite user path (should show address book collection)
echo "--- Test 2: PROPFIND on $COMPOSITE_PATH (composite user path) ---"
HTTP=$(curl -s -k -o /tmp/test-composite.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 0" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/><c:supported-address-data/></d:prop></d:propfind>' \
  "${BASE_URL}${COMPOSITE_PATH}")
echo "HTTP status: $HTTP"
if [ "$HTTP" = "207" ]; then
  echo "Response:"
  cat /tmp/test-composite.xml | xmllint --format - 2>/dev/null | head -40 || cat /tmp/test-composite.xml | head -30
  echo ""
  echo "Displayname:"
  cat /tmp/test-composite.xml | grep -oE '<(d:)?displayname>[^<]*</(d:)?displayname>' | sed 's/<[^>]*>//g' || echo "Not found"
  echo "Resourcetype:"
  cat /tmp/test-composite.xml | grep -oE '<(d:)?resourcetype[^>]*>.*?</(d:)?resourcetype>' | head -3 || echo "Not found"
else
  echo "Response:"
  cat /tmp/test-composite.xml | head -10
fi
echo ""

# Test 3: PROPFIND Depth:1 to see child collections
echo "--- Test 3: PROPFIND Depth:1 on $COMPOSITE_PATH (should show vCard files) ---"
HTTP=$(curl -s -k -o /tmp/test-depth1.xml -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
  "${BASE_URL}${COMPOSITE_PATH}")
echo "HTTP status: $HTTP"
if [ "$HTTP" = "207" ]; then
  echo "Number of responses:"
  cat /tmp/test-depth1.xml | grep -o '<response>' | wc -l || echo "0"
  echo ""
  echo "Hrefs found:"
  cat /tmp/test-depth1.xml | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | head -20
  echo ""
  echo "vCard files (.vcf):"
  cat /tmp/test-depth1.xml | grep -oE '<(d:)?href>[^<]*\.vcf</(d:)?href>' | sed 's/<[^>]*>//g' | wc -l || echo "0"
else
  echo "Response:"
  cat /tmp/test-depth1.xml | head -10
fi
echo ""

# Test 4: Compare with base user
echo "--- Test 4: Compare with base user ($BASE_USERNAME) ---"
echo "PROPFIND on /${BASE_USERNAME}/ (base user path):"
HTTP_BASE=$(curl -s -k -o /tmp/test-base.xml -w "%{http_code}" -u "${BASE_USERNAME}:${PASS}" -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
  "${BASE_URL}/${BASE_USERNAME}/")
echo "HTTP status: $HTTP_BASE"
if [ "$HTTP_BASE" = "207" ]; then
  echo "Hrefs found:"
  cat /tmp/test-base.xml | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | head -10
fi
echo ""

# Summary
echo "=== Summary ==="
echo "Composite user $USER:"
if [ "$HTTP" = "207" ]; then
  echo "  ✓ PROPFIND on $COMPOSITE_PATH returns 207 (collection exists)"
else
  echo "  ✗ PROPFIND on $COMPOSITE_PATH returns $HTTP (collection missing or inaccessible)"
fi

if [ -f /tmp/test-composite.xml ]; then
  HAS_DISPLAYNAME=$(cat /tmp/test-composite.xml | grep -c 'displayname' || echo "0")
  HAS_ADDRESSBOOK=$(cat /tmp/test-composite.xml | grep -c 'addressbook' || echo "0")
  echo "  Displayname present: $HAS_DISPLAYNAME"
  echo "  Addressbook tag present: $HAS_ADDRESSBOOK"
fi
