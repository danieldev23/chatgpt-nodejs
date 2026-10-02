#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3040}"
AUTH_KEY="${CHATGPT2API_AUTH_KEY:-chatgpt2api_secret_key_change_me}"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <access_token> [refresh_token]"
  exit 1
fi

ACCESS_TOKEN="$1"
REFRESH_TOKEN="${2:-}"

if [ -n "$REFRESH_TOKEN" ]; then
  PAYLOAD=$(cat <<EOF
{
  "accounts": [
    {
      "access_token": "$ACCESS_TOKEN",
      "refresh_token": "$REFRESH_TOKEN"
    }
  ]
}
EOF
)
else
  PAYLOAD=$(cat <<EOF
{
  "tokens": [
    "$ACCESS_TOKEN"
  ]
}
EOF
)
fi

echo "Adding token to ${BASE_URL}/api/accounts..."
curl -s -X POST "${BASE_URL}/api/accounts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_KEY}" \
  -d "$PAYLOAD"
echo ""
