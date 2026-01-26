#!/usr/bin/env bash
# Comprehensive CardDAV test script - persists for future debugging
# Tests both base users and composite users to verify correct behavior
# Usage: CARDDAV_HOST=carddav.example.com CARDDAV_BASE_USER=username CARDDAV_PASSWORD=yourpass ./scripts/tests/test-carddav-comprehensive.sh

set -e
HOST="${CARDDAV_HOST:?Set CARDDAV_HOST (e.g., carddav.example.com)}"
BASE_USER="${CARDDAV_BASE_USER:?Set CARDDAV_BASE_USER (e.g., username)}"
PASS="${CARDDAV_PASSWORD:?Set CARDDAV_PASSWORD}"
BASE_URL="https://${HOST}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="test-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/carddav-test-${TIMESTAMP}.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Comprehensive CardDAV Test - $(date) ==="
echo "Host: $HOST"
echo "Base user: $BASE_USER"
echo "Log file: $LOG_FILE"
echo ""

# Test 1: Base user discovery
echo "--- Test 1: Base User ($BASE_USER) Discovery ---"
HTTP_BASE=$(curl -s -k -o "$LOG_DIR/base-user-propfind.xml" -w "%{http_code}" -u "${BASE_USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
  "${BASE_URL}/${BASE_USER}/")
echo "HTTP status: $HTTP_BASE"
if [ "$HTTP_BASE" = "207" ]; then
  BASE_COLLECTIONS=$(xmllint --format "$LOG_DIR/base-user-propfind.xml" 2>/dev/null | grep -c 'addressbook' || echo "0")
  echo "  Addressbook collections: $BASE_COLLECTIONS"
  echo "  Collection paths:"
  xmllint --format "$LOG_DIR/base-user-propfind.xml" 2>/dev/null | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | grep -v "^/${BASE_USER}/$" | head -10
  echo ""
  echo "  vCard file counts per collection:"
  for href in $(xmllint --format "$LOG_DIR/base-user-propfind.xml" 2>/dev/null | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | grep -v "^/${BASE_USER}/$"); do
    HTTP_COLL=$(curl -s -k -o /dev/null -w "%{http_code}" -u "${BASE_USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
      -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>' \
      "${BASE_URL}${href}")
    if [ "$HTTP_COLL" = "207" ]; then
      VCF_COUNT=$(curl -s -k -u "${BASE_USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
        -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>' \
        "${BASE_URL}${href}" | xmllint --format - 2>/dev/null | grep -c '\.vcf' || echo "0")
      DISPLAYNAME=$(curl -s -k -u "${BASE_USER}:${PASS}" -X PROPFIND -H "Depth: 0" \
        -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>' \
        "${BASE_URL}${href}" | xmllint --format - 2>/dev/null | grep -oE '<(d:)?displayname>[^<]*</(d:)?displayname>' | sed 's/<[^>]*>//g' | head -1)
      echo "    $href -> $DISPLAYNAME: $VCF_COUNT vCards"
    fi
  done
fi
echo ""

# Test 2: Find composite users for base user
echo "--- Test 2: Composite Users for $BASE_USER ---"
# Get all users and filter for composite users of this base user
curl -s -k -u "${BASE_USER}:${PASS}" "${BASE_URL}/" -X PROPFIND -H "Depth: 1" \
  -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
  > "$LOG_DIR/all-collections.xml"

COMPOSITE_PATHS=$(xmllint --format "$LOG_DIR/all-collections.xml" 2>/dev/null | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | grep "^/${BASE_USER}-" || echo "")
echo "Found composite user paths:"
echo "$COMPOSITE_PATHS" | while read -r path; do
  if [ -n "$path" ]; then
    echo "  $path"
  fi
done
echo ""

# Test 3: Test each composite user
if [ -n "$COMPOSITE_PATHS" ]; then
  echo "--- Test 3: Individual Composite User Tests ---"
  echo "$COMPOSITE_PATHS" | while read -r composite_path; do
    if [ -z "$composite_path" ]; then continue; fi
    
    # Extract composite username from path
    COMPOSITE_USER=$(echo "$composite_path" | sed 's|^/||' | sed 's|/$||')
    echo ""
    echo "  Testing: $COMPOSITE_USER"
    echo "  Path: $composite_path"
    
    # Test accessibility
    HTTP=$(curl -s -k -o "$LOG_DIR/composite-${COMPOSITE_USER}.xml" -w "%{http_code}" -u "${COMPOSITE_USER}:${PASS}" -X PROPFIND -H "Depth: 0" \
      -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/><c:supported-address-data/></d:prop></d:propfind>' \
      "${BASE_URL}${composite_path}")
    echo "    HTTP status: $HTTP"
    
    if [ "$HTTP" = "207" ]; then
      DISPLAYNAME=$(xmllint --format "$LOG_DIR/composite-${COMPOSITE_USER}.xml" 2>/dev/null | grep -oE '<(d:)?displayname>[^<]*</(d:)?displayname>' | sed 's/<[^>]*>//g' | head -1)
      HAS_PRINCIPAL=$(xmllint --format "$LOG_DIR/composite-${COMPOSITE_USER}.xml" 2>/dev/null | grep -c 'principal' || echo "0")
      HAS_ADDRESSBOOK=$(xmllint --format "$LOG_DIR/composite-${COMPOSITE_USER}.xml" 2>/dev/null | grep -c 'addressbook' || echo "0")
      echo "    Displayname: $DISPLAYNAME"
      echo "    Has principal tag: $HAS_PRINCIPAL"
      echo "    Has addressbook tag: $HAS_ADDRESSBOOK"
      
      # Count vCards
      HTTP_DEPTH=$(curl -s -k -o "$LOG_DIR/composite-${COMPOSITE_USER}-depth1.xml" -w "%{http_code}" -u "${COMPOSITE_USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
        -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>' \
        "${BASE_URL}${composite_path}")
      if [ "$HTTP_DEPTH" = "207" ]; then
        VCF_COUNT=$(xmllint --format "$LOG_DIR/composite-${COMPOSITE_USER}-depth1.xml" 2>/dev/null | grep -c '\.vcf' || echo "0")
        echo "    vCard files: $VCF_COUNT"
        
        # Compare with base user's nested collection
        BOOK_ID=$(echo "$COMPOSITE_USER" | sed "s/^${BASE_USER}-//")
        BASE_NESTED_PATH="/${BASE_USER}/${BOOK_ID}/"
        HTTP_BASE_NESTED=$(curl -s -k -o "$LOG_DIR/base-nested-${BOOK_ID}.xml" -w "%{http_code}" -u "${BASE_USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
          -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>' \
          "${BASE_URL}${BASE_NESTED_PATH}")
        if [ "$HTTP_BASE_NESTED" = "207" ]; then
          BASE_NESTED_VCF=$(xmllint --format "$LOG_DIR/base-nested-${BOOK_ID}.xml" 2>/dev/null | grep -c '\.vcf' || echo "0")
          echo "    Base user nested collection ($BASE_NESTED_PATH): $BASE_NESTED_VCF vCards"
          if [ "$VCF_COUNT" != "$BASE_NESTED_VCF" ]; then
            echo "    ⚠ WARNING: vCard count mismatch! Composite: $VCF_COUNT, Base nested: $BASE_NESTED_VCF"
          fi
        fi
      fi
    else
      echo "    ✗ Collection not accessible"
    fi
  done
fi
echo ""

# Test 4: Web UI discovery
echo "--- Test 4: Web UI Discovery (PROPFIND on /) ---"
# Use first composite user found, if any
FIRST_COMPOSITE_PATH=$(echo "$COMPOSITE_PATHS" | head -1)
if [ -n "$FIRST_COMPOSITE_PATH" ]; then
  FIRST_COMPOSITE_USER=$(echo "$FIRST_COMPOSITE_PATH" | sed 's|^/||' | sed 's|/$||')
  echo "Testing composite user: $FIRST_COMPOSITE_USER"
  HTTP_WEB=$(curl -s -k -o "$LOG_DIR/web-ui-discovery.xml" -w "%{http_code}" -u "${FIRST_COMPOSITE_USER}:${PASS}" -X PROPFIND -H "Depth: 1" \
    -d '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>' \
    "${BASE_URL}/")
  echo "HTTP status: $HTTP_WEB"
  if [ "$HTTP_WEB" = "207" ]; then
    ADDRESSBOOK_COLLECTIONS=$(xmllint --format "$LOG_DIR/web-ui-discovery.xml" 2>/dev/null | grep -B 5 'addressbook' | grep -oE '<(d:)?href>[^<]*</(d:)?href>' | sed 's/<[^>]*>//g' | grep -v '^/$' || echo "")
    echo "Addressbook collections visible:"
    echo "$ADDRESSBOOK_COLLECTIONS" | head -10
    COMPOSITE_VISIBLE=$(echo "$ADDRESSBOOK_COLLECTIONS" | grep -c "$FIRST_COMPOSITE_USER" || echo "0")
    echo "Composite user collection visible in web UI: $([ "$COMPOSITE_VISIBLE" -gt "0" ] && echo "YES" || echo "NO (Radicale limitation)")"
  fi
else
  echo "No composite users found to test"
fi
echo ""

# Summary
echo "=== Test Summary ==="
echo "Log file saved: $LOG_FILE"
echo "All test outputs saved in: $LOG_DIR/"
echo ""
echo "Key findings:"
echo "  - Base user collections: Check Test 1 output above"
echo "  - Composite user accessibility: Check Test 3 output above"
echo "  - Web UI visibility: Check Test 4 output above"
echo ""
echo "Expected behavior:"
echo "  ✓ Composite users should be accessible via CardDAV"
echo "  ✓ Composite users should have correct vCard files"
echo "  ✗ Web UI may not show composite users (Radicale limitation)"
echo "  ✓ Apple Contacts should work with composite username + path"
