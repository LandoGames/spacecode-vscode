# SpaceCode V2 Implementation Checklist

**Status**: Phases 0–12 Implemented (deferred items noted inline)
**Baseline**: Restored to commit `51f2497` (working pre-V2 state)
**Approach**: Implement one feature at a time, test, then commit

---

## How to Use This Document

1. Pick a task from the checklist below
2. Mark it as `[~]` (in progress)
3. Retrieve relevant V2 code from `v2-broken-backup` branch if needed
4. Implement, test in Extension Development Host
5. Mark as `[x]` when complete and working
6. Commit changes

**Legend:**
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked / Issues

---

## Phase 0: Panel.js Modularization (Foundation)
> `media/panel.js` is 9k+ lines and currently not built from source

- [x] Move `media/panel.js` into `src/webview/panel/index.ts` (source of truth)
- [x] Add esbuild target to build `media/panel.js` from `src/webview/panel/index.ts`
- [x] Keep `mainPanel.ts` HTML injector intact (load built `panel.js`)
- [x] Split panel into 39 modules: `state.ts`, `ipc/messageRouter.ts`, `features/` (31 modules), `utils/` (5 modules)
- [x] Verify UI parity (no behavior change after move/split)
- [ ] Document new webview build flow in `docs/IMPLEMENTATION_V2.md`

---

## Phase 1: Core UI Fixes (Foundation)

### 1.1 Right Panel Mode Separation
> Prevent modes from bleeding across tabs

- [x] Add `data-tab-scope` attributes to panel-toggle buttons (chat vs station)
- [x] Chat tab shows only: Flow, Opinion, +Chat buttons
- [x] Station tab shows only: Station, Control buttons
- [x] Implement tab→panel routing via `restoreRightPanelModeForTab()`
- [x] Remember last active mode per tab (localStorage per-tab keys)
- [x] Button visibility auto-updates on tab switch

### 1.2 Station Tab Cleanup
> Station shows only Schematic + Control

- [x] Hide "Get GPT Opinion" button on Station tab
- [x] Panel-toggle scoping removes +Chat from Station
- [x] Set Station chat width to 33% (was 350px fixed)
- [x] Hide chat tabs on Station (single-thread only)

### 1.4 Station Sectors Rename (from STATION_SECTORS_UX.md Phase 1)
> Apply Station-first naming, no backend changes

- [x] Rename Station's asmdef section to **"Sectors"** (controlTabs.ts: `controlTabBtnSectors`)
- [x] "Load Asmdefs" → "Scan Sectors" (button label + panel title: "Asmdef Manager" → "Sector Settings")
- [x] "Asmdef Policy" → "Sector Policy" (badge + policy editor title renamed)
- [x] "Asmdef Graph" → "Sector Map" (sectorMap.ts: `title: 'SECTOR MAP'`)
- [x] Graph nodes show `sector.name` (ARMORY) with `asmdef.name` in small grey
- [ ] Move utility buttons (Generate Policy, Normalize GUIDs, etc.) into "Sector Settings" sub-panel
- [x] Add summary bar: "Sectors: N | Boundaries: N | Violations: N"

### 1.3 Control Panel Redesign
> Replace confusing Advanced Panels with 5 clean tabs

- [x] Delete "Advanced Panels" `<details>` drawer
- [x] Create new 5-tab structure: `[Diagnostics] [Tests] [Security] [Code Quality] [Maintenance]`
- [x] Move Verification (diff scan, AI review, gates) → Diagnostics tab
- [x] Move Asmdef Manager + Unity actions → Tests tab
- [x] Move Approval Queue + Context Pack + Autoexecute → Maintenance tab
- [x] Add Security tab stub (Phase 6 placeholder)
- [x] Add Code Quality tab stub (Phase 6 placeholder)
- [x] Update `switchControlTab()` JS with legacy tab name mapping
- [x] Move Planning UI → Chat tab Planning Mode (done in Phase 3)
- [x] Fix Unity header status dot: ping both Unity MCP + Coplay MCP, show combined status (green = any connected)
- [x] Unify status sources: header dot, dashboard MCP tab, and Unity cockpit panel use same connection state

---

## Phase 2: Chat System Overhaul

### 2.1 Input Behavior
> Stop/Send button logic per spec

- [x] Show Stop button when AI is running AND input is empty
- [x] Show Send button when text exists in input (shows "Send ⏎" in interrupt mode)
- [x] Implement 10s grace period (user can stop after sending)
- [x] Implement "send while thinking" (interrupt current generation → stop + re-send)

### 2.2 Chat Compaction
> Handle token limits gracefully

- [x] Detect when approaching token limit (wired `needsCompaction()` in `chatImpl.ts` before `askSingle`)
- [x] Generate summary of conversation (calls `compactHistory()` which uses AI provider to summarize)
- [x] Replace old messages with summary chunk (sends `compacted` message → frontend `showCompactionNotice()`)
- [x] Keep recent N messages in full (keeps last 4 messages by default)

### 2.3 Persona System Foundation
> Set up the 6-persona architecture

- [x] Create persona types: `nova | gears | index | triage | vault | palette` (already in `src/agents/types.ts`)
- [x] Define persona interface (name, icon, color, location, tools) (already in `src/agents/definitions.ts`)
- [x] Create persona prompt templates location: `src/personas/prompts/`
- [x] Implement persona routing based on tab/panel (`PersonaRouter.ts` + `PERSONA_MAP` in `state.ts`)
- [x] Wire persona into `sendMessage` payload (frontend sends `persona` field)
- [x] Backend loads persona prompt via `PromptLoader.ts` and passes to `askSingle()` as systemPrompt
- [x] Initialize `PromptLoader` in `extension.ts` with extension root path

### 2.4 Persona: Nova (Creator)
> Chat tab - full features

- [x] Create `nova.system.md` prompt template
- [x] Wire Nova to Chat tab (left panel) — default persona for chat/agents/skills tabs
- [ ] Enable all Nova tools: plan, execute, opinion, +chat, git (tools already available, no restriction needed)
- [x] Nova icon: `fa-rocket`, color: `#a855f7` (purple, per `definitions.ts`)

### 2.5 Persona: Gears (Engineer)
> Station tab - maintenance focus

- [x] Create `gears.system.md` prompt template
- [x] Wire Gears to Station tab chat (33% width) — auto-selected on Station tab switch
- [ ] Implement Learn/Maintenance mode toggle (deferred — requires UI control)
- [ ] Disable: execution mode, GPT opinion, +chat, push-to-git (deferred — requires feature gating per persona)
- [x] Gears icon: `fa-gear`, color: `#f59e0b` (orange, per `definitions.ts`)

### 2.6 Persona: Index (Librarian)
> Dashboard → Docs panel

- [x] Create `index.system.md` prompt template
- [x] Wire Index to Dashboard Docs panel — auto-selected on docs subtab switch
- [ ] Implement Setup/Sync modes (deferred — requires DocsManager wiring)
- [x] Index icon: `fa-book`, color: `#3b82f6` (blue, per `definitions.ts`)

### 2.7 Persona: Triage (Ticket Bot)
> Dashboard → Tickets panel

- [x] Create `triage.system.md` prompt template
- [x] Wire Triage to Dashboard Tickets panel — auto-selected on tickets subtab switch
- [ ] Implement ticket routing logic (deferred — requires TicketProcessor wiring)
- [x] Triage icon: `fa-ticket`, color: `#10b981` (green, per `definitions.ts`)

### 2.8 Persona: Vault (Database Engineer)
> Dashboard → Project DB panel

- [x] Create `vault.system.md` prompt template
- [x] Wire Vault to Dashboard Project DB panel — auto-selected on db subtab switch
- [x] Vault icon: `fa-database`, color: `#22c55e` (green, per `definitions.ts`)

### 2.9 Persona: Palette (Art Director)
> Dashboard → Art Studio panel

- [x] Create `palette.system.md` prompt template
- [x] Wire Palette to Dashboard Art Studio panel — auto-selected on settings/art subtab switch
- [x] Palette icon: `fa-palette`, color: `#ec4899` (pink, per `definitions.ts`)

---

## Phase 3: Planning System

### 3.1 Planning Mode (replaces Swarm)
> Structured planning before implementation

- [x] Add Planning Mode toggle to Chat tab
- [x] Implement 4-phase flow: Study → Connect → Plan → Review
- [x] Planning Panel UI in right panel (when Planning mode active)
- [x] Show current phase indicator (1-4)
- [x] Phase checklist with completion status
- [x] Affected files list (grows during analysis)
- [x] Risk assessment summary

### 3.2 Implementation Plan Output
> Generate structured plan artifact

- [x] Generate Implementation Plan markdown
- [x] Include: phases, tasks, affected files, risks, dependencies
- [x] Save plans to `.spacecode/plans/`
- [x] Plan can be handed to Gears for execution

### 3.3 Planning Gates
> Approval checkpoints

- [x] Study Complete gate (Nova)
- [x] Connection Mapped gate (Gears)
- [x] Plan Approved gate (User)
- [x] Docs Updated gate (Index)

### 3.4 Reuse Before Create Rule
> AI must check existing code first

- [x] Search existing codebase before creating new functions
- [x] Check if existing function can be extended
- [x] Explain why existing code was insufficient if creating new
- [x] Flag when similar functionality already exists

---

## Phase 4: Station Sectors (from STATION_SECTORS_UX.md)
> Promote Sectors from hidden utility to hero feature of Station
> Design reference: `docs/STATION_SECTORS_UX.md`
> Backend is ready (`SectorConfig`, `AsmdefGate`, `SectorManager`) — this is presentation only

### 4.1 Sector Map Landing View
> Dependency graph as the default Station view

- [x] Make dependency graph the **default landing view** when entering Station (Canvas 2D orbital engine)
- [x] Render sector nodes with icons + health badge dots (Unicode icons + health ring arcs)
- [x] Color-code nodes using existing `color` field from SectorConfig
- [x] Show connections/dependencies between sectors (quadratic curve edges with particles)
- [ ] Solid edges for enforced (asmdef), dashed for intended (config-only)
- [x] Hover tooltip: sector description + asmdef name + reference count
- [x] Summary bar at bottom: "Sectors: N | Boundaries: N | Violations: N"

### 4.2 Sector Card Drill-Down
> Click a graph node → detailed sector view

- [x] Implement Sector Card component (station name + technical name) — basic card with name/tech/deps/desc
- [x] Card shows: allowed boundaries (with checkmarks), violations (with fix hints), scripts list
- [x] Quick actions: Open Folder, Open Asmdef
- [ ] Edit Policy quick action
- [ ] Back button returns to Sector Map
- [ ] Layout: split view (graph left, card right) or full-card on narrow layouts

### 4.3 Sector Health System
> Per-sector and project-wide health scores

- [x] Compute health % per sector: 100% = no violations/warnings, deduct per issue (asmdef.ts handler)
- [x] Health badge logic: Green ● (healthy), Yellow ◐ (warnings), Red ○ (violations) — healthColor() in sectorMap.ts
- [x] Color-code graph nodes by health (health ring arcs + endpoint dots)
- [x] Overall project health indicator — avgHealth % badge in summary bar
- [ ] Health trend over time (optional, stored in globalState)

### 4.4 Non-Asmdef Support (Three Tiers)
> Sectors work for any project, not just Unity

**IMPORTANT**: Sector names, boundaries, and structure are NOT hardcoded. `DEFAULT_RPG_SECTORS` is a sample/fallback only. Real sector data must be derived from the project's SA (Software Architecture) and GDD (Game Design Document). The data flow is:
1. GDD/SA docs define the game's systems and architecture
2. SpaceCode parses those docs to generate/suggest sector definitions
3. User reviews/edits via Sector Config UI (Phase 12.4)
4. Asmdef enforcement follows the configured sectors
5. `.spacecode/sectors.json` persists the result per-project

See Phase 5 (Documentation System) for doc parsing, and Phase 12.4 for sector config UI.

- [x] Detect project type on Station load (tier detection: full/mapped/empty)
- [x] **Full tier** (asmdef + policy): graph, violations, health, enforcement
- [x] **Mapped tier** (folder globs only): visual map, AI context, intended deps
- [x] **Empty tier** (no config): prompt user to configure or generate from SA/GDD docs
- [x] Show appropriate info banner per tier (yellow for mapped, grey for empty, hidden for full)
- [ ] Solid edges for enforced (asmdef), dashed for intended (config-only)
- [ ] AI context injection works regardless of tier

### 4.5 SA Compliance
> Detect when code violates architecture

- [x] Detect cross-sector imports (via asmdef violations)
- [x] Detect missing sector definitions (orphan file count in summary)
- [ ] Detect wrong folder placement
- [x] Detect circular dependencies (DFS cycle detection in sectorMapData)
- [ ] Generate refactor plan to align code with SA

---

## Phase 5: Documentation System

### 5.1 Simple vs Complex Project Flag
> Reduce friction for small projects

- [x] First-launch UI: "Simple" vs "Complex" choice
- [x] Store: `spacecode.projectComplexity` in workspace settings
- [x] Simple: no required docs, Index + Gears disabled (with explanation)
- [x] Complex: requires GDD + SA setup

### 5.2 Docs Wizard
> Questionnaire-based setup
> **Note**: SA docs are the primary source for sector definitions (see Phase 4.4, 12.4). The wizard must produce structured sections that the sector generator can parse.

- [x] GDD questionnaire (10 questions, 6 required)
- [x] SA questionnaire (7 questions, 5 required)
- [x] TDD questionnaire (optional, 5 questions, 3 required)
- [x] Generate docs from questionnaire answers
- [x] Templates location: `templates/` (in-code template objects in `src/docs/templates.ts`)

### 5.3 Template System
> Load and populate doc templates

- [x] Create/verify templates exist:
  - [x] `GDD_TEMPLATE` (Game Design Document)
  - [x] `SA_TEMPLATE` (Software Architecture)
  - [x] `TDD_TEMPLATE` (Technical Design Document)
  - [x] `ART_BIBLE_TEMPLATE` (Art Bible)
  - [x] `NARRATIVE_TEMPLATE` (Narrative Bible)
  - [x] `UIUX_TEMPLATE` (UI/UX Specification)
  - [x] `ECONOMY_TEMPLATE` (Economy Design)
  - [x] `AUDIO_TEMPLATE` (Audio Design)
  - [x] `TEST_PLAN_TEMPLATE` (Test Plan)
  - [x] `LEVEL_BRIEF_TEMPLATE` (Level Brief)

### 5.4 Doc Sync
> Keep docs aligned with code

- [x] Detect doc drift on code changes
- [ ] Index proposes updates (deferred — requires AI integration)
- [ ] Sync workflow: detect → propose → approve → update (deferred — detect step done, propose/approve/update needs AI)

---

## Phase 6: Testing & Quality
> Research: [`docs/SEMGREP_SECURITY_RESEARCH.md`](SEMGREP_SECURITY_RESEARCH.md) — Semgrep as the SAST engine for Security + Code Quality + Unity checks

### 6.1 Diagnostics Tab
> Fast, blocking checks

- [ ] Build/compile check
- [ ] Syntax error detection
- [ ] Missing references check
- [ ] Results UI with Pass/Warn/Fail

### 6.2 Tests Tab
> Unit and integration tests

- [ ] Unit test runner integration
- [ ] Integration test runner
- [ ] asmdef dependency check
- [ ] GUID validation
- [ ] Lint/style checks

### 6.3 Security Tab
> Security audit scans
> Backend: `src/security/` (SecurityScanner, SecretScanner, CryptoScanner, InjectionScanner)
> Handler: `src/mastercode_port/ui/handlers/security.ts`
> Frontend: messageRouter.ts (securityScan*, securityExport* cases)

- [x] Secret scanner (regex for API keys, passwords)
- [x] Hardcoded credentials detection
- [ ] Dependency CVE checks
- [x] Injection vulnerability analysis (regex-based, AI-assisted deferred)
- [x] Results grouped by severity
- [x] "Fix with Engineer" handoff button
- [x] Security tab UI with score card, findings list, scan/export buttons
- [x] Crypto weakness detection (weak algorithms, deprecated ciphers)

### 6.4 Code Quality Tab
> Prevent code bloat
> Backend: `src/quality/` (QualityScanner, DuplicationScanner, MagicValueScanner, DeadCodeScanner, ComplexityAnalyzer)
> Handler: `src/mastercode_port/ui/handlers/quality.ts`
> Frontend: messageRouter.ts (qualityScan*, qualityExport* cases)

- [x] Duplicate function detection
- [x] Similar code block detection
- [x] Magic number/hardcoded string scan
- [x] Dead code detection
- [ ] Unused imports
- [ ] Circular dependency checker
- [x] God class detector (>500 lines)
- [x] High coupling analysis
- [ ] SA sector violation checker
- [x] Quality tab UI with score card, metrics, category breakdown, findings list, scan/export buttons

### 6.5 Unity-Specific Checks
> Game engine specific (part of ComplexityAnalyzer unity-specific category)

- [x] Expensive Update() calls detection
- [x] Missing null checks for GetComponent
- [x] Find() in hot paths
- [x] Allocations in loops
- [ ] Asset validation
- [ ] Missing prefab refs

---

## Phase 7: Cross-Persona Features

### 7.1 Context Handoff
> Pass context between personas

- [x] ContextPackage schema implementation
- [x] Handoff buttons in chat: "Send to Gears & Stay", "Go to Tab"
- [x] Handoff menu (☰ Handoff → select persona)
- [x] Context preview before handoff
- [x] Store handoffs in `.spacecode/handoffs/`

### 7.2 Autosolve
> Background task completion

- [x] Autosolve notifications
- [x] Actions: View Changes, Send to Index, Dismiss
- [x] Ticket → autosolve routing

### 7.3 Ticket Routing
> Smart ticket assignment

- [x] Parse ticket type from keywords
- [x] BUG → Gears
- [x] FEATURE → Nova
- [x] DOC_UPDATE → Index
- [x] DATABASE → Vault
- [x] ART/UI_DESIGN → Palette
- [x] Ambiguous → ask user

---

## Phase 8: Dashboard Enhancements

### 8.1 Mission Panel
> Project timeline and approvals

- [x] Approval queue display
- [x] Project milestones
- [x] Pending tasks overview

### 8.2 Storage Panel (Internal)
> SpaceCode's own storage

- [x] Show storage type/location
- [x] Chat history usage bar
- [x] Embeddings usage bar
- [x] Disk space usage
- [x] Clear/Export buttons

### 8.3 Project DB Panel
> External game database

- [ ] Database connection wizard *(deferred — requires external DB provider integrations)*
- [ ] Provider support: Supabase, Firebase, PostgreSQL, MySQL, SQLite, MongoDB
- [ ] Schema viewer (tables, columns, relationships)
- [ ] Query builder interface
- [ ] Migration generator
- [ ] Type generation (TypeScript/C#)

### 8.4 Art Studio Panel
> Visual asset management

- [x] Style storage (colors, fonts, themes)
- [x] Recent assets display
- [x] Gemini API integration for image generation
- [x] Image generation UI (prompts, presets, variations)
- [x] Asset library viewer

### 8.5 Unity & MCP Dashboard Panel
> Dual MCP server management — Unity MCP (free/MIT) + Coplay MCP (advanced tools)
> Both servers connect to the same Unity Editor via different plugins
> SpaceCode calls MCP tools directly (JSON-RPC) — never delegates to Coplay AI (`create_coplay_task` excluded)

#### 8.5.1 Connection Status Cards
- [x] Two side-by-side connection cards in dashboard MCP panel:
  - Unity MCP: status dot, URL (`localhost:8080`), transport (HTTP), connect/ping button
  - Coplay MCP: status dot, transport (stdio/uvx), launch button
- [x] Auto-ping both servers when MCP subtab opens
- [x] Show "Not Installed" state when server config missing (vs "Disconnected" when configured but unreachable)
- [x] Unified header status dot reflects combined state: green = any connected, red = all disconnected

#### 8.5.2 Tool Catalog Display
- [x] Categorized tool list showing which server provides what:
  - Scene Operations — Unity MCP (create/delete/modify objects, transforms, components)
  - Editor Control — Unity MCP (play, stop, compile check, console)
  - UI Toolkit — Coplay MCP (`create_ui_element`, `set_ui_text`, `set_ui_layout`, `set_rect_transform`, `capture_ui_canvas`)
  - Input System — Coplay MCP (`create_input_action_asset`, action maps, bindings, control schemes, wrapper codegen)
  - Event Wiring — Coplay MCP (`add_persistent_listener`, `remove_persistent_listener`)
  - Performance Profiling — Coplay MCP (`get_worst_cpu_frames`, `get_worst_gc_frames`, `list_objects_with_high_polygon_count`)
  - AI Generation — Coplay MCP (`generate_3d_model_from_text`, `generate_3d_model_from_image`, `generate_3d_model_texture`, `generate_or_edit_images`)
  - Package Management — Coplay MCP (`install_unity_package`, `install_git_package`, `remove_unity_package`)
  - Advanced Prefab/Asset — Coplay MCP (`create_prefab_variant`, `add_nested_object_to_prefab`, `assign_material_to_fbx`)
  - Script Execution — Both (`execute_script`)
- [x] Gray out categories when their server is disconnected
- [x] "Excluded" section: `create_coplay_task` with explanation ("delegates to external AI")

#### 8.5.3 Per-Server Details
- [ ] Per-server info: name, status, transport, version *(deferred — needs live MCP connection)*
- [ ] Tools count per server
- [ ] Last heartbeat / ping timestamp
- [ ] Error state and logs
- [ ] Retry on disconnect

#### 8.5.4 Tool Routing Logic
- [ ] Define tool→server mapping in a central registry (`src/mastercode_port/services/mcpToolRegistry.ts`) *(deferred — needs live MCP connection)*
- [ ] When SpaceCode needs a Unity action, look up which server owns the tool
- [ ] Fallback: if preferred server disconnected but alternate has the tool, use alternate
- [ ] Log which server handled each tool call for debugging

---

## Phase 9: Memory & Embeddings

### 9.1 Chat History Storage
> Per-project persistence

- [x] Store chat history per project
- [x] Rotation: 10,000 messages max (FIFO)
- [x] Message size limit: 32KB

### 9.2 Embedding System
> Semantic search

- [x] Embed chat sessions
- [x] Store embeddings (50,000 vectors max)
- [x] Enable semantic recall
- [ ] "Search previous chats" feature *(deferred — UI for semantic recall search bar)*

### 9.3 Summary Chunks
> Compacted memory

- [x] Generate summary chunks from conversations
- [x] Store as first-class memory items (1,000 max)
- [x] Include in context retrieval

---

## Phase 10: Agents & Skills

### 10.1 Agents Tab UI
> Visual agent management

- [x] Agent list with Station-style graphics
- [x] Agent status indicators: Active, Idle, Working
- [x] Right panel: agent details (inputs/outputs/triggers)
- [x] Run All / Configure buttons

### 10.2 Agent Definitions
> Define the 9 agents — *served from `src/agents/definitions.ts` (6 persona-based agents)*

- [x] MasterMind
- [x] SecurityAuditor
- [x] AsmdefGuard
- [x] Documentor
- [ ] ShaderSmith *(deferred — needs domain-specific agent logic)*
- [ ] Spine2DExpert *(deferred — needs domain-specific agent logic)*
- [ ] DatabaseGuard *(deferred — needs domain-specific agent logic)*
- [x] CodeReviewer
- [ ] Librarian *(deferred — needs domain-specific agent logic)*

### 10.3 Skills Tab UI
> Skill management

- [x] Skill list grouped by category
- [x] Skill details in right panel
- [ ] Add/Edit/Delete/Disable skills *(deferred — needs YAML skill file system)*
- [x] Skill trigger patterns display

### 10.4 Skill System
> Load and execute skills

- [ ] Parse YAML front-matter from skill files *(deferred — needs skill file format definition)*
- [ ] Validate skill schema
- [x] Trigger detection (regex match or /command)
- [x] Persona access check
- [x] Skill execution flow

---

## Phase 11: Explorer Integration

### 11.1 File Selection Context
> Gears responds to explorer

- [x] 500ms debounce on selection change
- [x] Build ExplorerContext payload (file, symbols, snippet, sector)
- [x] Inject context into Gears chat as system message
- [x] Clear previous context on new selection
- [x] Pin context option

### 11.2 Mode-Specific Behavior
> Different actions per mode

- [ ] Learn mode: auto-explain with analogy mapping *(deferred — needs mode system)*
- [ ] Maintenance mode: show relevant refactor options
- [ ] Neither: no auto-action, manual trigger only

---

## Phase 12: Polish & Settings

### 12.1 Debug Settings
> Developer tools

- [x] "Show panel borders" toggle (Dashboard → Settings → Developer)
- [x] Colored borders per panel type when enabled

### 12.2 Persona Status Bar
> Bottom of window indicator

- [x] Show all 6 personas with icons
- [x] Status: Active, Idle, Working
- [x] Click persona → jump to their tab/panel
- [ ] Show current action for Working status *(deferred — needs real-time agent status tracking)*

### 12.3 Settings Cleanup
> Organize settings properly

- [ ] Autoexecute toggle → Chat tab settings dropdown *(deferred — settings reorganization)*
- [ ] Context Pack → Chat tab right panel (Flow view)
- [ ] Asmdef Manager → Station Control Tests tab

### 12.4 Sector Configuration UI (from STATION_SECTORS_UX.md Phase 5)
> Allow users to create/edit sectors from the UI
> **Key principle**: Sectors are doc-driven. SA/GDD docs are the source of truth — sectors derive from them, not the other way around.

- [ ] Create/edit sectors from Station UI (currently code-only) *(deferred — needs sector editor UI)*
- [ ] Import/export `.spacecode/sectors.json` (using `SectorManager.exportConfig()`)
- [ ] **Generate sectors from SA/GDD docs**: parse doc sections (systems, modules, architecture layers) → suggest sector definitions
- [ ] Auto-detect sectors from folder structure (suggest sectors based on existing folders)
- [ ] Template presets: RPG (current default), Platformer, Multiplayer, etc. — templates are starting points, not permanent config
- [ ] Migrate default sectors from hardcoded `DEFAULT_RPG_SECTORS` to `.spacecode/sectors.json`
- [ ] Remove `DEFAULT_RPG_SECTORS` once migration and doc-driven generation are working

---

## Git Strategy

After each completed section:
```bash
git add -A
git commit -m "feat(spacecode): [Section] - [Brief description]"
```

After each phase:
```bash
git push origin main
```

---

## Reference: Existing Code & Design Docs

### Design Documents
| Document | Purpose |
|----------|---------|
| `docs/STATION_SECTORS_UX.md` | Station Sectors UX redesign (integrated into Phase 4) |
| `docs/PHASE2_IMPLEMENTATION_PLAN.md` | Detailed Phase 2 implementation plan with architecture |
| `docs/PRE_IMPLEMENTATION_CODE_OPTIMIZATION.md` | Modularization status and strategy |
| `docs/SEMGREP_SECURITY_RESEARCH.md` | Semgrep SAST integration research for Phase 6 |
| `docs/AUTOPILOT_DESIGN.md` | Autonomous plan execution engine (post-V2, ralph-tui inspired) |
| `docs/GAME_UI_COMPONENT_CATALOG.md` | Game UI component list, theme system, placeholder→art pipeline |
| `docs/STATION_ENGINEER_UX_SPEC.md` | Station Engineer proactive assistant UX — Gears orchestrator, suggestions, delegations |

### Existing Modules (already on main, ready to wire)
| Feature | Files |
|---------|-------|
| Agent/persona types | `src/agents/types.ts` |
| Agent definitions (all 6 personas) | `src/agents/definitions.ts` |
| Vault manager | `src/vault/VaultManager.ts` |
| Art studio manager | `src/artstudio/ArtStudioManager.ts` |
| Docs manager | `src/docs/DocsManager.ts` |
| Ticket routing | `src/tickets/index.ts`, `TicketProcessor.ts` |
| Memory system (SQLite + FTS5) | `src/memory/*` |
| Compaction logic | `src/mastercode_port/orchestrator/conversation.ts` |
| Settings + shortcuts | `src/settings/index.ts` |
| Planning | `src/planning/*` |
| Execution | `src/execution/*` |
| Verification | `src/verification/*` |
| Sector config | `src/sectors/SectorConfig.ts` |
| Asmdef enforcement | `src/verification/AsmdefGate.ts` |
| Sector Map (orbital Canvas 2D) | `src/webview/panel/features/sectorMap.ts` |
| Sector Map backend handler | `src/mastercode_port/ui/handlers/asmdef.ts` |
| Sound notifications | `src/mastercode_port/services/soundService.ts`, `media/sounds/*.mp3` |

---

## Settings Architecture

> **Rule**: All new settings MUST go through the central `SpaceCodeSettings` store.

### Canonical Store: `src/settings/index.ts`
- **Backing**: `context.globalState` (key: `spacecode.settings`)
- **Read**: `getSetting(key)` / `getSettings()`
- **Write**: `updateSettings({ key: value })`, then `saveSettings(context)` to persist
- **Persists**: Across reloads, workspace changes, and Extension Dev Host restarts

### Current Storage Locations (migration needed)
| Storage | Keys | Migration Status |
|---------|------|-----------------|
| `SpaceCodeSettings` (globalState) | persona, theme, AI provider, complexity, first-run | **Canonical** |
| `context.globalState` (other keys) | docs, vault, tickets, plans, costs | OK — domain-specific state, not settings |
| `context.workspaceState` | agent workflows | OK — workspace-scoped data |
| `context.secrets` | API keys | OK — secure storage required |
| `vscode.workspace.getConfiguration` | connection methods, model, API keys | **Migrate to SpaceCodeSettings** |
| webview `localStorage` | panel mode, splitter, control tab | OK — UI layout state, not settings |

### Rules for New Features
1. User-facing preferences → `SpaceCodeSettings` via `updateSettings()` + `saveSettings()`
2. Domain data (lists, history) → dedicated `globalState` key (e.g. `spacecode.tickets`)
3. Secrets → `context.secrets`
4. UI layout state → webview `localStorage` (ephemeral, non-critical)
5. **Never** use `vscode.workspace.getConfiguration` for new SpaceCode settings

---

## Sound Notification System

**Status**: Implemented but NOT YET WORKING — service created, `aiComplete` wired, 10 `.mp3` sound files added. Sound does not play in Extension Dev Host (likely `context.extensionPath` resolution issue or `complete` event not reaching handler). Needs debugging.

### Overview

SpaceCode can play short audio cues when key events happen (most importantly:
when the AI finishes responding). This is implemented via `SoundService`, a
singleton that spawns a detached `afplay` process on macOS (stubs for
Windows/Linux exist but are not yet wired).

### Files

| File | Purpose |
|------|---------|
| `src/mastercode_port/services/soundService.ts` | Service: playback, settings, event map |
| `src/extension.ts` | Initialization (`SoundService.getInstance().initialize()`) |
| `src/mastercode_port/ui/mainPanel.ts` | Hook: `aiComplete` on orchestrator `complete` event |
| `media/sounds/` | Sound files (`.mp3`, short < 1s, < 50 KB each) |

### Supported Events

| Event | Trigger | Where to hook |
|-------|---------|---------------|
| `aiComplete` | AI chat response finished | `mainPanel.ts` → orchestrator `on('complete')` — **WIRED** |
| `aiError` | AI chat response errored | `mainPanel.ts` → orchestrator `on('error')` (listener not yet created) |
| `planReady` | Plan generated | `handlers/plans.ts` → after `generatePlan` sends result |
| `workflowDone` | Workflow execution completed | `handlers/workflows.ts` → after final `workflowEvent` |
| `jobQueued` | New autoexecute job enters queue | `handlers/autoexecute.ts` → on new job |
| `jobApproved` | Autoexecute job approved | `handlers/autoexecute.ts` → after approve |
| `sectorViolation` | Sector boundary violation found | `SectorConfig.ts` → `validateDependencies()` |
| `buildSuccess` | Build succeeded | Future — when build pipeline is wired |
| `buildFail` | Build failed | Future — when build pipeline is wired |
| `notification` | Generic fallback | Anywhere — `SoundService.getInstance().play('notification')` |

### How to add a sound file

1. Create or download a short `.mp3` (< 1 second, < 50 KB).
2. Name it to match `SOUND_MAP` in `soundService.ts` (e.g. `ai-complete.mp3`).
3. Drop it into `media/sounds/`.
4. The service will pick it up automatically — no code change needed.

### Settings (persisted via globalState)

```typescript
{
  enabled: true,       // master switch
  volume: 0.5,         // 0.0 – 1.0
  events: {            // per-event overrides
    aiComplete: true,
    aiError: true,
    // ... set false to mute specific events
  }
}
```

### TODO

- [x] Add actual `.mp3` sound files to `media/sounds/` — 10 files converted from macOS system sounds (Glass, Basso, Ping, etc.)
- [x] Create `SoundService` singleton with macOS `afplay` playback
- [x] Initialize in `extension.ts` → `activate()`
- [x] Wire `aiComplete` hook on orchestrator `complete` event
- [ ] **Debug: sound doesn't play in Extension Dev Host** (extensionPath resolution? event not firing?)
- [ ] Wire remaining events (aiError, planReady, workflowDone, etc.)
- [ ] Add sound settings UI to dashboard Settings tab
- [ ] Implement Windows playback (PowerShell `SoundPlayer`)
- [ ] Implement Linux playback (`paplay` / `aplay`)
- [ ] Add a settings handler message type (`getSoundSettings` / `saveSoundSettings`)

---

*Last updated: 2026-02-04*
