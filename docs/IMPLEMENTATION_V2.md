# SpaceCode Implementation V2

**Created**: 2026-02-02
**Status**: Draft (owner review)
**Purpose**: Convert MASTER_PLAN.md + specs + current code into a concrete Implementation V2 plan. This is not only a refactor; several V1 items remain unimplemented.

---

## 0) Inputs Reviewed

- `docs/MASTER_PLAN.md` (core vision + feature decisions)
- `docs/specs/*` (flow visualization, context assembler, KB ingestion, MCP bridge, preflight checks, RAG retrieval, swarm coordinator, ticket-to-code flow)
- Current codebase (`src/*`, `media/*`) to identify what is already implemented

---

## 1) Current Feature Blocks (as implemented in code)

### 1.1 Core Extension + Webview Shell
**Where**: `src/extension.ts`, `src/panel.ts`, `src/webview/main.ts`, `media/main.js`/`media/panel.js`
**What works**:
- Single webview panel with tabbed UI and right-side panel
- Streaming responses for Claude + GPT
- Stop requests wired to chat controller
- Panel reload and CSP setup
**Gaps**:
- Right panel modes are not cleanly separated by tab context (requires different container tags/IDs)
- UI still shows overlapping features across tabs (Station shows Flow/Opinion/+Chat)
- `media/panel.js` is a large, manual bundle (~9k lines) and not built from source; must be moved into `src/webview/panel/` and built via esbuild

### 1.2 Chat System
**Where**: `src/chat/chatController.ts`, `src/providers/*`
**What works**:
- Claude/GPT providers via CLI bridge
- Streaming assistant chunks with stop
- Basic chat send
**Gaps**:
- No compaction/summary at token limit
- No “send while thinking” behavior
- No per-tab dedicated chat (Station should be separate chat type)
- No per-project embedding + retrieval of past chat

### 1.3 Planning + Execution
**Where**: `src/planning/*`, `src/execution/*`
**What works**:
- Plan generation and storage
- Plan execution pipeline (basic)
**Gaps**:
- Plan editor UI
- Step-by-step execution mode
- Approval gates in UI

### 1.4 Verification / Gates
**Where**: `src/verification/*`
**What works**:
- Preflight checker, asmdef gate, diff scanner, sector rule checks
**Gaps**:
- UI surface in Station Control needs redesign
- Results not presented in a junior-friendly way

### 1.5 Memory / RAG
**Where**: `src/memory/*`
**What works**:
- ContextAssembler, EmbeddingService, VectorStore, HybridRetriever, MessageStore
**Gaps**:
- UI for context preview and flow visualization is not cleanly scoped by tab
- No clear “project memory” surface or search
- No compaction workflow tied to token budget

### 1.6 Tickets
**Where**: `src/tickets/*`
**What works**:
- Ticket processing, storage, execution scaffolding
**Gaps**:
- UX unclear; no dedicated “ticket AI” persona
- No explicit Gears routing for maintenance tickets

### 1.7 Swarm (DEPRECATED → Planning Mode + Execution Mode)
**Where**: `src/swarm/*`
**Status**: Being replaced by Nova's Planning Mode (4.5) and Execution Mode (4.53).
**What exists**:
- SwarmCoordinator scaffold (to be repurposed for sub-agent orchestration)
**Migration**:
- Swarm UI → Planning Panel + Execution Dashboard
- SwarmCoordinator → Execution Mode worker orchestration

### 1.8 Sectors / Station
**Where**: `src/sectors/*`, `media/panel.js`
**What works**:
- Sector config and rule injection scaffolds
- Station schematic UI exists
**Gaps**:
- Schematic not driven by SA document (wizard-first approach needed)
- No setup wizard for SA → Sector Map generation
- Station should show only Schematic + Control

### 1.9 Integration
**Where**: `src/integration/*`
**What works**:
- Git + GitHub adapters (ticket sync, etc.)
**Gaps**:
- MCP details panel not fully surfaced
- Unity status and console are present but not contextualized

---

## 2) Current UX Blocks (as seen in UI)

### 2.1 Tabs
- **Chat**: main chat system (left) + right panel (flow/opinion/etc.)
- **Station**: schematic + control, but right panel still shows flow/opinion/+chat
- **Agents**: present but not implemented
- **Skills**: present but not implemented
- **Dashboard**: docs/tickets/db/settings panels, but many elements are placeholders

### 2.2 Right Panel Modes (current)
- Station, Control, Flow, Opinion, +Chat are all available in multiple tabs
**Gap**: Right panel must be mode-separated by tab context

---

## 3) Gaps vs Master Plan + Specs (high-level)

- Multi-persona chat surfaces are missing (Nova, Gears, Index, Triage, Vault, Palette)
- Documentation wizard + templates are missing
- No wizard-first, SA-driven schematic (prescriptive architecture)
- Control panel UX is confusing and not junior-friendly
- Flow/Opinion/+Chat should be Chat-only, not Station
- Agents/Skills UI is unimplemented; no agent detail panel
- MCP details panel is not showing per-server info
- Database panel lacks clear DB metadata (type/location/size)

---

## 4) Implementation V2 Requirements (Owner Notes)

### Chat System
- Add compaction/summary when token limit reached
- Allow “send while thinking” (input switches button to Send when text exists)
- Stop button default when AI is running and input is empty
- 10s grace: user can still stop after sending
- Multi-persona chat surfaces:
  - Nova (Chat tab)
  - Gears (Station tab)
  - Index (Dashboard → Docs)
  - Triage (Tickets)
- Gears chat: no execution mode, no GPT opinion, no +chat, no push to git
- Station chat width = 33% of window
- Station chat is single-thread only (no multi chat tabs)

### Station
- Station view shows only **Schematic** + **Control**
- Flow/Opinion/+Chat removed from Station
- Schematic must display both analogy name + real engineering name
- Wizard-first mapping (architecture is prescriptive, not descriptive)
- Station chat must support Learn/Maintenance modes
- Station chat tied to file explorer selection for code explanation

### Control Panel Redesign
- Current controls (Context Pack, Run Gates, Docs, Autoexecute, Asmdef Manager) are confusing
- **DELETE the entire "Advanced Panels" section** - redistribute or remove each item:
- Keep only clear, junior-friendly operations
- Surface relevant tests and maintenance actions

### Advanced Panels Migration (DELETE FROM CONTROL)

| Current Item | Action | New Location |
|--------------|--------|--------------|
| **Planning** section | MOVE | Chat tab → Planning Mode (right panel) |
| Generate Plan button | MOVE | Planning Mode UI |
| Save/Execute/Step-by-step | MOVE | Planning Mode UI |
| Use for Comparison | DELETE | Not needed in V2 |
| **Approval Queue** | MOVE | Dashboard → Mission (pending approvals widget) |
| **Tickets** panel | MOVE | Dashboard → Tickets (Triage persona) |
| **Verification** panel | MOVE | Station → Control → Diagnostics tab |
| **Core** panel | DELETE | Unclear purpose, remove |
| **Hangar** panel | DELETE | Unused in V2 |
| **Armory** panel | DELETE | Unused in V2 |
| Context Pack | MOVE | Chat tab right panel (Flow view) |
| Asmdef Manager | MOVE | Station → Control → Tests tab |
| Docs toggle | DELETE | Replaced by Index persona |
| Autoexecute toggle | MOVE | Chat tab settings dropdown |

**Result:** Control panel shows ONLY the 5 tabs: [Diagnostics] [Tests] [Security] [Code Quality] [Maintenance]

### Agents + Skills
- Agents system not implemented; redesign UI using Station-style graphics
- Agent detail panel on right with role + inputs + outputs
- Skills should show details in right panel

### Docs / Index
- If docs are missing, Index must block and request setup (code-linked docs only)
- Wizard-first setup uses a **questionnaire** derived from templates (not full doc writing)
- Minimal requirement for complex projects: **GDD + SA**
- Optional: TDD and other templates
- User can choose project complexity:
  - **Simple**: no required docs/architecture; Index + Gears inactive (UI shows "not required")
  - **Complex**: requires GDD + SA before Gears can operate
- SA Template defines the Sector Map (SpaceCode Integration) and becomes the prescriptive schematic
- Flow: New Project → Index blocks → Define architecture first → Gears enforces code to match SA
- Index keeps docs aligned with code changes
- Templates live in `templates/`:
  - GDD `templates/GDD_TEMPLATE.md`
  - TDD `templates/TDD_TEMPLATE.md`
  - SA `templates/SA_TEMPLATE.md`
  - Art Bible `templates/ART_BIBLE_TEMPLATE.md`
  - Narrative Bible `templates/NARRATIVE_BIBLE_TEMPLATE.md`
  - UI/UX Spec `templates/UIUX_SPEC_TEMPLATE.md`
  - Economy `templates/ECONOMY_TEMPLATE.md`
  - Audio Design `templates/AUDIO_DESIGN_TEMPLATE.md`
  - Test Plan `templates/TEST_PLAN_TEMPLATE.md`
  - Level Brief `templates/LEVEL_BRIEF_TEMPLATE.md`

### Tickets
- Ticket AI is a separate persona/robot
- Tickets route to Gears for maintenance
- Chat and Gears can exchange context

### Dashboard
- Database panel must show storage details (type, size, capacity)
- MCP list should show details on selection

---

## 4.1) Chat System Specs (Per Persona)

| Persona | Name | Icon | Location | Width | Modes | Tools/Actions | History | UI Controls |
|---------|------|------|----------|------:|-------|---------------|---------|-------------|
| Creator | **Nova** | `fa-rocket` | Chat tab | 50% | Solo / Consult / Planning | Plan/execute, opinion, push-to-git, +Chat, context preview | Project + Nova thread | Mode toggle, Opinion, +Chat, Push-to-Git |
| Engineer | **Gears** | `fa-gear` | Station tab | 33% | Learn / Maintenance | Sector explain, refactor plan, run gates/tests, file context | Project + Gears thread | Learn/Maintenance toggle, Reset context |
| Librarian | **Index** | `fa-book` | Dashboard → Docs | Panel | Setup / Sync | Docs wizard, questionnaire, ingest/update, drift detection | Project + Index thread | Start Wizard, Sync Docs, Review Changes |
| Ticket Bot | **Triage** | `fa-ticket` | Dashboard → Tickets | Panel | Triage / Solve | Route ticket, autosolve, status update, create sub-tasks | Project + Triage thread | Route to [Persona], Autosolve, Close |
| Database Engineer | **Vault** | `fa-database` | Dashboard → Project DB | Panel | Query / Schema / Migrate | Schema view, query builder, migrations, type generation | Project + Vault thread | View Schema, Query Builder, Generate Types |
| Art Director | **Palette** | `fa-palette` | Dashboard → Art Studio | Panel | Design / Generate | Style storage, image gen (Gemini), asset library, review | Project + Palette thread | Generate Image, Style Guide, Assets |

**Input Behavior (all personas):**
- Stop button when AI running + input empty
- Send button when text exists
- Interrupt enabled (sends new message, stops current)
- 10s grace period after sending to still cancel

**System Prompt/Persona Spec** (all 6 personas):
- Each persona has a dedicated system prompt template with role goals, tool access, and safety constraints.
- Persona prompts are versioned in code and surfaced in the UI (read-only) for transparency.

**History Storage**:
- Threads are separate per persona, but embeddings are unified per project.
- Cross-persona context is exchanged only via ContextPackage handoffs.

---

## 4.2) Cross‑Chat Protocol (Handoff Spec)

**ContextPackage:** See section 4.17 for final schema with all 6 personas.

**Quick Reference:**
```
ContextPackage {
  sourcePersona: 'nova' | 'gears' | 'index' | 'vault' | 'palette' | 'triage',
  targetPersona: 'nova' | 'gears' | 'index' | 'vault' | 'palette' | 'triage',
  summary: string,                // max 500 chars
  codeReferences: { file, lines?, symbol? }[],
  files: string[],
  codeChanges?: string,           // unified diff
  suggestedAction?: string,
  priority: 'low' | 'medium' | 'high' | 'critical',
  ticketId?: string,
  planId?: string,
  previousMessages: number        // 0-10
}
```

**Handoff Buttons (when shown):**
- Shown at end of assistant response when a handoff is relevant, or via a "Handoff" menu.
- Buttons: **Send Context & Stay**, **Go to Tab**, **Autosolve**.

**Autosolve Notifications:**
- On completion: "Yes Gears completed task …" with actions **View Changes**, **Send to Index**, **Dismiss**.

---

## 4.3) Gears Modes (Station Engineer)

**Learn Mode**
- Read-only explanations with analogy mapping.
- No code execution; only navigation + explanation tools.
- Triggered by file/selection changes from explorer.

**Maintenance Mode**
- Allows refactor plans, rule enforcement, tests/gates.
- Can propose alignment steps when code violates SA.

**Mode Switch**
- Toggle in Station chat header; persists per project session.

---

## 4.4) SA → Schematic Mapping

**Source of truth:** `templates/SA_TEMPLATE.md` → "Sector Map (SpaceCode Integration)" table.

**Parsing rules:**
- Parse the Markdown table (Sector ID, Name, Icon, Description, Dependencies).
- Normalize `sector_id` to lowercase slug.
- Build edges from Dependencies column (comma-separated).
- Render nodes using Name + Icon + Description.
- Assembly Structure (Asmdefs) optionally map to sector nodes.

**Fallback:**
- Optional YAML/JSON block inside SA for advanced layouts.
- If no SA exists and project is "simple", schematic is inactive.

---

## 4.5) Agents Tab Spec (Agents vs Personas)

**Agents (9 from MASTER_PLAN):**
- MasterMind, SecurityAuditor, AsmdefGuard, Documentor, ShaderSmith, Spine2DExpert, DatabaseGuard, CodeReviewer, Librarian.

**Personas vs Agents:**
- **Personas** = UI‑visible chat roles (6 total: Nova, Gears, Index, Vault, Palette, Triage)
- **Agents** = background specialists triggered by tasks or file scope (9 total)
- See section 4.53 for detailed execution flow.

**UI:**
- Station‑style node list with right‑panel details (inputs/outputs/triggers)

### Agents Tab Layout
```
┌─────────────────────────────────┬────────────────────────────────────────┐
│  AGENTS                         │  AGENT DETAILS                         │
│  ══════                         │  ═════════════                         │
│                                 │                                        │
│  ┌─────┐ ┌─────┐ ┌─────┐       │  SecurityAuditor                       │
│  │[fa- │ │[fa- │ │[fa- │       │  ────────────────                      │
│  │brain│ │shld]│ │cube]│       │                                        │
│  │Mind │ │Secur│ │Asmdf│       │  Status: ● Active (scanning)           │
│  └──○──┘ └──●──┘ └──○──┘       │  Triggered by: Security keywords        │
│     │       │       │          │  Reports to: Gears                     │
│  ┌─────┐ ┌─────┐ ┌─────┐       │                                        │
│  │[fa- │ │[fa- │ │[fa- │       │  INPUTS                                │
│  │file]│ │want]│ │bone]│       │  ──────                                │
│  │Doctr│ │Shadr│ │Spine│       │  • Source files (.cs, .js)             │
│  └──○──┘ └──○──┘ └──○──┘       │  • Dependencies list                   │
│     │       │       │          │                                        │
│  ┌─────┐ ┌─────┐ ┌─────┐       │  OUTPUTS                               │
│  │[fa- │ │[fa- │ │[fa- │       │  ───────                               │
│  │data]│ │eye] │ │book]│       │                                        │
│  │DBGrd│ │Revwr│ │Librn│       │                                        │
│  └──○──┘ └──○──┘ └──○──┘       │                                        │
│                                 │  • Security findings                   │
│  ● Active  ○ Idle  ◐ Working   │  • CVE alerts                          │
│                                 │  • Fix suggestions                     │
│                                 │                                        │
│  [Run All] [Configure]          │  [Trigger Now] [View History] [Config] │
└─────────────────────────────────┴────────────────────────────────────────┘
```

---

## 4.6) Control Panel Tests UI

**Priorities:**
1) Diagnostics (fast, blocking)
2) Mechanical tests (build/unit/asmdef)
3) AI-assisted reviews (architecture, security, performance)

**UX:**
- "Run All" + "Run Selected"
- Results list with severity (Pass/Warn/Fail)
- Click result → details + suggested fix

---

## 4.7) MCP Details Panel

**Fields per server:**
- Name, Status (Connected/Disconnected), Transport, Version, Tools count
- Last heartbeat, Error state, Logs/Diagnostics

**Offline handling:**
- Show "Disconnected" with retry and last error.

---

## 4.8) Planning System

Before implementing features, a structured planning phase is required. This prevents jumping from "idea" → "implementation" without analysis.

### Planning Flow (4 Phases)

| Phase | Name | Lead Persona | Activities |
|-------|------|--------------|------------|
| 1 | **Study** | Nova (Creator) + Index | Understand the feature, gather requirements, check GDD |
| 2 | **Connect** | Gears (Engineer) + Index | Map to existing code, identify touch points, check SA |
| 3 | **Plan** | Nova + Gears | Break into phases, define tasks, estimate risk |
| 4 | **Review** | Index (Librarian) | Validate plan, update docs, approve |

### Planning Mode in Chat

Repurpose **Swarm mode** as **Planning mode** for Nova (Creator):

| Current Swarm | New Planning Mode |
|---------------|-------------------|
| Multiple AI threads | Structured planning session |
| Parallel exploration | Sequential phases with gates |
| No structure | Study → Connect → Plan → Review |

### Planning Panel UI

When Planning Mode is active, the right panel shows:
- Current phase indicator (1-4)
- Phase checklist with completion status
- Affected files list (growing as analysis proceeds)
- Risk assessment summary
- [Skip to Plan] and [Cancel] buttons

### Planning Output: Implementation Plan

```markdown
## Implementation Plan: [Feature Name]

### Phase 1: [Name] (No breaking changes)
- [ ] Task 1
- [ ] Task 2

### Phase 2: [Name]
- [ ] Task 1
- [ ] Task 2

### Affected Files
- path/to/file.cs (modify)
- path/to/new.cs (create)

### Risk Assessment
- High: [description]
- Medium: [description]
- Low: [description]

### Dependencies
- Requires: [other feature/module]
- Blocks: [downstream work]
```

### Planning Gates

| Gate | Owner | Criteria |
|------|-------|----------|
| Study Complete | Nova | Feature understood, requirements listed |
| Connection Mapped | Gears | Existing code analyzed, touch points identified |
| Plan Approved | User | Phases reviewed, scope accepted |
| Docs Updated | Index | SA/GDD reflect planned changes |

### AI Behavior Rule: REUSE BEFORE CREATE

Before creating ANY new function/class, AI must:
1. Search existing codebase for similar functionality
2. Check if existing function can be extended
3. Check if existing function can be parameterized
4. Only create new if NO suitable existing code found
5. If creating new, explain why existing code was insufficient

---

## 4.9) Security Controls

Security is a core Gears capability with dedicated controls in the Station Control panel.

### Security Sub-Tab in Control Panel

```
[Diagnostics] [Tests] [Security] [Code Quality] [Maintenance]
```

### Security Tests Inventory

| Test | Type | Description | Priority |
|------|------|-------------|----------|
| Secret Scanner | Mechanical | Regex for API keys, passwords, tokens, credentials | P1 |
| Hardcoded Credentials | Mechanical | Detect passwords/keys in source | P1 |
| SQL Injection | AI-assisted | Analyze query construction patterns | P1 |
| Command Injection | AI-assisted | Check Process/Shell/Exec calls | P1 |
| Path Traversal | Mechanical | File path validation, directory escape | P1 |
| XSS Risks | AI-assisted | Output encoding, innerHTML usage | P2 |
| Insecure Crypto | Mechanical | Weak algorithms (MD5, SHA1, DES) | P2 |
| Dependency Audit | Mechanical | Known CVEs in packages/dependencies | P1 |
| Auth Flow Review | AI-assisted | Session/token handling, auth bypass | P2 |
| Network Security | Mechanical | HTTP vs HTTPS, insecure endpoints | P2 |
| Input Validation | AI-assisted | Unvalidated user input flows | P1 |
| Insecure Deserialization | AI-assisted | Unsafe object deserialization | P2 |

### Security Scan Results UI

- Results grouped by severity: Critical / High / Medium / Low
- Each finding shows: file, line, description, suggested fix
- "Fix with Engineer" button to hand off to Gears
- Export report option

---

## 4.10) Code Quality Checks (Full Inventory)

These checks ensure code health and prevent AI-induced code bloat.

### Code Quality Sub-Tab in Control Panel

```
[Diagnostics] [Tests] [Security] [Code Quality] [Maintenance]
```

### Duplication & Reuse Checks

| Check | Type | Description | Priority |
|-------|------|-------------|----------|
| Duplicate Functions | AI-assisted | Functions with >80% similar logic | P1 |
| Similar Code Blocks | Mechanical | Copy-paste detection (token similarity) | P1 |
| Redundant Functions | AI-assisted | Functions that do the same thing differently | P1 |
| Unused Functions | Mechanical | Functions never called | P1 |
| Opportunity to Extract | AI-assisted | Repeated patterns that should be functions | P2 |

### Hardcoded Values Checks

| Check | Type | Description | Priority |
|-------|------|-------------|----------|
| Magic Numbers | Mechanical | Unexplained numeric literals | P1 |
| Hardcoded Strings | Mechanical | URLs, paths, messages inline | P1 |
| Inline Config Values | Mechanical | Values that should be in config | P1 |
| Hardcoded Colors/Sizes | Mechanical | UI values that should be constants | P2 |
| Environment-Specific Values | Mechanical | Dev/prod URLs, paths hardcoded | P1 |

### Dead Code Checks

| Check | Type | Description | Priority |
|-------|------|-------------|----------|
| Unreachable Code | Mechanical | Code after return/throw, impossible branches | P1 |
| Unused Variables | Mechanical | Declared but never read | P1 |
| Unused Fields | Mechanical | Class fields never accessed | P1 |
| Commented-Out Code | Mechanical | Large commented blocks (>5 lines) | P2 |
| Empty Methods/Stubs | Mechanical | Methods with no implementation | P2 |
| Unused Imports | Mechanical | Using statements never referenced | P2 |
| Dead Feature Flags | AI-assisted | Flags always true/false | P2 |

### Coupling & Architecture Checks

| Check | Type | Description | Priority |
|-------|------|-------------|----------|
| Circular Dependencies | Mechanical | A→B→C→A dependency cycles | P1 |
| God Classes | Mechanical | Classes >500 lines or >20 methods | P1 |
| High Coupling | AI-assisted | Class depends on >10 other classes | P1 |
| Low Cohesion | AI-assisted | Class methods unrelated to each other | P2 |
| Single Responsibility Violation | AI-assisted | Class doing multiple unrelated things | P1 |
| Cross-Sector Dependencies | AI-assisted | Code violates SA sector boundaries | P1 |
| Deep Inheritance | Mechanical | Inheritance depth >4 levels | P2 |
| Interface Bloat | Mechanical | Interfaces with >10 methods | P2 |

### Naming & Conventions Checks

| Check | Type | Description | Priority |
|-------|------|-------------|----------|
| Inconsistent Naming | Mechanical | Mixed camelCase/snake_case/PascalCase | P2 |
| Cryptic Names | Mechanical | Single letters, unclear abbreviations | P2 |
| Misleading Names | AI-assisted | Name doesn't match behavior | P2 |
| Inconsistent Prefixes | Mechanical | _private vs m_private vs private | P2 |

### Unity-Specific Code Quality

| Check | Type | Description | Priority |
|-------|------|-------------|----------|
| Expensive Update() Calls | AI-assisted | Heavy logic in Update/FixedUpdate | P1 |
| Missing Null Checks | AI-assisted | GetComponent without null check | P1 |
| String Comparisons | Mechanical | Using == instead of CompareTag | P2 |
| Find() in Update | Mechanical | GameObject.Find in hot paths | P1 |
| Allocations in Loops | AI-assisted | new/Instantiate in Update/loops | P1 |

### Anti-Patterns AI Must Avoid

```
ANTI-PATTERNS TO FLAG:
- Creating PlayerMove() when MovePlayer() exists
- Creating new utility when existing util covers 90% of need
- Duplicating logic instead of extracting shared function
- Adding new config file when existing one could be extended
- Creating new enum when existing enum could be extended
- Hardcoding values that exist in constants elsewhere
```

---

## 4.11) Simple vs Complex Flag

**Purpose:** Reduce onboarding friction for small projects while enforcing architecture for large/production projects.

| Flag | Criteria | Default |
|------|----------|---------|
| Simple | Solo dev, prototype, game jam, learning project, <10 scripts | No |
| Complex | Team project, production game, >50 scripts, multiple systems | Yes (default) |

**First‑Launch UI (New Project):**
```
Project Setup

How would you classify this project?

○ Simple
  Solo/prototype. No architecture enforcement.
  Index + Gears disabled.

● Complex (Recommended)
  Team/production. Requires GDD + SA setup.
  Full SpaceCode features enabled.

[Continue]

ⓘ Can be changed later in Dashboard → Settings
```

**Storage:** `spacecode.projectComplexity: 'simple' | 'complex'` in workspace settings.

---

## 4.12) Questionnaire Spec (Docs Wizard)

**Principle:** Templates are long; the wizard asks only key questions. Answers populate templates.

### GDD Questionnaire (Mandatory for Complex)
| # | Question | Source Section | Required |
|---|----------|----------------|----------|
| 1 | Game title + working name | 1.1 | Yes |
| 2 | One‑sentence pitch (≤30 words) | 1.2 | Yes |
| 3 | Target platforms | 1.4 | Yes |
| 4 | Genre + subgenre | 2.1 | Yes |
| 5 | Core gameplay loop (3‑5 steps) | 2.2 | Yes |
| 6 | Primary mechanics (up to 5) | 3.1 | Yes |
| 7 | Player progression type | 4.1 | Optional |
| 8 | Multiplayer? (none/local/online) | 6.1 | Optional |
| 9 | Target audience | 1.5 | Optional |
| 10 | Inspirations/references (up to 3) | 1.3 | Optional |

**Completion Rule:** Questions 1‑6 required. 7‑10 can be “Define later”.

### SA Questionnaire (Mandatory for Complex)
| # | Question | Source Section | Required |
|---|----------|----------------|----------|
| 1 | Architecture pattern (MVC/ECS/custom) | 4.1 | Yes |
| 2 | List main systems/modules (up to 10) | 5.1 | Yes |
| 3 | For each module: name + responsibility | 5.1 | Yes |
| 4 | Dependencies between modules | 5.2 | Yes |
| 5 | Data persistence approach | 7.1 | Optional |
| 6 | Third‑party dependencies | 8.1 | Optional |
| 7 | Target Unity version | 3.1 | Yes |

**Completion Rule:** Questions 1‑4 and 7 required. Generates Sector Map.

### TDD Questionnaire (Optional)
| # | Question | Source Section | Required |
|---|----------|----------------|----------|
| 1 | Key APIs to implement | 4.1 | Optional |
| 2 | Data models (list entities) | 5.1 | Optional |
| 3 | External integrations | 6.1 | Optional |

---

## 4.13) Code‑Linked Docs (Blocking Rules)

| Doc Type | Can Block? | Reason |
|----------|-----------|--------|
| GDD | Yes (Complex) | Core vision for AI alignment |
| SA | Yes (Complex) | Architecture required for Gears |
| TDD | No | Technical details can evolve |
| Art Bible | No | Not code‑linked |
| Narrative Bible | No | Not code‑linked |
| UI/UX Spec | No | Informational, not blocking |
| Economy | No | Balance data |
| Audio Design | No | Not code‑linked |
| Test Plan | No | QA process |
| Level Brief | No | Per‑level, not blocking |

**Blocking Behavior:**
- If Complex + missing GDD/SA → Index shows wizard prompt
- Gears shows "Setup required" until SA complete
- Nova can operate but warns about missing context

---

## 4.14) Persona Tool Inventory

### Nova (Creator/Innovator Role)
| Category | Tools/Actions |
|----------|---------------|
| Code | Read, write, edit files; search codebase |
| Planning | Create implementation plan; enter planning mode |
| Execution | Run plan steps; spawn sub-agents for parallel execution (see 4.53) |
| Git | Stage, commit, push, branch, PR |
| MCP | All connected MCPs |
| Memory | Search past chats; retrieve context |
| Opinion | GPT second opinion |

### Gears (Station Engineer Role)
| Category | Tools/Actions |
|----------|---------------|
| Code | Read/search; no direct write in Learn mode |
| Analysis | Dependencies, SA compliance, gates |
| Refactor | Generate/apply refactor plan (Maintenance mode) |
| Tests | Mechanical + AI‑assisted |
| Unity | Scene info, asset validation, prefab checks |
| Explain | Analogy‑based explanation |
| Not Available | Git push, Execution Mode, GPT opinion, +Chat |

### Index (Librarian Role)
| Category | Tools/Actions |
|----------|---------------|
| Docs | Read/write/update docs |
| Wizard | Questionnaire + template generation |
| Sync | Detect doc drift; propose updates |
| Search | Search docs; cross‑reference GDD/SA/TDD |
| Not Available | Code execution, Git, tests |

### Triage (Ticket Bot Role)
| Category | Tools/Actions |
|----------|---------------|
| Tickets | Create/update/assign |
| Route | Analyze → Nova/Gears/Index/Vault |
| Autosolve | Trigger background solve |
| Notify | Completion notifications |
| Not Available | Direct code access, Git |

### Database Engineer (Vault)
| Category | Tools/Actions |
|----------|---------------|
| Schema | View tables, columns, types, relationships |
| Query | Build queries, validate SQL/NoSQL, optimize |
| Migration | Generate migrations, detect schema drift |
| Types | Generate TypeScript/C# types from schema |
| Security | Check RLS policies, validate permissions |
| Sync | Sync schema to SA document |
| Not Available | Code execution outside DB, Git, general file edits |

### Art Director (Palette)
| Category | Tools/Actions |
|----------|---------------|
| Styles | Store/retrieve color palettes, typography, spacing, themes |
| UI/UX | Design components, review layouts, accessibility checks |
| Image Gen | Generate images via Gemini AI (icons, sprites, backgrounds) |
| Assets | Organize asset library, naming conventions, export formats |
| Review | Compare designs to Art Bible, flag inconsistencies |
| Sync | Sync style guide to Art Bible / UI/UX Spec docs |
| Not Available | Code execution, Git, database access |

---

## 4.15) Persona Prompt Templates

**Location:**
```
src/
  personas/
    prompts/
      nova.system.md
      gears.system.md
      index.system.md
      vault.system.md
      palette.system.md
      triage.system.md
    schemas/
      persona.schema.json
```

**Versioning:**
- Prompts are versioned in git (e.g., `# Nova v1.2.0`).
- UI shows version (read-only). Changes require extension update.

**Prompt Structure:**
```
# [Persona Name] vX.Y.Z
## Role
## Capabilities
## Restrictions
## Tone
## Context Handling
## Tool Usage
```

---

## 4.16) Handoff Triggers

| Trigger | When | Example |
|---------|------|---------|
| AI‑Suggested | AI detects out‑of‑scope task | Nova finds refactor → suggest Gears |
| Keyword | User mentions persona domain | “update docs” → Index |
| Explicit Request | User asks for handoff | "send to Gears" |
| Completion | Task done, follow‑up elsewhere | Code done → Index |
| Error/Block | Persona cannot proceed | Gears blocked by missing SA |

**Inline Handoff UI:**
```
[Send to Gears & Stay] [Go to Station] [Keep Here]
```

**Menu Handoff UI:**
```
☰ Handoff → Gears / Index / Triage
```

---

## 4.17) ContextPackage (Final Schema)

```
ContextPackage {
  id: string,                       // UUID
  version: '1.0',
  timestamp: string,                // ISO 8601

  sourcePersona: 'nova' | 'gears' | 'index' | 'vault' | 'palette' | 'triage',
  targetPersona: 'nova' | 'gears' | 'index' | 'vault' | 'palette' | 'triage',

  summary: string,                  // max 500 chars
  fullContext?: string,             // max 4000 chars
  codeReferences: { file: string; lines?: [number, number]; symbol?: string }[],
  files: string[],
  codeChanges?: string,             // unified diff

  suggestedAction?: string,
  priority: 'low' | 'medium' | 'high' | 'critical',
  ticketId?: string,
  planId?: string,

  previousMessages: number,         // 0–10
  parentPackageId?: string
}
```

**Storage:** `.spacecode/handoffs/*.json` (retained 30 days, then archived).

**Security:** local-only; encrypted at rest if workspace is marked sensitive.

---

## 4.18) SA Parsing Validation

**Parse Steps:**
1) Find “Sector Map” table in SA
2) Extract columns: Sector ID, Name, Icon, Description, Dependencies
3) Validate rows + dependencies

**Validation Rules:**
| Field | Rule | On Fail |
|-------|------|---------|
| Sector ID | Non‑empty, lowercase slug, unique | Error |
| Name | Non‑empty, ≤50 chars | Error |
| Icon | Valid FontAwesome class (e.g., `fa-cube`, `fa-server`) | Warning (default `fa-cube`) |
| Description | Non‑empty | Warning |
| Dependencies | Valid Sector IDs | Error if invalid |

**Note:** Per MASTER_PLAN policy, all icons must be FontAwesome Free 6.x classes. No emojis in UI.

**Invalid SA UI:**
- **Simple projects**: Actions: **Edit SA**, **Ignore & Continue**, **Ask Index to Fix**
- **Complex projects**: Actions: **Edit SA**, **Ask Index to Fix** (no "Ignore & Continue" — SA is required)

**Fallback:** YAML/JSON block; if none, show "No architecture defined".

---

## 4.19) Enforcement Workflow (SA Violations)

**Detection:** Gears runs "SA Compliance Check" (manual or on-commit).

**Violation Types:** cross-sector import, missing sector, wrong folder, circular dependencies.

**Fix Flow:**
1) Show violation + suggested fix steps
2) Generate refactor plan
3) User approves
4) Gears executes
5) Index updates docs if needed

---

## 4.20) Ticket Routing Policy (Detailed)

| Ticket Type | Keywords/Signals | Route To | Fallback |
|-------------|------------------|----------|----------|
| BUG | bug, crash, fix | Gears | Nova if architectural |
| FEATURE | add, new, implement | Nova | — |
| REFACTOR | refactor, cleanup | Gears | — |
| DOC_UPDATE | document, update docs | Index | — |
| DOC_MISSING | missing docs | Index | — |
| SECURITY | vulnerability, CVE | Gears (Security mode) | — |
| PERFORMANCE | slow, optimize | Gears | Nova if redesign |
| UI/UX | ui, ux, layout | Nova | — |
| TEST | test, coverage | Gears | — |
| ARCHITECTURE | dependency, structure | Gears | Index if SA change |
| DATABASE | table, schema, query, migration | Vault | Gears if code-related |
| DATA_MODEL | entity, model, relationship | Vault | Index if doc-only |
| ART | icon, sprite, image, asset, visual | Palette | — |
| UI_DESIGN | ui, ux, layout, screen, component | Palette | Nova if code-heavy |
| STYLE | color, font, theme, style guide | Palette | Index if doc-only |

**Ambiguous:** ask user or route by referenced file → SA sector.

**Multi-Persona:** split into linked sub-tasks.

---

## 4.21) Workstream Task Mapping (Expanded)

### Workstream A.2: Security System
**Estimate:** 12 days
- Secret scanner (regex) – 2d
- Hardcoded credentials – 1d
- Dependency CVE checks – 2d
- AI injection analysis – 3d
- Security UI – 2d
- "Fix with Engineer" handoff – 1d
- Export report – 1d

### Workstream A.3: Code Quality System
**Estimate:** 20 days
- Duplication detection – 3d
- Magic number/string scan – 2d
- Dead code detection – 2d
- Circular dependency checker – 2d
- God class detector – 1d
- Coupling analysis – 3d
- SA violation checker – 2d
- Unity-specific checks – 2d
- Code quality UI – 2d
- "Reuse Before Create" prompt rule – 1d

**Updated Milestones (Est. Days):**
1) Chat System (15)
2) Planning + Execution Mode (20) ← includes 4.53 spec
3) Station Schematic (12)
4) Control Panel + Tests (8)
5) Security Checks (12)
6) Code Quality Checks (20)
7) Docs/Librarian (10)
8) Tickets (8)
9) Agents + Skills UI (10)
10) Dashboard (5)
11) Memory/Embeddings (8)
12) Project DB + Vault (15)
13) Art Studio + Palette (12)
14) UX Polish (13)

**Total:** ~168 dev days

---

## 4.22) MCP Details Data Source

**Source:** MCP SDK connection manager.

**Refresh Cadence:** heartbeat every 30s; full refresh on panel open/manual.

**Offline:** 3 missed heartbeats (90s) → Disconnected + retry.

---

## 4.23) Memory Retention Limits

| Storage Type | Limit | Rotation |
|--------------|-------|----------|
| Chat history (raw) | 10,000 messages | FIFO |
| Embeddings | 50,000 vectors | Oldest removed |
| Summary chunks | 1,000 | Oldest removed |
| ContextPackages | 500 | Delete after 30 days |

**Size Limits:** 500 MB per project; message 32 KB max.

**Rotation:** remove oldest 10%; pinned items exempt; ticket-linked exempt.

**UI:** Dashboard → Storage shows usage + clear/export.

---

## 4.24) Complete Persona Roster (6 Personas)

| # | Persona | Name | Icon (FA) | Color | Tab Location | Domain |
|---|---------|------|-----------|-------|--------------|--------|
| 1 | Creator/Innovator | **Nova** | `fa-rocket` | Blue | Chat | New features, creative work |
| 2 | Station Engineer | **Gears** | `fa-gear` | Orange | Station | Code maintenance, architecture |
| 3 | Librarian | **Index** | `fa-book` | Green | Dashboard → Docs | Documentation, specs |
| 4 | Ticket Bot | **Triage** | `fa-ticket` | Purple | Dashboard → Tickets | Ticket management, routing |
| 5 | Database Engineer | **Vault** | `fa-database` | Cyan | Dashboard → Project DB | Project DB, schemas, queries |
| 6 | Art Director | **Palette** | `fa-palette` | Pink | Dashboard → Art Studio | UI/UX, styles, image generation |

### Persona Status Bar (UI)
Shows all personas and current state at bottom of window:
```
[fa-rocket] Nova    [fa-gear] Gears   [fa-book] Index   [fa-database] Vault   [fa-palette] Palette   [fa-ticket] Triage
     ● Active          ○ Idle           ○ Idle             ○ Idle               ◐ Working             ○ Idle
                                                                                └─ "Generating icon"
```
Click any persona → jump to their tab/panel.

**Note:** All icons use FontAwesome Free 6.x classes per MASTER_PLAN policy (no emojis in UI).

---

## 4.25) Vault (Database Engineer) - New Persona

**Role:** Manages the **Project Database** (Supabase, Firebase, etc.) - not SpaceCode's internal storage.

### Vault Tool Inventory
| Category | Tools/Actions |
|----------|---------------|
| Schema | View tables, columns, types, relationships |
| Query | Build queries, validate SQL/NoSQL, optimize |
| Migration | Generate migrations, detect schema drift |
| Types | Generate TypeScript/C# types from schema |
| Security | Check RLS policies, validate permissions |
| Sync | Sync schema to SA document |
| Not Available | Code execution outside DB, Git, general file edits |

### Vault Prompt Location
```
src/personas/prompts/vault.system.md
```

---

## 4.26) Palette (Art Director) - New Persona

**Role:** Manages visual assets, UI/UX design, and image generation for the project.

### Palette Tool Inventory
| Category | Tools/Actions |
|----------|---------------|
| Styles | Store/retrieve color palettes, typography, spacing, themes |
| UI/UX | Design components, review layouts, accessibility checks |
| Image Gen | Generate images via Gemini AI (icons, sprites, backgrounds) |
| Assets | Organize asset library, naming conventions, export formats |
| Review | Compare designs to Art Bible, flag inconsistencies |
| Sync | Sync style guide to Art Bible / UI/UX Spec docs |
| Not Available | Code execution, Git, database access |

### Palette Prompt Location
```
src/personas/prompts/palette.system.md
```

### Art Studio Panel (Dashboard → Art Studio)
```
┌──────────────────┬──────────────────────────────────────────────┐
│                  │                                              │
│   PALETTE CHAT   │            ART STUDIO                        │
│   [fa-palette]   │                                              │
│                  │   STYLES                                     │
│   [Chat with     │   ──────                                     │
│    Palette about │   Primary: #3B82F6  Secondary: #10B981       │
│    your art]     │   Background: #1F2937  Text: #F9FAFB         │
│                  │                                              │
│                  │   FONTS                                      │
│                  │   ─────                                      │
│                  │   Headings: Inter Bold                       │
│                  │   Body: Inter Regular                        │
│                  │                                              │
│                  │   RECENT ASSETS                              │
│                  │   ─────────────                              │
│                  │   [icon_player.png] [bg_menu.png] [btn_*.9]  │
│                  │                                              │
│                  │   [Generate Image] [Style Guide] [Assets]    │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

### Image Generation (Gemini Integration)
```
┌──────────────────────────────────────────────────────────────────┐
│  Generate Image                                                  │
│  ══════════════                                                  │
│                                                                  │
│  Prompt:                                                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ A pixel art treasure chest, gold coins spilling out,       │  │
│  │ fantasy game style, 64x64 pixels, transparent background   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Style preset: ○ Pixel Art  ● UI Icon  ○ Background  ○ Custom   │
│  Size: [64] x [64]     Format: ○ PNG  ● WebP  ○ SVG             │
│                                                                  │
│  Apply project style guide: ☑                                   │
│                                                                  │
│  [Generate] [Generate Variations (4)]                            │
│                                                                  │
│  ─────────────────────────────────────────────────────────────── │
│  RESULTS                                                         │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                                    │
│  │ 1  │ │ 2  │ │ 3  │ │ 4  │                                    │
│  └────┘ └────┘ └────┘ └────┘                                    │
│  [Use #1] [Refine] [Save All]                                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Gemini API Settings
```
Dashboard → Settings → Integrations → Gemini AI

API Key: [••••••••••••••••••••] [Test]
Model: ● gemini-2.0-flash  ○ gemini-1.5-pro
Status: ● Connected

Default image settings:
  Size: 512x512
  Format: PNG
  Apply style guide: ☑
```

**Storage:** `spacecode.integrations.gemini.apiKey` (encrypted in system keychain)

---

## 4.27) Persona Connection Map

```
                            ┌───────────┐
                            │   Nova    │
                            │[fa-rocket]│
                            │  Creator  │
                            └─────┬─────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
   ┌───────────┐            ┌───────────┐            ┌───────────┐
   │   Gears   │◄──────────►│   Index   │◄──────────►│  Palette  │
   │ [fa-gear] │            │ [fa-book] │            │[fa-palette]│
   │  Engineer │            │ Librarian │            │  Art Dir  │
   └─────┬─────┘            └─────┬─────┘            └─────┬─────┘
         │                        │                        │
         │      ┌───────────┐     │                        │
         └─────►│   Vault   │◄────┘                        │
                │[fa-database]│                             │
                │  Database │◄─────────────────────────────┘
                └─────┬─────┘
                      │
                      ▼
                ┌───────────┐
                │  Triage   │
                │[fa-ticket]│
                │  Tickets  │
                └───────────┘
```

### Automatic Connection Triggers

| From | To | Trigger | Example |
|------|-----|---------|---------|
| Nova | Gears | Refactor/maintenance task | "Clean up this code" |
| Nova | Index | Doc update needed | Feature complete → docs need update |
| Nova | Vault | Database table/query mentioned | "Add a leaderboard table" |
| Nova | Palette | UI/art asset needed | "Create an icon for inventory" |
| Nova | Triage | Creates task for later | "Remind me to fix this" |
| Gears | Nova | Architectural redesign needed | Bug requires new system design |
| Gears | Index | SA violation found | Code doesn't match architecture |
| Gears | Vault | Query optimization needed | Slow DB calls detected |
| Gears | Palette | UI component needs design | New button/screen needed |
| Index | Nova | GDD change affects features | Game design pivot |
| Index | Gears | SA change affects code | Architecture update |
| Index | Vault | Schema documented in SA | New data model defined |
| Index | Palette | Art Bible update needed | New visual style defined |
| Palette | Nova | Asset ready for integration | "Icon created, add to UI" |
| Palette | Index | Style guide updated | New colors/fonts added |
| Palette | Gears | UI component ready | Design handoff for implementation |
| Vault | Gears | Schema change affects code | Migration needed |
| Vault | Index | Schema needs documentation | New tables added |
| Vault | Nova | Feature request for DB | "Need new query capability" |
| Triage | Nova | Feature ticket | Type: FEATURE |
| Triage | Gears | Bug/maintenance ticket | Type: BUG, REFACTOR |
| Triage | Index | Doc ticket | Type: DOC_UPDATE |
| Triage | Vault | Database ticket | Type: DATABASE, MIGRATION |
| Triage | Palette | Art/UI ticket | Type: ART, UI_DESIGN |

### Manual Handoff UI

**In-Chat Handoff Menu:**
```
☰ Handoff
┌──────────────────────────────────────────────────┐
│  [fa-rocket]   Nova      (current)               │
│  [fa-gear]     Gears     - Code maintenance      │
│  [fa-book]     Index     - Update docs           │
│  [fa-database] Vault     - Database work         │
│  [fa-palette]  Palette   - Art/UI design    ◄── suggested
│  [fa-ticket]   Triage    - Create ticket         │
└──────────────────────────────────────────────────┘
```

**Handoff Context Preview:**
```
┌──────────────────────────────────────────────────────────────┐
│  Handoff to Vault                                            │
│  ════════════════                                            │
│                                                              │
│  Summary:                                                    │
│  Create leaderboard and scores tables for player stats       │
│                                                              │
│  Context included:                                           │
│  ☑ Last 5 messages                                          │
│  ☑ Referenced files (PlayerStats.cs)                        │
│  ☐ Full conversation                                        │
│                                                              │
│  Suggested action:                                           │
│  "Create tables: leaderboards, scores with relationships"    │
│                                                              │
│  Priority: ● Medium                                          │
│                                                              │
│  [Send] [Edit Context] [Cancel]                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 4.28) Dashboard Structure (Updated)

**Tab Layout:**
```
[Mission] [Docs] [Tickets] [Art Studio] [Storage] [Project DB] [MCP] [Settings]
```

### Storage (SpaceCode Internal)
Shows SpaceCode's internal DB (embeddings, chat history, memory):
```
SPACECODE STORAGE
═════════════════

Type: SQLite + Vector Store
Location: ~/.spacecode/projects/{project-id}/

USAGE
─────
Chat History    8,234 / 10,000 messages     ████████░░ 82%
Embeddings      42,100 / 50,000 vectors     ████████░░ 84%
Summaries       312 / 1,000 chunks          ███░░░░░░░ 31%
Disk Space      423 MB / 500 MB             ████████░░ 85%

[Clear Old Data] [Export] [Rebuild Index]
```

### Project DB (Game's External Database)
Shows game's database (Supabase, Firebase, etc.) with Vault chat:
```
┌──────────────────┬──────────────────────────────────────────────┐
│                  │                                              │
│   VAULT CHAT     │            PROJECT DATABASE                  │
│   [fa-database]  │                                              │
│                  │   Provider: Supabase ● Connected             │
│   [Chat with     │                                              │
│    Vault about   │   TABLES              SCHEMA PREVIEW         │
│    your DB]      │   ──────              ──────────────         │
│                  │   players      ───►   id, name, email, ...   │
│                  │   inventory    ───►   player_id, item_id     │
│                  │   leaderboards ───►   id, player_id, score   │
│                  │                                              │
│                  │   [View Schema] [Query Builder] [Migrations] │
│                  │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

**Supported Providers:**
- Supabase
- Firebase / Firestore
- PostgreSQL
- MySQL
- SQLite (local)
- MongoDB

**Connect Flow:** Dashboard → Project DB → [+ Connect Database] → Select provider → Enter credentials → Test → Save

---

## 5) Implementation V2 Plan (Workstreams)

### Workstream 0: Webview Panel Modularization (panel.js)
**Goal:** Make `panel.js` maintainable and built from source (no behavior change).

**Tasks:**
1. Move `media/panel.js` into `src/webview/panel/index.ts` (source of truth).
2. Add esbuild target to emit `media/panel.js`.
3. Split panel code into modules:
   - `state/` (store, selectors)
   - `ipc/` (postMessage bridge + handlers)
   - `ui/` (layout, tabs, panel renderers)
   - `features/` (chat, station, flow, dashboards)
4. Verify UI parity (no visual or behavior change).
5. Document new build flow in this plan.

### Workstream A: Chat System Overhaul
**Goal**: Multi-persona chat system (Nova, Gears, Index, Triage, Vault, Palette)

**Tasks**:
1. Implement compaction/summary when token budget reached
2. Implement “send while thinking” input behavior
   - Claude: true interrupt
   - GPT: force-stop + restart with new message (Option C)
   - UI message on interrupt: “Process interrupted. Waiting for new orders.”
3. Implement persona routing + surfaces
   - Nova: Chat tab
   - Gears: Station tab (left 33%)
   - Index: Dashboard → Docs
   - Triage: Tickets
4. Gears chat options: remove execution mode, GPT opinion, +chat, push-to-git
5. Station chat width set to 33%
6. Add “Reset chat context” for new topics

**Acceptance**:
- Nova retains full features (execution mode, opinion)
- Gears is simplified + single-thread
- Index + Triage use dedicated surfaces
- Input behavior matches spec
 - Personas are visually distinct (skins, icons, colors)

---

### Workstream A.1: Planning System
**Goal**: Structured planning phase before implementation

**Tasks**:
1. Implement Planning mode for Nova (replaces legacy Swarm)
2. Implement 4-phase planning flow: Study → Connect → Plan → Review
3. Planning Panel UI in right panel showing:
   - Current phase (1-4)
   - Phase checklist with completion status
   - Affected files list
   - Risk assessment
4. Multi-persona collaboration during planning:
   - Nova leads Study + Plan phases
   - Gears leads Connect phase (code analysis)
   - Index leads Review phase (doc validation)
5. Planning output: structured Implementation Plan markdown
6. Planning gates with approval checkpoints
7. Implement "Reuse Before Create" AI rule:
   - Search existing code before creating new
   - Explain why existing code was insufficient if creating new
   - Flag when similar functionality already exists

**Acceptance**:
- User can enter Planning mode from Chat tab
- Planning progresses through 4 phases with visible status
- Implementation Plan is generated as artifact
- Plan can be handed off to Gears for execution
- AI demonstrates "Reuse Before Create" behavior

---

### Workstream B: Memory + Embeddings
**Goal**: Per-project chat memory + retrieval

**Tasks**:
1. Store chat history per project
2. Embed chat sessions and enable semantic recall
3. Expose “Search previous chats”
4. Add summary chunks as first-class memory items

---

### Workstream C: Station Schematic
**Goal**: Real architecture map

**Tasks**:
1. Wizard-first architecture setup (prescriptive)
2. Map analogy → real module names in the wizard
3. Schematic represents what code SHOULD be (not just what it is)
4. Show both names on hover and in detail panel
5. Allow “select sector → explain/analyze” actions
6. If code does not match SA, generate a refactor plan to align it
7. Optional: lightweight code scan to suggest current structure + gaps (if user has no docs)

---

### Workstream D: Control Panel Redesign
**Goal**: Junior-friendly maintenance controls with comprehensive test coverage

**New Control Tabs**:
1. **Diagnostics** - Fast, blocking checks
2. **Tests** - Unit/integration test runners
3. **Security** - Security audit scans (see 4.9)
4. **Code Quality** - Duplication, dead code, coupling (see 4.10)
5. **Maintenance** - Refactor suggestions, cleanup actions

**Tasks**:
1. **DELETE entire "Advanced Panels" section from Control** (see migration table in 4.0)
2. Move Planning UI to Chat tab → Planning Mode
3. Move Approval Queue to Dashboard → Mission
4. Move Verification to Diagnostics tab
5. Delete unused panels (Core, Hangar, Armory)
6. Implement new 5-tab control panel UI: [Diagnostics] [Tests] [Security] [Code Quality] [Maintenance]
7. Integrate all mechanical tests from inventory below
8. Integrate AI-assisted tests with proper async handling
9. Add "Run All" / "Run Selected" buttons
10. Results display with severity (Pass/Warn/Fail)
11. Click result → details + suggested fix
12. "Fix with Engineer" handoff button

**Complete Test Inventory**:

| Category | Test | Type | Priority |
|----------|------|------|----------|
| **Diagnostics** | Build/compile check | Mechanical | P0 |
| | Syntax errors | Mechanical | P0 |
| | Missing references | Mechanical | P0 |
| **Tests** | Unit test runner | Mechanical | P1 |
| | Integration tests | Mechanical | P1 |
| | asmdef dependency check | Mechanical | P1 |
| | GUID validation | Mechanical | P2 |
| | Lint/style checks | Mechanical | P2 |
| **Security** | Secret scanner | Mechanical | P1 |
| | Hardcoded credentials | Mechanical | P1 |
| | Injection vulnerabilities | AI | P1 |
| | Dependency CVEs | Mechanical | P1 |
| | Auth flow review | AI | P2 |
| | Insecure crypto | Mechanical | P2 |
| **Code Quality** | Duplicate functions | AI | P1 |
| | Similar code blocks | Mechanical | P1 |
| | Magic numbers | Mechanical | P1 |
| | Hardcoded strings | Mechanical | P1 |
| | Dead code | Mechanical | P1 |
| | Unused imports | Mechanical | P2 |
| | Circular dependencies | Mechanical | P1 |
| | God classes (>500 lines) | Mechanical | P1 |
| | High coupling | AI | P1 |
| | SA sector violations | AI | P1 |
| | Naming conventions | Mechanical | P2 |
| **Unity-Specific** | Asset validation | Mechanical | P1 |
| | Missing prefab refs | Mechanical | P1 |
| | Scene dependency check | Mechanical | P2 |
| | High-poly object scan | Mechanical | P2 |
| | Expensive Update() calls | AI | P1 |
| | Find() in hot paths | Mechanical | P1 |
| | Allocations in loops | AI | P1 |

**Unity-Specific Actions** (not tests):
- List active scene/prefab
- Select high-poly objects
- Run play/stop
- Build pipeline validation
- Asset reference audit

**Explicitly NOT in Station Control**:
- Unity console errors (Coplay MCP already connected)

---

### Workstream E: Agents + Skills UI
**Goal**: Working agent system visuals

**Tasks**:
1. Implement agent list with Station-style graphics
2. Add right-panel details for selected agent/skill
3. Define agent inputs/outputs per master plan

---

### Workstream F: Docs / Librarian
**Goal**: Mandatory doc setup + sync

**Tasks**:
1. Index blocks if docs missing
2. Setup wizard flow:
   - Step 1: GDD (mandatory for complex projects)
   - Step 2: SA (mandatory for complex projects; defines Sector Map)
   - Step 3: TDD (optional)
   - Step 4-10: Optional templates (user may skip)
3. Load templates from `templates/`:
   - GDD_TEMPLATE.md, TDD_TEMPLATE.md, SA_TEMPLATE.md
   - ART_BIBLE_TEMPLATE.md, NARRATIVE_BIBLE_TEMPLATE.md
   - UIUX_SPEC_TEMPLATE.md, ECONOMY_TEMPLATE.md
   - AUDIO_DESIGN_TEMPLATE.md, TEST_PLAN_TEMPLATE.md
   - LEVEL_BRIEF_TEMPLATE.md
4. Sync docs on code changes

**Template Inventory**:
| # | Template | File | Purpose | Mandatory |
|---|----------|------|---------|-----------|
| 1 | GDD | GDD_TEMPLATE.md | Game design vision, mechanics, systems | Yes (Complex) |
| 2 | TDD | TDD_TEMPLATE.md | Technical design, APIs, architecture, data | Optional |
| 3 | SA | SA_TEMPLATE.md | Software architecture + Sector Map | Yes (Complex) |
| 4 | Art Bible | ART_BIBLE_TEMPLATE.md | Visual style, budgets, pipeline | Optional |
| 5 | Narrative Bible | NARRATIVE_BIBLE_TEMPLATE.md | Lore, characters, dialogue | Optional |
| 6 | UI/UX Spec | UIUX_SPEC_TEMPLATE.md | Screens, components, accessibility | Optional |
| 7 | Economy | ECONOMY_TEMPLATE.md | Currencies, sinks, balance | Optional |
| 8 | Audio Design | AUDIO_DESIGN_TEMPLATE.md | Music, SFX, VO, mixing | Optional |
| 9 | Test Plan | TEST_PLAN_TEMPLATE.md | QA strategy, test cases, metrics | Optional |
| 10 | Level Brief | LEVEL_BRIEF_TEMPLATE.md | Per-level design spec | Optional |

---

### Workstream G: Tickets + Station Engineer
**Goal**: Dedicated maintenance workflow

**Tasks**:
1. Ticket AI persona (separate from Chat)
2. Route maintenance tickets to Gears
3. Allow Chat → Gears handoff
4. Cross-chat handoff UX (Pass Context / Go to Tab / Autosolve)
5. ContextPackage format for handoffs
6. Autosolve notifications (View Changes / Send to Index / Dismiss)
7. Ticket routing policy:
   - BUG / current code issues → Gears
   - FEATURE / new system → Nova
   - DOC_UPDATE / missing docs → Index

---

### Workstream H: Dashboard Enhancements
**Goal**: Expose system state clearly

**Tasks**:
1. Storage panel shows type/location/size/cap (SpaceCode internal)
2. MCP details panel shows server info
3. Logs grouped by severity
4. Mission panel with project timeline/milestones

---

### Workstream I: Project DB + Vault Persona
**Goal**: External database management with dedicated AI persona

**Tasks**:
1. Implement Vault persona with dedicated system prompt
2. Project DB panel UI in Dashboard
3. Database connection wizard (Supabase, Firebase, PostgreSQL, etc.)
4. Schema viewer with table/column details
5. Query builder interface
6. Migration generator
7. TypeScript/C# type generation from schema
8. RLS policy checker
9. Schema → SA sync (update docs when schema changes)
10. Vault ↔ other persona handoffs

**Estimate:** 15 days

---

### Workstream J: Art Studio + Palette Persona
**Goal**: Visual asset management with dedicated AI persona + Gemini integration

**Tasks**:
1. Implement Palette persona with dedicated system prompt
2. Art Studio panel UI in Dashboard
3. Style storage system (colors, fonts, spacing, themes)
4. Gemini API integration for image generation
5. Image generation UI (prompts, presets, variations)
6. Asset library viewer and organizer
7. Style guide sync to Art Bible / UI/UX Spec
8. Design review tools (compare to Art Bible)
9. Export formats and naming conventions
10. Palette ↔ other persona handoffs

**Estimate:** 12 days

---

## 4.29) Debug Settings

**UI Debug Flag:**
```
Dashboard → Settings → Developer

☐ Show panel borders (debug)
  Displays colored borders around UI panels for layout debugging.
  Useful during development, disable for production.
```

**Storage:** `spacecode.debug.showPanelBorders: boolean` (default: false)

**Implementation:**
- When enabled, all panels get a 1px colored border:
  - Chat panels: blue
  - Station panels: orange
  - Dashboard panels: green
  - Right panels: purple
- CSS class `.debug-borders` applied to webview root when enabled

---

## 4.30) Skills System Spec

**Location:**
```
.claude/skills/<skill-name>/SKILL.md
.codex/skills/<skill-name>/SKILL.md  (mirror for GPT/Codex)
```

### Skill File Format (YAML Front-Matter)
```yaml
---
id: skill-unique-id
name: My Skill Name
category: code | docs | unity | testing | deployment
version: 1.0.0
personas: [nova, gears, index, vault, palette, triage]
triggers:
  - pattern: "regex pattern"
    auto: true   # auto-invoke on match
  - pattern: "another pattern"
    auto: false  # suggest only
tools:
  - read_file
  - write_file
  - run_command
  - search_codebase
requires:
  - other-skill-id  # optional dependencies
---

# Skill Instructions

(Markdown body with instructions for the AI)
```

### Skill Schema Validation
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique lowercase slug |
| name | string | Yes | Display name |
| category | enum | Yes | Skill category for grouping |
| version | semver | Yes | Skill version |
| personas | string[] | Yes | Which personas can use this skill |
| triggers | object[] | No | Auto-invoke patterns |
| tools | string[] | No | Required tool access |
| requires | string[] | No | Dependent skills |

### Skills UI (Skills Tab)
```
┌─────────────────────────────────┬────────────────────────────────────────┐
│  SKILLS                         │  SKILL DETAILS                         │
│  ════════                       │  ═════════════                         │
│                                 │                                        │
│  📁 Code                        │  unity-test-runner                     │
│    └─ unity-test-runner ◄──     │  ────────────────                      │
│    └─ spacecode-ui-debug        │                                        │
│                                 │  Category: testing                     │
│  📁 Docs                        │  Personas: gears, nova                 │
│    └─ keybindings-help          │  Version: 1.0.0                        │
│                                 │                                        │
│  📁 Testing                     │  Triggers:                             │
│    └─ run-unit-tests            │  • /test, /unittest (auto)             │
│                                 │  • "run tests" (suggest)               │
│  📁 Custom                      │                                        │
│    └─ (user skills)             │  Tools: run_command, read_file         │
│                                 │                                        │
│  [+ Add Skill]                  │  [Edit] [Disable] [Delete]             │
│                                 │                                        │
└─────────────────────────────────┴────────────────────────────────────────┘
```

### Skill Execution Flow
1. Trigger detected (regex match or explicit /command)
2. Check persona access (is current persona in `personas` list?)
3. Load skill markdown body into context
4. Execute with specified tools
5. Log skill invocation for analytics

---

## 4.31) Explorer → Gears Context

**Trigger:** User selects file/symbol in VSCode Explorer or Editor.

### Debounce Rule
- **500ms debounce** after selection change before sending context
- Prevents spam during rapid navigation
- Cancel pending context if new selection made

### Context Payload
```typescript
interface ExplorerContext {
  file: string;                    // Absolute file path
  symbols: string[];               // Parsed symbols (classes, functions)
  codeSnippet: string;             // Up to 50 lines around selection
  sector: string | null;           // Matched SA sector (if any)
  selectionRange?: {               // If text selected
    start: { line: number; char: number };
    end: { line: number; char: number };
  };
}
```

### Mode Behavior
| Mode | On Selection | Action |
|------|--------------|--------|
| Learn | File/symbol selected | Auto-explain with analogy mapping |
| Maintenance | File/symbol selected | Show relevant refactor options |
| Neither active | File/symbol selected | No auto-action; manual trigger only |

### Context Injection
- Context injected into Gears chat as system message
- Previous file context cleared on new selection
- User can pin context to prevent auto-clear

---

## 4.32) Right Panel Mode Separation

**Principle:** Each tab has dedicated right-panel modes. No mode bleeds across tabs.

### Container IDs
```html
<!-- Chat Tab -->
<div id="right-panel-chat">
  <div id="rp-flow">...</div>
  <div id="rp-opinion">...</div>
  <div id="rp-plus-chat">...</div>
  <div id="rp-planning">...</div>
</div>

<!-- Station Tab -->
<div id="right-panel-station">
  <div id="rp-schematic">...</div>
  <div id="rp-control">...</div>
</div>

<!-- Dashboard Tab -->
<div id="right-panel-dashboard">
  <!-- Context-free: panel content depends on sub-tab -->
</div>
```

### Tab → Right Panel Routing
| Tab | Available Right Panel Modes |
|-----|----------------------------|
| Chat | Flow, Opinion, +Chat, Planning |
| Station | Schematic, Control |
| Agents | Agent Details |
| Skills | Skill Details |
| Dashboard | Sub-tab specific (no shared modes) |

### Routing Rules
1. On tab switch, hide all right panels except current tab's container
2. Remember last active mode per tab
3. Default modes: Chat→Flow, Station→Schematic
4. Never show Chat modes (Flow/Opinion/+Chat) in Station tab
5. Never show Station modes (Schematic/Control) in Chat tab

---

## 4.33) Simple Project UI State

**Principle:** Simple projects see full UI, but architecture-dependent features are disabled with explanation.

### Disabled Features (Simple Mode)
| Feature | Visible | State | Tooltip |
|---------|---------|-------|---------|
| Gears chat | Yes | Disabled | "Not required for simple projects" |
| Schematic view | Yes | Empty + message | "No architecture defined" |
| SA Compliance checks | Yes | Disabled | "Requires SA document" |
| Sector violation alerts | Yes | Hidden | — |
| Index blocking | No | Inactive | — |
| Doc sync reminders | No | Inactive | — |

### UI Treatment
```
┌──────────────────────────────────────────────────────────────┐
│  GEARS                                                        │
│  ════════════════                                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │   [fa-lock] Gears is disabled for simple projects         │  │
│  │                                                        │  │
│  │   This feature requires a Software Architecture (SA)   │  │
│  │   document to enforce code structure.                  │  │
│  │                                                        │  │
│  │   [Change to Complex Project] [Learn More]             │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### First Impression (Simple Project Dashboard)
```
┌──────────────────────────────────────────────────────────────┐
│  DASHBOARD                                                    │
│  ═════════                                                    │
│                                                              │
│  PROJECT: MySimpleGame           TYPE: [fa-star] Simple      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │   [fa-rocket] Welcome to SpaceCode!                    │  │
│  │                                                        │  │
│  │   Your project is set to **Simple** mode.              │  │
│  │   Nova is ready to help you code—just ask!             │  │
│  │                                                        │  │
│  │   Some features are disabled in Simple mode:           │  │
│  │   • Gears (code analysis)                              │  │
│  │   • Schematic view (architecture visualization)        │  │
│  │   • SA Compliance checks                               │  │
│  │                                                        │  │
│  │   [fa-arrow-up] Upgrade to Complex Project to unlock   │  │
│  │   all features and enable architecture enforcement.    │  │
│  │                                                        │  │
│  │   [Upgrade to Complex] [Stay Simple]                   │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  QUICK ACTIONS                                               │
│  ─────────────                                               │
│  [fa-comment] Chat with Nova                                 │
│  [fa-cog] Project Settings                                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Upgrade Path
- User can change Simple → Complex anytime via Dashboard → Settings
- On upgrade: Index prompts for GDD + SA setup
- After upgrade: SA Gap Analysis becomes available (see 4.34 "SA Gap Analysis")

---

## 4.34) Docs Wizard Output Mapping

**Principle:** Wizard answers populate template placeholders; unanswered questions become TODOs.

### Placeholder Format
Templates use `{{section:X.Y}}` placeholders:
```markdown
## 1.1 Game Title
{{section:1.1}}

## 1.2 Elevator Pitch
{{section:1.2}}
```

### Mapping Rules
| Questionnaire Answer | Template Action |
|----------------------|-----------------|
| Answered | Replace placeholder with answer |
| "Define later" | Insert `<!-- TODO: Define [section name] -->` |
| Skipped (optional) | Insert `<!-- TODO: [section name] (optional) -->` |
| Not asked | Leave placeholder for manual edit |

### Output Location
```
docs/
├── GDD.md           (from GDD_TEMPLATE.md)
├── SA.md            (from SA_TEMPLATE.md)
├── TDD.md           (from TDD_TEMPLATE.md)
└── ...
```

### Post-Generation
1. Open generated doc in editor
2. Highlight TODO sections
3. Index offers "Complete remaining sections" chat

### SA Gap Analysis (Gears Feature)

**Trigger:** Available after SA document is completed.

**Purpose:** Gears scans existing codebase against the SA and generates a compliance gap report showing what needs to change.

**Gap Report Contents:**
| Section | Description |
|---------|-------------|
| **Missing Sectors** | Folders/namespaces defined in SA but not in code |
| **Undefined Code** | Code areas not mapped to any SA sector |
| **Dependency Violations** | Imports/references that break SA dependency rules |
| **Naming Mismatches** | Classes/files not following SA naming conventions |
| **Migration Tasks** | Suggested steps to align code with SA |

**UI Integration:**
```
┌──────────────────────────────────────────────────────────────┐
│  SA GAP ANALYSIS                                  [fa-gear]  │
│  ════════════════                                            │
│                                                              │
│  Comparing: docs/SA.md ↔ Assets/Scripts/                     │
│                                                              │
│  COMPLIANCE: 45%  [████████░░░░░░░░░░░░]                      │
│                                                              │
│  GAPS FOUND: 12                                              │
│  ─────────────                                               │
│  [HIGH] 3 dependency violations                              │
│  [MED]  5 files in undefined sectors                         │
│  [LOW]  4 naming convention mismatches                       │
│                                                              │
│  [View Full Report] [Generate Migration Plan]                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Workflow:**
1. User completes SA via wizard → SA.md generated
2. User clicks "Run SA Gap Analysis" in Dashboard → Docs
3. Gears scans codebase and produces gap report
4. User can request "Generate Migration Plan" for Nova to create implementation plan
5. After migration, re-run Gap Analysis to verify compliance

**Notes:**
- Gap Analysis is read-only (does not modify code)
- Requires SA to be complete (no TODO placeholders in Sector Map)
- Can be re-run anytime to track compliance progress

---

## 4.35) SA → Schematic Visual Rules

**Principle:** The Sector Map table in SA document drives the Station schematic visualization.

### Layout Rules
| Rule | Description |
|------|-------------|
| Center | CORE sector (if exists) placed at center |
| Radial | Other sectors arranged radially by dependency depth |
| Grouping | Sectors with shared dependencies cluster together |
| Spacing | Minimum 100px between nodes |

### Edge Types
| Dependency Type | Line Style | Color |
|-----------------|------------|-------|
| Hard dependency | Solid | Gray (#6B7280) |
| Optional dependency | Dashed | Gray (#9CA3AF) |
| Circular (warning) | Solid | Red (#EF4444) |

### Node Appearance
```
┌─────────────────┐
│  🎮  GAMEPLAY   │  ← Icon + Analogy Name
│   game_systems  │  ← Real folder/namespace
└─────────────────┘
```

### Hover Behavior
- Hover node: Show tooltip with both names + description
- Hover edge: Highlight both connected nodes + show dependency direction
- Click node: Select sector, show details in right panel

### Invalid State
If SA parsing fails:
```
┌──────────────────────────────────────────┐
│  [!] Schematic Unavailable               │
│                                          │
│  SA document is missing or invalid.      │
│  [Edit SA] [Ask Index to Fix]            │
└──────────────────────────────────────────┘
```

---

## 4.36) Nova Execution Mode (Parallel Execution)

**Purpose:** Execute approved plans in parallel while enforcing SA rules and avoiding file conflicts.

> **Full Specification:** See **section 4.53** for complete Execution Mode documentation including UI mockups, schemas, and acceptance criteria.

### Mode Behavior
- Nova has three modes: Create (default), Planning, Execution
- Execution starts only after plan approval
- **No-Pause Rule:** once started, Execution never stops to ask the user questions
- **Manual Stop Only:** execution ends only on completion or explicit user stop (no auto-stop; infrastructure issues are stalled and deferred)

### Worker Model
- Default workers: 3 (max 5)
- Each worker receives: assigned plan steps, file locks, context slice
- No two workers may edit the same file concurrently

### Hard Constraints
- Plan-locked: workers only execute assigned steps
- File-locked: exclusive file ownership
- SA-locked: sector rules injected into every worker
- Merge-gated: no final changes until verification passes

### Execution Flow
1. Plan approved -> Nova switches to Execution Mode
2. Split plan steps by file/sector
3. Spawn workers with file locks
4. Parallel edits
5. Per-worker verification (fast)
6. Merge gate (auto-merge without user prompts)
7. Final verification (full gates)
8. Deferred decisions queue assembled
9. Commit/finish (optional git actions)

### Context Slice Rules
- Only target files + minimal dependencies
- SA rules for relevant sectors
- No unrelated project context unless required

### Conflict Management
- File collision: worker queued until lock release
- Dependency collision: read-only shared context
- Merge conflict: worker rebases before merge; if unresolved, add to Deferred Decisions

### Verification Strategy
- Worker verification: per-diff checks
- Global verification: full gate checks post-merge
- Failures block merge until fixed

### UI/UX
- Execution dashboard with:
  - Global progress bar (X/Y work units complete + phase label)
  - Worker cards (status, locked files, step progress)
  - Deferred decisions count and failures count
- Controls: manual stop only (no pause/resume—execution is either running or stopped)
- Sub-agent visibility:
  - Live worker list in feedback panel
  - Collapsed summary cards in main chat
- Final verification indicator

### Defaults
- Workers: 3
- Max workers: 5
- File locks: required
- Plan steps: required before execution

### Deferred Decisions Queue
- Any ambiguity is deferred rather than blocking execution
- Queue is presented after completion with action buttons

---

## 4.37) Agent vs Persona Execution Flow

**Personas** are user-facing chat interfaces. **Agents** are background specialists.

### Persona Characteristics
| Aspect | Personas |
|--------|----------|
| Visibility | User sees chat interface |
| Interaction | Direct conversation |
| Thread | Maintains conversation history |
| Count | 6 (Nova, Gears, Index, Vault, Palette, Triage) |

### Agent Characteristics
| Aspect | Agents |
|--------|--------|
| Visibility | Background, status only |
| Interaction | Triggered automatically |
| Thread | Task-scoped, no persistent chat |
| Count | 9 (MasterMind, SecurityAuditor, etc.) |

### Execution Flow
```
User Request → Persona (Nova)
                    │
                    ├─→ [Direct handling] → Response
                    │
                    └─→ [Needs specialist] → Spawn Agent
                                                │
                                                ├─→ Agent executes task
                                                │
                                                └─→ Returns result to Persona
                                                          │
                                                          └─→ Persona delivers to User
```

### Auto-Fire Triggers
| Agent | Trigger | Persona Notified |
|-------|---------|------------------|
| SecurityAuditor | Security keyword in code | Gears |
| AsmdefGuard | .asmdef file modified | Gears |
| Documentor | Code change in documented file | Index |
| ShaderSmith | .shader/.hlsl file touched | Nova |
| Spine2DExpert | Spine asset referenced | Nova |
| DatabaseGuard | Migration file created | Vault |
| CodeReviewer | PR review requested | Nova/Gears |

### Agent Status Display
```
Agents: SecurityAuditor ◐ scanning...  AsmdefGuard ○ idle
```

---

## 4.37a) External Coordinator Service (Asmdef Sync)

**Purpose:** Persist asmdef policy/inventory/graph and expose health/status.  
**Note:** This is **not** the same as the Swarm Coordinator. Execution intercepts are in-process only.

### Service
- Name: `spacecode-coordinator`
- Transport: Local HTTP
- Storage: SQLite (policy/inventory/graph + timestamps)
- Default URL: `http://127.0.0.1:5510`

### Client & Config
- Client: `CoordinatorClient` (mastercode_port/services)
- Settings:
  - `spacecode.coordinatorEnabled` (default: true)
  - `spacecode.coordinatorUrl` (default: `http://127.0.0.1:5510`)

### Sync Triggers
1. Asmdef scan completes → push inventory + graph
2. Policy generated/updated → push policy
3. Station info panel open → health check + status refresh

### Failure Behavior
- Non-blocking: local state remains source of truth
- UI shows `Disconnected` + last error
- Retry on next scan or manual “Check” in Station panel

### UI Fields
- Status badge, URL, last issue
- Last sync timestamps: policy / inventory / graph
- Summary line: “Synced / Pending / Error”

---

## 4.38) Testing UX Policies

**Principle:** Tests run in priority order with sensible defaults and clear blocking rules.

### Default Test Selection
| Category | Default State | Reason |
|----------|---------------|--------|
| Diagnostics | ☑ Always on | Fast, blocking issues |
| Mechanical Tests | ☑ On | Reliable, deterministic |
| AI-Assisted Tests | ☐ Off | Slower, optional depth |

### Run Order
1. Diagnostics (P0) - must pass before others run
2. Mechanical Tests (P1)
3. AI-Assisted Tests (P2) - only if enabled

### Blocking Rules
| Test Category | Blocks | Override |
|---------------|--------|----------|
| Diagnostics (build/syntax) | Commit, push | Manual override with warning |
| Security P1 (secrets) | Push only | User acknowledgment required |
| Code Quality | Nothing | Advisory only |
| AI-Assisted | Nothing | Advisory only |

### Override UI
```
[!] Diagnostics Failed

2 blocking issues found:
• Build error in PlayerController.cs:42
• Missing reference: GameManager

[Fix Issues] [Override & Commit Anyway]
            └─ "I understand this may break the build"
```

### Test Results Persistence
- Results cached until relevant files change
- Stale results marked with [!] icon
- "Re-run" button always available

---

## 4.39) Memory Pinning Rules

**Principle:** Important context is pinned and protected from rotation; everything else follows FIFO.

### Auto-Pinned Items
| Item Type | Auto-Pin | Reason |
|-----------|----------|--------|
| SA document | Yes | Architecture reference |
| GDD document | Yes | Design reference |
| Active ticket context | Yes | Current work |
| User-starred messages | Yes | Explicit importance |
| Recent handoff packages | Yes (24h) | Cross-persona continuity |

### Pinning Rules
1. Pinned items **never** deleted by rotation
2. Pinned items count toward storage limits
3. User can manually pin/unpin any message
4. Max 100 pinned items per project

### Rotation Algorithm
When storage limit reached:
1. Calculate 10% of unpinned items (oldest first)
2. Generate summary of items to be removed
3. Delete oldest 10% unpinned items
4. Store summary in summary chunks

### Pin UI
```
Message Actions: [[fa-thumbtack] Pin] [[fa-clipboard] Copy] [[fa-trash] Delete]

Pinned indicator:
┌──────────────────────────────────────────────┐
│ [fa-thumbtack] [User] How does the inventory work? │
│    [Nova] The inventory system uses... │
└────────────────────────────────────────┘
```

### Unpin Warning
```
[!] Unpin this message?

Unpinned messages may be deleted during
memory rotation to free up space.

[Unpin] [Cancel]
```

---

## 4.40) Telemetry & Logging Policy

**Principle:** All telemetry is local-only. No code content logged unless explicit verbose debug mode.

### Log Levels
| Level | What's Logged | Retention |
|-------|---------------|-----------|
| Error | Crashes, failures, blocked operations | 30 days |
| Warn | Degraded performance, fallbacks used | 14 days |
| Info | Feature usage, mode switches, handoffs | 7 days |
| Debug | Detailed execution traces | Session only |
| Verbose | Code snippets, full payloads | Never persisted |

### What Is NEVER Logged
- API keys or credentials
- Full file contents (unless verbose debug)
- User chat messages (stored separately in encrypted chat history)
- Personal identifiable information

### What IS Logged (Info level)
- Feature activation (e.g., "Planning mode started")
- Persona switches (e.g., "Handoff Nova → Gears")
- Test runs and results (pass/fail counts, not details)
- Error types (not full stack traces unless Error level)

### Log Storage
```
~/.spacecode/logs/
├── spacecode-2026-02-01.log
├── spacecode-2026-02-02.log
└── ...
```

### Log Viewer (Dashboard → Settings → Logs)
```
┌──────────────────────────────────────────────────────────────┐
│  LOGS                                            [Export]    │
│  ════                                                        │
│                                                              │
│  Filter: [All ▼] [Error ▼] [Today ▼]      [fa-search] Search │
│                                                              │
│  14:32:05 INFO  Planning mode started                        │
│  14:32:12 INFO  Phase 1 (Study) complete                     │
│  14:33:01 WARN  Token limit approaching (85%)                │
│  14:33:45 INFO  Handoff: Nova → Gears                        │
│  14:34:02 ERROR MCP connection failed: timeout               │
│                                                              │
│  [Clear Logs] [Open Log Folder]                              │
└──────────────────────────────────────────────────────────────┘
```

### Debug Mode Toggle
```
Dashboard → Settings → Developer

☐ Verbose logging (includes code snippets)
  [!] Warning: May contain sensitive code. Logs are not persisted
  but visible during session. Use only for debugging.
```

---

## 4.41) Mission Panel UI (Dashboard → Mission)

**Purpose:** Central project management hub showing planning status, milestones, approvals, and progress.

### Mission Panel Layout
```
┌──────────────────────────────────────────────────────────────────────────────┐
│  MISSION CONTROL                                               [fa-gear]     │
│  ═══════════════                                                             │
│                                                                              │
│  PROJECT: Space Dungeon    Status: ● Active    Complexity: Complex          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  CURRENT PHASE                                                          │ │
│  │  ──────────────                                                         │ │
│  │  [fa-clipboard] Planning: "Inventory System"                                        │ │
│  │                                                                         │ │
│  │  [1 Study ✓] [2 Connect ✓] [3 Plan ◐] [4 Review ○]                     │ │
│  │                                                                         │ │
│  │  Lead: Nova + Gears    Started: 2h ago    Est. remaining: 30min         │ │
│  │                                                                         │ │
│  │  [View Plan] [Skip to Review] [Cancel Planning]                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────┬──────────────────────────────────────────┐ │
│  │  PENDING APPROVALS (3)       │  RECENT ACTIVITY                         │ │
│  │  ─────────────────────       │  ───────────────                         │ │
│  │                              │                                          │ │
│  │  [!] Refactor plan: Player    │  14:32 Nova completed inventory design   │ │
│  │     [Approve] [Reject]       │  14:28 Gears ran security scan (2 warns) │ │
│  │                              │  14:15 Index updated SA document         │ │
│  │  [!] Schema migration         │  14:02 Vault created players table       │ │
│  │     [Approve] [Reject]       │  13:45 Planning started: Inventory       │ │
│  │                              │                                          │ │
│  │  [!] Push to main branch      │  [View All Activity]                     │ │
│  │     [Approve] [Reject]       │                                          │ │
│  │                              │                                          │ │
│  └──────────────────────────────┴──────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  MILESTONES                                                             │ │
│  │  ──────────                                                             │ │
│  │                                                                         │ │
│  │  ✓ Core Systems        ████████████████████ 100%   Done                 │ │
│  │  ◐ Player Mechanics    ████████████░░░░░░░░  60%   In Progress          │ │
│  │  ○ Inventory System    ░░░░░░░░░░░░░░░░░░░░   0%   Planning             │ │
│  │  ○ Combat System       ░░░░░░░░░░░░░░░░░░░░   0%   Not Started          │ │
│  │  ○ UI Polish           ░░░░░░░░░░░░░░░░░░░░   0%   Not Started          │ │
│  │                                                                         │ │
│  │  [+ Add Milestone] [Edit Milestones]                                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  IMPLEMENTATION PLANS                                                   │ │
│  │  ────────────────────                                                   │ │
│  │                                                                         │ │
│  │  📄 Inventory System (draft)           Today        [Open] [Delete]     │ │
│  │  📄 Player Movement Refactor           Yesterday    [Open] [Archive]    │ │
│  │  📄 Save System Implementation         3 days ago   [Open] [Archive]    │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Approval Queue Behavior
| Action Source | Requires Approval | Auto-Approve Option |
|---------------|-------------------|---------------------|
| Refactor plan (Gears) | Yes Yes | If <10 files affected |
| Schema migration (Vault) | Yes Yes | Never |
| Git push | Yes Yes | To non-main branches |
| Code deletion >50 lines | Yes Yes | Never |
| New file creation | No No | — |
| Doc updates (Index) | No No | — |

### Milestone Storage
```
.spacecode/mission/
├── milestones.json
├── plans/
│   ├── inventory-system.md
│   └── player-movement.md
└── activity.log
```

---

## 4.42) Docs Panel UI (Dashboard → Docs)

**Purpose:** Document management with Index (Librarian) persona for setup, sync, and maintenance.

### Docs Panel Layout
```
┌──────────────────┬───────────────────────────────────────────────────────────┐
│                  │                                                           │
│   INDEX CHAT     │  DOCUMENTATION                                            │
│   [fa-book]      │  ═════════════                                            │
│                  │                                                           │
│  ┌────────────┐  │  STATUS: [!] 2 docs need attention                        │
│  │            │  │                                                           │
│  │ Chat with  │  │  REQUIRED (Complex Project)                               │
│  │ Index about│  │  ─────────────────────────                                │
│  │ your docs  │  │  Yes GDD.md              Last sync: 2h ago    [Open] [Sync]│
│  │            │  │  [!] SA.md               Drift detected       [Open] [Sync]│
│  │            │  │                                                           │
│  │            │  │  OPTIONAL                                                 │
│  │            │  │  ────────                                                 │
│  │            │  │  Yes TDD.md              Last sync: 1d ago    [Open] [Sync]│
│  │            │  │  — Art Bible           Not created          [Create]     │
│  │            │  │  — UI/UX Spec          Not created          [Create]     │
│  │            │  │  Yes Economy.md          Last sync: 3d ago    [Open] [Sync]│
│  │            │  │                                                           │
│  │            │  │  SYNC STATUS                                              │
│  │            │  │  ───────────                                              │
│  │            │  │  SA.md has 3 sections out of sync with code:              │
│  │            │  │  • Section 5.2: New PlayerStats class not documented      │
│  │            │  │  • Section 5.4: InventoryManager renamed                  │
│  │            │  │  • Section 8.1: Missing Firebase dependency               │
│  │            │  │                                                           │
│  │            │  │  [Sync All] [Review Changes] [Ignore Until Tomorrow]      │
│  │            │  │                                                           │
│  └────────────┘  │  ─────────────────────────────────────────────────────────│
│                  │                                                           │
│  [Start Wizard]  │  WIZARD PROGRESS                                          │
│  [Sync All Docs] │  ───────────────                                          │
│                  │  GDD: 8/10 questions answered                             │
│                  │  SA:  5/7 questions answered                              │
│                  │  [Resume Wizard]                                          │
│                  │                                                           │
└──────────────────┴───────────────────────────────────────────────────────────┘
```

### Doc Sync States
| State | Icon | Meaning |
|-------|------|---------|
| Synced | Yes | Doc matches code |
| Drift | [!] | Code changed, doc outdated |
| Not Created | — | Optional doc not started |
| Error | No | Parse error or missing |

### Drift Detection Rules
- Index scans code on: file save, git commit, manual trigger
- Compares: class names, function signatures, dependencies, folder structure
- SA drift triggers Gears warning

---

## 4.43) Tickets Panel UI (Dashboard → Tickets)

**Purpose:** Ticket management with Triage persona for routing, tracking, and autosolve.

### Tickets Panel Layout
```
┌──────────────────┬───────────────────────────────────────────────────────────┐
│                  │                                                           │
│   TRIAGE CHAT    │  TICKETS                                                  │
│   [fa-ticket]    │  ═══════                                                  │
│                  │                                                           │
│  ┌────────────┐  │  [+ New Ticket]  Filter: [All ▼] [Open ▼] [fa-search]   │
│  │            │  │                                                           │
│  │ Chat with  │  │  ┌─────────────────────────────────────────────────────┐  │
│  │ Triage     │  │  │ [HIGH] #42 Player falls through floor                   │  │
│  │ about      │  │  │    Type: BUG  Routed: Gears  Status: In Progress    │  │
│  │ tickets    │  │  │    Created: 2h ago                                  │  │
│  │            │  │  │    [View] [Autosolve] [Close]                       │  │
│  │            │  │  └─────────────────────────────────────────────────────┘  │
│  │            │  │                                                           │
│  │            │  │  ┌─────────────────────────────────────────────────────┐  │
│  │            │  │  │ [MED] #41 Add inventory sorting                        │  │
│  │            │  │  │    Type: FEATURE  Routed: Nova  Status: Planning    │  │
│  │            │  │  │    Created: 1d ago                                  │  │
│  │            │  │  │    [View] [Autosolve] [Close]                       │  │
│  │            │  │  └─────────────────────────────────────────────────────┘  │
│  │            │  │                                                           │
│  │            │  │  ┌─────────────────────────────────────────────────────┐  │
│  │            │  │  │ [LOW] #40 Update SA with new modules                   │  │
│  │            │  │  │    Type: DOC_UPDATE  Routed: Index  Status: Done    │  │
│  │            │  │  │    Created: 2d ago  Completed: 1d ago               │  │
│  │            │  │  │    [View] [Reopen]                                  │  │
│  │            │  │  └─────────────────────────────────────────────────────┘  │
│  │            │  │                                                           │
│  └────────────┘  │  ─────────────────────────────────────────────────────────│
│                  │                                                           │
│  QUICK ACTIONS   │  TICKET STATS                                             │
│  ─────────────   │  ────────────                                             │
│  [Create Bug]    │  Open: 5   In Progress: 2   Done (week): 12              │
│  [Create Feature]│                                                           │
│  [Import GitHub] │  By Persona:  Nova: 3  Gears: 4  Index: 2  Vault: 1      │
│                  │                                                           │
└──────────────────┴───────────────────────────────────────────────────────────┘
```

### Ticket Schema
```typescript
interface Ticket {
  id: number;
  title: string;
  description: string;
  type: 'BUG' | 'FEATURE' | 'REFACTOR' | 'DOC_UPDATE' | 'SECURITY' | 'DATABASE' | 'ART';
  status: 'open' | 'in_progress' | 'blocked' | 'done' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  routedTo: 'nova' | 'gears' | 'index' | 'vault' | 'palette' | null;
  createdAt: string;
  updatedAt: string;
  linkedFiles: string[];
  linkedPlanId?: string;
  githubIssueId?: string;
}
```

### Autosolve Flow
1. User clicks [Autosolve]
2. Triage analyzes ticket, routes to appropriate persona
3. Persona works in background
4. Notification on completion: "Yes Ticket #42 solved by Gears"
5. User reviews: [Accept] [Request Changes] [Reject]

---

## 4.44) +Chat Feature Spec

**Purpose:** Allow multiple parallel chat threads with Nova (Creator) for exploring different approaches.

### +Chat UI
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CHAT                                                           [+Chat ▼]   │
│  ════                                                                       │
│                                                                             │
│  Tabs: [Main ✕] [Inventory Ideas ✕] [Alt Approach ✕] [+]                   │
│  ───────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  (Active chat content here)                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### +Chat Rules
| Rule | Description |
|------|-------------|
| Max tabs | 5 concurrent chats |
| Naming | Auto-named from first message, user can rename |
| Persistence | All tabs persist across sessions |
| Memory | Each tab has separate thread, shared project embeddings |
| Merge | User can merge insights: [Merge to Main] |
| Close | Closing tab archives (recoverable for 7 days) |

### +Chat Availability
| Persona | +Chat Available |
|---------|-----------------|
| Nova | Yes Yes |
| Gears | No No (single-thread) |
| Index | No No |
| Vault | No No |
| Palette | No No |
| Triage | No No |

### Right Panel: +Chat View
When +Chat mode selected in right panel:
```
┌─────────────────────────────────────┐
│  PARALLEL CHATS                     │
│  ═══════════════                    │
│                                     │
│  Compare threads side-by-side:      │
│                                     │
│  ☑ Main                             │
│  ☑ Inventory Ideas                  │
│  ☐ Alt Approach                     │
│                                     │
│  [Compare Selected]                 │
│                                     │
│  ───────────────────────────────────│
│  INSIGHTS                           │
│                                     │
│  Thread "Inventory Ideas" suggests: │
│  • Use ScriptableObjects for items  │
│  • Event-driven UI updates          │
│                                     │
│  Thread "Alt Approach" suggests:    │
│  • ECS-based inventory              │
│  • Data-oriented design             │
│                                     │
│  [Merge Insights to Main]           │
└─────────────────────────────────────┘
```

---

## 4.45) Opinion/Consult Mode Flow

**Purpose:** Get GPT second opinion on Claude's suggestions (or vice versa).

### Consult Mode Trigger
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Nova (Claude):                                                             │
│  I recommend using the Observer pattern for the event system because...     │
│                                                                             │
│  [[fa-thumbs-up]] [[fa-thumbs-down]] [[fa-clipboard] Copy] [[fa-comment] Get Opinion]  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Opinion Panel (Right Panel → Opinion)
```
┌─────────────────────────────────────┐
│  SECOND OPINION                     │
│  ══════════════                     │
│                                     │
│  Consulting: GPT-4o                 │
│  About: Observer pattern suggestion │
│                                     │
│  ───────────────────────────────────│
│                                     │
│  GPT Analysis:                      │
│                                     │
│  Yes Agrees: Observer pattern is     │
│     appropriate for event systems   │
│                                     │
│  [!] Suggests: Consider using        │
│     UniRx for Unity-specific        │
│     reactive extensions             │
│                                     │
│  ❓ Questions: What's the expected  │
│     number of listeners? >100 may   │
│     need optimization               │
│                                     │
│  ───────────────────────────────────│
│  [Apply Suggestion] [Ignore] [Ask]  │
│                                     │
│  Provider: ○ GPT-4o  ○ Claude       │
│  (switches who gives opinion)       │
└─────────────────────────────────────┘
```

### Consult Mode Rules
| Rule | Description |
|------|-------------|
| Trigger | User clicks [Get Opinion] on any assistant message |
| Context | Sends last 5 messages + current suggestion |
| Provider | Opposite of current (Claude→GPT, GPT→Claude) |
| Cost | Counts as separate API call |
| Availability | Nova only (not available in Station/other personas) |

---

## 4.46) Maintenance Tab Spec (Station → Control → Maintenance)

**Purpose:** Actionable cleanup and refactor suggestions for code health.

### Maintenance Tab UI
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Diagnostics] [Tests] [Security] [Code Quality] [Maintenance]              │
│  ═══════════════════════════════════════════════════════════════════════════│
│                                                                             │
│  MAINTENANCE ACTIONS                                              [Scan]    │
│  ───────────────────                                                        │
│                                                                             │
│  CLEANUP QUEUE (7 items)                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [fa-trash] Remove unused imports (23 files)       [Fix All] [Ignore]    ││
│  │ [fa-trash] Delete commented-out code (8 blocks)   [Review]  [Ignore]    ││
│  │ [fa-trash] Remove empty methods (4 stubs)         [Fix All] [Ignore]    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  REFACTOR SUGGESTIONS (3 items)                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [fa-wrench] Extract duplicate code in PlayerController [Create Plan] [Ignore]││
│  │    Lines 45-67 and 120-142 are 85% similar                                  ││
│  │                                                                              ││
│  │ [fa-wrench] Split God class: GameManager (847 lines)   [Create Plan] [Ignore]││
│  │    Suggest: GameManager, AudioManager, SceneLoader                          ││
│  │                                                                              ││
│  │ [fa-wrench] Reduce coupling: InventoryUI → 12 deps     [Create Plan] [Ignore]│
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  OPTIMIZATION OPPORTUNITIES                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [fa-bolt] Cache GetComponent calls in EnemyAI.Update()  [Fix] [Show Code]     ││
│  │ [fa-bolt] Replace Find() with cached reference (3 calls) [Fix All] [Show Code] ││
│  │ [fa-bolt] Object pooling candidate: BulletSpawner       [Create Plan] [Ignore]││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────────│
│  Last scan: 10 min ago    [Run Full Scan]    [Schedule Daily Scan]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Maintenance Action Types
| Category | Action | Auto-Fix | Needs Plan |
|----------|--------|----------|------------|
| Cleanup | Remove unused imports | Yes Yes | No |
| Cleanup | Delete commented code | [!] Review first | No |
| Cleanup | Remove empty methods | Yes Yes | No |
| Cleanup | Remove dead code | [!] Review first | No |
| Refactor | Extract duplicate code | No No | Yes Yes |
| Refactor | Split God class | No No | Yes Yes |
| Refactor | Reduce coupling | No No | Yes Yes |
| Optimize | Cache GetComponent | Yes Yes | No |
| Optimize | Replace Find() | Yes Yes | No |
| Optimize | Object pooling | No No | Yes Yes |

---

## 4.47) Error Handling & Recovery

**Purpose:** Define behavior when things go wrong.

### AI Provider Failures
| Error | UI Response | Recovery |
|-------|-------------|----------|
| API timeout (30s) | "⏳ Taking longer than usual..." | Auto-retry once |
| API error (500) | "No Provider error. Retrying..." | Auto-retry 3x with backoff |
| Rate limit (429) | "⏸️ Rate limited. Waiting 60s..." | Show countdown, auto-retry |
| Auth error (401) | "🔑 API key invalid" | Link to Settings |
| Network offline | "📡 No connection" | Queue message, send when online |

### Error UI
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  No Connection Error                                                        │
│                                                                             │
│  Could not reach Claude API. This might be temporary.                       │
│                                                                             │
│  [Retry Now] [Switch to GPT] [Work Offline]                                 │
│                                                                             │
│  Your message has been saved and will be sent when connection restores.     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Offline Mode
When network unavailable:
- Chat input shows "📡 Offline - messages queued"
- Local operations continue (file read, search, git local)
- Queued messages sent on reconnect
- Max queue: 10 messages

### Recovery Actions
| Scenario | Automatic | Manual Option |
|----------|-----------|---------------|
| Provider down | Switch to backup | [Use Other Provider] |
| Corrupted chat | Load from backup | [Restore from Backup] |
| Extension crash | Auto-reload | [Report Bug] |
| Webview blank | Auto-reload once | [Reload Panel] |

---

## 4.48) Settings Inventory

**Purpose:** Complete list of all user-configurable settings.

### Settings Panel (Dashboard → Settings)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SETTINGS                                                                   │
│  ════════                                                                   │
│                                                                             │
│  [General] [AI Providers] [Integrations] [Personas] [Developer]             │
│  ═══════════════════════════════════════════════════════════════════════════│
```

### General Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Project Complexity | simple/complex | complex | Architecture enforcement level |
| Auto-save chat | boolean | true | Save chat on each message |
| Theme | light/dark/system | system | UI color scheme |
| Language | enum | en | Interface language |
| Telemetry | boolean | true | Local usage logging |

### AI Provider Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Claude API Key | secret | — | Anthropic API key |
| Claude Model | enum | claude-sonnet-4-20250514 | Default Claude model |
| GPT API Key | secret | — | OpenAI API key |
| GPT Model | enum | gpt-4o | Default GPT model |
| Primary Provider | claude/gpt | claude | Main AI provider |
| Fallback Provider | claude/gpt/none | gpt | Backup when primary fails |
| Max Tokens | number | 4096 | Response length limit |
| Temperature | 0-1 | 0.7 | Creativity level |

### Integration Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Gemini API Key | secret | — | For image generation |
| Gemini Model | enum | gemini-2.0-flash | Image gen model |
| GitHub Token | secret | — | For issue sync |
| Database Provider | enum | none | Supabase/Firebase/etc |
| Database URL | string | — | Connection string |

### Persona Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Nova Enabled | boolean | true | — |
| Gears Enabled | boolean | true | — |
| Index Enabled | boolean | true | — |
| Vault Enabled | boolean | false | Enable when DB connected |
| Palette Enabled | boolean | false | Enable when Gemini connected |
| Triage Enabled | boolean | true | — |
| Show Persona Status Bar | boolean | true | Bottom status bar |

### Developer Settings
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Show Panel Borders | boolean | false | Debug UI borders |
| Verbose Logging | boolean | false | Include code in logs |
| Log Level | enum | info | error/warn/info/debug |
| Experimental Features | boolean | false | Enable beta features |

### Settings Storage
```
Workspace: .vscode/settings.json → spacecode.*
User: ~/.spacecode/config.json
Secrets: System keychain (API keys)
```

---

## 4.49) Token Budget Display

**Purpose:** Show users their token usage and help manage context limits.

### Token Display in Chat Header
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  NOVA [fa-rocket]                           Tokens: 45,231 / 128,000 (35%) │
│  ════                                       ████████░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Token Budget Panel (expandable)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOKEN USAGE                                                    [Compact]   │
│  ═══════════                                                                │
│                                                                             │
│  Current Context: 45,231 / 128,000 tokens                                   │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  35%      │
│                                                                             │
│  Breakdown:                                                                 │
│  ├─ System prompt:     2,100 tokens   ██░░░░░░░░░░░░░░  2%                 │
│  ├─ Pinned context:    8,500 tokens   ██████░░░░░░░░░░  7%                 │
│  ├─ Chat history:     28,400 tokens   ██████████████░░ 22%                 │
│  ├─ Retrieved docs:    4,200 tokens   ███░░░░░░░░░░░░░  3%                 │
│  └─ Current message:   2,031 tokens   █░░░░░░░░░░░░░░░  2%                 │
│                                                                             │
│  [!] At 80% (102,400): Auto-compaction will summarize older messages        │
│  [!] At 95% (121,600): Warning before sending                                │
│                                                                             │
│  [Compact Now] [Clear History] [Manage Pinned]                              │
│                                                                             │
│  ESTIMATED COST (this session)                                              │
│  ─────────────────────────────                                              │
│  Input:  $0.42  (280K tokens @ $0.15/100K)                                  │
│  Output: $0.18  (24K tokens @ $0.75/100K)                                   │
│  Total:  $0.60                                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Compaction Behavior
| Threshold | Action |
|-----------|--------|
| 80% | Auto-compact: summarize oldest 20% of messages |
| 90% | Warning: "Context nearly full" |
| 95% | Block new messages until compact |
| 100% | Force compact before sending |

### Compaction UI
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [!] Context Compaction Needed                                               │
│                                                                             │
│  Your conversation is 95% of the context limit.                             │
│  SpaceCode will summarize older messages to continue.                       │
│                                                                             │
│  Messages to summarize: 24 (oldest)                                         │
│  Pinned messages: 3 (preserved)                                             │
│  Space freed: ~40,000 tokens                                                │
│                                                                             │
│  [Compact Now] [Review Messages First] [Start New Chat]                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4.50) Notification System

**Purpose:** Alert users to background events, completions, and issues.

### Notification Types
| Type | Trigger | Display | Sound |
|------|---------|---------|-------|
| Autosolve complete | Background task done | Toast + badge | Optional chime |
| Approval needed | Pending action | Badge on Mission | None |
| Error | Provider/system failure | Toast (sticky) | None |
| Sync drift | Docs out of sync | Badge on Docs | None |
| Test failure | Diagnostics failed | Toast + badge | None |
| Handoff received | Another persona sent context | Toast | Optional |

### Toast UI
```
┌────────────────────────────────────────┐
│  Yes Autosolve Complete                 │
│                                        │
│  Gears fixed ticket #42:               │
│  "Player falls through floor"          │
│                                        │
│  [View Changes] [Dismiss]        3s    │
└────────────────────────────────────────┘
```

### Badge Display
```
Tabs: [Chat] [Station] [Agents] [Skills] [Dashboard [HIGH]3]
                                              └─ 3 pending items
```

### Notification Settings
| Setting | Type | Default |
|---------|------|---------|
| Show toasts | boolean | true |
| Toast duration | 3/5/10s | 5s |
| Play sounds | boolean | false |
| Badge on tabs | boolean | true |
| Desktop notifications | boolean | false |

---

## 4.51) First-Run Wizard

**Purpose:** Onboard new users with project setup and configuration.

### First-Run Flow
```
Step 1: Welcome
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    [fa-rocket] Welcome to SpaceCode                         │
│                                                                             │
│           AI-Powered Game Development for Unity                             │
│                                                                             │
│                          [Get Started]                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Step 2: API Keys
┌─────────────────────────────────────────────────────────────────────────────┐
│  SETUP: AI Providers                                          Step 2 of 5  │
│                                                                             │
│  SpaceCode needs at least one AI provider to work.                          │
│                                                                             │
│  Claude API Key (Recommended):                                              │
│  ┌─────────────────────────────────────────────────────┐                   │
│  │ sk-ant-...                                          │ [Test]            │
│  └─────────────────────────────────────────────────────┘                   │
│  Get key: https://console.anthropic.com                                     │
│                                                                             │
│  OpenAI API Key (Optional, for second opinion):                             │
│  ┌─────────────────────────────────────────────────────┐                   │
│  │                                                     │ [Test]            │
│  └─────────────────────────────────────────────────────┘                   │
│                                                                             │
│                                    [Skip for Now] [Next →]                  │
└─────────────────────────────────────────────────────────────────────────────┘

Step 3: Project Type
┌─────────────────────────────────────────────────────────────────────────────┐
│  SETUP: Project Type                                          Step 3 of 5  │
│                                                                             │
│  How would you classify this project?                                       │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ○ Simple                                                           │   │
│  │    Solo/prototype. Quick iteration, no architecture enforcement.    │   │
│  │    Best for: Game jams, learning, small projects                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ● Complex (Recommended)                                            │   │
│  │    Team/production. Requires documentation and architecture.        │   │
│  │    Best for: Professional games, team projects, large codebases     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                          [← Back] [Next →]                  │
└─────────────────────────────────────────────────────────────────────────────┘

Step 4: Documentation (Complex only)
┌─────────────────────────────────────────────────────────────────────────────┐
│  SETUP: Documentation                                         Step 4 of 5  │
│                                                                             │
│  Complex projects require GDD and SA documents.                             │
│  We'll help you create them with a quick questionnaire.                     │
│                                                                             │
│  Do you have existing documentation?                                        │
│                                                                             │
│  ○ No, start fresh (recommended)                                            │
│    → We'll guide you through creating GDD + SA                              │
│                                                                             │
│  ○ Yes, import existing docs                                                │
│    → Point us to your existing GDD and SA files                             │
│                                                                             │
│  ○ Skip for now                                                             │
│    → You can set up docs later, but some features will be limited           │
│                                                                             │
│                                          [← Back] [Next →]                  │
└─────────────────────────────────────────────────────────────────────────────┘

Step 5: Complete
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        Yes Setup Complete!                                   │
│                                                                             │
│  SpaceCode is ready. Here's what's next:                                    │
│                                                                             │
│  • Chat with Nova [fa-rocket] to start building features                    │
│  • Visit Dashboard → Docs to complete your GDD                              │
│  • Explore Station to understand your architecture                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  [fa-lightbulb] Tip: Say "help me plan [feature]" to Nova to start planning     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                          [Open Chat with Nova]                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4.52) Keyboard Shortcuts

**Purpose:** Power user efficiency with keyboard navigation.

### Global Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + Shift + P` | Open SpaceCode command palette |
| `Cmd/Ctrl + Shift + C` | Focus chat input |
| `Cmd/Ctrl + Shift + S` | Switch to Station tab |
| `Cmd/Ctrl + Enter` | Send message |
| `Escape` | Stop AI generation |
| `Cmd/Ctrl + K` | Clear chat (with confirmation) |

### Chat Shortcuts
| Shortcut | Action |
|----------|--------|
| `Up Arrow` | Edit last message (when input empty) |
| `Cmd/Ctrl + /` | Toggle code block in input |
| `Cmd/Ctrl + Shift + O` | Get opinion on last message |
| `Cmd/Ctrl + Shift + N` | New +Chat tab |
| `Cmd/Ctrl + W` | Close current +Chat tab |

### Station Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + 1-5` | Switch control tab (1=Diag, 2=Tests, etc.) |
| `Cmd/Ctrl + R` | Run selected tests |
| `Cmd/Ctrl + Shift + R` | Run all tests |
| `L` | Toggle Learn/Maintenance mode |

### Navigation Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + 1` | Chat tab |
| `Cmd/Ctrl + 2` | Station tab |
| `Cmd/Ctrl + 3` | Agents tab |
| `Cmd/Ctrl + 4` | Skills tab |
| `Cmd/Ctrl + 5` | Dashboard tab |

---

## 4.53) Nova Execution Mode — Full Specification

### 1) Purpose

**Execution Mode** is a deterministic, plan-driven state where Nova executes an already-approved plan using parallel sub-agents. It focuses on **delivery, not discussion**.

Key characteristics:
- Autonomous execution without user interruption
- Parallel sub-agent orchestration
- Visible progress and traceability
- Graceful handling of conflicts and uncertainties

---

### 2) Core Principles

| Principle | Description |
|-----------|-------------|
| **No-Pause Rule** | Once started, execution never stops to ask user questions |
| **Manual Stop Only** | Execution stops only on: success or user stop (no auto-stop) |
| **Visible Parallelism** | All sub-agents are visible and traceable in real-time |
| **Deterministic Output** | Results are merged and validated consistently |
| **Deferred Decisions** | Any uncertainty is deferred to a post-execution queue |

---

### 3) Entry Conditions

Execution Mode can start **only when**:

1. A plan exists and is in **Approved** state
2. Workspace state is stable (snapshot taken or clean git state)
3. User explicitly confirms: "Start Execution Mode"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PLANNING COMPLETE                                                          │
│  ══════════════════                                                         │
│                                                                             │
│  Plan: "Inventory System Implementation"                                    │
│  Status: [fa-check] Approved                                                │
│  Work Units: 12                                                             │
│  Estimated Time: ~15 min                                                    │
│                                                                             │
│  [fa-play] Start Execution    [fa-pencil] Edit Plan    [fa-times] Cancel    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4) Exit Conditions

Execution Mode ends **only** when:

1. **Success**: All work units finish successfully (including deferred items logged)
2. **Manual Stop**: User clicks Stop or sends a new message

**No auto-stop.** Infrastructure issues (file system unavailable, API auth revoked, disk full) do NOT stop execution. Instead:
- Affected work units enter **Stalled** state
- Stalled items are added to the Deferred Decisions Queue
- Execution continues with remaining work units
- Final summary shows stalled items for user resolution

---

### 5) Execution Workflow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   1. PARSE  │───►│  2. GRAPH   │───►│  3. ASSIGN  │───►│  4. EXECUTE │
│   Plan      │    │  Dependencies│   │  Sub-agents │    │  Parallel   │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │
│ 7. COMPLETE │◄───│  6. VALIDATE│◄───│   5. MERGE  │◄──────────┘
│   Summary   │    │  Tests/Checks│   │   Outputs   │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Detailed Steps:**

| Step | Name | Description |
|------|------|-------------|
| 1 | Plan Parsing | Approved plan is split into discrete Work Units |
| 2 | Dependency Graph | Units are mapped to dependencies to determine parallelism |
| 3 | Parallel Assignment | Eligible units are assigned to sub-agents |
| 4 | Execution | Sub-agents generate patches + summaries |
| 5 | Merge | Orchestrator merges outputs, resolves conflicts |
| 6 | Validation | Tests/checks run if defined in plan |
| 7 | Completion | Full summary + deferred queue shown to user |

---

### 6) No-Pause Rule (Critical)

**During execution, Nova NEVER pauses to ask user questions.**

Any ambiguity must be resolved by:

| Situation | Resolution |
|-----------|------------|
| Missing information | Use safe default (if defined) |
| Multiple valid options | Pick first/simplest option |
| Requires user input | Defer to Post-Execution Decision Queue |
| Potential destructive action | Skip and defer with warning |

**Execution stops only on: success or user manual stop. No auto-stop—infrastructure issues (file system, API auth) enter Stalled state and are deferred. Task failures are also deferred, not stopped.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [!] EXECUTION IN PROGRESS                                                  │
│                                                                             │
│  Nova is executing your plan autonomously.                                  │
│  Questions and decisions are deferred until completion.                     │
│                                                                             │
│  To interrupt: Click [Stop] or type a message                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 7) Progress Feedback (Mandatory UI)

Execution Mode **must** show real-time progress:

#### A) Global Progress Bar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXECUTION PROGRESS                                           [fa-stop] Stop │
│  ══════════════════                                                          │
│                                                                              │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  42%          │
│                                                                              │
│  Phase: Executing    Work Units: 5 / 12 completed    ETA: ~8 min            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### B) Task Timeline

Each work unit shows its state:

| State | Icon | Description |
|-------|------|-------------|
| Pending | `○` | Not yet started |
| Running | `◐` | Currently executing |
| Done | `●` | Completed successfully |
| Failed | `✗` | Failed (see error) |
| Deferred | `◇` | Needs user decision |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TASK TIMELINE                                                              │
│  ─────────────                                                              │
│                                                                             │
│  ● 1. Create InventoryItem.cs              Done (2.3s)                      │
│  ● 2. Create InventoryManager.cs           Done (4.1s)                      │
│  ● 3. Create InventorySlot.cs              Done (1.8s)                      │
│  ● 4. Add ItemDatabase ScriptableObject    Done (3.2s)                      │
│  ◐ 5. Create InventoryUI.cs                Running...                       │
│  ◐ 6. Add drag-drop handlers               Running...                       │
│  ○ 7. Connect to PlayerController          Pending                          │
│  ○ 8. Add save/load serialization          Pending                          │
│  ○ 9. Create unit tests                    Pending                          │
│  ◇ 10. Update SA documentation             Deferred (needs review)          │
│  ○ 11. Integration test                    Pending                          │
│  ○ 12. Final validation                    Pending                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 8) Sub-Agent Visibility

All sub-agents **must be visible** even if user doesn't intervene.

#### Required View 1: Execution Dashboard Panel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXECUTION DASHBOARD                                                        │
│  ═══════════════════                                                        │
│                                                                             │
│  PROGRESS                                                                   │
│  ████████████████████░░░░░░░░░░░░░░  42%   5/12 units   ETA: ~8 min        │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  ACTIVE SUB-AGENTS (3)                                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ [fa-code] Code-Agent-1         ◐ Running                              │  │
│  │    Task: Create InventoryUI.cs                                        │  │
│  │    Files: Assets/Scripts/UI/InventoryUI.cs                            │  │
│  │    [Expand Logs]                                                      │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ [fa-code] Code-Agent-2         ◐ Running                              │  │
│  │    Task: Add drag-drop handlers                                       │  │
│  │    Files: Assets/Scripts/UI/DragDropHandler.cs                        │  │
│  │    [Expand Logs]                                                      │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ [fa-file-alt] Doc-Agent-1      ○ Pending                              │  │
│  │    Task: Update SA documentation                                      │  │
│  │    Waiting for: Code-Agent-1, Code-Agent-2                            │  │
│  │    [View Dependencies]                                                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  SUMMARY                                                                    │
│  ● Completed: 5    ◐ Running: 2    ○ Pending: 4    ✗ Failed: 0    ◇ Deferred: 1│
│                                                                             │
│  [fa-stop] Stop Execution                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Required View 2: Main Chat Inline Summaries

Each sub-agent posts a **collapsed summary card** into the main chat:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Sub-Agent: Code-Agent-1] ● Done                                           │
│  ─────────────────────────────────                                          │
│  Task: Create InventoryUI.cs                                                │
│  Files: Assets/Scripts/UI/InventoryUI.cs (+142 lines)                       │
│  Summary: Created inventory grid UI with 24 slots, tooltip support          │
│                                                                             │
│  [fa-chevron-down] Expand Details    [fa-code] View Diff                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Expanded view shows:**
- Full file diff
- Rationale for decisions made
- Any warnings or notes
- Link to related work units

---

### 9) Parallelism Rules

#### Safe to Parallelize

| Scenario | Example |
|----------|---------|
| Different files | `PlayerController.cs` + `EnemyAI.cs` |
| Different modules | UI system + Save system |
| UI vs backend tasks | Create UI component + Create data model |
| Docs vs code | Update SA + Write unit tests |

#### Unsafe to Parallelize (Sequential Required)

| Scenario | Reason |
|----------|--------|
| Multiple edits to same file | Merge conflicts |
| Core API refactors | Downstream dependencies |
| Shared schema/model changes | Type consistency |
| Database migrations | Order-dependent |

#### File Locking

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FILE LOCKS (Active)                                                        │
│  ───────────────────                                                        │
│                                                                             │
│  [fa-lock] InventoryUI.cs          Locked by: Code-Agent-1                  │
│  [fa-lock] DragDropHandler.cs      Locked by: Code-Agent-2                  │
│  [fa-lock-open] PlayerController.cs  Available                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- Each work unit locks files it touches
- Conflicting tasks are queued until lock released
- Deadlock detection with automatic resolution

---

### 10) Sub-Agent Output Contract

Each sub-agent **must return**:

```typescript
interface SubAgentOutput {
  workUnitId: string;
  status: 'done' | 'failed' | 'deferred';

  // Changes
  patch: string;           // Unified diff format
  filesModified: string[];
  filesCreated: string[];
  filesDeleted: string[];

  // Metadata
  rationale: string;       // Why these changes were made
  riskEstimate: 'low' | 'medium' | 'high';
  executionTime: number;   // milliseconds

  // Issues
  warnings: string[];
  todos: string[];         // Unresolved points
  deferredDecisions: DeferredDecision[];

  // For failures
  error?: string;
  recoveryHint?: string;
}

interface DeferredDecision {
  id: string;
  type: 'approval' | 'choice' | 'confirmation';
  question: string;
  options?: string[];
  context: string;
  defaultChoice?: string;
}
```

---

### 11) Conflict Handling

When merge conflicts occur:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [!] MERGE CONFLICT DETECTED                                                │
│  ═══════════════════════════                                                │
│                                                                             │
│  File: Assets/Scripts/Player/PlayerController.cs                            │
│  Conflict between: Code-Agent-1 and Code-Agent-2                            │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  <<<<<<< Code-Agent-1                                                       │
│  private void HandleInput() {                                               │
│      if (Input.GetKeyDown(KeyCode.I)) OpenInventory();                      │
│  }                                                                          │
│  =======                                                                    │
│  private void HandleInput() {                                               │
│      if (Input.GetKeyDown(KeyCode.Tab)) OpenInventory();                    │
│  }                                                                          │
│  >>>>>>> Code-Agent-2                                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Resolution: Deferred to post-execution review                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Conflict Resolution Strategy:**

| Step | Action |
|------|--------|
| 1 | Attempt auto-merge (non-overlapping changes) |
| 2 | If semantic conflict → queue for manual review |
| 3 | Show conflict in Execution Summary |
| 4 | Continue with remaining work units |

---

### 12) Deferred Decisions Queue

For any decision requiring human choice:

1. Task continues with **safe default** or **no-op**
2. Decision is added to queue
3. Queue appears after completion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DEFERRED DECISIONS (3)                                                     │
│  ══════════════════════                                                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Rename confirmation                                                │  │
│  │    "Rename ItemSlot → InventorySlot across 5 files?"                  │  │
│  │    Context: Found inconsistent naming during refactor                 │  │
│  │    Default: Kept original (ItemSlot)                                  │  │
│  │                                                                       │  │
│  │    [Approve Rename] [Keep Original] [View Files]                      │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ 2. Overwrite confirmation                                             │  │
│  │    "Overwrite existing InventoryUI.cs?"                               │  │
│  │    Context: File already exists with different implementation         │  │
│  │    Default: Created InventoryUI_new.cs instead                        │  │
│  │                                                                       │  │
│  │    [Overwrite] [Keep Both] [View Diff]                                │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │ 3. Merge conflict                                                     │  │
│  │    "Resolve conflict in PlayerController.cs"                          │  │
│  │    Context: Two agents modified same method                           │  │
│  │    Default: Neither change applied                                    │  │
│  │                                                                       │  │
│  │    [Use Agent-1] [Use Agent-2] [Manual Merge]                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  [Apply All Defaults] [Review Each]                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 13) Interrupt Behavior

**Stop button is always available** during execution.

#### If user types during execution:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [!] EXECUTION INTERRUPTED                                                  │
│                                                                             │
│  Execution was stopped because you sent a new message.                      │
│                                                                             │
│  Completed: 7/12 work units                                                 │
│  In Progress: 2 (cancelled)                                                 │
│  Pending: 3 (not started)                                                   │
│                                                                             │
│  Your message: "Wait, I need to change the inventory size"                  │
│                                                                             │
│  [Restart Execution] [View Partial Results] [Discard & Start Over]          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Interrupt flow:**

| Step | Action |
|------|--------|
| 1 | User types → Send button appears |
| 2 | User sends → Execution force-stops |
| 3 | In-progress work units are rolled back |
| 4 | Nova replies: "Execution interrupted. New instruction received." |
| 5 | Nova processes the new message |

**Note:** True mid-stream interrupt not supported by AI APIs, so stop+restart pattern is used.

---

### 14) Completion Summary (Mandatory)

At completion, Nova shows a comprehensive summary:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXECUTION COMPLETE                                                         │
│  ══════════════════                                                         │
│                                                                             │
│  Plan: "Inventory System Implementation"                                    │
│  Duration: 12 min 34 sec                                                    │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  RESULTS                                                                    │
│                                                                             │
│  ● COMPLETED (10)                                                           │
│    ├─ Create InventoryItem.cs                                               │
│    ├─ Create InventoryManager.cs                                            │
│    ├─ Create InventorySlot.cs                                               │
│    ├─ Add ItemDatabase ScriptableObject                                     │
│    ├─ Create InventoryUI.cs                                                 │
│    ├─ Add drag-drop handlers                                                │
│    ├─ Connect to PlayerController                                           │
│    ├─ Add save/load serialization                                           │
│    ├─ Create unit tests (8 tests, all passing)                              │
│    └─ Final validation                                                      │
│                                                                             │
│  ◇ DEFERRED DECISIONS (2)                                                   │
│    ├─ Rename ItemSlot → InventorySlot? [Review]                             │
│    └─ Resolve conflict in PlayerController.cs [Review]                      │
│                                                                             │
│  ✗ FAILED (0)                                                               │
│    None                                                                     │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  TESTS RUN                                                                  │
│  ● 8 passed    ○ 0 failed    ○ 0 skipped                                   │
│                                                                             │
│  FILES CHANGED                                                              │
│  +12 created    ~3 modified    -0 deleted    Total: +847 lines              │
│                                                                             │
│  ───────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  [fa-check] Apply Changes    [fa-code] View Diff    [fa-undo] Rollback      │
│                                                                             │
│  [fa-arrow-right] Send to Gears    [fa-arrow-right] Send to Index           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15) Execution Dashboard Layout (Complete)

**Full panel specification:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXECUTION MODE                                              [fa-stop] STOP │
│  ══════════════                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  PROGRESS                                                               ││
│  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  58%          ││
│  │  Phase: Executing    7/12 units    ETA: ~5 min                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌──────────────────────────────────┬──────────────────────────────────────┐│
│  │  WORK UNITS                      │  ACTIVE AGENTS                       ││
│  │  ───────────                     │  ─────────────                       ││
│  │  ● 1. InventoryItem.cs     2.3s  │  [fa-code] Agent-1                   ││
│  │  ● 2. InventoryManager.cs  4.1s  │     ◐ InventoryUI.cs                 ││
│  │  ● 3. InventorySlot.cs     1.8s  │     Lines: 45-89                     ││
│  │  ● 4. ItemDatabase.asset   3.2s  │                                      ││
│  │  ● 5. InventoryUI.cs       5.7s  │  [fa-code] Agent-2                   ││
│  │  ● 6. DragDropHandler.cs   3.1s  │     ◐ SaveLoadSystem.cs              ││
│  │  ◐ 7. PlayerController.cs  ...   │     Lines: 12-34                     ││
│  │  ○ 8. SaveLoadSystem.cs          │                                      ││
│  │  ○ 9. Unit tests                 │  [fa-file-alt] Agent-3               ││
│  │  ◇ 10. Update SA docs            │     ○ Waiting for deps               ││
│  │  ○ 11. Integration test          │                                      ││
│  │  ○ 12. Final validation          │                                      ││
│  └──────────────────────────────────┴──────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  SUMMARY    ● Done: 6   ◐ Running: 2   ○ Pending: 3   ◇ Deferred: 1    ││
│  │             ✗ Failed: 0                                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 16) Risk & Safety Constraints

| Constraint | Rule |
|------------|------|
| No destructive actions | File deletion requires explicit prior approval in plan |
| No git push | Push never happens during execution; always post-approval |
| No external API calls | Unless explicitly approved in plan |
| Max concurrency | Configurable, default 3, max 5 sub-agents |
| Task timeouts | Each work unit has timeout (default 5 min) |
| Workspace snapshot | Taken before execution for rollback capability |
| Sensitive files | `.env`, credentials never modified without explicit approval |

---

### 17) Configuration Options

```typescript
interface ExecutionModeConfig {
  maxConcurrency: number;        // Default: 3
  taskTimeout: number;           // Default: 300000 (5 min)
  autoApplyOnSuccess: boolean;   // Default: false
  showInlineCards: boolean;      // Default: true
  showDashboard: boolean;        // Default: true
  enableRollback: boolean;       // Default: true
  runTestsAfter: boolean;        // Default: true
}
```

**Settings location:** `Dashboard → Settings → Execution Mode`

---

### 18) Acceptance Criteria

| # | Criterion | Validation |
|---|-----------|------------|
| 1 | Execution runs without pausing for user input | Manual test |
| 2 | Progress visible at all times (bar + units) | UI inspection |
| 3 | Sub-agents visible in dashboard | UI inspection |
| 4 | Inline summary cards appear in chat | UI inspection |
| 5 | Conflicts handled gracefully (deferred) | Test with conflicting edits |
| 6 | Deferred decisions shown at end | Trigger a decision point |
| 7 | Stop button works instantly | Manual test |
| 8 | Rollback works after stop | Manual test |
| 9 | Tests run automatically if configured | Enable in config |
| 10 | Completion summary is comprehensive | Manual review |

---

### 19) Work Unit Schema

```typescript
interface WorkUnit {
  id: string;                    // UUID
  planId: string;                // Parent plan reference
  index: number;                 // Order in plan (1-based)

  // Definition
  title: string;                 // Short description
  description: string;           // Full specification
  type: 'code' | 'test' | 'doc' | 'config' | 'validation';

  // Dependencies
  dependsOn: string[];           // IDs of prerequisite work units
  blocks: string[];              // IDs of work units this blocks

  // Files
  targetFiles: string[];         // Files to create/modify
  relatedFiles: string[];        // Context files to read

  // Execution
  status: 'pending' | 'running' | 'done' | 'failed' | 'deferred';
  assignedAgent?: string;        // Sub-agent ID
  startedAt?: string;            // ISO timestamp
  completedAt?: string;          // ISO timestamp

  // Output
  output?: SubAgentOutput;       // See section 10
}
```

---

### 20) Workstream Allocation

**Add to Workstream A.1 (Planning System):**

| Task | Days |
|------|------|
| Execution Mode orchestrator | 3d |
| Sub-agent coordination | 2d |
| Progress UI (dashboard + inline) | 2d |
| Conflict detection & deferral | 1d |
| Interrupt handling | 1d |
| Completion summary | 1d |

**Additional estimate: 10 days**

---

## 6) Milestone Order (Suggested)

0. Webview panel modularization (Workstream 0)
1. Multi-persona chat system + input behavior (Workstream A)
2. Planning + Execution Mode system (Workstream A.1, see 4.53)
3. Station schematic + control redesign (Workstreams C + D)
4. Security + Code Quality checks (part of D, see 4.9 + 4.10)
5. Docs/Librarian setup (Workstream F)
6. Tickets + Station Engineer (Workstream G)
7. Project DB + Vault persona (Workstream I)
8. **Art Studio + Palette persona (Workstream J)** ← NEW
9. Agents + Skills UI (Workstream E)
10. Dashboard enhancements (Workstream H)
11. Memory/embedding polish (Workstream B)

**Updated Total:** ~173 dev days

| Workstream | Days | Status |
|------------|------|--------|
| 0: Panel.js Modularization | 5 | — |
| A: Chat System | 15 | — |
| A.1: Planning + Execution Mode | 20 | — |
| B: Memory + Embeddings | 8 | — |
| C: Station Schematic | 12 | — |
| D: Control Panel + Tests | 8 | — |
| A.2: Security Checks | 12 | — |
| A.3: Code Quality | 20 | — |
| E: Agents + Skills UI | 10 | — |
| F: Docs/Librarian | 10 | — |
| G: Tickets + Station Engineer | 8 | — |
| H: Dashboard Enhancements | 5 | — |
| I: Project DB + Vault | 15 | — |
| J: Art Studio + Palette | 12 | — |
| K: UX Polish (new) | 13 | — |

### Workstream K: UX Polish (New)
**Goal**: Complete missing UI specs and polish

**Tasks**:
1. Mission Panel implementation (4.41) – 2d
2. +Chat multi-tab system (4.44, Nova-only) – 2d
3. Opinion/Consult mode (4.45) – 1d
4. Error handling & recovery (4.47) – 2d
5. Settings panel complete (4.48) – 1d
6. Token budget display (4.49) – 1d
7. Notification system (4.50) – 2d
8. First-run wizard (4.51) – 1d
9. Keyboard shortcuts (4.52) – 1d

**Estimate:** 13 days

---

## 7) Open Questions for Owner

### Resolved
1. ~~Exact tests to expose in Station control (priority list)~~ → See 4.9, 4.10, Workstream D
2. ~~Definition of "Station Engineer tools" for maintenance mode~~ → See 4.14
3. ~~Confirm scope for ticket AI persona behavior~~ → See 4.20 routing policy
4. ~~For "Simple" projects: show as disabled or hide?~~ → See 4.33 (visible but disabled)
5. ~~Project DB credentials storage~~ → See 4.48 (system keychain)

### Also Resolved
6. ~~Planning mode: Replace Swarm or coexist?~~ → **Nova has a Planning Mode** (nova.planning.md prompt). Swarm removed. Planning is accessed via Chat tab mode toggle.
7. ~~Security scan frequency: On-demand or pre-commit/pre-push?~~ → **Both**: On-demand scans + pre-commit/pre-push hooks configurable in settings.
8. ~~Code Quality blocking: Block commit or advisory?~~ → **Tiered**: P0 Diagnostics (errors, security) block commit; P1-P3 are advisory with warnings.
9. ~~Vault read-only mode for production?~~ → **Multi-environment**: dev/staging/prod with production read-only by default. Users can unlock with confirmation.

---

*End of Implementation V2 plan.*
