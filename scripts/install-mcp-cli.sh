#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
TARGET="${BIN_DIR}/scx-mcp"

cd "$ROOT"
pnpm install --ignore-scripts
pnpm --dir packages/superconnectx-mcp run build
pnpm --dir packages/superconnectx-mcp-cli run build

mkdir -p "$BIN_DIR"
cat > "$TARGET" <<EOF
#!/usr/bin/env bash
exec node "$ROOT/packages/superconnectx-mcp-cli/dist/cli.js" "\$@"
EOF
chmod +x "$TARGET"

echo "Installed: $TARGET"
echo "Add this directory to PATH if needed:"
echo "  export PATH=\"$BIN_DIR:\$PATH\""
echo "Next:"
echo "  scx-mcp --doctor"
echo "  scx-mcp --print-config"
