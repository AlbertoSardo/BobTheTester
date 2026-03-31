#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MCP_PACKAGE_DIR="${REPO_ROOT}/tools/regression-mcp"
DIST_ENTRY="${MCP_PACKAGE_DIR}/dist/index.js"
LOCAL_CONFIG_PATH="${HOME}/.config/tiware/bobthetester/claude-mcp-server.local.json"
WRITE_DESKTOP_CONFIG="false"
WRITE_OPENCODE_CONFIG="false"
DESKTOP_CONFIG_PATH="${HOME}/Library/Application Support/Claude/claude_desktop_config.json"
OPENCODE_CONFIG_PATH="${REPO_ROOT}/opencode.jsonc"
SKIP_INSTALL="false"
SKIP_BUILD="false"

usage() {
  cat <<'EOF'
Usage: ./scripts/setup-bobthetester.sh [options]

Options:
  --skip-install          Skip npm install in tools/regression-mcp
  --skip-build            Skip npm build in tools/regression-mcp
  --write-desktop-config  Write/merge MCP server into Claude Desktop config
  --write-opencode-config Write/merge MCP server into OpenCode config (opencode.jsonc)
  --desktop-config-path <path>
                          Override Claude Desktop config path
  --opencode-config-path <path>
                          Override OpenCode config path (default: ./opencode.jsonc)
  --help                  Show this help

What this script does:
  1) Installs dependencies for tools/regression-mcp (unless skipped)
  2) Builds the MCP server (unless skipped)
  3) Generates a local MCP config snippet with absolute path
  4) Optionally merges the MCP server into Claude Desktop config
  5) Optionally merges the MCP server into OpenCode config
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      SKIP_INSTALL="true"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="true"
      shift
      ;;
    --write-desktop-config)
      WRITE_DESKTOP_CONFIG="true"
      shift
      ;;
    --write-opencode-config)
      WRITE_OPENCODE_CONFIG="true"
      shift
      ;;
    --desktop-config-path)
      if [[ $# -lt 2 ]]; then
        echo "Error: --desktop-config-path requires a value" >&2
        exit 1
      fi
      DESKTOP_CONFIG_PATH="$2"
      shift 2
      ;;
    --opencode-config-path)
      if [[ $# -lt 2 ]]; then
        echo "Error: --opencode-config-path requires a value" >&2
        exit 1
      fi
      OPENCODE_CONFIG_PATH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "${MCP_PACKAGE_DIR}" ]]; then
  echo "Error: MCP package directory not found: ${MCP_PACKAGE_DIR}" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found in PATH." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required but was not found in PATH." >&2
  exit 1
fi

if [[ "${SKIP_INSTALL}" != "true" ]]; then
  echo "[bobthetester] Installing dependencies..."
  npm --prefix "${MCP_PACKAGE_DIR}" install

  echo "[bobthetester] Installing Playwright browser runtime (chromium)..."
  npm --prefix "${MCP_PACKAGE_DIR}" exec playwright install chromium
fi

if [[ "${SKIP_BUILD}" != "true" ]]; then
  echo "[bobthetester] Building MCP server..."
  npm --prefix "${MCP_PACKAGE_DIR}" run build
fi

if [[ ! -f "${DIST_ENTRY}" ]]; then
  echo "Error: built MCP entry not found: ${DIST_ENTRY}" >&2
  exit 1
fi

echo "[bobthetester] Writing local MCP config snippet to ${LOCAL_CONFIG_PATH}"
node - "${LOCAL_CONFIG_PATH}" "${DIST_ENTRY}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const outputPath = process.argv[2];
const distEntry = process.argv[3];

const content = {
  mcpServers: {
    "tiware-regression": {
      command: "node",
      args: [distEntry],
    },
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
NODE

if [[ "${WRITE_DESKTOP_CONFIG}" == "true" ]]; then
  echo "[bobthetester] Merging MCP server into Claude Desktop config: ${DESKTOP_CONFIG_PATH}"
  node - "${DESKTOP_CONFIG_PATH}" "${DIST_ENTRY}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configPath = process.argv[2];
const distEntry = process.argv[3];

let config = {};
if (fs.existsSync(configPath)) {
  const raw = fs.readFileSync(configPath, "utf8").trim();
  if (raw.length > 0) {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      config = parsed;
    }
  }
}

if (
  !Object.prototype.hasOwnProperty.call(config, "mcpServers") ||
  typeof config.mcpServers !== "object" ||
  config.mcpServers === null ||
  Array.isArray(config.mcpServers)
) {
  config.mcpServers = {};
}

config.mcpServers["tiware-regression"] = {
  command: "node",
  args: [distEntry],
};

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
NODE
fi

if [[ "${WRITE_OPENCODE_CONFIG}" == "true" ]]; then
  echo "[bobthetester] Merging MCP server into OpenCode config: ${OPENCODE_CONFIG_PATH}"
  node - "${OPENCODE_CONFIG_PATH}" "${DIST_ENTRY}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const configPath = process.argv[2];
const distEntry = process.argv[3];

let config = {};
if (fs.existsSync(configPath)) {
  let raw = fs.readFileSync(configPath, "utf8").trim();
  // Strip single-line comments (// ...) for JSONC support
  raw = raw.replace(/^\s*\/\/.*$/gm, "");
  if (raw.length > 0) {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      config = parsed;
    }
  }
}

if (!config["$schema"]) {
  config["$schema"] = "https://opencode.ai/config.json";
}

if (
  !Object.prototype.hasOwnProperty.call(config, "mcp") ||
  typeof config.mcp !== "object" ||
  config.mcp === null ||
  Array.isArray(config.mcp)
) {
  config.mcp = {};
}

config.mcp["bobthetester"] = {
  type: "local",
  command: ["node", distEntry],
  enabled: true,
};

fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
NODE
fi

echo ""
echo "[bobthetester] Setup completed."
echo "- Local MCP config snippet: ${LOCAL_CONFIG_PATH}"
if [[ "${WRITE_DESKTOP_CONFIG}" == "true" ]]; then
  echo "- Claude Desktop config updated: ${DESKTOP_CONFIG_PATH}"
fi
if [[ "${WRITE_OPENCODE_CONFIG}" == "true" ]]; then
  echo "- OpenCode config updated: ${OPENCODE_CONFIG_PATH}"
fi
if [[ "${WRITE_DESKTOP_CONFIG}" != "true" && "${WRITE_OPENCODE_CONFIG}" != "true" ]]; then
  echo "- Next: rerun with --write-desktop-config and/or --write-opencode-config"
fi
echo "- Then open repo in your client and run: /bobthetester"
