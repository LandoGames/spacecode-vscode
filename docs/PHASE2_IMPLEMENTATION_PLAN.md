# Phase 2: Chat System Overhaul — Implementation Plan

**Status**: Ready to implement (after backend decoupling completes)
**Depends on**: Phase 0 (frontend modularization — DONE), backend handler extraction (IN PROGRESS)
**Last updated**: 2026-02-04

---

## Architecture Context

### Current Message Flow
```
Frontend (chatInput.ts)
  → postMessage({ type: 'sendMessage', mode, chatMode, text, history, ... })
  → mainPanelRouter.ts → case 'sendMessage'
  → mainPanel.ts:3193 → _handleSendMessage()
  → mainPanel.ts:3196 → provider = mode === 'claude' | 'gpt'
  → mainPanel.ts:3369 → orchestrator.askSingle(provider, contextWithKb, undefined, history)
                                                                          ^^^^^^^^^ persona prompt goes here
  → conversation.ts:637 → fullSystemPrompt = getWorkspaceContext() + systemPrompt
  → claude.ts / gpt.ts → streamMessage(messages, fullSystemPrompt)
```

### Existing Code to Reuse
| Module | Location | Status |
|--------|----------|--------|
| Agent types + definitions | `src/agents/types.ts`, `definitions.ts` | Ready (all 6 personas defined) |
| Compaction logic | `src/mastercode_port/orchestrator/conversation.ts:164-232` | Ready (needs UI wiring) |
| Memory module (SQLite + FTS5) | `src/memory/` | Ready (MessageStore, ContextAssembler, VectorStore) |
| Compaction UI notice | `src/webview/panel/features/chatInput.ts:172-191` | Ready |
| DocsManager (Index persona backend) | `src/docs/DocsManager.ts` | Ready |
| Ticket routing (Triage persona backend) | `src/tickets/index.ts` | Ready |
| VaultManager (Vault persona backend) | `src/vault/VaultManager.ts` | Ready |
| ArtStudioManager (Palette persona backend) | `src/artstudio/ArtStudioManager.ts` | Ready |

---

## 2.1 Chat Input Behavior

### What to Build
- Stop button when AI is running AND input is empty
- Send button when text exists in input
- 10s grace period after sending (user can still stop)
- "Send while thinking" (interrupt current generation, queue new message)

### Files to Change

**Frontend:**
- `src/webview/panel/features/chatInput.ts` — add `updateSendStopButton()`, wire to `setGenerating()` callback
- `src/mastercode_port/ui/mainPanelHtml.ts` — update send button HTML to support dual-state (send/stop icon swap)

**Backend:**
- `src/mastercode_port/ui/mainPanel.ts` — add `_handleStopAndSend` for interrupt flow (stop current → send new)
- `src/mastercode_port/orchestrator/conversation.ts` — ensure `cancelGeneration()` properly resets state for re-send

### Implementation Order
1. Add button state toggle in `chatInput.ts` (`updateSendStopButton()`)
2. Wire `setGenerating` to also call `updateSendStopButton()`
3. Add 10s grace timer — after send, keep stop button visible for 10s even if input has text
4. Add interrupt flow: if user types + sends while AI is generating, stop current then send new

---

## 2.2 Chat Compaction

### What to Build
- Auto-detect when approaching token limit
- Generate summary of older messages
- Replace old messages with summary chunk in UI
- Keep recent N messages in full

### Files to Change

**Backend (mostly wiring — logic exists):**
- `src/mastercode_port/ui/mainPanel.ts` — in `_handleSendMessage()`, call `orchestrator.needsCompaction(history)` before sending, call `orchestrator.compactHistory()` if needed
- `src/mastercode_port/orchestrator/conversation.ts` — already has `needsCompaction()`, `compactHistory()`, `estimateHistoryTokens()`

**Frontend (already exists):**
- `src/webview/panel/features/chatInput.ts:172` — `showCompactionNotice()` already renders the UI
- `src/webview/panel/ipc/messageRouter.ts` — already handles `case 'compacted'` message

### Implementation Order
1. Wire `needsCompaction()` check into `_handleSendMessage()` before the AI call
2. If compaction needed, call `compactHistory()` and emit `'compacted'` event
3. Send compacted history to AI instead of full history
4. Frontend already handles the `'compacted'` message type — verify it works end-to-end
5. Add token count display to chat UI (optional, shows "~75,000 / 100,000 tokens")

---

## 2.3 Persona System Foundation

### What to Build
- Persona routing: which persona is active based on current tab/panel
- Persona prompt injection: load `.system.md` and pass as systemPrompt to `askSingle()`
- Persona indicator in chat UI (icon + name)

### Routing Table
| Tab | Panel | Persona | Prompt File |
|-----|-------|---------|-------------|
| Chat | (any) | Nova | `nova.system.md` |
| Station | Chat (33%) | Gears | `gears.system.md` |
| Dashboard > Docs | — | Index | `index.system.md` |
| Dashboard > Tickets | — | Triage | `triage.system.md` |
| Dashboard > Project DB | — | Vault | `vault.system.md` |
| Dashboard > Art Studio | — | Palette | `palette.system.md` |

### Files to Create
- `src/personas/prompts/nova.system.md`
- `src/personas/prompts/gears.system.md`
- `src/personas/prompts/index.system.md`
- `src/personas/prompts/triage.system.md`
- `src/personas/prompts/vault.system.md`
- `src/personas/prompts/palette.system.md`
- `src/personas/PersonaRouter.ts` — maps (tab, panel, chatMode) → AgentId → prompt file

### Files to Change

**Frontend:**
- `src/webview/panel/features/chatInput.ts` — add `persona` field to `sendMessage()` payload (derived from current tab/mode)
- `src/webview/panel/state.ts` — add `currentPersona` to uiState
- `src/webview/panel/features/tabs.ts` — update persona on tab switch
- `src/mastercode_port/ui/mainPanelHtml.ts` — add persona indicator element (icon + name near chat header)

**Backend:**
- `src/mastercode_port/ui/mainPanel.ts:3369` — change `undefined` to `personaPrompt` in `askSingle()` call
- `src/mastercode_port/ui/mainPanel.ts:3193` — extract `persona` from message, look up prompt
- `src/personas/PersonaRouter.ts` — new file: `getPersonaForContext(tab, chatMode) → AgentId`
- `src/personas/PromptLoader.ts` — new file: reads `.system.md` files, caches them

### Implementation Order
1. Create `PersonaRouter.ts` with routing table
2. Create `PromptLoader.ts` to read and cache `.system.md` files
3. Write the 6 prompt templates (start minimal, iterate)
4. Add `persona` field to frontend sendMessage payload
5. Backend: extract persona from message, load prompt, pass to `askSingle()`
6. Add persona indicator to chat header UI

---

## 2.4 Persona: Nova (Creator)
> Chat tab — full features

### Prompt Template (`nova.system.md`)
- Role: Lead Engineer / Creator
- Capabilities: plan, execute, code generation, refactoring, code review, git operations
- Personality: proactive, solution-oriented, explains trade-offs
- Tools available: all (plan, execute, opinion, +chat, git)

### Files to Change
- Create `src/personas/prompts/nova.system.md`
- Ensure Chat tab routes to Nova in `PersonaRouter.ts`
- Nova is the default — no special UI changes needed beyond the foundation (2.3)

---

## 2.5 Persona: Gears (Engineer)
> Station tab — maintenance focus

### Prompt Template (`gears.system.md`)
- Role: Station Engineer / Maintenance Specialist
- Capabilities: debugging, testing, code quality, security audit, maintenance scanning
- Personality: methodical, safety-first, checks before changes
- Restrictions: no execution mode, no GPT opinion, no +chat, no push-to-git
- Modes: Learn (explain with analogies) / Maintenance (refactor suggestions)

### Files to Change
- Create `src/personas/prompts/gears.system.md`
- `PersonaRouter.ts` — Station tab → Gears
- `src/webview/panel/features/chatInput.ts` — disable restricted features when persona is Gears
- `src/webview/panel/features/modelToolbar.ts` — hide GPT consult toggle when Gears active

---

## 2.6-2.9 Remaining Personas

### Index (Librarian) — Dashboard Docs
- Prompt: documentation specialist, GDD/SA/TDD aware, template-driven
- Backend: `DocsManager.ts` already handles doc wizard, scanning, generation
- Wire: Dashboard Docs panel chat → Index persona

### Triage (Ticket Bot) — Dashboard Tickets
- Prompt: ticket analysis, routing (bug→Gears, feature→Nova, doc→Index)
- Backend: `src/tickets/index.ts` + `TicketProcessor.ts` already have routing policy
- Wire: Dashboard Tickets panel chat → Triage persona

### Vault (Database Engineer) — Dashboard Project DB
- Prompt: database design, queries, migrations, type generation
- Backend: `VaultManager.ts` already has full DB operations
- Wire: Dashboard Project DB panel chat → Vault persona

### Palette (Art Director) — Dashboard Art Studio
- Prompt: visual design, style guides, asset management, image generation
- Backend: `ArtStudioManager.ts` already has style/asset/image operations
- Wire: Dashboard Art Studio panel chat → Palette persona

---

## Implementation Priority Order

```
2.1 Chat Input Behavior       ← Smallest scope, high UX impact
2.2 Chat Compaction            ← Mostly wiring (logic exists)
2.3 Persona Foundation         ← Required before any persona
2.4 Nova                       ← Default persona, test the system
2.5 Gears                     ← Station tab persona
2.6-2.9 Index/Triage/Vault/Palette ← Dashboard personas (can be parallel)
```

---

## Color Discrepancy Note

The V2 checklist says Nova = blue, Index = green. The existing `definitions.ts` has:
- Nova = `#a855f7` (purple)
- Index = `#3b82f6` (blue)

Decision needed: follow the checklist or keep the existing code definitions?

---

## Risk Notes

1. **Backend decoupling dependency**: `_handleSendMessage` is in `mainPanel.ts` which GPT is actively splitting. Persona prompt injection (2.3) touches this function. Wait for GPT to finish.
2. **Prompt quality**: The `.system.md` files will need iteration. Start with minimal prompts, test, refine.
3. **Compaction token estimation**: Current `estimateTokens()` uses rough 4-chars-per-token. May need tiktoken for accuracy.
4. **Memory module vs orchestrator compaction**: Two parallel implementations exist. Should unify during 2.2 or defer to Phase 9.
