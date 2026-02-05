// Dev-only layout enforcement for the SpaceCode editing window.
//
// WHY THIS EXISTS:
//   VS Code doesn't persist auxiliary bar state across reloads.
//   The main SpaceCode extension (src/extension.ts) handles this for the
//   final app and Extension Development Host, but this dev VS Code window
//   doesn't run SpaceCode — so we need a tiny extension to enforce layout.
//
// HOW TO INSTALL:
//   bash .dev-tools/install.sh
//   (creates symlink in ~/.vscode/extensions/)
//
// HOW TO UNINSTALL:
//   rm ~/.vscode/extensions/spacecode-layout-enforcer
//
// IMPORTANT — KEEP IN SYNC:
//   Any layout command added here MUST also be added to:
//     src/extension.ts → activate() function
//   That file handles layout for the production app and Extension Dev Host.
//   This file only handles the dev editing window.

const vscode = require('vscode');

function activate() {
  vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
}

function deactivate() {}

module.exports = { activate, deactivate };
