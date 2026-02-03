# SpaceCode V2 Implementation Checklist

**Status**: In Progress
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

- [ ] Move `media/panel.js` into `src/webview/panel/index.ts` (source of truth)
- [ ] Add esbuild target to build `media/panel.js` from `src/webview/panel/index.ts`
- [ ] Keep `mainPanel.ts` HTML injector intact (load built `panel.js`)
- [ ] Split panel into modules: `state/`, `ipc/`, `ui/`, `features/`
- [ ] Verify UI parity (no behavior change after move/split)
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
- [ ] Move Planning UI → Chat tab Planning Mode (deferred to Phase 3)

---

## Phase 2: Chat System Overhaul

### 2.1 Input Behavior
> Stop/Send button logic per spec

- [ ] Show Stop button when AI is running AND input is empty
- [ ] Show Send button when text exists in input
- [ ] Implement 10s grace period (user can stop after sending)
- [ ] Implement "send while thinking" (interrupt current generation)

### 2.2 Chat Compaction
> Handle token limits gracefully

- [ ] Detect when approaching token limit
- [ ] Generate summary of conversation
- [ ] Replace old messages with summary chunk
- [ ] Keep recent N messages in full

### 2.3 Persona System Foundation
> Set up the 6-persona architecture

- [ ] Create persona types: `nova | gears | index | triage | vault | palette`
- [ ] Define persona interface (name, icon, color, location, tools)
- [ ] Create persona prompt templates location: `src/personas/prompts/`
- [ ] Implement persona routing based on tab/panel

### 2.4 Persona: Nova (Creator)
> Chat tab - full features

- [ ] Create `nova.system.md` prompt template
- [ ] Wire Nova to Chat tab (left panel)
- [ ] Enable all Nova tools: plan, execute, opinion, +chat, git
- [ ] Nova icon: `fa-rocket`, color: blue

### 2.5 Persona: Gears (Engineer)
> Station tab - maintenance focus

- [ ] Create `gears.system.md` prompt template
- [ ] Wire Gears to Station tab chat (33% width)
- [ ] Implement Learn/Maintenance mode toggle
- [ ] Disable: execution mode, GPT opinion, +chat, push-to-git
- [ ] Gears icon: `fa-gear`, color: orange

### 2.6 Persona: Index (Librarian)
> Dashboard → Docs panel

- [ ] Create `index.system.md` prompt template
- [ ] Wire Index to Dashboard Docs panel
- [ ] Implement Setup/Sync modes
- [ ] Index icon: `fa-book`, color: green

### 2.7 Persona: Triage (Ticket Bot)
> Dashboard → Tickets panel

- [ ] Create `triage.system.md` prompt template
- [ ] Wire Triage to Dashboard Tickets panel
- [ ] Implement ticket routing logic
- [ ] Triage icon: `fa-ticket`, color: purple

### 2.8 Persona: Vault (Database Engineer)
> Dashboard → Project DB panel

- [ ] Create `vault.system.md` prompt template
- [ ] Wire Vault to Dashboard Project DB panel
- [ ] Vault icon: `fa-database`, color: cyan

### 2.9 Persona: Palette (Art Director)
> Dashboard → Art Studio panel

- [ ] Create `palette.system.md` prompt template
- [ ] Wire Palette to Dashboard Art Studio panel
- [ ] Palette icon: `fa-palette`, color: pink

---

## Phase 3: Planning System

### 3.1 Planning Mode (replaces Swarm)
> Structured planning before implementation

- [ ] Add Planning Mode toggle to Chat tab
- [ ] Implement 4-phase flow: Study → Connect → Plan → Review
- [ ] Planning Panel UI in right panel (when Planning mode active)
- [ ] Show current phase indicator (1-4)
- [ ] Phase checklist with completion status
- [ ] Affected files list (grows during analysis)
- [ ] Risk assessment summary

### 3.2 Implementation Plan Output
> Generate structured plan artifact

- [ ] Generate Implementation Plan markdown
- [ ] Include: phases, tasks, affected files, risks, dependencies
- [ ] Save plans to `.spacecode/plans/`
- [ ] Plan can be handed to Gears for execution

### 3.3 Planning Gates
> Approval checkpoints

- [ ] Study Complete gate (Nova)
- [ ] Connection Mapped gate (Gears)
- [ ] Plan Approved gate (User)
- [ ] Docs Updated gate (Index)

### 3.4 Reuse Before Create Rule
> AI must check existing code first

- [ ] Search existing codebase before creating new functions
- [ ] Check if existing function can be extended
- [ ] Explain why existing code was insufficient if creating new
- [ ] Flag when similar functionality already exists

---

## Phase 4: Station Schematic

### 4.1 SA-Driven Schematic
> Architecture map from SA document

- [ ] Parse "Sector Map" table from SA document
- [ ] Extract: Sector ID, Name, Icon, Description, Dependencies
- [ ] Validate parsed data (see validation rules in spec)
- [ ] Build sector nodes and edges from dependencies

### 4.2 Schematic Visualization
> Display architecture visually

- [ ] Render sector nodes with FontAwesome icons
- [ ] Show connections/dependencies between sectors
- [ ] Display both analogy name + real engineering name
- [ ] Click sector → show details + explain/analyze actions

### 4.3 SA Compliance
> Detect when code violates architecture

- [ ] Detect cross-sector imports
- [ ] Detect missing sector definitions
- [ ] Detect wrong folder placement
- [ ] Detect circular dependencies
- [ ] Generate refactor plan to align code with SA

---

## Phase 5: Documentation System

### 5.1 Simple vs Complex Project Flag
> Reduce friction for small projects

- [ ] First-launch UI: "Simple" vs "Complex" choice
- [ ] Store: `spacecode.projectComplexity` in workspace settings
- [ ] Simple: no required docs, Index + Gears disabled (with explanation)
- [ ] Complex: requires GDD + SA setup

### 5.2 Docs Wizard
> Questionnaire-based setup

- [ ] GDD questionnaire (10 questions, 6 required)
- [ ] SA questionnaire (7 questions, 5 required)
- [ ] TDD questionnaire (optional)
- [ ] Generate docs from questionnaire answers
- [ ] Templates location: `templates/`

### 5.3 Template System
> Load and populate doc templates

- [ ] Create/verify templates exist:
  - [ ] `GDD_TEMPLATE.md`
  - [ ] `SA_TEMPLATE.md`
  - [ ] `TDD_TEMPLATE.md`
  - [ ] `ART_BIBLE_TEMPLATE.md`
  - [ ] `NARRATIVE_BIBLE_TEMPLATE.md`
  - [ ] `UIUX_SPEC_TEMPLATE.md`
  - [ ] `ECONOMY_TEMPLATE.md`
  - [ ] `AUDIO_DESIGN_TEMPLATE.md`
  - [ ] `TEST_PLAN_TEMPLATE.md`
  - [ ] `LEVEL_BRIEF_TEMPLATE.md`

### 5.4 Doc Sync
> Keep docs aligned with code

- [ ] Detect doc drift on code changes
- [ ] Index proposes updates
- [ ] Sync workflow: detect → propose → approve → update

---

## Phase 6: Testing & Quality

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

- [ ] Secret scanner (regex for API keys, passwords)
- [ ] Hardcoded credentials detection
- [ ] Dependency CVE checks
- [ ] Injection vulnerability analysis (AI-assisted)
- [ ] Results grouped by severity
- [ ] "Fix with Engineer" handoff button

### 6.4 Code Quality Tab
> Prevent code bloat

- [ ] Duplicate function detection
- [ ] Similar code block detection
- [ ] Magic number/hardcoded string scan
- [ ] Dead code detection
- [ ] Unused imports
- [ ] Circular dependency checker
- [ ] God class detector (>500 lines)
- [ ] High coupling analysis
- [ ] SA sector violation checker

### 6.5 Unity-Specific Checks
> Game engine specific

- [ ] Expensive Update() calls detection
- [ ] Missing null checks for GetComponent
- [ ] Find() in hot paths
- [ ] Allocations in loops
- [ ] Asset validation
- [ ] Missing prefab refs

---

## Phase 7: Cross-Persona Features

### 7.1 Context Handoff
> Pass context between personas

- [ ] ContextPackage schema implementation
- [ ] Handoff buttons in chat: "Send to Gears & Stay", "Go to Tab"
- [ ] Handoff menu (☰ Handoff → select persona)
- [ ] Context preview before handoff
- [ ] Store handoffs in `.spacecode/handoffs/`

### 7.2 Autosolve
> Background task completion

- [ ] Autosolve notifications
- [ ] Actions: View Changes, Send to Index, Dismiss
- [ ] Ticket → autosolve routing

### 7.3 Ticket Routing
> Smart ticket assignment

- [ ] Parse ticket type from keywords
- [ ] BUG → Gears
- [ ] FEATURE → Nova
- [ ] DOC_UPDATE → Index
- [ ] DATABASE → Vault
- [ ] ART/UI_DESIGN → Palette
- [ ] Ambiguous → ask user

---

## Phase 8: Dashboard Enhancements

### 8.1 Mission Panel
> Project timeline and approvals

- [ ] Approval queue display
- [ ] Project milestones
- [ ] Pending tasks overview

### 8.2 Storage Panel (Internal)
> SpaceCode's own storage

- [ ] Show storage type/location
- [ ] Chat history usage bar
- [ ] Embeddings usage bar
- [ ] Disk space usage
- [ ] Clear/Export buttons

### 8.3 Project DB Panel
> External game database

- [ ] Database connection wizard
- [ ] Provider support: Supabase, Firebase, PostgreSQL, MySQL, SQLite, MongoDB
- [ ] Schema viewer (tables, columns, relationships)
- [ ] Query builder interface
- [ ] Migration generator
- [ ] Type generation (TypeScript/C#)

### 8.4 Art Studio Panel
> Visual asset management

- [ ] Style storage (colors, fonts, themes)
- [ ] Recent assets display
- [ ] Gemini API integration for image generation
- [ ] Image generation UI (prompts, presets, variations)
- [ ] Asset library viewer

### 8.5 MCP Details Panel
> Server info display

- [ ] Per-server info: name, status, transport, version
- [ ] Tools count
- [ ] Last heartbeat
- [ ] Error state and logs
- [ ] Retry on disconnect

---

## Phase 9: Memory & Embeddings

### 9.1 Chat History Storage
> Per-project persistence

- [ ] Store chat history per project
- [ ] Rotation: 10,000 messages max (FIFO)
- [ ] Message size limit: 32KB

### 9.2 Embedding System
> Semantic search

- [ ] Embed chat sessions
- [ ] Store embeddings (50,000 vectors max)
- [ ] Enable semantic recall
- [ ] "Search previous chats" feature

### 9.3 Summary Chunks
> Compacted memory

- [ ] Generate summary chunks from conversations
- [ ] Store as first-class memory items (1,000 max)
- [ ] Include in context retrieval

---

## Phase 10: Agents & Skills

### 10.1 Agents Tab UI
> Visual agent management

- [ ] Agent list with Station-style graphics
- [ ] Agent status indicators: Active, Idle, Working
- [ ] Right panel: agent details (inputs/outputs/triggers)
- [ ] Run All / Configure buttons

### 10.2 Agent Definitions
> Define the 9 agents

- [ ] MasterMind
- [ ] SecurityAuditor
- [ ] AsmdefGuard
- [ ] Documentor
- [ ] ShaderSmith
- [ ] Spine2DExpert
- [ ] DatabaseGuard
- [ ] CodeReviewer
- [ ] Librarian

### 10.3 Skills Tab UI
> Skill management

- [ ] Skill list grouped by category
- [ ] Skill details in right panel
- [ ] Add/Edit/Delete/Disable skills
- [ ] Skill trigger patterns display

### 10.4 Skill System
> Load and execute skills

- [ ] Parse YAML front-matter from skill files
- [ ] Validate skill schema
- [ ] Trigger detection (regex match or /command)
- [ ] Persona access check
- [ ] Skill execution flow

---

## Phase 11: Explorer Integration

### 11.1 File Selection Context
> Gears responds to explorer

- [ ] 500ms debounce on selection change
- [ ] Build ExplorerContext payload (file, symbols, snippet, sector)
- [ ] Inject context into Gears chat as system message
- [ ] Clear previous context on new selection
- [ ] Pin context option

### 11.2 Mode-Specific Behavior
> Different actions per mode

- [ ] Learn mode: auto-explain with analogy mapping
- [ ] Maintenance mode: show relevant refactor options
- [ ] Neither: no auto-action, manual trigger only

---

## Phase 12: Polish & Settings

### 12.1 Debug Settings
> Developer tools

- [ ] "Show panel borders" toggle (Dashboard → Settings → Developer)
- [ ] Colored borders per panel type when enabled

### 12.2 Persona Status Bar
> Bottom of window indicator

- [ ] Show all 6 personas with icons
- [ ] Status: Active, Idle, Working
- [ ] Click persona → jump to their tab/panel
- [ ] Show current action for Working status

### 12.3 Settings Cleanup
> Organize settings properly

- [ ] Autoexecute toggle → Chat tab settings dropdown
- [ ] Context Pack → Chat tab right panel (Flow view)
- [ ] Asmdef Manager → Station Control Tests tab

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

## Reference: V2 Code Locations

Code from `v2-broken-backup` branch that may be useful:

| Feature | Files |
|---------|-------|
| Persona types | `src/personas/types.ts` |
| Vault manager | `src/vault/VaultManager.ts` |
| Settings | `src/settings/index.ts` |
| Notifications | `src/notifications/index.ts` |
| Memory system | `src/memory/*` |
| Planning | `src/planning/*` |
| Execution | `src/execution/*` |
| Tickets | `src/tickets/*` |
| Verification | `src/verification/*` |
| Swarm (deprecated) | `src/swarm/*` |

To retrieve code:
```bash
git show v2-broken-backup:src/path/to/file.ts > temp_reference.ts
```

---

*Last updated: 2026-02-03*
