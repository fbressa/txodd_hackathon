#!/usr/bin/env bash
# sondagem rápida de endpoints TxLINE com as credenciais cacheadas (uso: ./probe.sh <path>)
set -euo pipefail
cd "$(dirname "$0")"
JWT=$(python3 -c 'import json; print(json.load(open(".txline-auth.json"))["jwt"])')
TOK=$(python3 -c 'import json; print(json.load(open(".txline-auth.json"))["apiToken"])')
curl -s -w '\nHTTP %{http_code}\n' \
  -H "Authorization: Bearer $JWT" \
  -H "X-Api-Token: $TOK" \
  "https://txline-dev.txodds.com$1"
