# SpaceCode Feature Roadmap

**Goal**: Enable a junior dev to take control of a 1M+ line AI-generated RPG codebase.

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

## 1. NAVIGATION (Where Am I?)

Help junior dev understand their position in a massive codebase.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| NAV-1 | **Sector Map UI** | Visual spaceship/station with clickable sectors. Shows current sector highlighted. | P0 |
| NAV-2 | **Auto-Sector Detection** | Detect sector from active file path. Update UI automatically. | P0 |
| NAV-3 | **Sector Boundaries** | Define which folders/namespaces belong to which sector. Config file. | P0 |
| NAV-4 | **Breadcrumb Trail** | Show: `ARMORY > Combat > DamageCalculator.cs:42` always visible. | P1 |
| NAV-5 | **Sector Overview** | On sector click, show: key files, recent changes, open issues, health. | P1 |
| NAV-6 | **Dependency Graph** | Visualize which sectors depend on which. Highlight impact of changes. | P2 |
| NAV-7 | **Heat Map** | Color sectors by: recent activity, error rate, complexity, test coverage. | P2 |
| NAV-8 | **Quick Jump** | `Cmd+Shift+S` → fuzzy search sectors and key files within. | P1 |

---

## 2. PLANNING (What Do I Do?)

Structured planning before execution - stolen from Traycer, made sector-aware.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| PLN-1 | **Plan Generator** | Input intent → Output structured spec with files, rationale, order. | P0 |
| PLN-2 | **Sector-Aware Plans** | Plans know which sectors are touched. Auto-inject sector rules. | P0 |
| PLN-3 | **Phase Breakdown** | Break large plans into phases. Each phase = PR-sized chunk. | P1 |
| PLN-4 | **Plan Editor** | Editable plan panel. Add/remove/reorder steps. Markdown + structured. | P1 |
| PLN-5 | **Plan Templates** | Pre-built templates: "Add new system", "Fix bug", "Refactor", "Add UI". | P1 |
| PLN-6 | **Impact Preview** | Before executing, show: files affected, sectors touched, dependencies. | P1 |
| PLN-7 | **Plan Chat** | Refine plan via chat. "What about edge cases?" → Plan updates. | P2 |
| PLN-8 | **Plan History** | Store all plans. Search/reuse old plans. Learn from past work. | P2 |
| PLN-9 | **Plan Diff** | Compare two plans. See what changed between versions. | P3 |

---

## 3. EXECUTION (Do The Work)

Hand off plans to AI agents and execute.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| EXE-1 | **One-Click Execute** | Plan → "Execute" button → Sends to Claude Code with full context. | P0 |
| EXE-2 | **Context Pre-Injection** | Auto-inject: sector rules, relevant files, doc targets, constraints. | P0 |
| EXE-3 | **Step-by-Step Mode** | Execute plan one step at a time. Review between steps. | P1 |
| EXE-4 | **Agent Selection** | Choose: Claude, GPT, MasterMind, or custom agent per step. | P1 |
| EXE-5 | **Live Progress** | Show which plan step is executing. Progress bar. Time elapsed. | P1 |
| EXE-6 | **Pause/Resume** | Pause execution mid-plan. Resume later with context preserved. | P2 |
| EXE-7 | **Parallel Execution** | Execute independent steps in parallel (multiple agents). | P2 |
| EXE-8 | **Dry Run Mode** | "What would this do?" without actually executing. | P2 |

---

## 4. VERIFICATION (Did It Work?)

Post-execution validation - stolen from Traycer.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| VER-1 | **Diff Scanner** | After execution, scan git diff. List all changes. | P0 |
| VER-2 | **Plan Comparison** | Compare diff to plan. Flag: unexpected files, missing steps. | P0 |
| VER-3 | **Sector Rule Check** | Verify changes follow sector rules. Flag violations. | P1 |
| VER-4 | **Regression Detection** | Run tests. Compare before/after. Flag new failures. | P1 |
| VER-5 | **AI Review** | AI reviews the diff. Catches bugs, style issues, logic errors. | P1 |
| VER-6 | **Doc Drift Check** | Do docs still match code? Flag stale documentation. | P2 |
| VER-7 | **Security Scan** | Check for: hardcoded secrets, SQL injection, XSS, etc. | P2 |
| VER-8 | **Performance Check** | Flag obvious performance issues (N+1, missing async, etc). | P3 |
| VER-9 | **Approval Workflow** | Require human approval before committing verified changes. | P1 |

---

## 5. COMPLIANCE (Am I Allowed?)

Pre-execution gates and rule enforcement.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| CMP-1 | **Doc Gating** | Block execution if doc target not updated. Bypass in Yard mode. | P0 |
| CMP-2 | **Sector Rules** | Per-sector rules injected into every prompt. Enforced. | P0 |
| CMP-3 | **Approval Gates** | Certain sectors require approval before changes (e.g., CORE). | P1 |
| CMP-4 | **Dependency Check** | Block if change would break dependent sectors. | P1 |
| CMP-5 | **Test Requirement** | Block if change touches code without test coverage. | P2 |
| CMP-6 | **Review Requirement** | Certain changes require MasterMind review before commit. | P2 |
| CMP-7 | **Rollback Plan** | Require rollback plan for high-risk changes. | P3 |
| CMP-8 | **Audit Log** | Log all gate passes/failures. Who bypassed what, when. | P2 |

---

## 6. COORDINATION (What's The Status?)

Project management and job tracking - the "Coordinator" system.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| CRD-1 | **Phase Board** | Kanban: Backlog → Planning → Executing → Verifying → Done. | P1 |
| CRD-2 | **Ticket Ingestion** | GitHub Issues → SpaceCode plans. Auto-assign sector. | P1 |
| CRD-3 | **Job Queue** | Queue multiple plans. Execute in order or parallel. | P1 |
| CRD-4 | **Status Dashboard** | Overview: active jobs, recent completions, failures, blockers. | P1 |
| CRD-5 | **Notifications** | Alert on: job complete, verification failed, approval needed. | P2 |
| CRD-6 | **Time Tracking** | Track time per plan/sector. Estimate future work. | P3 |
| CRD-7 | **Team View** | Multi-user: who's working on what sector. Avoid conflicts. | P3 |
| CRD-8 | **Sprint Planning** | Group tickets into sprints. Track velocity by sector. | P3 |

---

## 7. KNOWLEDGE (What Do I Need To Know?)

Context management and knowledge injection.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| KNW-1 | **Context Packs** | Per-sector knowledge bundles. Auto-inject on sector entry. | P0 |
| KNW-2 | **Context Preview** | Always show: what context is being injected right now. | P0 |
| KNW-3 | **Auto-Context Build** | Build context from: active file, diagnostics, selection, sector. | P1 |
| KNW-4 | **Doc Targets** | Link sectors to their design docs. Track freshness. | P1 |
| KNW-5 | **Knowledge Base** | Store URLs, PDFs, notes. Semantic search. | P1 |
| KNW-6 | **Code Examples** | Per-sector example snippets. "This is how we do X here." | P2 |
| KNW-7 | **Pattern Library** | Reusable patterns: "Add ScriptableObject", "Create Manager". | P2 |
| KNW-8 | **Glossary** | Project-specific terms. Auto-link in chat. | P2 |
| KNW-9 | **Onboarding Flow** | New dev walkthrough: tour sectors, key concepts, first task. | P3 |

---

## 8. INTEGRATION (Connect To Everything)

External tool connections.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| INT-1 | **Claude Code CLI** | Execute plans via Claude Code. Session management. | P0 |
| INT-2 | **Unity MCP** | Scene/prefab/asset awareness. Console monitoring. | P0 |
| INT-3 | **Git Integration** | Diff, commit, branch, PR creation from SpaceCode. | P1 |
| INT-4 | **GitHub Issues** | Read issues, create issues, link to plans. | P1 |
| INT-5 | **GitHub PRs** | Create PR from verified plan. Auto-fill description. | P1 |
| INT-6 | **GPT/OpenAI** | Alternative agent for execution or MasterMind. | P1 |
| INT-7 | **Linear/Jira** | Ticket sync for teams using those tools. | P2 |
| INT-8 | **Slack/Discord** | Notifications to team channels. | P3 |
| INT-9 | **CI/CD Hooks** | Trigger builds, get results, block on failure. | P2 |
| INT-10 | **CodeSensei** | Code analysis, indexing, documentation from Unity editor. | P1 |

---

## 9. UX (Make It Easy)

User experience for junior devs.

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| UX-1 | **Station UI** | Spaceship metaphor. Visual, approachable, memorable. | P0 |
| UX-2 | **Single Cockpit** | Everything in one panel. No context switching. | P0 |
| UX-3 | **Guided Mode** | Step-by-step guidance for common tasks. Wizard-style. | P1 |
| UX-4 | **Error Recovery** | Clear error messages. "What went wrong, how to fix." | P1 |
| UX-5 | **Undo/Rollback** | Undo last execution. Rollback to previous state. | P1 |
| UX-6 | **Keyboard Shortcuts** | Power user shortcuts for all actions. Vim-style optional. | P2 |
| UX-7 | **Themes** | Light/dark mode. Customizable station colors. | P2 |
| UX-8 | **Tooltips Everywhere** | Hover explanations for every button/panel. | P1 |
| UX-9 | **Tutorial Mode** | Interactive tutorial for first-time users. | P2 |
| UX-10 | **Help Command** | `/help <topic>` → contextual help in chat. | P2 |

---

## Priority Summary

### P0 - Must Have (MVP)
Core functionality to achieve the goal.

| ID | Feature |
|----|---------|
| NAV-1 | Sector Map UI |
| NAV-2 | Auto-Sector Detection |
| NAV-3 | Sector Boundaries |
| PLN-1 | Plan Generator |
| PLN-2 | Sector-Aware Plans |
| EXE-1 | One-Click Execute |
| EXE-2 | Context Pre-Injection |
| VER-1 | Diff Scanner |
| VER-2 | Plan Comparison |
| CMP-1 | Doc Gating |
| CMP-2 | Sector Rules |
| KNW-1 | Context Packs |
| KNW-2 | Context Preview |
| INT-1 | Claude Code CLI |
| INT-2 | Unity MCP |
| UX-1 | Station UI |
| UX-2 | Single Cockpit |

**P0 Count: 17 features**

### P1 - Should Have (Release 1.0)
Important for real-world usability.

| ID | Feature |
|----|---------|
| NAV-4 | Breadcrumb Trail |
| NAV-5 | Sector Overview |
| NAV-8 | Quick Jump |
| PLN-3 | Phase Breakdown |
| PLN-4 | Plan Editor |
| PLN-5 | Plan Templates |
| PLN-6 | Impact Preview |
| EXE-3 | Step-by-Step Mode |
| EXE-4 | Agent Selection |
| EXE-5 | Live Progress |
| VER-3 | Sector Rule Check |
| VER-4 | Regression Detection |
| VER-5 | AI Review |
| VER-9 | Approval Workflow |
| CMP-3 | Approval Gates |
| CMP-4 | Dependency Check |
| CRD-1 | Phase Board |
| CRD-2 | Ticket Ingestion |
| CRD-3 | Job Queue |
| CRD-4 | Status Dashboard |
| KNW-3 | Auto-Context Build |
| KNW-4 | Doc Targets |
| KNW-5 | Knowledge Base |
| INT-3 | Git Integration |
| INT-4 | GitHub Issues |
| INT-5 | GitHub PRs |
| INT-6 | GPT/OpenAI |
| INT-10 | CodeSensei |
| UX-3 | Guided Mode |
| UX-4 | Error Recovery |
| UX-5 | Undo/Rollback |
| UX-8 | Tooltips Everywhere |

**P1 Count: 32 features**

### P2 - Nice to Have (Release 2.0)
Enhancements and polish.

| ID | Feature |
|----|---------|
| NAV-6 | Dependency Graph |
| NAV-7 | Heat Map |
| PLN-7 | Plan Chat |
| PLN-8 | Plan History |
| EXE-6 | Pause/Resume |
| EXE-7 | Parallel Execution |
| EXE-8 | Dry Run Mode |
| VER-6 | Doc Drift Check |
| VER-7 | Security Scan |
| CMP-5 | Test Requirement |
| CMP-6 | Review Requirement |
| CMP-8 | Audit Log |
| CRD-5 | Notifications |
| KNW-6 | Code Examples |
| KNW-7 | Pattern Library |
| KNW-8 | Glossary |
| INT-7 | Linear/Jira |
| INT-9 | CI/CD Hooks |
| UX-6 | Keyboard Shortcuts |
| UX-7 | Themes |
| UX-9 | Tutorial Mode |
| UX-10 | Help Command |

**P2 Count: 22 features**

### P3 - Future (Release 3.0+)
Long-term vision.

| ID | Feature |
|----|---------|
| PLN-9 | Plan Diff |
| VER-8 | Performance Check |
| CMP-7 | Rollback Plan |
| CRD-6 | Time Tracking |
| CRD-7 | Team View |
| CRD-8 | Sprint Planning |
| KNW-9 | Onboarding Flow |
| INT-8 | Slack/Discord |

**P3 Count: 8 features**

---

## Implementation Phases

### Phase 1: Navigation + Context (Weeks 1-2)
Foundation for "where am I?" and "what do I know?"

```
NAV-1  Sector Map UI
NAV-2  Auto-Sector Detection
NAV-3  Sector Boundaries
KNW-1  Context Packs
KNW-2  Context Preview
CMP-2  Sector Rules
UX-1   Station UI
UX-2   Single Cockpit
```

**Deliverable**: Junior dev can see sectors, navigate, get context injected.

---

### Phase 2: Planning (Weeks 3-4)
Add the plan generator and editor.

```
PLN-1  Plan Generator
PLN-2  Sector-Aware Plans
PLN-4  Plan Editor
PLN-5  Plan Templates
PLN-6  Impact Preview
```

**Deliverable**: Junior dev can describe intent, get structured plan.

---

### Phase 3: Execution (Weeks 5-6)
Connect to agents and execute plans.

```
EXE-1  One-Click Execute
EXE-2  Context Pre-Injection
EXE-3  Step-by-Step Mode
EXE-5  Live Progress
INT-1  Claude Code CLI
INT-2  Unity MCP
```

**Deliverable**: Plans execute via Claude Code with full context.

---

### Phase 4: Verification (Weeks 7-8)
Post-execution validation.

```
VER-1  Diff Scanner
VER-2  Plan Comparison
VER-3  Sector Rule Check
VER-4  Regression Detection
VER-5  AI Review
VER-9  Approval Workflow
```

**Deliverable**: Changes verified against plan, rules, tests.

---

### Phase 5: Compliance + Gates (Weeks 9-10)
Pre-execution enforcement.

```
CMP-1  Doc Gating
CMP-3  Approval Gates
CMP-4  Dependency Check
KNW-4  Doc Targets
```

**Deliverable**: Junior dev can't accidentally break things.

---

### Phase 6: Coordination (Weeks 11-12)
Project management layer.

```
CRD-1  Phase Board
CRD-2  Ticket Ingestion
CRD-3  Job Queue
CRD-4  Status Dashboard
INT-3  Git Integration
INT-4  GitHub Issues
INT-5  GitHub PRs
```

**Deliverable**: Full workflow from ticket to PR.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time for junior dev to make first change | < 30 minutes |
| % of changes that pass verification | > 90% |
| Sector rule violations caught pre-execution | > 95% |
| Context switching (leaving SpaceCode) | < 2x per task |
| Junior dev confidence score (survey) | > 4/5 |

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
│   ├── PlanGenerator.ts        # Intent → Plan
│   ├── PlanEditor.ts           # Plan editing UI
│   ├── PlanTemplates.ts        # Pre-built templates
│   └── PlanStorage.ts          # Plan persistence
├── execution/
│   ├── Executor.ts             # Plan → Agent handoff
│   ├── ContextBuilder.ts       # Build injection context
│   ├── ProgressTracker.ts      # Live execution status
│   └── AgentAdapter.ts         # Claude/GPT abstraction
├── verification/
│   ├── DiffScanner.ts          # Git diff analysis
│   ├── PlanComparer.ts         # Diff vs plan
│   ├── RuleChecker.ts          # Sector rule validation
│   ├── TestRunner.ts           # Run and compare tests
│   └── AIReviewer.ts           # AI code review
├── compliance/
│   ├── GateManager.ts          # Pre-execution gates
│   ├── DocGate.ts              # Doc coverage check
│   ├── ApprovalGate.ts         # Human approval flow
│   └── AuditLog.ts             # Gate pass/fail log
├── coordination/
│   ├── PhaseBoard.ts           # Kanban UI
│   ├── JobQueue.ts             # Plan queue
│   ├── TicketIngestion.ts      # GitHub → Plan
│   └── StatusDashboard.ts      # Overview panel
├── knowledge/
│   ├── ContextPackManager.ts   # Pack storage/injection
│   ├── KnowledgeBase.ts        # URLs, PDFs, notes
│   └── DocTargetManager.ts     # Doc linking
└── integration/
    ├── ClaudeCodeAdapter.ts    # Claude CLI integration
    ├── UnityMCPAdapter.ts      # Unity MCP bridge
    ├── GitAdapter.ts           # Git operations
    └── GitHubAdapter.ts        # Issues, PRs
```

---

## Total Feature Count

| Priority | Count |
|----------|-------|
| P0 | 17 |
| P1 | 32 |
| P2 | 22 |
| P3 | 8 |
| **Total** | **79** |
