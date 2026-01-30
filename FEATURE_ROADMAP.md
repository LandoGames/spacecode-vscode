# SpaceCode Feature Roadmap

**Goal**: Enable a junior dev to take control of a 1M+ line AI-generated RPG codebase.

---

## Feature Sources Legend

| Tag | Meaning | Description |
|-----|---------|-------------|
| 🟢 **EXISTING** | Already in SpaceCode | Built, may need polish or completion |
| 🔵 **TRAYCER** | Inspired by Traycer | Concepts to integrate from Traycer |
| 🟣 **ORIGINAL** | SpaceCode unique | Our innovation, not in Traycer |
| ⚪ **STANDARD** | Common feature | Expected in any dev tool |

---

## Feature Categories

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPACECODE FEATURES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   NAVIGATION          PLANNING           EXECUTION              │
│   "Where am I?"       "What do I do?"    "Do the work"          │
│                                                                 │
│   VERIFICATION        COMPLIANCE         COORDINATION           │
│   "Did it work?"      "Am I allowed?"    "What's the status?"   │
│                                                                 │
│   KNOWLEDGE           INTEGRATION        UX                     │
│   "What do I need     "Connect to        "Make it easy"         │
│    to know?"           everything"                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Source Summary

| Source | Count | % | Description |
|--------|-------|---|-------------|
| 🟢 EXISTING | 12 | 15% | Already built in SpaceCode |
| 🔵 TRAYCER | 18 | 23% | Concepts from Traycer to add |
| 🟣 ORIGINAL | 28 | 35% | SpaceCode unique innovations |
| ⚪ STANDARD | 21 | 27% | Common features any tool needs |
| **Total** | **79** | 100% | |

---

## 1. NAVIGATION (Where Am I?)

Help junior dev understand their position in a massive codebase.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| NAV-1 | **Sector Map UI** | Visual spaceship/station with clickable sectors. Shows current sector highlighted. | P0 | 🟢 EXISTING |
| NAV-2 | **Auto-Sector Detection** | Detect sector from active file path. Update UI automatically. | P0 | 🟣 ORIGINAL |
| NAV-3 | **Sector Boundaries** | Define which folders/namespaces belong to which sector. Config file. | P0 | 🟣 ORIGINAL |
| NAV-4 | **Breadcrumb Trail** | Show: `ARMORY > Combat > DamageCalculator.cs:42` always visible. | P1 | 🟣 ORIGINAL |
| NAV-5 | **Sector Overview** | On sector click, show: key files, recent changes, open issues, health. | P1 | 🟣 ORIGINAL |
| NAV-6 | **Dependency Graph** | Visualize which sectors depend on which. Highlight impact of changes. | P2 | 🟣 ORIGINAL |
| NAV-7 | **Heat Map** | Color sectors by: recent activity, error rate, complexity, test coverage. | P2 | 🟣 ORIGINAL |
| NAV-8 | **Quick Jump** | `Cmd+Shift+S` → fuzzy search sectors and key files within. | P1 | ⚪ STANDARD |

---

## 2. PLANNING (What Do I Do?)

Structured planning before execution - inspired by Traycer, made sector-aware.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| PLN-1 | **Plan Generator** | Input intent → Output structured spec with files, rationale, order. | P0 | 🔵 TRAYCER |
| PLN-2 | **Sector-Aware Plans** | Plans know which sectors are touched. Auto-inject sector rules. | P0 | 🟣 ORIGINAL |
| PLN-3 | **Phase Breakdown** | Break large plans into phases. Each phase = PR-sized chunk. | P1 | 🔵 TRAYCER |
| PLN-4 | **Plan Editor** | Editable plan panel. Add/remove/reorder steps. Markdown + structured. | P1 | 🔵 TRAYCER |
| PLN-5 | **Plan Templates** | Pre-built templates: "Add new system", "Fix bug", "Refactor", "Add UI". | P1 | ⚪ STANDARD |
| PLN-6 | **Impact Preview** | Before executing, show: files affected, sectors touched, dependencies. | P1 | 🟣 ORIGINAL |
| PLN-7 | **Plan Chat** | Refine plan via chat. "What about edge cases?" → Plan updates. | P2 | 🔵 TRAYCER |
| PLN-8 | **Plan History** | Store all plans. Search/reuse old plans. Learn from past work. | P2 | ⚪ STANDARD |
| PLN-9 | **Plan Diff** | Compare two plans. See what changed between versions. | P3 | ⚪ STANDARD |

---

## 3. EXECUTION (Do The Work)

Hand off plans to AI agents and execute.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| EXE-1 | **One-Click Execute** | Plan → "Execute" button → Sends to Claude Code with full context. | P0 | 🔵 TRAYCER |
| EXE-2 | **Context Pre-Injection** | Auto-inject: sector rules, relevant files, doc targets, constraints. | P0 | 🟢 EXISTING |
| EXE-3 | **Step-by-Step Mode** | Execute plan one step at a time. Review between steps. | P1 | 🔵 TRAYCER |
| EXE-4 | **Agent Selection** | Choose: Claude, GPT, MasterMind, or custom agent per step. | P1 | 🟢 EXISTING |
| EXE-5 | **Live Progress** | Show which plan step is executing. Progress bar. Time elapsed. | P1 | ⚪ STANDARD |
| EXE-6 | **Pause/Resume** | Pause execution mid-plan. Resume later with context preserved. | P2 | ⚪ STANDARD |
| EXE-7 | **Parallel Execution** | Execute independent steps in parallel (multiple agents). | P2 | 🔵 TRAYCER |
| EXE-8 | **Dry Run Mode** | "What would this do?" without actually executing. | P2 | 🟣 ORIGINAL |

---

## 4. VERIFICATION (Did It Work?)

Post-execution validation - inspired by Traycer.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| VER-1 | **Diff Scanner** | After execution, scan git diff. List all changes. | P0 | 🔵 TRAYCER |
| VER-2 | **Plan Comparison** | Compare diff to plan. Flag: unexpected files, missing steps. | P0 | 🔵 TRAYCER |
| VER-3 | **Sector Rule Check** | Verify changes follow sector rules. Flag violations. | P1 | 🟣 ORIGINAL |
| VER-4 | **Regression Detection** | Run tests. Compare before/after. Flag new failures. | P1 | 🔵 TRAYCER |
| VER-5 | **AI Review** | AI reviews the diff. Catches bugs, style issues, logic errors. | P1 | 🔵 TRAYCER |
| VER-6 | **Doc Drift Check** | Do docs still match code? Flag stale documentation. | P2 | 🟣 ORIGINAL |
| VER-7 | **Security Scan** | Check for: hardcoded secrets, SQL injection, XSS, etc. | P2 | ⚪ STANDARD |
| VER-8 | **Performance Check** | Flag obvious performance issues (N+1, missing async, etc). | P3 | ⚪ STANDARD |
| VER-9 | **Approval Workflow** | Require human approval before committing verified changes. | P1 | 🔵 TRAYCER |

---

## 5. COMPLIANCE (Am I Allowed?)

Pre-execution gates and rule enforcement.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| CMP-1 | **Doc Gating** | Block execution if doc target not updated. Bypass in Yard mode. | P0 | 🟢 EXISTING |
| CMP-2 | **Sector Rules** | Per-sector rules injected into every prompt. Enforced. | P0 | 🟢 EXISTING |
| CMP-3 | **Approval Gates** | Certain sectors require approval before changes (e.g., CORE). | P1 | 🟣 ORIGINAL |
| CMP-4 | **Dependency Check** | Block if change would break dependent sectors. | P1 | 🟣 ORIGINAL |
| CMP-5 | **Test Requirement** | Block if change touches code without test coverage. | P2 | ⚪ STANDARD |
| CMP-6 | **Review Requirement** | Certain changes require MasterMind review before commit. | P2 | 🟣 ORIGINAL |
| CMP-7 | **Rollback Plan** | Require rollback plan for high-risk changes. | P3 | 🟣 ORIGINAL |
| CMP-8 | **Audit Log** | Log all gate passes/failures. Who bypassed what, when. | P2 | ⚪ STANDARD |

---

## 6. COORDINATION (What's The Status?)

Project management and job tracking - the "Coordinator" system.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| CRD-1 | **Phase Board** | Kanban: Backlog → Planning → Executing → Verifying → Done. | P1 | 🔵 TRAYCER |
| CRD-2 | **Ticket Ingestion** | GitHub Issues → SpaceCode plans. Auto-assign sector. | P1 | 🔵 TRAYCER |
| CRD-3 | **Job Queue** | Queue multiple plans. Execute in order or parallel. | P1 | 🟣 ORIGINAL |
| CRD-4 | **Status Dashboard** | Overview: active jobs, recent completions, failures, blockers. | P1 | ⚪ STANDARD |
| CRD-5 | **Notifications** | Alert on: job complete, verification failed, approval needed. | P2 | ⚪ STANDARD |
| CRD-6 | **Time Tracking** | Track time per plan/sector. Estimate future work. | P3 | ⚪ STANDARD |
| CRD-7 | **Team View** | Multi-user: who's working on what sector. Avoid conflicts. | P3 | ⚪ STANDARD |
| CRD-8 | **Sprint Planning** | Group tickets into sprints. Track velocity by sector. | P3 | ⚪ STANDARD |

---

## 7. KNOWLEDGE (What Do I Need To Know?)

Context management and knowledge injection.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| KNW-1 | **Context Packs** | Per-sector knowledge bundles. Auto-inject on sector entry. | P0 | 🟢 EXISTING |
| KNW-2 | **Context Preview** | Always show: what context is being injected right now. | P0 | 🟢 EXISTING |
| KNW-3 | **Auto-Context Build** | Build context from: active file, diagnostics, selection, sector. | P1 | 🟢 EXISTING |
| KNW-4 | **Doc Targets** | Link sectors to their design docs. Track freshness. | P1 | 🟣 ORIGINAL |
| KNW-5 | **Knowledge Base** | Store URLs, PDFs, notes. Semantic search. | P1 | 🟢 EXISTING |
| KNW-6 | **Code Examples** | Per-sector example snippets. "This is how we do X here." | P2 | 🟣 ORIGINAL |
| KNW-7 | **Pattern Library** | Reusable patterns: "Add ScriptableObject", "Create Manager". | P2 | 🟣 ORIGINAL |
| KNW-8 | **Glossary** | Project-specific terms. Auto-link in chat. | P2 | 🟣 ORIGINAL |
| KNW-9 | **Onboarding Flow** | New dev walkthrough: tour sectors, key concepts, first task. | P3 | 🟣 ORIGINAL |

---

## 8. INTEGRATION (Connect To Everything)

External tool connections.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| INT-1 | **Claude Code CLI** | Execute plans via Claude Code. Session management. | P0 | 🟢 EXISTING |
| INT-2 | **Unity MCP** | Scene/prefab/asset awareness. Console monitoring. | P0 | 🟣 ORIGINAL |
| INT-3 | **Git Integration** | Diff, commit, branch, PR creation from SpaceCode. | P1 | ⚪ STANDARD |
| INT-4 | **GitHub Issues** | Read issues, create issues, link to plans. | P1 | 🔵 TRAYCER |
| INT-5 | **GitHub PRs** | Create PR from verified plan. Auto-fill description. | P1 | ⚪ STANDARD |
| INT-6 | **GPT/OpenAI** | Alternative agent for execution or MasterMind. | P1 | 🟢 EXISTING |
| INT-7 | **Linear/Jira** | Ticket sync for teams using those tools. | P2 | 🔵 TRAYCER |
| INT-8 | **Slack/Discord** | Notifications to team channels. | P3 | ⚪ STANDARD |
| INT-9 | **CI/CD Hooks** | Trigger builds, get results, block on failure. | P2 | ⚪ STANDARD |
| INT-10 | **CodeSensei** | Code analysis, indexing, documentation from Unity editor. | P1 | 🟣 ORIGINAL |

---

## 9. UX (Make It Easy)

User experience for junior devs.

| ID | Feature | Description | Priority | Source |
|----|---------|-------------|----------|--------|
| UX-1 | **Station UI** | Spaceship metaphor. Visual, approachable, memorable. | P0 | 🟢 EXISTING |
| UX-2 | **Single Cockpit** | Everything in one panel. No context switching. | P0 | 🟣 ORIGINAL |
| UX-3 | **Guided Mode** | Step-by-step guidance for common tasks. Wizard-style. | P1 | 🟣 ORIGINAL |
| UX-4 | **Error Recovery** | Clear error messages. "What went wrong, how to fix." | P1 | ⚪ STANDARD |
| UX-5 | **Undo/Rollback** | Undo last execution. Rollback to previous state. | P1 | ⚪ STANDARD |
| UX-6 | **Keyboard Shortcuts** | Power user shortcuts for all actions. Vim-style optional. | P2 | ⚪ STANDARD |
| UX-7 | **Themes** | Light/dark mode. Customizable station colors. | P2 | 🟢 EXISTING |
| UX-8 | **Tooltips Everywhere** | Hover explanations for every button/panel. | P1 | ⚪ STANDARD |
| UX-9 | **Tutorial Mode** | Interactive tutorial for first-time users. | P2 | 🟣 ORIGINAL |
| UX-10 | **Help Command** | `/help <topic>` → contextual help in chat. | P2 | ⚪ STANDARD |

---

## Priority Summary by Source

### P0 - Must Have (MVP)

| ID | Feature | Source |
|----|---------|--------|
| NAV-1 | Sector Map UI | 🟢 EXISTING |
| NAV-2 | Auto-Sector Detection | 🟣 ORIGINAL |
| NAV-3 | Sector Boundaries | 🟣 ORIGINAL |
| PLN-1 | Plan Generator | 🔵 TRAYCER |
| PLN-2 | Sector-Aware Plans | 🟣 ORIGINAL |
| EXE-1 | One-Click Execute | 🔵 TRAYCER |
| EXE-2 | Context Pre-Injection | 🟢 EXISTING |
| VER-1 | Diff Scanner | 🔵 TRAYCER |
| VER-2 | Plan Comparison | 🔵 TRAYCER |
| CMP-1 | Doc Gating | 🟢 EXISTING |
| CMP-2 | Sector Rules | 🟢 EXISTING |
| KNW-1 | Context Packs | 🟢 EXISTING |
| KNW-2 | Context Preview | 🟢 EXISTING |
| INT-1 | Claude Code CLI | 🟢 EXISTING |
| INT-2 | Unity MCP | 🟣 ORIGINAL |
| UX-1 | Station UI | 🟢 EXISTING |
| UX-2 | Single Cockpit | 🟣 ORIGINAL |

**P0 by Source:**
| Source | Count |
|--------|-------|
| 🟢 EXISTING | 8 |
| 🔵 TRAYCER | 4 |
| 🟣 ORIGINAL | 5 |
| ⚪ STANDARD | 0 |

**P0 Count: 17 features**

---

### P1 - Should Have (Release 1.0)

| ID | Feature | Source |
|----|---------|--------|
| NAV-4 | Breadcrumb Trail | 🟣 ORIGINAL |
| NAV-5 | Sector Overview | 🟣 ORIGINAL |
| NAV-8 | Quick Jump | ⚪ STANDARD |
| PLN-3 | Phase Breakdown | 🔵 TRAYCER |
| PLN-4 | Plan Editor | 🔵 TRAYCER |
| PLN-5 | Plan Templates | ⚪ STANDARD |
| PLN-6 | Impact Preview | 🟣 ORIGINAL |
| EXE-3 | Step-by-Step Mode | 🔵 TRAYCER |
| EXE-4 | Agent Selection | 🟢 EXISTING |
| EXE-5 | Live Progress | ⚪ STANDARD |
| VER-3 | Sector Rule Check | 🟣 ORIGINAL |
| VER-4 | Regression Detection | 🔵 TRAYCER |
| VER-5 | AI Review | 🔵 TRAYCER |
| VER-9 | Approval Workflow | 🔵 TRAYCER |
| CMP-3 | Approval Gates | 🟣 ORIGINAL |
| CMP-4 | Dependency Check | 🟣 ORIGINAL |
| CRD-1 | Phase Board | 🔵 TRAYCER |
| CRD-2 | Ticket Ingestion | 🔵 TRAYCER |
| CRD-3 | Job Queue | 🟣 ORIGINAL |
| CRD-4 | Status Dashboard | ⚪ STANDARD |
| KNW-3 | Auto-Context Build | 🟢 EXISTING |
| KNW-4 | Doc Targets | 🟣 ORIGINAL |
| KNW-5 | Knowledge Base | 🟢 EXISTING |
| INT-3 | Git Integration | ⚪ STANDARD |
| INT-4 | GitHub Issues | 🔵 TRAYCER |
| INT-5 | GitHub PRs | ⚪ STANDARD |
| INT-6 | GPT/OpenAI | 🟢 EXISTING |
| INT-10 | CodeSensei | 🟣 ORIGINAL |
| UX-3 | Guided Mode | 🟣 ORIGINAL |
| UX-4 | Error Recovery | ⚪ STANDARD |
| UX-5 | Undo/Rollback | ⚪ STANDARD |
| UX-8 | Tooltips Everywhere | ⚪ STANDARD |

**P1 by Source:**
| Source | Count |
|--------|-------|
| 🟢 EXISTING | 4 |
| 🔵 TRAYCER | 10 |
| 🟣 ORIGINAL | 10 |
| ⚪ STANDARD | 8 |

**P1 Count: 32 features**

---

### P2 - Nice to Have (Release 2.0)

| ID | Feature | Source |
|----|---------|--------|
| NAV-6 | Dependency Graph | 🟣 ORIGINAL |
| NAV-7 | Heat Map | 🟣 ORIGINAL |
| PLN-7 | Plan Chat | 🔵 TRAYCER |
| PLN-8 | Plan History | ⚪ STANDARD |
| EXE-6 | Pause/Resume | ⚪ STANDARD |
| EXE-7 | Parallel Execution | 🔵 TRAYCER |
| EXE-8 | Dry Run Mode | 🟣 ORIGINAL |
| VER-6 | Doc Drift Check | 🟣 ORIGINAL |
| VER-7 | Security Scan | ⚪ STANDARD |
| CMP-5 | Test Requirement | ⚪ STANDARD |
| CMP-6 | Review Requirement | 🟣 ORIGINAL |
| CMP-8 | Audit Log | ⚪ STANDARD |
| CRD-5 | Notifications | ⚪ STANDARD |
| KNW-6 | Code Examples | 🟣 ORIGINAL |
| KNW-7 | Pattern Library | 🟣 ORIGINAL |
| KNW-8 | Glossary | 🟣 ORIGINAL |
| INT-7 | Linear/Jira | 🔵 TRAYCER |
| INT-9 | CI/CD Hooks | ⚪ STANDARD |
| UX-6 | Keyboard Shortcuts | ⚪ STANDARD |
| UX-7 | Themes | 🟢 EXISTING |
| UX-9 | Tutorial Mode | 🟣 ORIGINAL |
| UX-10 | Help Command | ⚪ STANDARD |

**P2 by Source:**
| Source | Count |
|--------|-------|
| 🟢 EXISTING | 1 |
| 🔵 TRAYCER | 3 |
| 🟣 ORIGINAL | 9 |
| ⚪ STANDARD | 9 |

**P2 Count: 22 features**

---

### P3 - Future (Release 3.0+)

| ID | Feature | Source |
|----|---------|--------|
| PLN-9 | Plan Diff | ⚪ STANDARD |
| VER-8 | Performance Check | ⚪ STANDARD |
| CMP-7 | Rollback Plan | 🟣 ORIGINAL |
| CRD-6 | Time Tracking | ⚪ STANDARD |
| CRD-7 | Team View | ⚪ STANDARD |
| CRD-8 | Sprint Planning | ⚪ STANDARD |
| KNW-9 | Onboarding Flow | 🟣 ORIGINAL |
| INT-8 | Slack/Discord | ⚪ STANDARD |

**P3 by Source:**
| Source | Count |
|--------|-------|
| 🟢 EXISTING | 0 |
| 🔵 TRAYCER | 0 |
| 🟣 ORIGINAL | 2 |
| ⚪ STANDARD | 6 |

**P3 Count: 8 features**

---

## What This Means

### Build Priority by Source

```
MVP (P0):     🟢🟢🟢🟢🟢🟢🟢🟢 | 🔵🔵🔵🔵 | 🟣🟣🟣🟣🟣
              8 EXISTING         4 TRAYCER   5 ORIGINAL

              Most P0 is already built! Focus on 4 Traycer features.
```

### Effort Breakdown

| Phase | Existing (polish) | Traycer (build) | Original (build) | Standard (build) |
|-------|-------------------|-----------------|------------------|------------------|
| MVP | 8 | 4 | 5 | 0 |
| 1.0 | 4 | 10 | 10 | 8 |
| 2.0 | 1 | 3 | 9 | 9 |
| 3.0 | 0 | 0 | 2 | 6 |

### Key Insight

**For MVP, you need to build only 4 new Traycer-inspired features:**

1. **PLN-1 Plan Generator** - Intent → structured spec
2. **EXE-1 One-Click Execute** - Plan → agent handoff
3. **VER-1 Diff Scanner** - Post-execution diff analysis
4. **VER-2 Plan Comparison** - Diff vs plan verification

The other 8 P0 features already exist in SpaceCode.
The remaining 5 P0 features are SpaceCode originals (sector system).

---

## Implementation Phases

### Phase 1: Navigation + Context (Weeks 1-2)
Foundation for "where am I?" and "what do I know?"

| Feature | Source | Status |
|---------|--------|--------|
| NAV-1 Sector Map UI | 🟢 EXISTING | Polish |
| NAV-2 Auto-Sector Detection | 🟣 ORIGINAL | Build |
| NAV-3 Sector Boundaries | 🟣 ORIGINAL | Build |
| KNW-1 Context Packs | 🟢 EXISTING | Polish |
| KNW-2 Context Preview | 🟢 EXISTING | Polish |
| CMP-2 Sector Rules | 🟢 EXISTING | Polish |
| UX-1 Station UI | 🟢 EXISTING | Polish |
| UX-2 Single Cockpit | 🟣 ORIGINAL | Build |

**Work**: 5 polish, 3 build

---

### Phase 2: Planning (Weeks 3-4)
Add the plan generator and editor.

| Feature | Source | Status |
|---------|--------|--------|
| PLN-1 Plan Generator | 🔵 TRAYCER | Build |
| PLN-2 Sector-Aware Plans | 🟣 ORIGINAL | Build |
| PLN-4 Plan Editor | 🔵 TRAYCER | Build |
| PLN-5 Plan Templates | ⚪ STANDARD | Build |
| PLN-6 Impact Preview | 🟣 ORIGINAL | Build |

**Work**: 0 polish, 5 build (2 Traycer, 2 Original, 1 Standard)

---

### Phase 3: Execution (Weeks 5-6)
Connect to agents and execute plans.

| Feature | Source | Status |
|---------|--------|--------|
| EXE-1 One-Click Execute | 🔵 TRAYCER | Build |
| EXE-2 Context Pre-Injection | 🟢 EXISTING | Polish |
| EXE-3 Step-by-Step Mode | 🔵 TRAYCER | Build |
| EXE-5 Live Progress | ⚪ STANDARD | Build |
| INT-1 Claude Code CLI | 🟢 EXISTING | Polish |
| INT-2 Unity MCP | 🟣 ORIGINAL | Build |

**Work**: 2 polish, 4 build (2 Traycer, 1 Original, 1 Standard)

---

### Phase 4: Verification (Weeks 7-8)
Post-execution validation.

| Feature | Source | Status |
|---------|--------|--------|
| VER-1 Diff Scanner | 🔵 TRAYCER | Build |
| VER-2 Plan Comparison | 🔵 TRAYCER | Build |
| VER-3 Sector Rule Check | 🟣 ORIGINAL | Build |
| VER-4 Regression Detection | 🔵 TRAYCER | Build |
| VER-5 AI Review | 🔵 TRAYCER | Build |
| VER-9 Approval Workflow | 🔵 TRAYCER | Build |

**Work**: 0 polish, 6 build (5 Traycer, 1 Original)

---

### Phase 5: Compliance + Gates (Weeks 9-10)
Pre-execution enforcement.

| Feature | Source | Status |
|---------|--------|--------|
| CMP-1 Doc Gating | 🟢 EXISTING | Polish |
| CMP-3 Approval Gates | 🟣 ORIGINAL | Build |
| CMP-4 Dependency Check | 🟣 ORIGINAL | Build |
| KNW-4 Doc Targets | 🟣 ORIGINAL | Build |

**Work**: 1 polish, 3 build (0 Traycer, 3 Original)

---

### Phase 6: Coordination (Weeks 11-12)
Project management layer.

| Feature | Source | Status |
|---------|--------|--------|
| CRD-1 Phase Board | 🔵 TRAYCER | Build |
| CRD-2 Ticket Ingestion | 🔵 TRAYCER | Build |
| CRD-3 Job Queue | 🟣 ORIGINAL | Build |
| CRD-4 Status Dashboard | ⚪ STANDARD | Build |
| INT-3 Git Integration | ⚪ STANDARD | Build |
| INT-4 GitHub Issues | 🔵 TRAYCER | Build |
| INT-5 GitHub PRs | ⚪ STANDARD | Build |

**Work**: 0 polish, 7 build (3 Traycer, 1 Original, 3 Standard)

---

## Total Counts

| Priority | 🟢 EXISTING | 🔵 TRAYCER | 🟣 ORIGINAL | ⚪ STANDARD | Total |
|----------|-------------|------------|-------------|-------------|-------|
| P0 | 8 | 4 | 5 | 0 | 17 |
| P1 | 4 | 10 | 10 | 8 | 32 |
| P2 | 1 | 3 | 9 | 9 | 22 |
| P3 | 0 | 0 | 2 | 6 | 8 |
| **Total** | **13** | **17** | **26** | **23** | **79** |

---

## Architecture Notes

### Data Models

```typescript
interface Sector {
  id: string;
  name: string;
  icon: string;
  paths: string[];           // Folder patterns
  rules: string;             // Context pack content
  docTarget: string;         // Path to design doc
  dependencies: string[];    // Other sector IDs
  approvalRequired: boolean;
}

interface Plan {
  id: string;
  intent: string;            // User's original request
  sectors: string[];         // Sectors touched
  phases: Phase[];
  status: 'draft' | 'approved' | 'executing' | 'verifying' | 'done' | 'failed';
  createdAt: Date;
  executedAt?: Date;
  verifiedAt?: Date;
}

interface Phase {
  id: string;
  title: string;
  steps: Step[];
  status: 'pending' | 'in_progress' | 'done' | 'failed';
}

interface Step {
  id: string;
  description: string;
  files: string[];           // Files to touch
  rationale: string;         // Why this step
  agent: 'claude' | 'gpt' | 'mastermind';
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  diff?: string;             // Git diff after execution
  verification?: Verification;
}

interface Verification {
  passed: boolean;
  planMatch: boolean;        // Diff matches plan?
  ruleViolations: string[];  // Sector rules broken
  testResults?: TestResult[];
  aiReview?: string;         // AI's assessment
}

interface ContextPack {
  sector: string;
  rules: string;
  examples: string[];
  patterns: string[];
  docContent?: string;       // From doc target
}
```

### Key Components

```
spacecode-vscode/src/
├── sectors/
│   ├── SectorManager.ts        # Sector detection, boundaries
│   ├── SectorConfig.ts         # Sector definitions
│   └── SectorUI.ts             # Station map rendering
├── planning/
│   ├── PlanGenerator.ts        # Intent → Plan (TRAYCER)
│   ├── PlanEditor.ts           # Plan editing UI (TRAYCER)
│   ├── PlanTemplates.ts        # Pre-built templates
│   └── PlanStorage.ts          # Plan persistence
├── execution/
│   ├── Executor.ts             # Plan → Agent handoff (TRAYCER)
│   ├── ContextBuilder.ts       # Build injection context (EXISTING)
│   ├── ProgressTracker.ts      # Live execution status
│   └── AgentAdapter.ts         # Claude/GPT abstraction (EXISTING)
├── verification/
│   ├── DiffScanner.ts          # Git diff analysis (TRAYCER)
│   ├── PlanComparer.ts         # Diff vs plan (TRAYCER)
│   ├── RuleChecker.ts          # Sector rule validation (ORIGINAL)
│   ├── TestRunner.ts           # Run and compare tests (TRAYCER)
│   └── AIReviewer.ts           # AI code review (TRAYCER)
├── compliance/
│   ├── GateManager.ts          # Pre-execution gates (EXISTING)
│   ├── DocGate.ts              # Doc coverage check (EXISTING)
│   ├── ApprovalGate.ts         # Human approval flow (ORIGINAL)
│   └── AuditLog.ts             # Gate pass/fail log
├── coordination/
│   ├── PhaseBoard.ts           # Kanban UI (TRAYCER)
│   ├── JobQueue.ts             # Plan queue (ORIGINAL)
│   ├── TicketIngestion.ts      # GitHub → Plan (TRAYCER)
│   └── StatusDashboard.ts      # Overview panel
├── knowledge/
│   ├── ContextPackManager.ts   # Pack storage/injection (EXISTING)
│   ├── KnowledgeBase.ts        # URLs, PDFs, notes (EXISTING)
│   └── DocTargetManager.ts     # Doc linking (ORIGINAL)
└── integration/
    ├── ClaudeCodeAdapter.ts    # Claude CLI integration (EXISTING)
    ├── UnityMCPAdapter.ts      # Unity MCP bridge (ORIGINAL)
    ├── GitAdapter.ts           # Git operations
    └── GitHubAdapter.ts        # Issues, PRs (TRAYCER)
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time for junior dev to make first change | < 30 minutes |
| % of changes that pass verification | > 90% |
| Sector rule violations caught pre-execution | > 95% |
| Context switching (leaving SpaceCode) | < 2x per task |
| Junior dev confidence score (survey) | > 4/5 |
