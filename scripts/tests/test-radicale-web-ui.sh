#!/usr/bin/env bash
# Test Radicale web UI collection discovery for composite users
# Usage: CARDDAV_HOST=carddav.example.com CARDDAV_USER=username-bookid CARDDAV_PASSWORD=yourpass ./scripts/tests/test-radicale-web-ui.sh

set -e
HOST="${CARDDAV_HOST:?Set CARDDAV_HOST (e.g., carddav.example.com)}"
USER="${CARDDAV_USER:?Set CARDDAV_USER}"
PASS="${CARDDAV_PASSWORD:?Set CARDDAV_PASSWORD}"
BASE_URL="https://${HOST}"

echo "=== Testing Radicale Web UI Discovery for: $USER ==="
echo ""

# Test 1: What does Radicale return for PROPFIND on / with Depth:1?
echo "--- Test 1: PROPFIND on / (root) Depth:1 ---"
curl -s -k -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/><c:addressbook-home-set/></d:prop></d:propfind>' \
  "${BASE_URL}/" > /tmp/web-ui-root.xml

echo "HTTP status: $(curl -s -k -o /dev/null -w "%{http_code}" -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 1" "${BASE_URL}/")"
echo ""
echo "Collections discovered (href + displayname + resourcetype):"
xmllint --format /tmp/web-ui-root.xml 2>/dev/null | grep -A 5 '<response>' | grep -E '<href>|<displayname>|<resourcetype>' | head -60 || cat /tmp/web-ui-root.xml | head -40
echo ""

# Test 2: Check current-user-principal
echo "--- Test 2: current-user-principal ---"
curl -s -k -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 0" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>' \
  "${BASE_URL}/" | xmllint --format - 2>/dev/null | grep -A 3 'current-user-principal' || echo "Not found"
echo ""

# Test 3: Check addressbook-home-set
echo "--- Test 3: addressbook-home-set ---"
curl -s -k -u "${USER}:${PASS}" -X PROPFIND -H "Depth: 0" -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><c:addressbook-home-set/></d:prop></d:propfind>' \
  "${BASE_URL}/${USER}/" | xmllint --format - 2>/dev/null | grep -A 3 'addressbook-home-set' || echo "Not found"
echo ""

# Test 4: What collections does the web UI actually see?
echo "--- Test 4: Collections with addressbook tag (what web UI should show) ---"
xmllint --format /tmp/web-ui-root.xml 2>/dev/null | grep -B 5 'addressbook' | grep -E '<href>|<displayname>' | head -20 || echo "No addressbook collections found"
echo ""

# Summary
echo "=== Summary ==="
TOTAL_COLLECTIONS=$(xmllint --format /tmp/web-ui-root.xml 2>/dev/null | grep -c '<response>' || echo "0")
ADDRESSBOOK_COLLECTIONS=$(xmllint --format /tmp/web-ui-root.xml 2>/dev/null | grep -c 'addressbook' || echo "0")
echo "Total collections in PROPFIND response: $TOTAL_COLLECTIONS"
echo "Collections with addressbook tag: $ADDRESSBOOK_COLLECTIONS"
echo ""
echo "Collections for user $USER:"
xmllint --format /tmp/web-ui-root.xml 2>/dev/null | grep -B 10 "$USER" | grep -E '<href>|<displayname>' | head -10 || echo "None found"
