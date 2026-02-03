# Pre-Implementation Code Optimization (Modularization + Dedup)

**Purpose**: Make the current codebase modular and stable before Implementation V2. This is a preparation step to reduce risk, remove duplication, and improve maintainability.

**Scope**: TS/JS only. No feature changes. No behavior changes.
**Last scan**: 2026-02-03

---

## 1) Current Structural Risks

### 1.1 God Classes / Oversized Files (Top 20 by LOC)
- `media/panel.js` (9,385) – monolithic webview UI logic (not built from source)
- `src/mastercode_port/ui/mainPanel.ts` (6,772) – huge webview controller + business logic
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

### 3.1 Webview Modularization (P0)
**Goal**: Make panel UI maintainable before V2.

Actions:
- Move `media/panel.js` into `src/webview/panel/` (source of truth)
- Add esbuild target to generate `media/panel.js`
- Split into:
  - `state/` (store, reducers, selectors)
  - `ipc/` (postMessage bridge, events)
  - `ui/` (layout, tabs, panel renderers)
  - `features/` (chat, station, flow, dashboard)

### 3.2 Shared Webview Base (P0)
Create a shared helper for:
- CSP generation
- HTML template assembly
- resource URI helpers
- standardized postMessage

Apply to:
- `mainPanel.ts`
- `panel.ts`
- `sidebarProvider.ts`
- `hotspotToolPanel.ts`

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
- Panel.js source move + build target
- Split panel.js into modules
- Shared webview base utilities

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
