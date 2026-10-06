#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${HOME}"
SKILL_NAME="superconnectx-mcp"
TARGETS=(
  "${HOME_DIR}/.agents/skills/${SKILL_NAME}"
  "${HOME_DIR}/.codex/skills/${SKILL_NAME}"
)

cd "$ROOT"
bash "$ROOT/scripts/install-mcp-cli.sh"

for target in "${TARGETS[@]}"; do
  mkdir -p "$(dirname "$target")"
  rm -rf "$target"
  cp -R "$ROOT/packages/superconnectx-mcp-skill" "$target"
  rm -f "$target/package.json"
done

export PATH="${HOME_DIR}/.local/bin:${PATH}"
echo "Skill installed:"
printf '  %s\n' "${TARGETS[@]}"
echo
scx-mcp --doctor
echo
scx-mcp --print-config
