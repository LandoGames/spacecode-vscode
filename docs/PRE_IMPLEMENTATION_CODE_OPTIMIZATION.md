# Pre-Implementation Code Optimization (Modularization + Dedup)

**Purpose**: Make the current codebase modular and stable before Implementation V2. This is a preparation step to reduce risk, remove duplication, and improve maintainability.

**Scope**: TS/JS only. No feature changes. No behavior changes.
**Last scan**: 2026-02-04

---

## 1) Current Structural Risks

### 1.1 God Classes / Oversized Files (Top 20 by LOC)
- ~~`media/panel.js` (9,385)~~ → split into 39 modules under `src/webview/panel/` (DONE)
- `src/mastercode_port/ui/mainPanel.ts` (4,067, was 6,772) – backend controller (IN PROGRESS)
- `src/mastercode_port/services/knowledgeBase.ts` (1,011)
- `src/swarm/SwarmCoordinator.ts` (852)
- `src/mastercode_port/orchestrator/conversation.ts` (793)
- `src/mastercode_port/ui/hotspotToolPanel.ts` (768)
- `src/quality/ComplexityAnalyzer.ts` (766)
- `src/mastercode_port/services/contextGatherer.ts` (703)
- `src/planning/PlanGenerator.ts` (639)
- `src/mastercode_port/services/mcpManager.ts` (632)
- `src/planning/PlanningSessionController.ts` (608)
- `src/integration/GitAdapter.ts` (598)
- `src/schematic/SchematicManager.ts` (587)
- `src/memory/VectorStore.ts` (577)
- `src/maintenance/MaintenanceScanner.ts` (576)
- `src/mastercode_port/services/embedder.ts` (571)
- `src/quality/MagicValueScanner.ts` (545)
- `src/quality/DeadCodeScanner.ts` (544)
- `src/mastercode_port/ui/sidebar.ts` (537)
- `src/vault/VaultManager.ts` (518)

**Risk**: these files bundle multiple concerns, making V2 changes fragile and hard to reason about.

---

## 2) Likely Duplication Hotspots (Must Confirm)

### 2.1 Webview Plumbing (HTML/CSP/PostMessage)
Found in multiple classes:
- `src/mastercode_port/ui/mainPanel.ts`
- `src/panel.ts`
- `src/mastercode_port/ui/sidebar.ts`
- `src/mastercode_port/ui/sidebarProvider.ts`
- `src/mastercode_port/ui/hotspotToolPanel.ts`

**Problem**: same patterns repeated for webview HTML, CSP, message routing, postMessage wrappers.

### 2.2 Dual Webview Frontends
- `src/webview/main.ts` -> `media/main.js`
- `media/panel.js` (manual bundle, not built)

**Problem**: two UI stacks with overlapping responsibilities. Divergence risk is high.

### 2.3 Provider / Transport Duplication
- `providers/claude.ts` vs `providers/claudeCli.ts`
- `providers/gpt.ts` vs `providers/gptCli.ts`

**Problem**: repeated streaming/stop/error logic across transports.

### 2.4 Sidebar vs SidebarProvider
- `ui/sidebar.ts` and `ui/sidebarProvider.ts` look overlapping.

**Problem**: similar message paths, different integration points.

### 2.5 Memory + KB Services
- `src/memory/*` and `src/mastercode_port/services/embedder.ts` / `knowledgeBase.ts`

**Problem**: parallel implementations of embedding/KB functions.

### 2.6 Quality Scanners Share Identical Scan Boilerplate
- `ComplexityAnalyzer`, `DeadCodeScanner`, `DuplicationScanner`, `MagicValueScanner`
- same `scanWorkspace` flow + same ignore glob lists

**Problem**: repeated workspace scan setup should be a shared base class/util.

---

## 3) Modularization Strategy (Pre-Implementation)

### 3.1 Webview Modularization (P0) — COMPLETE
**Goal**: Make panel UI maintainable before V2.

**Result**: `index.ts` reduced from 9,385 lines to 1,026 (wiring-only). 39 total files across 3 directories.

**Structure**:
```
src/webview/panel/
├── index.ts              (1,026 LOC — wiring only, no local functions)
├── state.ts              (constants, UI state, tab/mode enums)
├── ipc/
│   └── messageRouter.ts  (inbound message routing switch)
├── features/
│   ├── agents.ts         — workflow panel
│   ├── asmdef.ts         — asmdef rendering
│   ├── autoexecute.ts    — job list + approvals
│   ├── chatInput.ts      — input, attachments, compaction
│   ├── chatMode.ts       — chat mode switching
│   ├── chatRenderer.ts   — message render + streaming
│   ├── chatSessions.ts   — tabbed chat sessions
│   ├── chatTools.ts      — GPT opinion + chat split
│   ├── contextPreview.ts — context preview + copy
│   ├── controlTabs.ts    — control panel tabs
│   ├── dashboard.ts      — dashboard main
│   ├── dashboardStats.ts — dashboard stats + logs
│   ├── docTargets.ts     — doc target selection
│   ├── flow.ts           — AI flow visualization
│   ├── kb.ts             — KB panel + crawl UI
│   ├── mcp.ts            — MCP panel
│   ├── modelToolbar.ts   — model/consultant/reasoning selectors
│   ├── plans.ts          — plan list/summary/generate
│   ├── rightPanel.ts     — right panel mode + toggles
│   ├── settingsPanel.ts  — settings + costs + tooling
│   ├── sideChat.ts       — side chat UI
│   ├── skills.ts         — skills panel
│   ├── splitter.ts       — main splitter drag logic
│   ├── station.ts        — station view + asmdef actions
│   ├── tabs.ts           — main tab switching
│   ├── tickets.ts        — main tickets panel
│   ├── ticketsSidebar.ts — ticket sidebar UI
│   ├── tokenBar.ts       — token usage + pricing
│   ├── unityPanel.ts     — Unity panel
│   ├── verificationPanel.ts — tests + plan execution
│   └── voice.ts          — voice panel
└── utils/
    ├── context.ts        — context limits
    ├── dom.ts            — escapeHtml
    ├── ids.ts            — ID helpers
    ├── status.ts         — shipSetStatus
    └── toast.ts          — toasts
```

### 3.2 Backend Modularization (P0) — IN PROGRESS
**Goal**: Break `mainPanel.ts` (was 6,772 LOC, now 4,067) into handler modules.

**Completed extractions**:
- `src/mastercode_port/ui/mainPanelHtml.ts` — `buildMainPanelHtml()` (~1.6k LOC of HTML)
- `src/mastercode_port/ui/mainPanelTypes.ts` — ChatState + AutoexecuteJob types
- `src/mastercode_port/ui/mainPanelRouter.ts` — `handleMainPanelMessage()` message switch
- `src/mastercode_port/ui/impl/docsImpl.ts` — doc targets/open/info controller logic
- `src/mastercode_port/ui/impl/chatImpl.ts` — chat send + mastermind controller logic
- `src/mastercode_port/ui/impl/settingsImpl.ts` — settings/git settings + costs + pricing
- `src/mastercode_port/ui/impl/gitImpl.ts` — git operations controller
- `src/mastercode_port/ui/impl/voiceImpl.ts` — voice settings + mic/speaker controller
- `src/mastercode_port/ui/impl/mcpImpl.ts` — MCP server management + ping
- `src/mastercode_port/ui/impl/kbImpl.ts` — KB entries + embedder + logs + stats
- `src/mastercode_port/ui/impl/plansImpl.ts` — plans/AI review controller
- `src/mastercode_port/ui/impl/ticketsImpl.ts` — tickets controller
- `src/mastercode_port/ui/impl/unityImpl.ts` — Unity cockpit controller
- `src/mastercode_port/ui/impl/workflowsImpl.ts` — workflow controller
- `src/mastercode_port/ui/impl/autoexecuteImpl.ts` — autoexecute + gates/docs checks
- `src/mastercode_port/ui/impl/shipImpl.ts` — ship/station actions + context preview
- `src/mastercode_port/ui/impl/verificationImpl.ts` — diff/test/plan-compare controller
- `src/mastercode_port/ui/impl/cliImpl.ts` — CLI status/login controller
- `src/mastercode_port/ui/impl/miscImpl.ts` — logs/terminal/pricing/whisper download helpers
- `src/mastercode_port/ui/impl/senseiImpl.ts` — Sensei/Unity MCP wrappers
- `src/mastercode_port/ui/impl/githubImpl.ts` — GitHub integration controller
- `src/mastercode_port/ui/handlers/docs.ts` — doc target handlers
- `src/mastercode_port/ui/handlers/autoexecute.ts` — autoexecute handlers
- `src/mastercode_port/ui/handlers/ship.ts` — ship/station handlers
- `src/mastercode_port/ui/handlers/asmdef.ts` — asmdef handlers
- `src/mastercode_port/ui/handlers/plans.ts` — plan handlers
- `src/mastercode_port/ui/handlers/tickets.ts` — ticket handlers
- `src/mastercode_port/ui/handlers/unity.ts` — Unity handlers
- `src/mastercode_port/ui/handlers/git.ts` — Git handlers
- `src/mastercode_port/ui/handlers/mcp.ts` — MCP handlers
- `src/mastercode_port/ui/handlers/kb.ts` — KB handlers
- `src/mastercode_port/ui/handlers/voice.ts` — voice handlers
- `src/mastercode_port/ui/handlers/settings.ts` — settings/logs handlers
- `src/mastercode_port/ui/handlers/workflows.ts` — workflow handlers
- `src/mastercode_port/ui/handlers/assistant.ts` — chat/model handlers
- `src/mastercode_port/ui/handlers/sensei.ts` — CodeSensei handlers
- `src/mastercode_port/ui/handlers/shipActions.ts` — ship context + station actions
- `src/mastercode_port/ui/handlers/misc.ts` — misc UI helpers
- `src/mastercode_port/ui/handlers/dashboard.ts` — dashboard metrics/activity/db-stats/logs handlers

**Remaining**: Split `mainPanel.ts` itself into per-feature handler modules (controller logic).

### 3.2.1 Shared Webview Base (Deferred)
Create shared helpers for CSP generation, HTML template assembly, resource URI helpers, and standardized postMessage. Apply to `mainPanel.ts`, `panel.ts`, `sidebarProvider.ts`, `hotspotToolPanel.ts`. Deferred until backend modularization is complete.

### 3.3 Provider Core (P1)
Centralize shared provider logic:
- request lifecycle
- streaming
- cancellation
- error normalization

Transport-specific code only:
- CLI vs API

### 3.4 Message Schema (P1)
Define a shared `messageTypes.ts` or JSON schema:
- Webview event types
- AI response streaming
- Unity/MCP/status updates

Prevents UI regression ("[object Object]" issues).

---

## 4) Dedup & Consolidation Targets

### 4.1 Remove Parallel UI Stack
Decide ONE frontend stack for full panel:
- Option A: merge everything into `src/webview/main.ts`
- Option B: move everything into `src/webview/panel/` (recommended)

### 4.2 Collapse Sidebar Implementations
Pick one:
- `sidebar.ts` OR `sidebarProvider.ts`

### 4.3 Unify Memory/KB Layer
Choose a single KB layer and delete the other:
- merge `src/memory/*` with `mastercode_port/services/knowledgeBase.ts`

---

## 5) Best Practices to Enforce (TS/JS)

- No logic in UI string builders (HTML in templates or renderer functions)
- No global state in webview without a store layer
- All webview messages typed
- No provider duplication
- Avoid nested if/else chains over 200 lines
- Any file > 400 LOC must be split

---

## 6) Pre-Implementation Tasks (Checklist)

**P0 (must do before V2):**
- Panel.js source move + build target (DONE)
- Split panel.js into 39 frontend modules (DONE)
- Backend mainPanel.ts handler extraction (IN PROGRESS — GPT)
- Shared webview base utilities (deferred until backend split done)
- Wire Coplay MCP transport in `coplayClient.ts` (DONE) — replaced stubbed `callTool()` with real stdio JSON-RPC transport. Spawns `coplay-mcp-server` as child process, communicates via stdin/stdout, handles MCP initialize handshake, request/response correlation, timeouts, process lifecycle. Also fixed hardcoded `/Users/blade/.local/bin/uvx` path in `mcpManager.ts`.

**P1 (strongly recommended):**
- Provider core refactor
- Webview message schema
- Sidebar consolidation

**P2 (optional but good):**
- Merge memory/KB layers
- Reduce oversized planners/quality scanners

---

## 7) Expected Benefits

- Safer V2 implementation
- Smaller, testable modules
- No hidden duplication
- Faster debugging
- Lower regression risk

---

## 8) Risks if Skipped

- V2 changes happen inside giant files
- Duplicate UI stacks drift
- Provider inconsistencies cause random failures
- Debugging cost explodes

---

## 9) Output Required Before V2 Starts

- `panel.js` built from source
- shared webview helper in use
- duplication hotspots reduced
