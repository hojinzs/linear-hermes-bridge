#!/bin/bash
# Preflight check for smoke tests. Exits non-zero if any prerequisite fails.
# Usage: bash .smoke_test/preflight.sh

set -u
fail=0
ok()   { printf "\033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "\033[33m⚠\033[0m %s\n" "$1"; }
err()  { printf "\033[31m✗\033[0m %s\n" "$1"; fail=$((fail+1)); }

echo "=== Smoke test preflight ==="

# 1. Bridge :8787
if curl -fsS http://127.0.0.1:8787/healthz >/dev/null 2>&1; then
  ok "bridge alive on :8787"
else
  err "bridge :8787 down — start with 'pnpm --filter @lhb/bridge dev' (env: PUBLIC_BASE_URL, ENCRYPTION_KEY, APP_SECRET, LINEAR_LIVE=true)"
fi

# 2. Public tunnel
if curl -fsS https://lhb-dev.daapp.net/healthz >/dev/null 2>&1; then
  ok "tunnel reachable at https://lhb-dev.daapp.net"
else
  err "tunnel down — run 'wrangler tunnel run lhb-dev' in the background"
fi

# 3. Hermes gateway (loaded with a non-zero PID via launchd)
GS=$(hermes gateway status 2>&1)
if echo "$GS" | grep -q "Gateway service is loaded" && echo "$GS" | grep -qE '"PID" = [1-9][0-9]*;'; then
  ok "hermes gateway loaded (PID $(echo "$GS" | grep -oE '"PID" = [0-9]+' | grep -oE '[0-9]+'))"
else
  err "hermes gateway down — run 'hermes gateway restart'"
fi

# 4. Hermes lhb subscription
if hermes webhook list 2>&1 | grep -q "◆ lhb"; then
  ok "hermes 'lhb' webhook subscription active"
else
  err "hermes 'lhb' subscription missing — see SMOKE_TEST.md §5"
fi

# 5. lhb-reply hook loaded
if grep -q "Loaded hook 'lhb-reply'" ~/.hermes/logs/gateway.log 2>/dev/null; then
  ok "lhb-reply hook loaded into hermes gateway"
else
  warn "lhb-reply hook not seen in gateway.log — restart gateway and look for [hooks] line"
fi

# 6. Bridge agent installation with write scope
INST=$(curl -fsS http://127.0.0.1:8787/api/agents/daapp/installations 2>/dev/null || echo "{}")
if echo "$INST" | grep -q '"status":"installed"'; then
  ok "agent 'daapp' has installed token"
  if echo "$INST" | grep -q '"write"'; then
    ok "token includes 'write' scope (agentActivityCreate available)"
  else
    warn "token does NOT include 'write' scope — agentActivityCreate will fall back to commentCreate. Re-OAuth via https://lhb-dev.daapp.net/oauth/authorize/daapp"
  fi
else
  err "no installed token for 'daapp' — visit https://lhb-dev.daapp.net/oauth/authorize/daapp"
fi

echo
if [ "$fail" -gt 0 ]; then
  echo "=== $fail check(s) FAILED ==="
  exit 1
fi
echo "=== preflight OK ==="
