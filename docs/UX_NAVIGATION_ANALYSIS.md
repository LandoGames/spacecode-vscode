# SpaceCode UX Navigation Analysis

**Date**: 2026-02-05
**Status**: Analysis Document
**Context**: Preparing for V3 persistent chat implementation

---

## Current State Analysis

### The Double Menu Problem

Currently SpaceCode has **two navigation systems** that overlap:

#### Upper Bar (Header)
```
[Chat] [Station] [Agents] [Skills] [Dashboard]  ⚙️ 🔄
```
- Main tab navigation
- Switches entire view
- Dashboard has 10+ subtabs (Docs, Tickets, DB, Logs, Mission, Storage, Art, Info, MCP, Settings)

#### Lower Bar (Above Chat Input)
```
● Nova  ● Gears  ● Index  ● Triage  ● Vault  ● Palette
  Idle    Idle    Idle     Idle      Idle    Idle
```
- Persona status indicators
- Clickable → jumps to persona's tab/panel
- Shows status: Idle, Working, Active

### UX Issues

1. **Redundant Navigation**: Both bars can take you to similar places
   - Clicking "Station" tab → shows Station with Gears persona
   - Clicking "Gears" persona dot → also switches to Station

2. **Context Loss**: Switching tabs loses your chat context
   - You're in Chat with Nova → switch to Station → chat resets to Gears context
   - Multi-turn conversations are interrupted

3. **Persona Confusion**: Users don't understand personas vs tabs
   - Are they switching context or switching UI?
   - What's the relationship?

4. **Dashboard Overload**: Too many subtabs
   - Docs, Tickets, DB, Logs, Mission, Storage, Art, Info, MCP, Settings
   - Some are major features (Docs, Tickets), some are utilities (Logs, Info)

---

## V3 Vision: Persistent Chat Layout

From `V3_IMPLEMENTATION_CHECKLIST.md`, Phase 0:

### Core Concept
```
┌─────────────────────────────────────────────────────────────────┐
│  [Station] [Agents] [Skills] [Dashboard]           ⚙️ 🔄        │
├───────────────────┬─────────────────────────────────────────────┤
│                   │                                             │
│     CHAT          │          CONTENT AREA                       │
│   (Always Here)   │       (Changes per tab)                     │
│                   │                                             │
│   Nova context    │   Station / Dashboard / Agents / Skills     │
│   + active skills │                                             │
│                   │                                             │
│  [input........]  │                                             │
├───────────────────┴─────────────────────────────────────────────┤
│  ● Nova  ● Gears  ● Index  ● Triage  ● Vault  ● Palette        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Changes
1. **No "Chat" tab** - Chat is always visible on left (33% width)
2. **Single chat instance** - Never recreated, scroll position preserved
3. **Persona auto-switch** - Tab determines default context, user can override
4. **Skills "dress" the chat** - Entering a tab adds capabilities, leaving removes them

---

## Your Concept: "Dressing Up" the Chat

### The Metaphor
- Chat is like a **person** (Nova)
- Tabs are like **costumes/roles** with special **tools**
- When you enter Station → Nova puts on engineer clothes and gets access to sector tools
- When you enter Art → Nova becomes an Art Director with Gemini/image tools
- **The conversation continues** - you don't start over

### Implementation Implications

1. **Skills as Equipment**
   - Each tab has default skills that auto-enable
   - Skills = tools + prompts + context
   - Station: sector analysis, asmdef checks, build tools
   - Art: image generation, style library, UITK tools
   - Docs: librarian skills, doc sync, template generation

2. **Conversation Continuity**
   - Same chat thread across all tabs
   - Context accumulates (but can be cleared)
   - Compaction handles token limits

3. **Visual Skill Indicators**
   Options for showing active skills:

   **Option A: Input Bar Chips**
   ```
   [📐 Sectors] [🎨 Art] [📚 Docs]  [Type message... ]  [Send]
   ```

   **Option B: Side Rail**
   ```
   ┌─────────┐
   │ Skills  │
   │ ───────-│
   │ 📐 On   │
   │ 🎨 On   │
   │ 📚 Off  │
   └─────────┘
   ```

   **Option C: Chat Header Badge**
   ```
   ┌─────────────────────────────────────────┐
   │ Nova  [+3 skills active]        ⚙️ ✕    │
   ├─────────────────────────────────────────┤
   │ Chat messages...                        │
   ```

---

## Major Features Analysis

### Tier 1: Core Systems (Always Accessible)
These deserve **prominent navigation** - they're always needed:

| Feature | Current Location | Proposed |
|---------|-----------------|----------|
| **Chat** | Tab | Always visible (left panel) |
| **Station** | Tab | Tab (content area) |
| **Docs (Librarian)** | Dashboard subtab | **Promote to Tab or prominent shortcut** |
| **Tickets** | Dashboard subtab | **Promote to Tab or prominent shortcut** |

### Tier 2: Context-Specific (Available When Relevant)
These appear based on what you're doing:

| Feature | Current Location | Proposed |
|---------|-----------------|----------|
| Agents | Tab | Tab (content area) |
| Skills | Tab | Tab (content area) |
| Art Studio | Dashboard subtab | Auto-skill when in Palette context |
| Project DB | Dashboard subtab | Auto-skill when in Vault context |

### Tier 3: Utilities (Settings/Tools)
These are accessed occasionally, don't need prominent nav:

| Feature | Current Location | Proposed |
|---------|-----------------|----------|
| Settings | Dashboard subtab → Now ⚙️ icon | ⚙️ overlay (done) |
| MCP Status | Dashboard subtab | Settings overlay or Station |
| Logs | Dashboard subtab | Settings or Command Palette |
| Storage | Dashboard subtab | Settings overlay |
| Info | Dashboard subtab | Settings overlay |

---

## Recommendations

### 1. Keep Upper Navigation, Simplify Lower

**Upper Bar** (Primary Navigation):
```
[Station] [Docs] [Tickets] [Skills] [Dashboard]  ⚙️ 🔄
```
- Remove "Chat" tab (chat is always visible)
- Remove "Agents" tab (merge with Skills or make contextual)
- Promote **Docs** and **Tickets** to top-level

**Lower Bar** (Status Only, Not Navigation):
```
● Nova (Active)  ● Gears  ● Index  ● Triage  ● Vault  ● Palette
```
- Keep as **status indicators** only
- Clicking shows a tooltip/popup, doesn't switch tabs
- Or: Remove entirely if personas auto-switch reliably

### 2. Alternatively: Remove Lower Bar Entirely

If personas always auto-switch based on tab, the status bar is redundant:
- Station → Gears automatically
- Docs → Index automatically
- Tickets → Triage automatically

The user doesn't need to see "Idle" statuses. Show **active persona** in chat header instead:
```
┌───────────────────────────────────────┐
│ Chat with Nova 🚀  [+2 skills]  ⚙️   │
```

### 3. Skills Visualization

**Recommended: Input Bar Chips (Option A)**
```
┌─────────────────────────────────────────────────────────────┐
│ [📐 Sectors] [🎨 Image Gen] [×]    [Type message...]  [Send]│
└─────────────────────────────────────────────────────────────┘
```
- Active skills shown as chips above/beside input
- Click chip to see skill details or disable
- [×] to clear all context skills
- Unobtrusive but visible

### 4. Dashboard Slimming

Current Dashboard subtabs (10+):
```
[Docs] [Tickets] [DB] [MCP] [Logs] [Mission] [Storage] [Art] [Info]
```

Proposed:
- **Promote** to top nav: Docs, Tickets
- **Move** to Settings overlay: MCP, Logs, Storage, Info
- **Keep** in Dashboard: Mission (project overview), DB (if wired)
- **Art** becomes a skill, not a destination

Result:
```
Dashboard subtabs: [Mission] [DB]  (that's it)
```

---

## Phased Implementation

### Phase A: V3 Layout (Do First)
1. Implement persistent chat layout (left 33%, right 67%)
2. Remove "Chat" tab from header
3. Chat persists across all tab switches
4. Persona auto-switches but conversation continues

### Phase B: Navigation Simplification
1. Promote Docs and Tickets to top-level tabs
2. Slim down Dashboard to Mission + DB only
3. Move utilities to Settings overlay (already have ⚙️)

### Phase C: Skills Visualization
1. Add skill chips to input bar
2. Show active skills count in chat header
3. Auto-enable skills based on tab context
4. Allow manual skill toggling

### Phase D: Remove Persona Status Bar (Optional)
1. If auto-switching works well, remove lower status bar
2. Show active persona in chat header instead
3. Less UI clutter, cleaner look

---

## Summary

| Question | Answer |
|----------|--------|
| Keep double menu? | **No** - upper nav for tabs, remove lower as navigation |
| Why upper not lower? | Upper is standard nav pattern, lower is status (or remove) |
| Docs/Tickets prominence? | **Promote** to top-level tabs (they're core features) |
| Skills visualization? | **Input bar chips** showing active skills |
| Dashboard future? | Slim to Mission + DB, move utilities to Settings |
| Chat persistence? | **Always visible**, never destroyed, skills "dress" it |

---

## Next Steps

1. **Read and digest V3 Phase 0** implementation details
2. **Decide on navigation structure** before implementing
3. **Prototype the persistent chat layout**
4. **Test with real workflows** to validate UX

---

*This analysis is a starting point for discussion, not a final decision.*
