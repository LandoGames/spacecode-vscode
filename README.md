# SpaceCode (VS Code extension)

This is the new SpaceCode extension scaffold.

## Dev loop

1. In a terminal:
   - `cd spacecode-vscode`
   - `npm i`

2. In VS Code:
   - Run the launch config **Run SpaceCode Extension** (F5)
   - In the Extension Development Host, run **SpaceCode: Open**

3. Fast UI iteration:
   - `npm run watch` keeps rebuilding `dist/extension.js` + `media/main.js`
   - Use **SpaceCode: Reload Panel** to reload the webview without restarting the host

## Ship image

Put your AI-generated PNG at:
- `spacecode-vscode/media/ship.png`

Hotspots are currently placeholders in `spacecode-vscode/src/webview/main.ts`.
