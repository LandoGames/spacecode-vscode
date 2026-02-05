#!/bin/bash
# Install dev layout enforcer into VS Code extensions (symlink).
# Run once. Survives across reloads. Remove with: rm ~/.vscode/extensions/spacecode-layout-enforcer

EXT_DIR="$HOME/.vscode/extensions/spacecode-layout-enforcer"
SOURCE_DIR="$(cd "$(dirname "$0")/layout-enforcer" && pwd)"

[ -L "$EXT_DIR" ] || [ -d "$EXT_DIR" ] && rm -rf "$EXT_DIR"
ln -s "$SOURCE_DIR" "$EXT_DIR"
echo "Installed: $EXT_DIR -> $SOURCE_DIR"
echo "Restart VS Code to activate."
