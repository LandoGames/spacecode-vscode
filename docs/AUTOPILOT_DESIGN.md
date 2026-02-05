# SpaceCode Autopilot Mode — Design Document

**Inspiration**: [ralph-tui](https://github.com/subsy/ralph-tui) autonomous agent loop
**Approach**: Adapt core patterns to SpaceCode's existing architecture — no code copying
**Status**: Design / Pre-implementation

---

## 1. What ralph-tui Does (Patterns We Want)

ralph-tui is a TUI-based autonomous agent loop that:

1. **Runs a cooperative while-loop** — iterates through tasks, executing an AI agent on each one
2. **Supports pause/resume** — user can pause mid-execution, engine polls until resumed
3. **Tracks task state** — open → in_progress → completed/blocked/cancelled
4. **Handles errors with strategies** — retry (exponential backoff), skip, or abort
5. **Detects rate limits** — regex patterns on stderr, falls back to secondary agent, pauses if all agents limited
6. **Persists sessions** — JSON metadata + PID-based lock files for crash recovery
7. **Emits granular events** — engine:started/stopped/paused, iteration:started/completed/failed, task:selected/completed, agent:switched

### Key ralph-tui State Machine

```
idle → running → pausing → paused → running → stopping → idle
                    ↓                     ↑
                (poll 100ms)         (resume())
```

### ralph-tui Loop Structure (simplified)

```
while (!shouldStop) {
  1. Check pause → poll until resumed
  2. Attempt primary agent recovery (if on fallback)
  3. Check completion (maxIterations, all tasks done, no tasks left)
  4. Get next task (dependency-aware, skip list)
  5. Execute task with error handling
     → Rate limit? Backoff → fallback agent → pause if all limited
     → Failed? Retry/skip/abort per strategy
  6. Persist session state
  7. Wait iterationDelay
}
```

---

## 2. What SpaceCode Already Has

| Concept | SpaceCode Equivalent | Location |
|---------|---------------------|----------|
| Task queue | `AutoexecuteJob[]` (FIFO, persisted in globalState) | `autoexecuteImpl.ts` |
| Plan execution | `PlanExecutor.execute()` + `executePlanStepByStep()` | `src/execution/PlanExecutor.ts`, `verificationImpl.ts` |
| Human approval | Step-by-step mode waits on `_awaitPlanStepApproval()` | `verificationImpl.ts` |
| AI agent | `orchestrator.askSingle()` (Claude CLI / Claude API / GPT) | `src/mastercode_port/orchestrator/conversation.ts` |
| Event system | `orchestrator.emit('chunk'/'turn'/'complete'/'error')` | `conversation.ts` |
| Session persistence | `globalState` for jobs, `PlanStorage` for plans (file-based) | `autoexecuteImpl.ts`, `src/planning/` |
| Sound notifications | `SoundService.play('aiComplete'/'aiError'/...)` | `src/mastercode_port/services/soundService.ts` |
| Context compaction | `orchestrator.needsCompaction()` + `compactHistory()` | `conversation.ts` |
| Gating system | `requireAutoexecute()` — blocks or queues if autoexecute off | `shipImpl.ts` |

### Gaps (What SpaceCode Lacks)

| ralph-tui Feature | SpaceCode Gap |
|-------------------|---------------|
| Cooperative pause/resume loop | Plans either run all-at-once or step-by-step (no true pause/resume) |
| Resumable execution state | `ExecutionState` is ephemeral — lost if panel closes |
| Error strategies (retry/skip/abort) | Plans stop on first failure, no retry or skip |
| Rate limit detection + agent fallback | No rate limit handling; single agent per request |
| Session lock files | No crash recovery for in-progress execution |
| Configurable iteration delay | No throttling between steps |
| Task dependency ordering | Job queue is FIFO only |

---

## 3. Autopilot Architecture

### 3.1 Core: AutopilotEngine

A new class that wraps SpaceCode's existing `PlanExecutor` and `orchestrator` with ralph-tui's loop patterns.

```
src/autopilot/
  AutopilotEngine.ts      — Main loop + state machine
  AutopilotSession.ts     — Session persistence + lock
  AutopilotTypes.ts       — State, config, event types
  RateLimitDetector.ts    — Pattern matching on agent errors
  ErrorStrategy.ts        — Retry/skip/abort handlers
```

### 3.2 State Machine

```typescript
type AutopilotStatus = 'idle' | 'running' | 'pausing' | 'paused' | 'stopping';

interface AutopilotState {
  status: AutopilotStatus;
  sessionId: string;
  currentIteration: number;
  currentStep: PlanStep | null;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: string[];       // step IDs that were skipped
  startedAt: string;
  activeAgent: 'claude' | 'gpt';
  fallbackReason?: string;
}
```

### 3.3 Loop (Pseudocode)

```typescript
async runLoop(plan: Plan): Promise<AutopilotResult> {
  this.state.status = 'running';
  this.emit('autopilot:started', { planId, totalSteps });
  await this.session.create(plan);

  for (const phase of plan.phases) {
    for (const step of phase.steps) {
      // 1. PAUSE CHECK
      if (this.state.status === 'pausing') {
        this.state.status = 'paused';
        this.emit('autopilot:paused');
        SoundService.getInstance().play('notification');
        while (this.state.status === 'paused' && !this.shouldStop) {
          await delay(200);
        }
        if (this.shouldStop) break;
        this.emit('autopilot:resumed');
      }

      // 2. PRIMARY AGENT RECOVERY
      if (this.state.activeAgent !== this.config.primaryAgent) {
        await this.attemptPrimaryRecovery();
      }

      // 3. EXECUTE STEP WITH ERROR HANDLING
      this.state.currentStep = step;
      this.emit('autopilot:step-start', { step, phase });
      const result = await this.executeWithRetry(step);

      // 4. HANDLE RESULT
      if (result.success) {
        this.state.completedSteps++;
        this.emit('autopilot:step-complete', { step, result });
        SoundService.getInstance().play('aiComplete');
      } else if (result.skipped) {
        this.state.skippedSteps.push(step.id);
        this.emit('autopilot:step-skipped', { step, reason: result.error });
      } else if (this.config.errorStrategy === 'abort') {
        this.emit('autopilot:aborted', { step, error: result.error });
        SoundService.getInstance().play('aiError');
        break;
      }

      // 5. PERSIST STATE
      await this.session.update(this.state);

      // 6. THROTTLE
      if (this.config.stepDelay > 0) {
        await delay(this.config.stepDelay);
      }
    }
  }

  await this.session.complete(this.state);
  this.emit('autopilot:complete', { completed: this.state.completedSteps });
  SoundService.getInstance().play('workflowDone');
}
```

### 3.4 Error Handling with Retry

```typescript
async executeWithRetry(step: PlanStep): Promise<StepResult> {
  let attempts = 0;
  const maxRetries = this.config.maxRetries;   // default: 2

  while (attempts <= maxRetries) {
    try {
      const result = await this.executor.executeSingleStep(plan, phase, step, {
        onOutput: (chunk) => this.emit('autopilot:output', { chunk }),
      });

      if (result.success) return result;

      // Check if rate limited
      if (this.rateLimitDetector.detect(result.error || result.output)) {
        return await this.handleRateLimit(step, attempts);
      }

      // Not rate limited — apply error strategy
      if (this.config.errorStrategy === 'retry' && attempts < maxRetries) {
        attempts++;
        const backoff = this.config.retryBaseMs * Math.pow(2, attempts); // 2s, 4s, 8s
        this.emit('autopilot:retrying', { step, attempt: attempts, backoffMs: backoff });
        await delay(backoff);
        continue;
      }

      if (this.config.errorStrategy === 'skip') {
        return { ...result, skipped: true };
      }

      return result; // abort — caller handles
    } catch (error) {
      if (attempts < maxRetries && this.config.errorStrategy === 'retry') {
        attempts++;
        await delay(this.config.retryBaseMs * Math.pow(2, attempts));
        continue;
      }
      return { success: false, error: error.message, stepId: step.id };
    }
  }
}
```

### 3.5 Rate Limit Detection + Agent Fallback

```typescript
class RateLimitDetector {
  private patterns = [
    /rate[- ]limit/i,
    /too many requests/i,
    /429/,
    /overloaded/i,
    /quota[- ]?exceeded/i,
    /anthropic.*rate/i,
    /openai.*rate/i,
  ];

  detect(output: string): boolean {
    return this.patterns.some(p => p.test(output));
  }
}

// In AutopilotEngine:
async handleRateLimit(step, attempt): Promise<StepResult> {
  const backoff = 5000 * Math.pow(3, attempt);  // 5s, 15s, 45s
  this.emit('autopilot:rate-limited', { agent: this.state.activeAgent, backoffMs: backoff });

  if (attempt < this.config.maxRateLimitRetries) {
    await delay(backoff);
    return this.executeWithRetry(step);  // retry same agent
  }

  // Switch to fallback agent
  if (this.state.activeAgent === 'claude' && this.config.fallbackAgent === 'gpt') {
    this.state.activeAgent = 'gpt';
    this.state.fallbackReason = 'rate-limited';
    this.emit('autopilot:agent-switched', { from: 'claude', to: 'gpt', reason: 'rate-limit' });
    return this.executeWithRetry(step);  // retry with fallback
  }

  // All agents limited — pause for user
  this.emit('autopilot:all-limited');
  SoundService.getInstance().play('sectorViolation');
  this.pause();
  return { success: false, error: 'All agents rate limited', stepId: step.id };
}
```

### 3.6 Session Persistence

```typescript
// File: .spacecode/autopilot-session.json
interface AutopilotSessionData {
  version: 1;
  sessionId: string;
  planId: string;
  status: AutopilotStatus;
  startedAt: string;
  updatedAt: string;
  currentPhaseIndex: number;
  currentStepIndex: number;
  completedSteps: number;
  failedSteps: number;
  skippedStepIds: string[];
  activeAgent: 'claude' | 'gpt';
  config: AutopilotConfig;
}

class AutopilotSession {
  private filePath: string;  // workspace/.spacecode/autopilot-session.json

  async create(plan: Plan): Promise<void> { /* write initial state */ }
  async update(state: AutopilotState): Promise<void> { /* update file */ }
  async complete(state: AutopilotState): Promise<void> { /* mark complete, keep for history */ }
  async loadExisting(): Promise<AutopilotSessionData | null> { /* read if exists */ }
  async canResume(): Promise<boolean> { /* check if interrupted session exists */ }
}
```

On extension activation, check for interrupted session → offer resume in UI.

### 3.7 Configuration

```typescript
interface AutopilotConfig {
  primaryAgent: 'claude' | 'gpt';       // default: 'claude'
  fallbackAgent: 'claude' | 'gpt';      // default: 'gpt'
  errorStrategy: 'retry' | 'skip' | 'abort';  // default: 'retry'
  maxRetries: number;                     // default: 2
  retryBaseMs: number;                    // default: 2000
  maxRateLimitRetries: number;            // default: 3
  stepDelay: number;                      // ms between steps, default: 500
  recoverPrimary: boolean;                // try primary agent between steps, default: true
  autoCommit: boolean;                    // git commit after each step, default: false
}
```

Exposed in SpaceCode settings panel under a new "Autopilot" section.

---

## 4. Integration with Existing SpaceCode

### 4.1 Replacing Current Plan Execution Modes

Currently SpaceCode has two modes:
- **Full execute** (`executePlanFromJob`) — runs all steps, no pause
- **Step-by-step** (`executePlanStepByStep`) — human approves each step

Autopilot becomes a **third mode**: autonomous with pause/resume/retry.

```
┌─────────────────────────────────────────────────────┐
│ Plan Execution Modes                                 │
├──────────────┬──────────────┬────────────────────────┤
│ Manual       │ Step-by-Step │ Autopilot              │
│ (full speed) │ (approve ea.)│ (autonomous + control) │
│              │              │                         │
│ No pause     │ Pause=implicit│ Pause/Resume/Abort    │
│ Stop on error│ Stop on error│ Retry/Skip/Abort      │
│ No persist   │ No persist   │ Session persisted      │
│ Single agent │ Single agent │ Agent fallback         │
└──────────────┴──────────────┴────────────────────────┘
```

### 4.2 UI Integration

The webview gets a new autopilot control bar when autopilot is active:

```
┌─────────────────────────────────────────────────┐
│ ▶ Autopilot Running  │ Step 3/12  │ ⏸ Pause │ ⏹ Stop │
│ Phase: Implementation │ Agent: Claude │ Retries: 0 │
└─────────────────────────────────────────────────┘
```

WebView messages:
- `autopilotStart { planId, config }` — start autopilot
- `autopilotPause` — pause
- `autopilotResume` — resume
- `autopilotAbort` — abort
- `autopilotStatus { state }` — backend → webview state updates

### 4.3 Coordinator Integration

The existing autoexecute gate (`requireAutoexecute`) applies:
- If autoexecute is ON → autopilot can start immediately
- If autoexecute is OFF → autopilot start is queued for approval

### 4.4 Sound Integration

Already wired events:

| Autopilot Event | Sound |
|----------------|-------|
| Step completed | `aiComplete` |
| Step failed | `aiError` |
| All steps done | `workflowDone` |
| Paused (rate limit) | `sectorViolation` |
| Paused (user) | `notification` |
| Resumed | `notification` |

### 4.5 Context Compaction

For long plans (many steps), the conversation context grows. The existing `orchestrator.needsCompaction()` + `compactHistory()` slots in naturally — the autopilot engine calls compaction between phases or when token count exceeds threshold.

---

## 5. Implementation Order

### Phase A — Core Engine (Minimal)
1. Create `src/autopilot/AutopilotTypes.ts` — types and config
2. Create `src/autopilot/AutopilotEngine.ts` — loop + state machine (pause/resume/abort)
3. Wire to existing `PlanExecutor.executeSingleStep()` for actual step execution
4. Add `autopilotStart/Pause/Resume/Abort` message handlers in mainPanel router
5. Add basic autopilot status messages to webview

### Phase B — Resilience
6. Create `src/autopilot/ErrorStrategy.ts` — retry with backoff, skip, abort
7. Create `src/autopilot/RateLimitDetector.ts` — pattern detection on errors
8. Add agent fallback (claude ↔ gpt switch)
9. Wire sound events

### Phase C — Persistence
10. Create `src/autopilot/AutopilotSession.ts` — file-based session state
11. Add resume-on-activation check in `extension.ts`
12. Add "Resume interrupted session?" prompt in webview

### Phase D — UI Polish
13. Add autopilot control bar in webview
14. Add autopilot config section in settings panel
15. Add autopilot history/log viewer

---

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Loop location | Extension host (not webview) | Survives panel close, access to filesystem + git |
| Persistence format | JSON file in `.spacecode/` | Survives VS Code restart, inspectable, git-ignorable |
| Agent abstraction | Reuse existing `orchestrator.askSingle()` | No new agent plugins needed; claude + gpt already work |
| Task source | Plan phases/steps (not job queue) | Plans have structure; job queue is for gating, not ordering |
| Default error strategy | Retry (2 attempts, 2s base backoff) | Most failures are transient (rate limits, timeouts) |
| Lock mechanism | Session file status field (not PID lock) | VS Code extension lifecycle is managed, PID locks overkill |

---

## 7. Differences from ralph-tui

| ralph-tui | SpaceCode Autopilot | Why |
|-----------|--------------------|----|
| Plugin-based agents (claude, opencode, aider) | `orchestrator.askSingle('claude'/'gpt')` | SpaceCode already has multi-provider orchestrator |
| Plugin-based trackers (linear, markdown) | Plan phases/steps from PlanStorage | SpaceCode uses structured plans, not external trackers |
| PID-based lock files | Session status field + extension lifecycle | VS Code manages process lifecycle |
| TUI rendering (blessed) | WebView panel messages | SpaceCode is a VS Code extension |
| Completion via `<promise>COMPLETE</promise>` tag | `PlanExecutor.executeSingleStep()` return value | SpaceCode execution is structured, not freeform |
| Exponential backoff base 5s × 3^n | Base 2s × 2^n (configurable) | SpaceCode steps are shorter, faster recovery preferred |
