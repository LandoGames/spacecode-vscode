# Station Engineer UX Spec

## Scope
Define a proactive, project-aware assistant ("Station Engineer") that turns the AI from passive helper into a guided operator. Integrates with SpaceCode's Station tab, sector system, and autoexecute queue.

## Goals
- Provide high-signal, actionable guidance without noise.
- Maintain an "eagle-eye" view of project health, gaps, and next steps.
- Delegate to specialized roles for deep dives.
- Never execute changes without explicit user approval.

## Non-Goals
- Full autonomous decision making.
- Replacing the human operator.
- Real-time mic input as the primary control channel.

---

## Primary Role
**Station Engineer (Orchestrator)**
- Lives on the **Station tab** — maintenance and project health focus.
- Owns the sector map and project state.
- Tracks health, risks, and next actions.
- Delegates to specialist roles when needed.

## Delegated Roles

| Role | Responsibility | When Delegated |
|------|---------------|----------------|
| **Architect** | Long-term structure, cross-cutting design, feature planning | Architecture decisions, refactoring proposals |
| **Modularity Lead** | Decoupling, dependency hygiene, duplication elimination | Coupling detected, sector boundary violations |
| **Verifier** | Tests, gates, compliance checks | Gates pending, tests failing, policy changed |
| **Doc Officer** | Docs staleness, template fill, doc sync | Docs stale after code change, new undocumented features |
| **Planner** | Task breakdown, sequencing, priority assessment | Complex multi-step work, issue triage |
| **Release Captain** | Packaging, versioning, release readiness | Pre-release checks, version bumps, changelog |

---

## Pillar 1: Architecture Integration

The Station Engineer works **with** existing systems, not as a standalone feature.

### Webview Message Protocol

```typescript
// Extension → Webview
{ type: 'engineerStatus', health: 'ok'|'warn'|'critical', alertCount: number, topAction: string }
{ type: 'engineerSuggestions', suggestions: Suggestion[] }
{ type: 'engineerHistory', history: HistoryEntry[] }
{ type: 'engineerPrompt', message: string, actions: string[] }  // inline prompt

// Webview → Extension
{ type: 'engineerAction', suggestionId: string, action: 'run'|'open'|'defer'|'dismiss' }
{ type: 'engineerDelegate', role: string }  // 'architect'|'verifier'|'docOfficer'|etc.
{ type: 'engineerRefresh' }  // manual rescan
```

### Autoexecute Queue

Suggestions **never auto-run**. Any "Run" action queues a job via the existing autoexecute system and requires explicit user approval — same behavior as existing autoexecute gate.

### Sector System

Every suggestion is tagged with `sectorId` / `subId` where applicable. Sector violations automatically raise urgency in the scoring formula and appear in the Ship Status section.

---

## Pillar 2: Suggestion Generation (Hybrid)

Two sources, filtered and ranked before display.

### Rule-Based Triggers (Deterministic, Cheap, Always Safe)

| Trigger | Condition | Suggestion |
|---------|-----------|------------|
| Docs stale | Git diff touches sector X + docs unchanged | "Update docs for sector X" |
| Tests failing | Build/test output contains failures | "Check test output" / "Run gates" |
| Policy changed | ASMDEF policy file modified | "Validate sector boundaries" |
| New undocumented files | Files added without matching docs | "Update documentation" |
| Sector violation | Cross-sector import detected | "Fix sector boundary violation" |
| Orphan files | Files outside any sector | "Assign orphan files to sectors" |

### AI-Generated Suggestions (Optional, Labeled)

- Refactor opportunities spotted by AI analysis
- Potential risks not covered by rules
- Alternative approaches or improvements
- Clearly labeled as `source: 'ai'` vs `source: 'rule'` in the suggestion data

### Filters (Applied to Both Sources)

- Reject duplicate suggestions (same title + same sector)
- Rate-limit repeats (no re-suggestion within 24h of dismissal)
- Suppress suggestions that violate policy or sector rules
- AI suggestions capped at 3 per scan to avoid noise

---

## Pillar 3: Persistence

The system remembers decisions, avoids nagging, and shows history.

### Storage

```
.spacecode/engineer-state.json
```

```typescript
interface EngineerState {
  lastScanAt: string;                // ISO timestamp
  healthStatus: 'ok' | 'warn' | 'critical';
  activeSuggestions: Suggestion[];   // current ranked list
  history: HistoryEntry[];           // past decisions (last 100)
  dismissed: Record<string, string>; // suggestionId → dismissedAt (24h cooldown)
}

interface Suggestion {
  id: string;
  title: string;
  why: string;
  source: 'rule' | 'ai';
  risk: 'low' | 'med' | 'high';
  confidence: 'low' | 'med' | 'high';
  score: number;                     // computed from scoring formula
  sectorId?: string;                 // which sector this relates to
  actionType: 'inspect' | 'plan' | 'validate' | 'document' | 'refactor';
  delegateTo?: string;               // role name if delegation needed
  createdAt: string;
}

interface HistoryEntry {
  suggestionId: string;
  title: string;
  decision: 'accepted' | 'deferred' | 'dismissed';
  decidedAt: string;
}
```

### Behavior

- State written after every user decision (accept/defer/dismiss)
- State loaded on Station tab open — restores last known health + suggestions
- Dismissed items suppressed for 24h (cooldown check against `dismissed` map)
- History capped at 100 entries (FIFO eviction)
- File is `.gitignore`-able (user-specific state, not project config)

---

## Pillar 4: Suggestion Scoring

Rank suggestions consistently and explain the ranking.

### Formula

```
score = (Risk × 3) + (Impact × 2) + (Urgency × 2) - Effort
```

### Factors (Each Scored 1–5)

| Factor | Weight | 1 (Low) | 3 (Medium) | 5 (High) |
|--------|--------|---------|------------|----------|
| **Risk** | ×3 | Style nit | Logic bug possible | Security / data loss |
| **Impact** | ×2 | Single file | Single sector | Cross-sector / project-wide |
| **Urgency** | ×2 | Anytime | Should do soon | Blocking merge / release |
| **Effort** | ×1 (subtracted) | Trivial (1 click) | Moderate (multi-file) | Major (architecture change) |

### Score Range

- **Max**: 35 (Risk=5×3 + Impact=5×2 + Urgency=5×2 - Effort=0) — theoretical ceiling
- **Practical high**: 25–30 — critical security issue, cross-sector, blocking
- **Practical mid**: 12–18 — docs stale, tests pending, moderate scope
- **Practical low**: 5–10 — style suggestions, minor improvements

### Display Rules

- Top 3 by score shown in status strip
- Full ranked list in Engineer Panel
- Suggestions with score < 5 hidden by default (show via "Show all")

### Example Scored Suggestions

| Suggestion | Risk | Impact | Urgency | Effort | Score |
|-----------|------|--------|---------|--------|-------|
| Fix SQL injection in auth | 5×3=15 | 3×2=6 | 5×2=10 | 2 | **29** |
| Run gates (policy changed) | 3×3=9 | 4×2=8 | 4×2=8 | 1 | **24** |
| Update docs for UI sector | 1×3=3 | 2×2=4 | 3×2=6 | 1 | **12** |
| Remove unused import | 1×3=3 | 1×2=2 | 1×2=2 | 1 | **6** |

---

## UI Placement

### 1) Persistent Status Strip
- Location: Station tab header bar (always visible when Station tab is active).
- Shows: health indicator (OK / Warn / Critical), active alert count, top suggested action.
- Clicking the strip opens the full Engineer Panel.

### 2) Engineer Panel (Primary Workspace)
- The Station tab's main content area.
- Sections:
  - **Ship Status** — health summary, active risks, trend arrow (improving/stable/degrading)
  - **Suggestions** — ranked list with rationale + action buttons
  - **Delegations** — quick-launch buttons by role name (Architect, Verifier, etc.)
  - **History** — past suggestions + user decisions (accepted/deferred/dismissed)

### 3) Contextual Inline Prompts
- Appear only when relevant (e.g., docs page open, tests fail, sector touched).
- Rendered as compact notification bars in the webview, dismissible, non-blocking.
- Sent via `postMessage({ type: 'engineerPrompt', ... })`.

## UI Wireframes (Text)

### Status Strip (Header)
```
[✅ Healthy]  |  Next: Run gates (score: 24)  |  1 warning  |  Open Engineer →
```

### Engineer Panel (Primary)
```
┌──────────────────────────────────────────────────────┐
│ Station Engineer                                     │
├──────────────────────────────────────────────────────┤
│ Ship Status: ⚠ 2 Warnings                            │
│ - Docs stale: UI, Core                               │
│ - Gates pending: asmdef policy                       │
│                                                      │
│ Top Suggestions                                      │
│ 1) Run gates  [Run] [Open] [Defer]        score: 24  │
│    Why: policy changed in UI sector                  │
│    Risk: med │ Confidence: high │ Source: rule        │
│ 2) Update docs [Open] [Defer]             score: 12  │
│    Why: UI files changed, docs stale                 │
│    Risk: low │ Confidence: high │ Source: rule        │
│                                                      │
│ Delegate To                                          │
│ [Architect] [Modularity Lead] [Verifier]             │
│ [Doc Officer] [Planner] [Release Captain]            │
│                                                      │
│ History                                              │
│ - Deferred: Run gates (10:14)                        │
│ - Completed: Update docs (09:55)                     │
└──────────────────────────────────────────────────────┘
```

### Contextual Inline Prompt
```
⚠ Docs stale for sector UI — Open checklist?  [Open] [Dismiss]
```

---

## Interaction Model
- **Suggest-only by default**. Explicit approval required for any action.
- Each suggestion includes:
  - **Why** — short rationale (1 sentence)
  - **Risk** — low / med / high
  - **Confidence** — low / med / high
  - **Source** — rule / ai
  - **Score** — numeric ranking
  - **Action buttons** — Run / Open / Defer / Dismiss
- Respects autoexecute gate: if autoexecute is OFF, "Run" queues the action for approval.

## Notification Policy
- **Critical**: immediate notification + status strip turns red + sound (`sectorViolation`).
- **Warning**: visible in Engineer panel + amber badge on Station tab.
- **Info**: only in panel feed, no badge.
- Rate-limited; no repeated nags for dismissed items (suppressed for 24h).

## Speaking / Voice
- Voice is optional, off by default.
- Enabled only for Critical alerts or on-demand.
- Text remains the primary channel for precision.
- Uses existing `SoundService` for alert sounds.

## Action Types
- **Inspect**: open file, diff, test output → navigates to file/line in editor.
- **Plan**: generate plan, create task → delegates to Planner role.
- **Validate**: run gates, tests, compliance checks → delegates to Verifier role.
- **Document**: suggest/update docs, open templates → delegates to Doc Officer role.
- **Refactor**: propose modularization steps, identify duplication → delegates to Modularity Lead role.

## Data Inputs
- Repo diff / commits (via `git` CLI)
- Tests / build results (via task output)
- Sector map + ASMDEF policy (via `SectorConfig`)
- Docs staleness — file mtime vs. source mtime comparison
- Plan / ticket state (via `PlanStorage`)
- Recent user decisions (accepted / deferred / dismissed — from history)

---

## UX Example Flow
1) Engineer detects: diff touches 3 sectors + no docs update.
2) Status strip shows: "⚠ Docs stale for sectors: UI, Core."
3) Engineer panel suggests:
   - "Open docs checklist for UI sector" (score: 12, source: rule, risk: low)
   - "Run gates before merge" (score: 24, source: rule, risk: med)
4) User clicks "Open docs checklist."
5) Decision logged to `engineer-state.json`; suggestion suppressed for 24h.
6) Doc Officer role activated → routes to Index persona with docs context pre-loaded.

## Guardrails
- Never execute without explicit approval.
- Show clear previews of actions before execution.
- Always allow "Undo" where possible.
- Maintain audit history of all actions and decisions.
- Autoexecute gate applies — if OFF, all "Run" actions queue for approval.

## Success Metrics
- Reduced missed docs/tests after sector changes
- Lower defect rate from sector drift
- Fewer manual checklist steps
- Positive user sentiment (low interruption, high value)

---

*Last updated: 2026-02-04*
