#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/bin:${PATH}"

test -x "${HOME}/.local/bin/scx-mcp"
test -f "${HOME}/.agents/skills/superconnectx-mcp/SKILL.md"
test -f "${HOME}/.codex/skills/superconnectx-mcp/SKILL.md"
test -f "packages/superconnectx-mcp-skill/SKILL.md"
test -f "resources/mcp/templates/generic-serial.json"

scx-mcp --doctor | grep -q '"ok": true'
scx-mcp --print-config | grep -q '"superconnectx"'

pnpm run test:mcp >/tmp/superconnectx-mcp-verify.log

echo "MCP delivery verified"
