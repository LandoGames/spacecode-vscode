# SpaceCode V3 Implementation Checklist

**Status**: Phase 0 Complete (+/help +icons), Phase 5.0 Complete, CF-1 Sound UI + cross-platform + events wired, CF-2 Complete (except 2 deferred), CF-3 Diagnostics tab added, CF-7 Settings reviewed, CF-8 Complete, Phase 1 Complete (1.1–1.4; 1.5 deferred), Phase 2 Complete, Phase 3 Complete, Phase 4 Infrastructure Complete, Phase 5 Complete, Phase 6 Complete, Phase 7 Core Complete (+persistence), Phase 8 Core Complete (+persistence), Phase 9 Core Complete, **Post-V3 Refinements Complete** (R1–R6: tag strip, per-tab modes, split layout, flow fix, module scaffolding, settings overlay)
**Baseline**: V2 complete (Phases 0–12 implemented, deferred items carried forward)
**Approach**: Phase 0 (persistent chat layout) is foundational — implement first, then remaining phases in order

---

## How to Use This Document

1. Pick a task from the checklist below
2. Mark it as `[~]` (in progress)
3. Implement, test in Extension Development Host
4. Mark as `[x]` when complete and working
5. Commit changes

**Legend:**
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked / Issues

---

## V2 Carry-Forward (Remaining from V2)

> Items deferred or incomplete from V2. Must be addressed before or alongside V3 features.

### CF-1: Sound System Debugging
> Sound system is built but doesn't play in Extension Dev Host
> Files: `src/mastercode_port/services/soundService.ts`, `src/extension.ts`

- [x] Debug `extensionPath` resolution in Extension Dev Host (uses context.extensionPath — correct)
- [ ] Verify `media/sounds/*.mp3` files are accessible at runtime (need actual .mp3 files)
- [x] Confirm `SoundService.getInstance().play('aiComplete')` fires and reaches `afplay`
- [x] Wire remaining events: `aiError`, `planReady`, `workflowDone`, `jobQueued`, `jobApproved`, `sectorViolation`
- [x] Add sound settings UI to Dashboard Settings tab (volume slider + per-event toggles)
- [x] Add `getSoundSettings` / `saveSoundSettings` message types
- [x] Implement Windows playback (PowerShell MediaPlayer)
- [x] Implement Linux playback (`paplay` / `aplay`)

### CF-2: Sector Map Polish
> Remaining UI polish items from Phase 4

- [x] Solid edges for enforced (asmdef), dashed for intended (config-only)
- [x] Edit Policy quick action on Sector Card
- [x] Back button returns to Sector Map from Card view
- [x] Layout: split view (graph left, card right) or full-card on narrow layouts
- [x] Health trend over time (stored in localStorage, trend arrow ↑↓→)
- [x] AI context injection works regardless of tier (`contextAvailable` flag)
- [ ] Detect wrong folder placement (deferred to Phase 1)
- [ ] Generate refactor plan to align code with SA (deferred to Phase 1)

### CF-3: Testing & Quality Gaps
> Remaining Phase 6 items — partially addressed by Semgrep integration (Phase 2 below)

- [x] Diagnostics tab: build/compile check, syntax error detection, missing references, results UI
- [ ] Tests tab: unit test runner, integration test runner, asmdef dependency check, GUID validation, lint/style
- [ ] Security tab: dependency CVE checks (via Semgrep Supply Chain)
- [ ] Quality tab: unused imports, circular dependency checker, SA sector violation checker
- [ ] Unity checks: asset validation, missing prefab refs

### CF-4: Doc Sync AI Integration
> Phase 5.4 — detection works, AI-driven propose/approve/update pending

- [ ] Technical Writer proposes doc updates based on detected drift
- [ ] Sync workflow: detect → propose → approve → update

### CF-5: MCP Live Connection Features
> Phase 8.5.3–8.5.4 — deferred until live MCP connection available

- [ ] Per-server details: name, status, transport, version, tools count, heartbeat, error logs
- [ ] Tool routing logic: central registry, server lookup, fallback, call logging

### CF-6: Agent & Skill System Gaps
> Phase 10 deferrals

- [ ] Domain-specific agents: ShaderSmith, Spine2DExpert, DatabaseGuard, Librarian
- [ ] YAML skill file system: parse front-matter, validate schema, Add/Edit/Delete/Disable UI

### CF-7: Mode System & Settings
> Phase 11–12 deferrals

- [ ] Learn mode / Maintenance mode for Explorer integration
- [x] Settings cleanup: autoexecute toggle placement, context pack placement (both well-placed in General/Info)
- ~~Persona status bar: show current action for Working status~~ — **OBSOLETE**: Persona bar replaced by Chat Context Bar (Phase 0.7)

### CF-8: Sector Configuration UI
> Phase 12.4 — full sector editor

- [x] Create/edit sectors from Station UI (Configure panel with inline editor)
- [x] Import/export `.spacecode/sector-config.json` (via file dialogs)
- [ ] Generate sectors from SA/GDD docs (deferred — requires AI integration)
- [x] Auto-detect sectors from folder structure (asmdef scan + folder pattern scan)
- [x] Template presets (RPG, Platformer, Multiplayer, Mobile, Blank)
- [x] Migrate from hardcoded `DEFAULT_RPG_SECTORS` to file-based config (loadSectorConfig + config UI)

---

## Phase 0: Persistent Chat Layout
> Foundational UX change — chat is always present across all tabs
> Must be implemented first as all other phases depend on this layout
>
> **Prerequisite**: Phase 5.0 (Base Persona Rename) should be done first or in parallel, since Phase 0 UI references persona names. Implementing with old names (Nova, Gears) then renaming causes rework.

### 0.1 Header Navigation
> Remove Chat tab — chat is always present; keep existing navigation structure

- [x] Remove "Chat" button from header tab bar (chat is always visible on left)
- [x] Remaining header tabs: Station, Agents, Skills, Dashboard (unchanged)
- [x] Dashboard sub-tabs remain contextual (appear only when Dashboard active) — see list below
- [x] Station mode buttons remain contextual (appear only when Station active) — no changes

**Dashboard Sub-tabs (V3):**
| Sub-tab | Purpose | Notes |
|---------|---------|-------|
| Mission | Project overview, goals, health summary | Primary landing |
| Docs | Documentation library (GDD, SA, TDD) | Major feature — `/docs` shortcut |
| Tickets | Issue tracking, task management | Major feature — `/tickets` shortcut |
| DB | Project database, schema viewer | If connected |
| Art | Art assets, image generation | Art Director context |
| MCP | MCP server status, connections | Moved from Settings |
| Logs | System logs, debug output | Developer utility |
| Storage | File storage, assets | Utility |
| Info | Project info, version, stats | Utility |

**Note**: Settings moved to ⚙️ overlay (already done in V2).

### 0.2 Layout Architecture
> Split layout into Chat (left) + Content (right)

- [x] Refactor webview layout to two-column structure: chat panel (left) + content area (right)
- [x] Default width split: 33% chat / 67% content
- [x] Add draggable resize handle between chat and content panels
- [x] Persist user's preferred width ratio in settings (via `localStorage`)
- [x] Add collapse button to hide chat entirely (full hide, not minimize to rail)
- [x] Add expand button (visible when chat is collapsed) to restore chat
- [x] Collapsed state persisted across tab switches and sessions

### 0.3 Chat Across All Tabs
> Chat panel renders the same chat instance regardless of active tab

- [x] Chat panel is a single persistent instance — not re-created per tab
- [x] Tab switching does NOT clear chat history or reset scroll position
- [x] Chat input, message list, and controls render identically across all tabs
- [x] Content area swaps based on active tab: Station, Dashboard, Agents, Skills

### 0.4 Persona Auto-Switching
> Chat persona context changes based on active tab

- [x] Active tab determines default persona context:
  - Station → QA Engineer (sector map, engineer suggestions)
  - Dashboard → QA Engineer (project health, build info, settings)
  - Agents → Lead Engineer (engineering tasks)
  - Skills → Technical Writer (skill/doc lookup)
- [x] Persona switch is a context hint, not forced — user can manually override at any time
- [x] Show current persona name in chat header
- [x] Switching tabs does NOT interrupt an in-progress AI response

**Manual Override Precedence Rules:**
- [x] Track `manualOverride: boolean` flag in chat state
- [x] When user manually selects persona → set `manualOverride = true`
- [x] When `manualOverride = true` → tab switches do NOT change persona
- [x] Clear button in chat header resets to tab-default persona and sets `manualOverride = false`
- [x] Visual indicator when in manual override mode (e.g., persona name has "pinned" icon)

### 0.5 Per-Tab Content Area Adjustments
> Each tab's content adapts to the reduced width

- [x] Dashboard: build info, tickets, art panels stack vertically instead of grid when narrow
- [x] Station: sector map uses available width; card detail overlays instead of side panel
- [x] Agents tab: agent list and config use full content width
- [x] Skills tab: skill cards reflow to available width

### 0.6 Responsive Behavior
> Handle edge cases for narrow viewports

- [x] Minimum chat width: 250px (below this, auto-collapse)
- [x] Minimum content width: 300px (below this, chat auto-collapses)
- [x] When total panel width < 550px: show only one panel at a time with toggle button
- [x] Resize handle shows visual feedback on hover/drag (cursor change, highlight line)

### 0.7 Chat Context Bar (Replaces Persona Status Bar)
> Repurpose lower persona status bar from navigation to context display
> **Implementation evolved into Tag Strip** — see Post-V3 Refinement R1

**Original design (Phase 0.7 spec):**
```
[🔧 QA Engineer ▼] [📐] [🎨] [📚]  [×]
```

**Actual implementation (Tag Strip):**
```
● QA Engineer  |  Sectors  Asmdef  Build  |  Ready
  [persona tag]   [skill tags per tab]       [status]
```

- [x] Remove click-to-navigate behavior from persona dots
- [x] Replace persona dots with tag strip (`.status-bar.tag-strip`)
- [x] Persona tag: color dot + label + pin indicator; click opens persona menu
- [x] Skill tags auto-populate per tab from `TAB_SKILL_MAP` with readable labels
- [x] `SKILL_LABELS` map translates IDs to display names (`'sector-analysis'` → `"Sectors"`)
- [x] Status tag shows current state (Ready / Working / Error)
- [x] Persona dropdown shows all 6 personas — selecting one sets `manualOverride = true`
- [x] `[×]` unpin button clears manual override, returns to tab-default persona
- [x] Context bar positioned at top of chat pane

### 0.8 Chat State Store
> Single source of truth for chat state — survives tab switches

- [x] Create `ChatStore` interface with:
  - `messages: ChatMessage[]` — full conversation history (via existing chatSessions.ts)
  - `activePersona: PersonaId` — current persona context
  - `manualOverride: boolean` — user manually selected persona
  - `autoSkills: SkillId[]` — tab-derived skills (change on tab switch)
  - `manualSkills: SkillId[]` — user-added skills (persist across tabs)
  - `scrollPosition: number` — preserve scroll on tab switch
- [x] Tab switches update `activePersona` + `autoSkills` WITHOUT re-rendering messages
- [x] Implement `reconcileContext(newTab)` — updates persona/skills based on tab, respects override
- [ ] Store persisted to `globalState` for session recovery (deferred — localStorage used for now)
- [x] Create `src/webview/panel/features/chatStore.ts` — singleton managing chat state
- [x] Export via `window.chatStore` for access from handlers and webview sync

**Tab → Auto-Skills Mapping:**

| Tab | Default Persona | Auto-Skills |
|-----|-----------------|-------------|
| Station | QA Engineer | `sector-analysis`, `asmdef-check`, `build-tools` |
| Dashboard | QA Engineer | `project-health`, `settings-access` |
| Agents | Lead Engineer | `agent-management`, `task-delegation` |
| Skills | Technical Writer | `skill-lookup`, `doc-templates` |

- [x] Define `TAB_SKILL_MAP` constant with above mappings
- [x] Auto-skills attach on tab enter, detach on tab leave
- [x] Manual skills (user-added) persist across all tabs
- [x] Combined skills = `autoSkills ∪ manualSkills` (union, no duplicates)

### 0.9 Quick Access Shortcuts
> Major features accessible from persistent chat without tab switching

- [x] `/docs` command opens Docs panel in content area (switches to Dashboard > Docs)
- [x] `/tickets` command opens Tickets panel in content area (switches to Dashboard > Tickets)
- [x] `/station` command switches to Station tab
- [x] `/skills` command switches to Skills tab
- [x] Optional: Add quick-access icon buttons in chat header for Docs, Tickets, Station
- [x] Commands work regardless of current tab — they switch content area, not chat

**Command Routing:**
- [x] All `/` commands route through existing skill command system (not a separate namespace)
- [x] Navigation shortcuts are registered as built-in skills with `type: 'navigation'`
- [x] Check for conflicts with user-defined skills — built-ins take precedence
- [x] `/help` lists all available commands (navigation + user skills)
- [x] Create `BUILTIN_NAV_COMMANDS` in `state.ts` — register `/docs`, `/tickets`, `/station`, `/skills` at startup
- [x] Precedence order: built-in navigation > user skills > fallback to chat

---

## Phase 1: Station Engineer
> Design reference: [`docs/STATION_ENGINEER_UX_SPEC.md`](STATION_ENGINEER_UX_SPEC.md)
> Proactive project-aware assistant on Station tab with suggest-only model
>
> **Dependency**: CF-8 (Sector Configuration UI) provides sector state that Engineer triggers use. Engineer works without sectors but sector-related triggers (orphan files, violations) require CF-8.
>
> **Fallback when sectors unavailable**: Run only doc-staleness, test-failure, policy-change, and undocumented-file triggers. Skip sector-violation and orphan-file triggers. Show "Configure sectors to enable full analysis" hint in UI.

### 1.1 Core Engine
> Backend: suggestion generation, scoring, and persistence

- [x] Create `src/engineer/EngineerTypes.ts` — `Suggestion`, `HistoryEntry`, `EngineerState` interfaces
- [x] Create `src/engineer/EngineerScorer.ts` — scoring formula: `(Risk×3) + (Impact×2) + (Urgency×2) - Effort`
- [x] Create `src/engineer/EngineerPersistence.ts` — read/write `.spacecode/engineer-state.json`
- [x] Create `src/engineer/RuleTriggers.ts` — 6 rule-based triggers (docs stale, tests failing, policy changed, undocumented files, sector violation, orphan files)
- [x] Create `src/engineer/EngineerEngine.ts` — orchestrates triggers, scoring, filtering, persistence
- [x] Implement 24h dismissal cooldown logic
- [x] Implement duplicate rejection and AI suggestion cap (max 3)

**Suggestion Ordering:**
- [x] Rule-based suggestions always appear first (sorted by score)
- [x] AI suggestions fill remaining slots (max 3) after rule-based
- [x] If rule-based count ≥ display limit, AI suggestions are suppressed
- [x] "Show all" toggle reveals all suggestions regardless of limit

### 1.2 Message Handler
> Wire engineer to webview message protocol

- [x] Create `src/mastercode_port/ui/handlers/engineer.ts`
- [x] Handle `engineerAction` — accept/defer/dismiss a suggestion
- [x] Handle `engineerDelegate` — route to role (Architect, Verifier, Doc Officer, etc.)
- [x] Handle `engineerRefresh` — trigger manual rescan
- [x] Send `engineerStatus` on Station tab open
- [x] Send `engineerSuggestions` after scan completes
- [x] Send `engineerHistory` on request
- [x] Wire to autoexecute queue — "Run" actions queue for approval

**Autoexecute Gate Rules:**
- [x] If autoexecute is **ON**: "Run" adds to approval queue, executes after user approves
- [x] If autoexecute is **OFF**: "Run" button is disabled, shows "Enable autoexecute to run"
- [x] High-risk suggestions (score > 8 or `risk: 'high'`) always require explicit approval even with autoexecute ON
- [x] Delegation actions (Architect, Verifier, etc.) bypass autoexecute — they're chat context switches, not code execution

### 1.3 Station Tab UI
> Engineer Panel in Station tab

- [x] Status strip in Station header: health indicator + alert count + top action
- [x] Ship Status section: warnings list, health trend
- [x] Suggestions list: ranked cards with Why / Risk / Confidence / Source / Score
- [x] Action buttons per suggestion: Run / Open / Defer / Dismiss
- [x] Delegations section: 6 role buttons (Architect, Modularity Lead, Verifier, Doc Officer, Planner, Release Captain)
- [x] History section: past 20 decisions with timestamps
- [x] "Show all" toggle for low-score suggestions (< 5)

### 1.4 Contextual Inline Prompts
> Non-blocking notifications

- [x] Send `engineerPrompt` for critical/warning items when relevant context is active
- [x] Render as dismissible notification bar in webview
- [x] Suppress after dismiss (24h cooldown)

### 1.5 AI-Driven Suggestions (Optional)
> AI analysis layered on top of rule-based triggers — **deferred to Phase 1.5**

- [ ] Structured prompt for QA Engineer persona to analyze project state
- [ ] Parse JSON response into `Suggestion[]`
- [ ] Label AI suggestions with `source: 'ai'`
- [ ] Trigger on: Station tab open, manual refresh, significant git activity

---

## Phase 2: Semgrep Integration
> Design reference: [`docs/SEMGREP_SECURITY_RESEARCH.md`](SEMGREP_SECURITY_RESEARCH.md)
> Replace regex-based scanners with Semgrep SAST engine

### 2.1 Semgrep CLI Wrapper
> Core infrastructure for running Semgrep

- [x] Create `src/security/SemgrepRunner.ts` — spawn `semgrep --json`, parse output
- [x] Create `src/security/SemgrepTypes.ts` — `Finding`, `SemgrepResult`, severity types
- [x] Create `src/security/SemgrepRules.ts` — manage rule configs (built-in + custom), 6 scan profiles
- [x] Implement `checkInstalled()` — detect if Semgrep CLI is available (common paths, expanded PATH)
- [x] Show Semgrep mode indicator in scan results (`semgrepMode` field)

**Offline/Fallback Mode:**
- [x] When Semgrep not installed → mode returns `'unavailable'`, regex scanners run as full fallback
- [x] Fallback to existing regex-based scanners (`SecurityScanner.ts`, `SecretScanner.ts`, etc.)
- [x] Semgrep mode sent with every scan result for UI indicator
- [x] `resetInstallCache()` for re-checking after install
- [x] `securitySemgrepStatus` message returns profiles, custom rules, install status

### 2.2 Security Tab Enhancement
> Upgrade existing Security tab with Semgrep-backed scanning

- [x] Wire `SemgrepRunner.scan()` as primary engine in `SecurityScanner.scan()`
- [x] Use built-in rulesets: `p/security-audit`, `p/secrets`, `p/owasp-top-ten`
- [x] Parse JSON results → existing `SecurityFinding[]` format (full field mapping)
- [x] Map Semgrep severity (ERROR/WARNING/INFO) to existing severity display
- [x] Add CWE + OWASP metadata to finding details
- [x] Add Semgrep autofix suggestions (`fix` field mapped to `suggestedFix`)
- [x] Keep existing regex scanners as fallback when Semgrep not installed
- [x] Deduplication: regex findings that overlap Semgrep findings are filtered
- [x] Profile-based scanning via `securityScanWithProfile` message
- [x] 6 scan profiles: security-full, security-quick, quality, supply-chain, unity, pentest

### 2.3 Custom Unity Rules
> Game-dev specific YAML rules

- [x] Create `media/semgrep-rules/unity-performance.yaml` — Find/GetComponent in Update, allocations, Camera.main, tag comparison, SendMessage
- [x] Create `media/semgrep-rules/unity-null-safety.yaml` — unchecked GetComponent, destroyed object access, coroutine null checks, singleton null
- [x] Create `media/semgrep-rules/csharp-security.yaml` — SQL injection, path traversal, command injection, weak crypto, hardcoded credentials, insecure deserialization, HTTP no TLS
- [x] Create `media/semgrep-rules/typescript-security.yaml` — eval, innerHTML XSS, command injection, path traversal, hardcoded secrets, prototype pollution, regex DoS, insecure random
- [x] Create `media/semgrep-rules/code-quality.yaml` — unused promises, console.log, TODO/FIXME, empty catch, any type, Debug.Log, magic numbers, nested ternary
- [x] Custom rules auto-discovered from `media/semgrep-rules/` and `.spacecode/semgrep-rules/`
- [x] Include custom rules in scan config alongside built-in rulesets

### 2.4 Code Quality Tab Enhancement
> Use Semgrep for pattern-based quality checks

- [x] Wire Semgrep quality profile alongside existing regex scanners
- [x] Semgrep quality findings sent as `semgrepFindings` in quality scan result
- [x] Keep existing `ComplexityAnalyzer`, `DuplicationScanner`, `MagicValueScanner`, `DeadCodeScanner` for metrics Semgrep can't do
- [ ] Add circular dependency detection via `madge` CLI wrapper (deferred — JS/TS specific)

### 2.5 Dependency CVE Scanning
> Semgrep Supply Chain for vulnerability detection

- [x] Wire `semgrep --supply-chain` via `supply-chain` scan profile
- [x] `securitySupplyChainScan` message handler
- [x] Supply chain profile configured with `p/supply-chain` ruleset
- [ ] Display dedicated CVE results UI in Security tab (deferred — uses standard findings display for now)
- [ ] Group by package name with upgrade recommendations (deferred)

---

## Phase 3: Autopilot Engine
> Design reference: [`docs/AUTOPILOT_DESIGN.md`](AUTOPILOT_DESIGN.md)
> Autonomous plan execution with pause/resume, retry, and agent fallback

### 3.1 Core Engine (Phase A from design doc)
> Minimal viable autopilot loop

- [x] Create `src/autopilot/AutopilotTypes.ts` — `AutopilotStatus`, `AutopilotState`, `AutopilotConfig`, `StepResult`
- [x] Create `src/autopilot/AutopilotEngine.ts` — main loop with state machine (idle → running → pausing → paused → stopping)
- [x] Implement pause check (poll 200ms while paused)
- [x] Wire to `PlanExecutor.executeSingleStep()` for step execution
- [x] Emit events: `autopilot:started`, `autopilot:step-start`, `autopilot:step-complete`, `autopilot:complete`
- [x] Add message handlers: `autopilotStart`, `autopilotPause`, `autopilotResume`, `autopilotAbort`
- [x] Send `autopilotStatus` updates to webview

### 3.2 Error Handling (Phase B from design doc)
> Resilience: retry, skip, abort, rate limiting

- [x] Create `src/autopilot/ErrorStrategy.ts` — retry with exponential backoff (2s × 2^n)
- [x] Implement skip strategy (mark step skipped, continue)
- [x] Implement abort strategy (stop on failure)
- [x] Create `src/autopilot/RateLimitDetector.ts` — regex patterns for 429, rate limit, quota exceeded
- [x] Implement agent fallback: claude → gpt on rate limit
- [x] Implement primary agent recovery between steps
- [x] Wire sound events: `aiComplete` per step, `aiError` on fail, `workflowDone` on complete, `sectorViolation` on all-agents-limited

### 3.3 Session Persistence (Phase C from design doc)
> Survive restarts and crashes

- [x] Create `src/autopilot/AutopilotSession.ts` — file-based session state (`.spacecode/autopilot-session.json`)
- [x] Write session state after each step completion
- [x] On extension activation: check for interrupted session
- [x] "Resume interrupted session?" prompt in webview
- [x] Session includes: planId, current phase/step index, completed/failed/skipped counts, active agent, config

### 3.4 Autopilot UI (Phase D from design doc)
> Control bar and configuration

- [x] Autopilot control bar in webview: status, step counter, pause/stop buttons, agent indicator
- [x] Autopilot config section in Dashboard Settings: primary agent, fallback agent, error strategy, retry count, step delay
- [x] Autopilot as third plan execution mode (alongside Manual and Step-by-Step)
- [x] Respect autoexecute gate: if OFF, autopilot start queued for approval
- [x] Context compaction between phases for long plans

**Autoexecute Gate Behavior:**
- [x] If autoexecute is **ON**: Autopilot runs freely, each step executes automatically
- [x] If autoexecute is **OFF**: Autopilot start request goes to approval queue
- [x] Once approved, autopilot runs until completion (no per-step approval needed)
- [x] User can pause/abort anytime regardless of autoexecute setting
- [x] Show "Autopilot queued — awaiting approval" status when blocked by gate

---

## Phase 4: Game UI Pipeline
> Design reference: [`docs/GAME_UI_COMPONENT_CATALOG.md`](GAME_UI_COMPONENT_CATALOG.md)
> Build game UI via Coplay MCP with placeholders, then swap with NanoBanana art

### 4.0 Pipeline Infrastructure (SpaceCode Extension)
> Types, engine, handler, frontend for orchestrating UI generation

- [x] Create `src/gameui/GameUITypes.ts` — component catalog (150+ components), theme types, pipeline state
- [x] Create `src/gameui/GameUIPipeline.ts` — pipeline engine with phase execution, placeholder generation, USS generation, state persistence
- [x] Create `src/gameui/index.ts` — barrel exports
- [x] Create `src/mastercode_port/ui/handlers/gameui.ts` — 12 message handlers for pipeline control
- [x] Create `src/webview/panel/features/gameui.ts` — frontend render + action handlers
- [x] Add Game UI tab to Station control tabs
- [x] Wire messageRouter cases for gameuiState, gameuiCatalog, gameuiPipelineEvent, gameuiThemes, etc.
- [x] Add Game UI CSS styles to panel.css

### 4.1 Theme System
> USS-based theming for Unity UI Toolkit

- [x] Define theme variable categories: brand, surface, text, feedback, rarity, bars, typography, spacing, borders, component sizes
- [ ] Create default theme USS file (`Assets/UI/Themes/DefaultTheme.uss`) with all variables from catalog
- [ ] Create `ThemeManager.cs` — runtime theme switching via USS swap
- [ ] Store theme preference in PlayerPrefs
- [ ] Create at least one alternate theme (e.g., light theme)

### 4.2 Primitives (Phase A)
> Foundation components used by everything else

- [ ] PRM-001 Button (primary, secondary, ghost, icon, danger)
- [ ] PRM-002 Toggle switch
- [ ] PRM-003 Slider
- [ ] PRM-004 Dropdown
- [ ] PRM-005 Text input
- [ ] PRM-006 Checkbox
- [ ] PRM-007 Radio group
- [ ] PRM-008 Tab bar
- [ ] PRM-009 Scroll view
- [ ] PRM-010 Progress bar
- [ ] PRM-011 Badge / pill
- [ ] PRM-012 Divider
- [ ] PRM-013 Avatar frame
- [ ] PRM-014 Tooltip
- [ ] PRM-015 Modal backdrop
- [ ] PRM-016 Spinner / loader
- [ ] PRM-017 Star rating

### 4.3 System Screens (Phase B)
> Full-screen flows

- [ ] SYS-001 Splash screen
- [ ] SYS-002 Title screen
- [ ] SYS-003 Loading screen
- [ ] SYS-004 Login panel
- [ ] SYS-005 Server select
- [ ] SYS-006 Settings panel
- [ ] SYS-007 Credits scroll
- [ ] SYS-008 Pause menu
- [ ] SYS-009 Game over screen

### 4.4 Main Menu (Phase C)
- [ ] MENU-001 through MENU-009
- [ ] Navigation wiring between sections

### 4.5 HUD Elements (Phase D)
- [ ] HUD-001 through HUD-018
- [ ] Position for target resolution

### 4.6 Panels (Phase E)
- [ ] INV-001 through INV-009 (Inventory & Equipment)
- [ ] CHAR-001 through CHAR-006 (Character & Stats)
- [ ] SOC-001 through SOC-008 (Social)
- [ ] SHOP-001 through SHOP-007 (Store / Shop)

### 4.7 Dialogs & Map (Phases F–G)
- [ ] DLG-001 through DLG-008
- [ ] MAP-001 through MAP-005

### 4.8 Art Replacement (Phase H)
> Swap placeholders with NanoBanana-generated spritesheets

- [ ] Generate spritesheets via NanoBanana (primitives first, then HUD, panels, icons, screens)
- [ ] Slice and import to Unity (`Assets/UI/Sprites/[ComponentID]/`)
- [ ] Update USS references: `background-image: resource('UI/Sprites/...')`
- [ ] Verify each component via `capture_ui_canvas`
- [ ] Create second theme variant with alternate art

---

## Phase 5: Role System Upgrade
> Replace fantasy persona names with real job titles that users understand

### 5.0 Base Persona Rename
> "Nova what is it? means nothing." — Use real role names everywhere.

**Old → New Mapping:**

| Old Name | New Name | Role Description |
|----------|----------|------------------|
| Nova | **Lead Engineer** | Primary coding agent — features, architecture, code review |
| Gears | **QA Engineer** | Quality specialist — debugging, testing, security, maintenance |
| Index | **Technical Writer** | Documentation specialist — GDD, SA, TDD, doc sync |
| Triage | **Issue Triager** | Ticket routing — analyze issues, assign to appropriate role |
| Vault | **Database Engineer** | Data specialist — schema, queries, migrations, API design |
| Palette | **Art Director** | Visual design — style guides, assets, UI/UX, image generation |

**Implementation checklist:**

- [x] Rename `AgentId` type: `nova` → `lead-engineer`, `gears` → `qa-engineer`, etc.
- [x] Rename prompt files: `nova.system.md` → `lead-engineer.system.md`, etc.
- [x] Update `PromptLoader.ts` fallback strings with new names
- [x] Update `PersonaRouter.ts` to use new IDs
- [x] Update all UI labels in `mainPanelHtml.ts` and `panel.js`
- [x] Update `settingsPanel.ts` persona dropdown (persona selector is in chatContextBar HTML — already uses new names)
- [x] Update chat header persona display
- [x] Update persona auto-switching mapping (tab → persona)
- [x] Update `agents/definitions.ts` persona definitions
- [x] Update all `messageRouter.ts` references
- [x] Search & replace all `'nova'` / `'gears'` / etc. string literals across codebase
- [x] Update documentation (V3 checklist, any design docs)

### 5.1 Delegated Role Definitions
> Scoped sub-roles for Station Engineer delegation (these scope the base personas)

| Delegated Role | Base Persona | Scope |
|----------------|--------------|-------|
| Architect | Lead Engineer | Architecture decisions only |
| Modularity Lead | Lead Engineer | Module boundaries & dependencies |
| Verifier | QA Engineer | Verification & testing only |
| Doc Officer | Technical Writer | Same as base (documentation) |
| Planner | Lead Engineer | Planning & task breakdown |
| Release Captain | Lead Engineer | Release prep & checklist |

- [x] Create role-specific system prompts that scope the base persona
- [x] Each prompt inherits base persona capabilities but focuses on role's responsibility

### 5.2 Role Delegation UI
> Station Engineer delegates to scoped roles

- [x] Role buttons in Station Engineer panel trigger persona switch with role-scoped prompt
- [x] Show delegated role name in chat header (e.g., "Architect" not "Lead Engineer")
- [x] Return to Station Engineer view when delegation completes

---

## Phase 6: Infrastructure & Polish

### 6.1 Project DB Panel
> Dashboard database integration (from V2 Phase 8.3)

- [x] Database connection wizard
- [x] Provider support: Supabase, Firebase, PostgreSQL, MySQL, SQLite, MongoDB
- [x] Schema viewer, query builder, migration generator, type generation

### 6.2 Semantic Search UI
> From V2 Phase 9.2

- [x] "Search previous chats" feature — search bar in chat header
- [x] Display results with relevance score, source chat, timestamp
- [x] Click result → load full chat context

### 6.3 Build Pipeline Integration
> Wire build success/failure events

- [x] Detect build results from Unity Editor (via MCP `check_compile_errors`)
- [x] Wire `buildSuccess` / `buildFail` sound events
- [x] Station Engineer: auto-suggest on build failure

---

## Phase 7: Comms Array
> API operations, security scanning, and penetration testing hub
> Location: **Station → Control → Comms**

### 7.0 Concept

The **Comms Array** handles external communications and threat detection — sending API requests, scanning for vulnerabilities, and testing defenses.

| Station Concept | SpaceCode Feature |
|-----------------|-------------------|
| Transmit signal | Send API request |
| Threat detection | Vulnerability scanning |
| Defensive systems test | Penetration testing |
| Frequency scan | Port scanning |
| Signal interception | Traffic sniffing (proxy capture) |
| Signal alteration | Request/response modification |
| Comms hold | Request intercept (pause before forward) |
| Echo test | Replay attack |

**Comms vs Ops**:
| Aspect | Comms Array | Ops Array |
|--------|-------------|-----------|
| Purpose | Test & probe external systems | Manage & deploy infrastructure |
| Actions | Send requests, scan, intercept | Deploy, configure, monitor |
| Security role | Find vulnerabilities | Prevent vulnerabilities |

### 7.1 Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 1: API Operations (Postman MCP) — FREE                         │
│ ├── Run API test collections                                        │
│ ├── Switch environments (dev/staging/prod)                          │
│ ├── Generate client SDKs                                            │
│ └── Monitor API health                                              │
├─────────────────────────────────────────────────────────────────────┤
│ TIER 2: Security Scanning (OWASP ZAP MCP) — FREE (Apache 2.0)       │
│ ├── Active vulnerability scanning                                   │
│ ├── SQL injection, XSS, CSRF detection                              │
│ ├── Spider/crawl endpoints                                          │
│ ├── Traffic interception & manipulation                             │
│ └── OWASP Top 10 audit                                              │
├─────────────────────────────────────────────────────────────────────┤
│ TIER 3: Penetration Testing (Kali Pentest MCP) — FREE               │
│ ├── Port scanning (Nmap)                                            │
│ ├── Directory bruteforce (Gobuster)                                 │
│ ├── SQL injection exploitation (SQLMap)                             │
│ └── Password attacks (Hydra)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tier 1: API Operations (Postman MCP)

**MCP**: `postman-mcp` — requires Postman API key (free tier available)

| Tool | Purpose |
|------|---------|
| `postman_list_collections` | List all collections |
| `postman_run_collection` | Execute test collection |
| `postman_list_environments` | List environments |
| `postman_switch_environment` | Switch dev/staging/prod |
| `postman_generate_code` | Generate client SDK |
| `postman_create_mock` | Create mock server |

**Checklist**:
- [ ] Document Postman MCP setup (API key, server config)
- [ ] Add Postman to recommended MCP servers list
- [ ] Quick action: "Run Collection" → `postman_run_collection`
- [ ] Quick action: "Switch Environment" → `postman_switch_environment`
- [ ] Quick action: "Generate Client" → `postman_generate_code` (TypeScript/Python/Go)

### 7.3 Tier 2: Security Scanning (OWASP ZAP MCP)

**MCP**: `zap-mcp` — requires ZAP running locally (Apache 2.0, free)

| Tool | Purpose |
|------|---------|
| `zap_spider` | Crawl site to discover endpoints |
| `zap_ajax_spider` | Crawl JS-heavy apps |
| `zap_active_scan` | Run vulnerability scan |
| `zap_get_alerts` | Get findings by severity |
| `zap_generate_report` | HTML/JSON security report |
| `zap_set_mode` | Set proxy mode |

**Checklist**:
- [ ] Document OWASP ZAP MCP setup (ZAP must be running locally)
- [ ] Add ZAP to recommended MCP servers list
- [ ] Quick action: "Security Scan" → `zap_active_scan`
- [ ] Quick action: "Spider/Crawl" → `zap_spider`, `zap_ajax_spider`
- [ ] Display findings by severity (HIGH/MEDIUM/LOW/INFO)
- [ ] Generate HTML/JSON security report

### 7.4 Tier 3: Penetration Testing (Kali Pentest MCP)

**MCP**: `kali-pentest-mcp` — requires tools installed (Nmap, SQLMap, etc.)

| Tool | Purpose |
|------|---------|
| `nmap_scan` | Port scan + service detection |
| `gobuster_dir` | Directory/file bruteforce |
| `sqlmap_scan` | SQL injection testing |
| `hydra_attack` | Password bruteforce |
| `nikto_scan` | Web server vulnerabilities |

**Legal Warning** (display when Tier 3 enabled):
```
⚠️  LEGAL DISCLAIMER
These tools are for AUTHORIZED TESTING ONLY:
• Systems you own
• Systems with explicit written permission
• CTF challenges / Lab environments
Unauthorized use is ILLEGAL.
```

**Checklist**:
- [ ] Document Kali Pentest MCP setup
- [ ] Add legal disclaimer/warning when Tier 3 enabled
- [ ] Quick action: "Port Scan" → `nmap_scan`
- [ ] Quick action: "Directory Bruteforce" → `gobuster_dir`
- [ ] Quick action: "SQL Injection Test" → `sqlmap_scan`

### 7.5 Traffic Interception & Manipulation

ZAP proxy mode for sniffing and modifying traffic:

| Capability | How | Use Case |
|------------|-----|----------|
| Passive Sniffing | ZAP proxy records traffic | See what app sends/receives |
| Request Modification | Breakpoint → edit → forward | Test input validation |
| Response Modification | Edit server response | Test client-side validation bypass |
| Replay Attacks | Resend with modifications | Test session handling, race conditions |

**Example: Price Manipulation Test**
```
1. Add item to cart → ZAP captures POST /api/cart
2. Set breakpoint on request
3. Change "price": 99.99 → "price": 0.01
4. Forward modified request
5. Check if server accepts the manipulated price
```

**Checklist**:
- [ ] Quick action: "Start Proxy" → launch ZAP in proxy mode
- [ ] Quick action: "Capture Traffic" → enable passive recording
- [ ] Quick action: "Enable Intercept" → set breakpoints
- [ ] View captured request/response history
- [ ] Request modification panel (edit before forwarding)
- [ ] Replay attack button
- [ ] Export traffic as HAR file

### 7.6 Anti-Cheat Test Suite (Game-Specific)

| Cheat Type | Test Method | What We Look For |
|------------|-------------|------------------|
| **Price manipulation** | Intercept purchase → change price to 0 | Server accepts modified price |
| **Item duplication** | Replay "use item" request 100x | Items multiply in inventory |
| **IDOR** | Change player ID in requests | Access other players' data |
| **Score injection** | Submit impossible high score | Server accepts fake scores |
| **Currency injection** | Modify currency values | Free in-game currency |
| **Speed hacks** | Modify timestamps | Instant challenge completion |
| **Stat hacking** | Modify character attributes | Max stats accepted |
| **Paywall bypass** | Remove premium flags | Access paid content free |

**Checklist**:
- [ ] Quick action: "Anti-Cheat Audit" → runs full cheat vulnerability suite
- [ ] Test: Price Manipulation
- [ ] Test: Item Duplication
- [ ] Test: IDOR
- [ ] Test: Score Injection
- [ ] Test: Currency Injection
- [ ] Test: Speed Hacks
- [ ] Test: Stat Hacking
- [ ] Test: Paywall Bypass
- [ ] Generate anti-cheat report (VULNERABLE/SECURE per test)
- [ ] Provide fix recommendations

### 7.7 Standard Test Profiles

**Game Backend Security Scan**:
```
1. Nmap → port scan + service detection
2. ZAP spider → discover all endpoints
3. ZAP active scan → find vulnerabilities
4. Generate severity report
```

**OWASP Top 10 Audit**:
```
1. ZAP scan with OWASP policy
2. Check: Injection, Broken Auth, XSS, CSRF, Security Misconfig
3. Generate compliance report
```

**Full Penetration Test** (Tier 3):
```
1. Nmap → port scan + service detection
2. Gobuster → directory bruteforce
3. Nikto → web server vulnerabilities
4. SQLMap → SQL injection testing
5. ZAP → full vulnerability scan
6. Generate comprehensive report
```

### 7.8 Comms Tab UI

```
┌──────────────────────────────────────────────────────────────────────┐
│ STATION                                                               │
│ Mode: [Control] [Monitor] [Explore]                                   │
├──────────────────────────────────────────────────────────────────────┤
│ Sub-tabs: [Security] [Quality] [Unity] [COMMS] [Ops]                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  📡 COMMS ARRAY                                           [Tier: 2]  │
│                                                                      │
│  Connected Services                                                  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                       │
│  │ ● Postman  │ │ ● ZAP      │ │ ○ Pentest  │                       │
│  │   Ready    │ │   Ready    │ │   Not configured                   │
│  └────────────┘ └────────────┘ └────────────┘                       │
│                                                                      │
│  Quick Actions                                                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Run API     │ │ Security    │ │ Anti-Cheat  │ │ Full        │   │
│  │ Tests       │ │ Scan        │ │ Audit       │ │ Pentest     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                      │
│  Recent Scans                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Anti-Cheat  api.game.com     2 VULN  6 SECURE        2m ago │    │
│  │ ZAP Scan    api.game.com     3 HIGH  5 MED   12 LOW  5m ago │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Checklist**:
- [x] Add "Comms" sub-tab to Station → Control mode (after Unity)
- [x] Create `src/webview/panel/features/comms.ts`
- [x] Create `src/mastercode_port/ui/handlers/comms.ts`
- [x] Tier selector (1/2/3) with connection status
- [x] Recent scans list with severity summary
- [x] Scan results detail view
- [x] Scan history persistence (`.spacecode/comms-scans.json`)

### 7.9 Finding Investigation Flow

Each finding has action buttons:
- **"Investigate →"** — sends finding to chat for analysis
- **"Generate Fix"** — sends finding to chat for remediation code
- **"Re-scan"** — retest specific endpoint

**Investigate prompt template**:
```
Analyze this vulnerability and explain how to exploit and fix it:

**SQL Injection** (HIGH)
- URL: /api/leaderboard?name=
- Parameter: name
- Evidence: Response shows SQL error when name=' OR '1'='1
- CWE: CWE-89

Provide:
1. How this vulnerability works
2. Proof-of-concept exploitation steps
3. Code fix with parameterized queries
4. Additional hardening recommendations
```

**Checklist**:
- [x] "Investigate →" button on each finding
- [x] "Generate Fix" button on each finding
- [ ] "Re-scan" button on each finding
- [ ] Chat generates PoC, remediation code, follow-up suggestions

### 7.10 Message Protocol

**Webview → Extension**:
```typescript
{ type: 'commsSetTier', tier: 1 | 2 | 3 }
{ type: 'commsQuickScan', profile: 'gameBackend' | 'owaspTop10' | 'antiCheat' | 'fullPentest', target: string }
{ type: 'commsRunCollection', collectionId: string }
{ type: 'commsSecurityScan', target: string, scanType: 'active' | 'passive' | 'spider' }
{ type: 'commsPortScan', target: string, ports?: string }
{ type: 'commsInvestigate', finding: Finding }
{ type: 'commsGenerateFix', finding: Finding }
{ type: 'commsRescan', finding: Finding }
```

**Extension → Webview**:
```typescript
{ type: 'commsStatus', tiers: { postman: boolean, zap: boolean, pentest: boolean } }
{ type: 'commsScanProgress', scanId: string, progress: number, stage: string }
{ type: 'commsScanResult', scanId: string, findings: Finding[] }
{ type: 'commsAlerts', high: number, medium: number, low: number, info: number }
```

### 7.11 Data Types

```typescript
interface Finding {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  name: string;
  description: string;
  url: string;
  parameter?: string;
  evidence?: string;
  solution?: string;
  cwe?: string[];
  owasp?: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ScanResult {
  id: string;
  target: string;
  profile: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
  findings: Finding[];
  summary: { high: number; medium: number; low: number; info: number };
}

interface AntiCheatResult {
  cheatType: string;
  status: 'VULNERABLE' | 'SECURE' | 'UNTESTED';
  evidence?: string;
  fixRecommendation?: string;
}
```

### 7.12 Chat & Engineer Integration

**Chat routing**:
- "scan for vulnerabilities" → ZAP MCP
- "find open ports" → Pentest MCP (Nmap)
- "run API tests" → Postman MCP
- "intercept requests to /api/checkout" → ZAP proxy

**Station Engineer triggers**:
- Backend code changed → "Run security scan on affected endpoints"
- New endpoint added → "Scan new endpoint for vulnerabilities"
- Pre-release → "Run OWASP Top 10 audit before deploy"

**Sound events**:
- [ ] `scanComplete` — scan finished
- [ ] `vulnerabilityFound` — HIGH severity finding
- [ ] `apiTestsPassed` — all API tests pass
- [ ] `apiTestsFailed` — API tests failed

---

## Phase 8: Ops Array
> VPS and infrastructure management — server deployment, hardening, monitoring
> Location: **Station → Control → Ops**

### 8.0 Concept

The **Ops Array** handles infrastructure management — deploying game servers, hardening VPS security, and monitoring health. While Comms probes and tests, Ops manages and deploys.

| Aspect | Comms Array | Ops Array |
|--------|-------------|-----------|
| Purpose | Test & probe external systems | Manage & deploy infrastructure |
| Direction | Outbound probes | Inbound management |
| Targets | Any API/server | Your servers only |
| Security role | Find vulnerabilities | Prevent vulnerabilities |

### 8.1 MCP Integration

**Primary: mcp-ssh-manager** (bvisible) — 37 tools for SSH operations

| Category | Tools |
|----------|-------|
| Connection | `add_ssh_host`, `remove_ssh_host`, `list_ssh_hosts`, `test_ssh_connection` |
| Execution | `execute_ssh_command`, `execute_sudo_command`, `execute_multi_host_command` |
| Files | `upload_file`, `download_file`, `list_directory`, `read_file`, `write_file` |
| System | `get_system_info`, `get_disk_usage`, `get_running_processes`, `check_port` |
| Security | `update_firewall`, `manage_ssh_keys`, `check_security_status` |
| Backup | `create_backup`, `restore_backup`, `list_backups`, `schedule_backup` |
| Docker | `docker_ps`, `docker_logs`, `docker_exec`, `docker_compose_up` |
| Monitoring | `get_server_metrics`, `tail_log`, `check_service_status` |

**Cloud: DigitalOcean MCP** (official, FREE)
- `create_droplet`, `destroy_droplet`, `list_droplets`
- `create_firewall`, `add_firewall_rules`
- `create_snapshot`, `restore_snapshot`

**Cloud: AWS MCP** (official, FREE)
- EC2 instance management
- Security group configuration
- S3 bucket operations

**Checklist**:
- [ ] Document mcp-ssh-manager setup (37 tools)
- [ ] Document DigitalOcean MCP setup
- [ ] Document AWS MCP setup
- [ ] Add SSH key configuration guide
- [ ] Add to recommended MCP servers list

### 8.2 Server Connection Management

- [x] Create `src/ops/OpsTypes.ts` — `Server`, `ServerStatus`, `OpsState`
- [x] Create `src/ops/OpsManager.ts` — manage server connections
- [x] Persist server list in `.spacecode/ops-servers.json`
- [x] Quick action: "Add Server" → configure SSH connection
- [x] Quick action: "Test Connection" → `test_ssh_connection`
- [x] Quick action: "Remove Server" → remove from list
- [x] Server health indicators (online/offline/degraded)

### 8.3 SSH Operations

- [ ] Quick action: "SSH Terminal" → open terminal to server
- [ ] Quick action: "Execute Command" → `execute_ssh_command`
- [ ] Quick action: "Execute Sudo" → `execute_sudo_command`
- [ ] Quick action: "Upload File" → `upload_file`
- [ ] Quick action: "Download File" → `download_file`
- [ ] Quick action: "View Logs" → `tail_log` with real-time streaming
- [ ] Multi-host command execution → `execute_multi_host_command`

### 8.4 Server Hardening

**"Harden Server" one-click script**:
```bash
# 1. System updates
apt update && apt upgrade -y

# 2. Create deploy user (no root SSH)
adduser deploy --disabled-password
usermod -aG sudo deploy

# 3. SSH hardening
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# 4. Firewall (UFW)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 3478/udp    # STUN
ufw allow 5349/tcp    # TURN TLS
ufw allow 49152:65535/udp  # TURN relay range
ufw enable

# 5. Fail2ban
apt install fail2ban -y
systemctl enable fail2ban

# 6. Automatic security updates
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades
```

**Hardening Checklist**:
| Check | Command | Expected |
|-------|---------|----------|
| Root login disabled | `grep PermitRootLogin /etc/ssh/sshd_config` | `no` |
| Password auth disabled | `grep PasswordAuthentication /etc/ssh/sshd_config` | `no` |
| Firewall active | `ufw status` | `active` |
| Fail2ban running | `systemctl is-active fail2ban` | `active` |
| Auto-updates enabled | `cat /etc/apt/apt.conf.d/20auto-upgrades` | `"1"` |

**Checklist**:
- [ ] Quick action: "Harden Server" → run full hardening script
- [ ] Harden script: disable root login, disable password auth
- [ ] Harden script: configure UFW firewall with game server ports
- [ ] Harden script: install and enable Fail2ban
- [ ] Harden script: enable unattended security updates
- [ ] Quick action: "Update OS" → `apt update && apt upgrade`
- [ ] Quick action: "Firewall Status" → `ufw status`
- [ ] Security status panel showing hardening checklist completion

### 8.5 Service Deployment

**"Deploy coturn" (STUN/TURN) script**:
```bash
apt install coturn -y

cat > /etc/turnserver.conf << 'EOF'
listening-port=3478
tls-listening-port=5349
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=<GENERATED_SECRET>
realm=yourgame.com
total-quota=100
cert=/etc/letsencrypt/live/turn.yourgame.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.yourgame.com/privkey.pem
no-multicast-peers
EOF

systemctl enable coturn
systemctl start coturn
```

**"Deploy Unity Server" script**:
```bash
# Upload build (via SCP)
scp -r ./Build/Linux/* deploy@server:/opt/game-server/

# Set permissions
chmod +x /opt/game-server/GameServer.x86_64

# Create systemd service
cat > /etc/systemd/system/game-server.service << 'EOF'
[Unit]
Description=Game Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/game-server
ExecStart=/opt/game-server/GameServer.x86_64 -batchmode -nographics
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable game-server
systemctl start game-server
```

**Checklist**:
- [ ] Quick action: "Deploy coturn" → install and configure STUN/TURN
- [ ] Quick action: "Deploy Unity Server" → upload build, create systemd service
- [ ] Quick action: "Restart Service" → `systemctl restart <service>`
- [ ] Quick action: "Check Service Status" → `check_service_status`
- [ ] Service status panel showing running services
- [ ] Last deploy timestamp and status

### 8.6 Monitoring

**Alert Thresholds**:
- CPU > 80% for 5+ minutes
- RAM > 90%
- Disk > 85%
- Service crashed (systemd failed state)
- Failed SSH attempts > 10/hour (brute force)

**Firewall Rules (Game Server)**:
| Port | Protocol | Service |
|------|----------|---------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP |
| 443 | TCP | HTTPS |
| 3478 | UDP | STUN |
| 5349 | TCP | TURN TLS |
| 7777 | UDP | Unity game server |
| 49152-65535 | UDP | TURN relay range |

**Checklist**:
- [ ] Quick action: "Health Check" → `get_system_info`, `get_disk_usage`
- [ ] Display server metrics: CPU, RAM, disk usage
- [ ] Quick action: "Running Processes" → `get_running_processes`
- [ ] Quick action: "Check Port" → `check_port`
- [ ] Alert thresholds: CPU > 80%, RAM > 90%, Disk > 85%
- [ ] Alert on service failure
- [ ] Uptime tracking per server

### 8.7 Backup & Docker Operations

**Backup**:
- [ ] Quick action: "Create Backup" → `create_backup`
- [ ] Quick action: "List Backups" → `list_backups`
- [ ] Quick action: "Restore Backup" → `restore_backup`
- [ ] Quick action: "Schedule Backup" → `schedule_backup`

**Docker**:
- [ ] Quick action: "List Containers" → `docker_ps`
- [ ] Quick action: "View Container Logs" → `docker_logs`
- [ ] Quick action: "Docker Compose Up" → `docker_compose_up`
- [ ] Quick action: "Docker Exec" → `docker_exec`

### 8.8 Ops Tab UI

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚙️ OPS ARRAY — Infrastructure Command                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ 🖥️ SERVERS      │  │ 🔒 SECURITY     │  │ 🚀 DEPLOY       │     │
│  │                 │  │                 │  │                 │     │
│  │ game-server-1   │  │ [Harden All]    │  │ [Deploy Unity]  │     │
│  │ ● Online 45d    │  │ [Update OS]     │  │ [Deploy TURN]   │     │
│  │ CPU: 23% RAM:41%│  │ [Firewall]      │  │ [Restart Svc]   │     │
│  │                 │  │                 │  │                 │     │
│  │ turn-server     │  │ Status:         │  │ Last deploy:    │     │
│  │ ● Online 12d    │  │ ✓ Patched       │  │ 2h ago ✓        │     │
│  │ CPU: 5%  RAM:12%│  │ ✓ Firewall OK   │  │                 │     │
│  │                 │  │ ⚠ 2 updates     │  │                 │     │
│  │ [+ Add Server]  │  │                 │  │                 │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 📋 QUICK ACTIONS                                             │   │
│  │ [SSH Terminal]  [View Logs]  [Upload Build]  [Health Check]  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 📜 RECENT OPERATIONS                                         │   │
│  │  14:32  ✓ Deployed headless-unity v1.2.3 to game-server-1   │   │
│  │  14:30  ✓ Security patches applied (3 packages)             │   │
│  │  12:15  ✓ coturn service restarted                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Checklist**:
- [x] Add "Infra" sub-tab to Station → Control mode (after Comms)
- [x] Create `src/webview/panel/features/ops.ts`
- [x] Create `src/mastercode_port/ui/handlers/ops.ts`
- [x] Server list panel with health indicators
- [x] Security panel with hardening status
- [x] Deploy panel with one-click actions
- [x] Command execution panel
- [x] Recent operations log

### 8.9 Message Protocol

**Webview → Extension**:
```typescript
{ type: 'opsAddServer', host: string, user: string, keyPath: string }
{ type: 'opsRemoveServer', serverId: string }
{ type: 'opsTestConnection', serverId: string }
{ type: 'opsExecuteCommand', serverId: string, command: string, sudo: boolean }
{ type: 'opsUploadFile', serverId: string, localPath: string, remotePath: string }
{ type: 'opsHardenServer', serverId: string }
{ type: 'opsDeployService', serverId: string, service: 'coturn' | 'unity' }
{ type: 'opsHealthCheck', serverId: string }
```

**Extension → Webview**:
```typescript
{ type: 'opsServerList', servers: Server[] }
{ type: 'opsServerStatus', serverId: string, status: ServerStatus }
{ type: 'opsCommandOutput', serverId: string, output: string }
{ type: 'opsDeployProgress', serverId: string, stage: string, progress: number }
{ type: 'opsAlert', serverId: string, alertType: string, message: string }
```

### 8.10 Data Types

```typescript
interface Server {
  id: string;
  name: string;
  host: string;
  user: string;
  keyPath: string;
  status: 'online' | 'offline' | 'degraded';
  lastSeen?: Date;
  metrics?: ServerMetrics;
}

interface ServerMetrics {
  cpu: number;
  ram: number;
  disk: number;
  uptime: number;
  services: ServiceStatus[];
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'failed';
  pid?: number;
}

interface HardeningStatus {
  rootLoginDisabled: boolean;
  passwordAuthDisabled: boolean;
  firewallActive: boolean;
  fail2banRunning: boolean;
  autoUpdatesEnabled: boolean;
  lastPatchDate?: Date;
  pendingUpdates: number;
}
```

### 8.11 Chat & Engineer Integration

**Chat routing**:
- "deploy to server" → Ops deployment workflow
- "check server status" → Ops health check
- "harden my server" → Ops hardening workflow
- "restart the game server" → `systemctl restart game-server`

**Station Engineer triggers**:
- Successful build → "Deploy to production?"
- Security update available → "Apply OS patches to game-server-1?"
- Server CPU > 80% → "Server under heavy load — investigate?"

**Sound events**:
- [ ] `deploySuccess` — deployment completed
- [ ] `deployFailed` — deployment failed
- [ ] `serverAlert` — health threshold exceeded

---

## Phase 9: Live Markdown Editor
> Obsidian-style WYSIWYG markdown editing — see formatted content, reveal syntax on cursor
> Location: Custom editor for `.md` files (optional default)

### 9.0 Concept

When you open a `.md` file in SpaceCode, you see **formatted markdown** (headers rendered large, bold text bold, links clickable). When your cursor enters a line, that line reveals the raw markdown syntax for editing. When you leave, it re-renders.

This is how **Obsidian** works — and it's far superior to VS Code's split preview.

| Traditional | Live Preview (Obsidian-style) |
|-------------|-------------------------------|
| Raw markdown on left, preview on right | Single view, both at once |
| Context switching between panes | Edit in place |
| Can't click to edit formatted text | Click anywhere to edit |

### 9.1 Technology Choice

**Recommended: Milkdown** (MIT, 8k+ stars)
- Built on ProseMirror (battle-tested, used by NYTimes, Atlassian)
- Plugin architecture for extensions
- "Typewriter mode" — reveal syntax on cursor
- 50kb gzipped
- Supports tables, code blocks, math, diagrams

**Alternatives**:
| Library | Pros | Cons |
|---------|------|------|
| CodeMirror 6 | What Obsidian uses | More complex, 150kb |
| TipTap | Popular, extensible | Less markdown-focused |
| Lexical (Meta) | Modern, fast | Younger ecosystem |

### 9.2 VS Code Integration

Use `CustomTextEditorProvider` API to replace Monaco for `.md` files:

```typescript
// package.json contribution
{
  "customEditors": [{
    "viewType": "spacecode.markdownEditor",
    "displayName": "SpaceCode Markdown",
    "selector": [{ "filenamePattern": "*.md" }],
    "priority": "option"  // User can choose; use "default" to always use
  }]
}
```

```typescript
// src/editors/MarkdownEditorProvider.ts
export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      'spacecode.markdownEditor',
      new MarkdownEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.html = this.getEditorHtml(document.getText());

    // Bidirectional sync
    webviewPanel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'contentChanged') {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
        edit.replace(document.uri, fullRange, msg.content);
        vscode.workspace.applyEdit(edit);
      }
    });

    // VS Code → Webview sync
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        webviewPanel.webview.postMessage({
          type: 'documentChanged',
          content: document.getText()
        });
      }
    });
  }
}
```

### 9.3 Milkdown Editor Setup

```typescript
// In webview HTML/JS
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';  // GitHub Flavored Markdown
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { cursor } from '@milkdown/plugin-cursor';  // Reveal syntax on cursor

const editor = await Editor.make()
  .config(ctx => {
    ctx.set(rootCtx, document.getElementById('editor'));
    ctx.set(defaultValueCtx, initialMarkdown);
    ctx.get(listenerCtx).markdownUpdated((ctx, markdown) => {
      // Send to VS Code extension
      vscode.postMessage({ type: 'contentChanged', content: markdown });
    });
  })
  .use(commonmark)
  .use(gfm)
  .use(listener)
  .use(cursor)
  .create();
```

### 9.4 Features

**Core editing**:
- [x] Headers render as large text, reveal `#` on cursor
- [x] Bold/italic render styled, reveal `**`/`*` on cursor
- [x] Links render clickable, reveal `[text](url)` on cursor
- [x] Code blocks render with syntax highlighting
- [x] Tables render as formatted tables
- [x] Lists render with bullets/numbers
- [x] Checkboxes render as clickable checkboxes

**Obsidian-style behavior**:
- [x] Click anywhere to place cursor and edit (double-click enters source mode)
- [x] Source mode shows raw markdown, Escape returns to preview
- [ ] Per-line cursor reveal (deferred — requires ProseMirror/Milkdown)
- [ ] Smooth transition animation (optional)

**SpaceCode integration**:
- [x] Works as standalone custom editor for .md files
- [x] Syncs with VS Code document model (undo/redo works)
- [x] File saves work normally (Cmd+S)
- [x] Git integration unchanged

### 9.5 Markdown Extensions

Beyond standard markdown:

| Feature | Syntax | Rendered |
|---------|--------|----------|
| Callouts | `> [!NOTE]` | Styled callout box |
| Mermaid diagrams | ````mermaid` | Rendered diagram |
| Math (KaTeX) | `$E=mc^2$` | Rendered equation |
| Wiki links | `[[Page Name]]` | Internal link |
| Tags | `#tag` | Clickable tag |
| Frontmatter | `---\ntitle: ...\n---` | Metadata panel |

**Checklist**:
- [ ] Mermaid diagram rendering (via `@milkdown/plugin-diagram`)
- [ ] KaTeX math rendering (via `@milkdown/plugin-math`)
- [ ] Callout/admonition blocks
- [ ] Frontmatter parsing and display
- [ ] Wiki-style `[[links]]` (optional)

### 9.6 Toolbar (Optional)

Floating toolbar on text selection:

```
┌─────────────────────────────────────────┐
│ B  I  S  ~  </> 🔗  H1 H2 H3  • 1. ☐   │
└─────────────────────────────────────────┘
  Bold Italic Strike Code Link Headers List
```

**Checklist**:
- [x] Persistent top toolbar (always visible)
- [x] Bold, italic, strikethrough, code buttons
- [x] Link insertion
- [x] Header level buttons (H1, H2, H3)
- [x] List type buttons (bullet, numbered, checkbox)
- [x] Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+E toggle)

### 9.7 Implementation Checklist

**Phase A: Core Editor**
- [x] Create `src/editors/MarkdownEditorProvider.ts`
- [x] Register custom editor in `package.json`
- [x] Lightweight built-in markdown renderer (no external dependencies)
- [x] Create webview HTML with preview + source mode
- [x] Bidirectional sync: webview ↔ VS Code document
- [x] Basic styling (light/dark theme support via VS Code CSS variables)

**Phase B: Obsidian-style Cursor**
- [ ] Install cursor plugin: `npm install @milkdown/plugin-cursor`
- [ ] Configure "reveal on cursor" behavior
- [ ] Test: cursor enters line → raw markdown shown
- [ ] Test: cursor leaves line → formatted view restored
- [ ] Smooth transition (CSS transition on reveal)

**Phase C: Extended Markdown**
- [ ] Mermaid diagrams: `npm install @milkdown/plugin-diagram`
- [ ] Math rendering: `npm install @milkdown/plugin-math`
- [ ] Callout blocks (custom plugin or CSS)
- [ ] Frontmatter display (custom plugin)

**Phase D: Polish**
- [ ] Floating toolbar on selection
- [ ] Keyboard shortcuts
- [ ] Theme sync with VS Code color theme
- [ ] Performance optimization for large files
- [ ] Error handling for malformed markdown

### 9.8 File Associations

```json
// package.json
{
  "contributes": {
    "customEditors": [{
      "viewType": "spacecode.markdownEditor",
      "displayName": "SpaceCode Markdown (Live Preview)",
      "selector": [
        { "filenamePattern": "*.md" },
        { "filenamePattern": "*.markdown" }
      ],
      "priority": "option"
    }]
  }
}
```

**Priority options**:
- `"option"` — User can choose between Monaco and SpaceCode editor
- `"default"` — SpaceCode editor is default, can switch to Monaco
- `"builtin"` — Always use SpaceCode editor (not recommended)

### 9.9 Settings

```typescript
// VS Code settings
{
  "spacecode.markdownEditor.enabled": true,
  "spacecode.markdownEditor.showToolbar": true,
  "spacecode.markdownEditor.enableMermaid": true,
  "spacecode.markdownEditor.enableMath": true,
  "spacecode.markdownEditor.cursorRevealAnimation": true
}
```

### 9.10 Message Protocol

**Webview → Extension**:
```typescript
{ type: 'contentChanged', content: string }
{ type: 'linkClicked', href: string }
{ type: 'ready' }
```

**Extension → Webview**:
```typescript
{ type: 'documentChanged', content: string }
{ type: 'themeChanged', theme: 'light' | 'dark' }
{ type: 'settingsChanged', settings: EditorSettings }
```

### 9.11 Opening Docs in SpaceCode Panel

For viewing `.md` files inside the SpaceCode sidebar (not as a tab):

```typescript
// In mainPanel.ts or handlers
function openDocInPanel(docPath: string) {
  const content = fs.readFileSync(docPath, 'utf8');
  panel._postMessage({
    type: 'showDocument',
    path: docPath,
    content,
    format: 'markdown'
  });
}
```

The webview renders the markdown using the same Milkdown editor, but in read-only or edit mode depending on context.

**Use cases**:
- View GDD/SA docs in Station panel
- View skill documentation in Skills tab
- Quick preview without opening new tab

---

## Post-V3 Refinements
> Changes made after initial V3 phases were complete, before V4 begins.
> These refine Phase 0 UX, establish modular architecture, and fix integration issues.

### R1. Tag Strip Status Bar (Phase 0.7 Evolution)
> Commit: `669c184` — Settings overlay, model cards, API consolidation, V3 UX planning
> Phase 0.7 specified persona dropdown + skill icons. Implementation evolved into a tag-based status bar.

**What shipped:**
- Status bar redesigned from persona dots to a horizontal tag strip
- Four tag types: persona (clickable, color-coded), skill (auto per tab), skin (context docs), status (ready/working/error)
- Persona tag shows color dot + label + pin indicator; click opens persona menu
- Skill tags auto-populated from `TAB_SKILL_MAP` with readable labels via `SKILL_LABELS` map
- Cursor pointer fixed on clickable tags (`.tag-persona { cursor: pointer }`)

**Checklist:**
- [x] Tag strip HTML in `mainPanelHtml.ts` (`.status-bar.tag-strip` with `#tagPersona`, `#tagSkills`, `#tagSkins`, `#tagStatus`)
- [x] Persona tag: color dot, label, pin/unpin, click-to-switch persona menu
- [x] Skill tags auto-populate per tab from `TAB_SKILL_MAP`
- [x] `SKILL_LABELS` map in `index.ts` for readable tag text (`'sector-analysis'` → `"Sectors"`, `'asmdef-check'` → `"Asmdef"`, etc.)
- [x] Tag CSS in `panel.css`: `.tag`, `.tag-persona`, `.tag-skill`, `.tag-skin`, `.tag-status` (lines 3092–3165)
- [x] Cursor pointer on `.tag-persona`, hover states with color transitions
- [x] `updateContextBar()` in `index.ts` reconciles persona/skills/skins on every tab switch

### R2. Per-Tab Right Panel Mode System
> Commit: `7036fe7` — Phase 1.1 right panel mode separation

**What shipped:**
- Each tab has its own valid panel modes and default mode
- Mode persisted per tab via localStorage
- Mode buttons scoped by `data-tab-scope` attribute (only visible on matching tab)
- Flow panel accessible from both CHAT and STATION tabs

**Checklist:**
- [x] `TAB_PANEL_MODES` in `state.ts`: CHAT → `['flow', 'chat', 'planning']`, STATION → `['station', 'control', 'flow', 'planning']`
- [x] `TAB_DEFAULT_MODE` in `state.ts`: CHAT → `'flow'`, STATION → `'station'`
- [x] `createRightPanelHandlers(deps)` factory in `features/rightPanel.ts`
- [x] `restoreRightPanelModeForTab()` replaces hardcoded mode assignments
- [x] `updatePanelToggleButtons()` shows/hides buttons per active tab
- [x] Mode persisted to localStorage per tab key

### R3. 50/50 Split Layout
> Commit: `209ad79` — Add 50/50 split layout for Chat + Synthesis/Swarm panels

**What shipped:**
- Chat panel (left) + content panel (right) in 50/50 horizontal split
- Right panel shows context flow visualization (Solo mode) or swarm workers (Swarm mode)
- CSS controls visibility via `data-panel-mode` attribute
- D3 constellation visualization moved to right pane

**Checklist:**
- [x] Two-column layout: chat (left) + content area (right)
- [x] Solo mode shows Context Flow visualization in right pane
- [x] Panel mode attribute controls right pane content visibility
- [x] D3 context flow canvas (`#contextFlowCanvas`) in right pane

### R4. Flow Panel Fix
> Commit: `1095e9a` — GPT flow visualization fix, module scaffolding, dashboard enhancements

**What shipped:**
- Flow visualization was broken by GPT consultation flow killing the constellation prematurely
- Fixed with `_gptFlowPending` flag to prevent premature teardown
- Flow re-initialized on mode switch: `setTimeout(() => initContextFlowVisualization(), 50)`

**Checklist:**
- [x] Fixed GPT consultation flow killing constellation with `_gptFlowPending` flag
- [x] Flow re-init on mode switch to `'flow'`
- [x] Flow listed in `TAB_PANEL_MODES` for both CHAT and STATION tabs

### R5. Webview Module Scaffolding
> Commit: `669c184` — Module architecture split from monolithic files

**What shipped:**
- Webview panel code organized into `state.ts` (config), `features/*` (42 modules), `ipc/*` (routing), `utils/*`
- Extension-side handlers split from monolithic `mainPanel.ts` into `handlers/*` (33 modules)
- Message routing modularized: `mainPanelRouter.ts` (extension-side) + `messageRouter.ts` (webview-side)

**New core files:**

| File | Purpose |
|------|---------|
| `src/webview/panel/state.ts` | TABS, CHAT_MODES, TAB_PANEL_MODES, TAB_DEFAULT_MODE, TAB_SKILL_MAP, PERSONA_MAP, BUILTIN_NAV_COMMANDS, uiState |
| `src/webview/panel/features/chatStore.ts` | ChatStore singleton, PERSONA_COLORS, PERSONA_LABELS, subscriber pattern |
| `src/webview/panel/features/rightPanel.ts` | `createRightPanelHandlers()`, mode management |
| `src/webview/panel/features/chatMode.ts` | `createChatModeHandlers()`, solo/planning mode switching |
| `src/webview/panel/ipc/messageRouter.ts` | Webview-side message dispatch (all inbound `postMessage` handling) |
| `src/mastercode_port/ui/mainPanelRouter.ts` | Extension-side message dispatch |
| `src/mastercode_port/ui/mainPanelTypes.ts` | Shared message types between extension and webview |

**Handler modules (33 in `src/mastercode_port/ui/handlers/`):**

| Handler | Domain |
|---------|--------|
| `agentSkills.ts`, `assistant.ts`, `handoff.ts`, `sensei.ts` | Agent/skill management |
| `asmdef.ts`, `ship.ts`, `shipActions.ts` | Sector/station |
| `autopilot.ts`, `autoexecute.ts`, `autosolve.ts` | Automation |
| `comms.ts`, `security.ts`, `quality.ts`, `diagnostics.ts` | Security/quality |
| `engineer.ts` | Station Engineer |
| `ops.ts`, `unity.ts`, `gameui.ts` | Operations/game |
| `dashboard.ts`, `settings.ts`, `explorer.ts` | Dashboard/settings |
| `docs.ts`, `db.ts`, `tickets.ts`, `kb.ts` | Content management |
| `plans.ts`, `planning.ts`, `workflows.ts` | Planning/execution |
| `git.ts`, `mcp.ts`, `memory.ts`, `voice.ts`, `misc.ts` | Infrastructure |

**Feature modules (42 in `src/webview/panel/features/`):**

| Category | Modules |
|----------|---------|
| Chat | `chatInput.ts`, `chatRenderer.ts`, `chatSessions.ts`, `chatStore.ts`, `chatMode.ts`, `chatSearch.ts`, `chatTools.ts` |
| Station | `station.ts`, `engineer.ts`, `sectorMap.ts`, `controlTabs.ts`, `asmdef.ts` |
| Security | `comms.ts`, `diagnostics.ts` |
| Ops | `ops.ts` |
| Agents | `agents.ts`, `skills.ts` |
| Dashboard | `dashboard.ts`, `dashboardStats.ts`, `db.ts`, `tickets.ts`, `ticketsSidebar.ts` |
| Planning | `planningPanel.ts`, `plans.ts`, `autopilot.ts` |
| Visualization | `flow.ts`, `kb.ts`, `mcp.ts` |
| UI Infrastructure | `tabs.ts`, `splitter.ts`, `rightPanel.ts`, `modelToolbar.ts`, `settingsPanel.ts`, `tokenBar.ts` |
| Game | `gameui.ts`, `unityPanel.ts`, `verificationPanel.ts` |
| Misc | `autoexecute.ts`, `contextPreview.ts`, `docTargets.ts`, `sideChat.ts`, `voice.ts` |

### R6. Settings Overlay
> Commit: `669c184` — Settings moved from Dashboard subtab to full-screen overlay

**What shipped:**
- Settings now opens as full-screen overlay (⚙️ button) instead of Dashboard subtab
- Model cards redesigned with visual context/output comparison bars
- API keys consolidated to VS Code SecretStorage (migrated from plain config)
- Settings export/import to `.spacecode/backups/`

**Checklist:**
- [x] Settings overlay UI in `features/settingsPanel.ts`
- [x] Model cards with visual bars for context window and max output
- [x] `ModelVerificationService` — verify API access to models
- [x] API key SecretStorage migration (from `spacecode.claudeApiKey` config to `SecretStorage`)
- [x] Settings export/import to `.spacecode/backups/`
- [x] Extension-side handler in `handlers/settings.ts`

---

## V3 → V4 Transition Notes

> Current state of key files at V3 completion. These are V4's starting point.

**Tab structure (pre-V4):**
`[Station] [Agents] [Skills] [Dashboard]` + persistent Chat

**Station right-panel modes (pre-V4):**
`['station', 'control', 'flow', 'planning']`

**Chat right-panel modes (pre-V4):**
`['flow', 'chat', 'planning']`

**CHAT default mode:** `'flow'` — V4 Phase 13 will remove Flow and replace with Telemetry.

**Files V4 Phase A will modify first:**
| File | V4 Action | Why |
|------|-----------|-----|
| `src/webview/panel/ipc/messageRouter.ts` | Enforce typed message schema (A1) | Currently uses bare string matching |
| `src/webview/panel/index.ts` | Split into bootstrap + router + bridge (A7) | 72KB, 2100+ lines |
| `src/webview/panel/state.ts` | Remove `'flow'` from TAB_PANEL_MODES (Phase 13) | Flow replaced by Telemetry |
| `src/webview/panel/features/flow.ts` | Delete or empty (Phase 13) | 58KB of D3 visualization replaced by signal log |

---

## Design Documents

| Document | Purpose |
|----------|---------|
| `docs/STATION_ENGINEER_UX_SPEC.md` | Station Engineer proactive assistant — roles, 4 pillars, scoring, persistence |
| `docs/SEMGREP_SECURITY_RESEARCH.md` | Semgrep SAST integration research for Security + Quality + Unity |
| `docs/AUTOPILOT_DESIGN.md` | Autonomous plan execution engine — loop, retry, rate limits, session persistence |
| `docs/GAME_UI_COMPONENT_CATALOG.md` | 80+ game UI components, theme system, placeholder → NanoBanana pipeline |

> **Note**: Comms Array, Ops Array, and Live Markdown Editor designs are fully documented inline in Phases 7–9 above.

## Existing Code (V2 baseline + V3 additions)

**V2 baseline (extended in V3):**

| Feature | Files |
|---------|-------|
| Security scanners (regex-based) | `src/security/SecurityScanner.ts`, `SecretScanner.ts`, `CryptoScanner.ts`, `InjectionScanner.ts` |
| Quality scanners | `src/quality/QualityScanner.ts`, `DuplicationScanner.ts`, `MagicValueScanner.ts`, `DeadCodeScanner.ts`, `ComplexityAnalyzer.ts` |
| Plan executor | `src/execution/PlanExecutor.ts` |
| Autoexecute queue | `src/mastercode_port/ui/impl/autoexecuteImpl.ts` |
| Orchestrator | `src/mastercode_port/orchestrator/conversation.ts` |
| Sector system | `src/sectors/SectorConfig.ts`, `src/verification/AsmdefGate.ts` |
| Sound service | `src/mastercode_port/services/soundService.ts` |
| Persona prompts | `src/personas/prompts/*.system.md` |
| Settings store | `src/settings/index.ts` |
| Coplay MCP client | `src/mastercode_port/services/coplayClient.ts` |

**V3 additions (new in V3):**

| Feature | Files |
|---------|-------|
| Webview state config | `src/webview/panel/state.ts` |
| Chat store (persona/skills) | `src/webview/panel/features/chatStore.ts` |
| Right panel modes | `src/webview/panel/features/rightPanel.ts` |
| Chat mode switching | `src/webview/panel/features/chatMode.ts` |
| Webview message router | `src/webview/panel/ipc/messageRouter.ts` |
| Extension message router | `src/mastercode_port/ui/mainPanelRouter.ts` |
| Shared message types | `src/mastercode_port/ui/mainPanelTypes.ts` |
| Handler modules (33) | `src/mastercode_port/ui/handlers/*.ts` |
| Feature modules (42) | `src/webview/panel/features/*.ts` |
| Semgrep runner | `src/security/SemgrepRunner.ts`, `SemgrepTypes.ts`, `SemgrepRules.ts` |
| Station Engineer | `src/engineer/EngineerEngine.ts`, `EngineerScorer.ts`, `EngineerPersistence.ts`, `RuleTriggers.ts` |
| Autopilot engine | `src/autopilot/AutopilotEngine.ts`, `ErrorStrategy.ts`, `RateLimitDetector.ts`, `AutopilotSession.ts` |
| Game UI pipeline | `src/gameui/GameUIPipeline.ts`, `GameUITypes.ts` |
| Comms handler | `src/mastercode_port/ui/handlers/comms.ts` |
| Ops handler | `src/mastercode_port/ui/handlers/ops.ts` |
| Markdown editor | `src/editors/MarkdownEditorProvider.ts` |
| Flow visualization | `src/webview/panel/features/flow.ts` |
| Sector map (orbital) | `src/webview/panel/features/sectorMap.ts` |
| Settings overlay | `src/webview/panel/features/settingsPanel.ts` |

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

*Last updated: 2026-02-05*
