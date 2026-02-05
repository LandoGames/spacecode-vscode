# V3 UX Architecture Decisions (Persistent Chat)

**Status**: Active decisions for Phase 0 (V3)  
**Scope**: Navigation, chat persistence, persona/skills context, and tab behavior  
**Goal**: Reduce mode confusion and make chat the always‑on control surface

---

## 1) Navigation Model (Single Global Navigation)

**Decision**: Keep one global navigation bar (top header).  
**Remove**: Any secondary navigation that behaves like a second tab system.

**Header tabs (global)**:
- Station
- Agents
- Skills
- Dashboard

**Rationale**:
- Two tab bars create ambiguous state and mode confusion.
- Users must have a single source of truth for “where am I”.
- The header owns app‑level context; chat owns local context.

---

## 2) Persistent Chat Layout (Always‑On Chat)

**Decision**: Chat is a **single persistent instance** across all tabs.

**Behavior**:
- Switching tabs **does not reset** chat history or scroll.
- Chat input remains visible at all times.
- Content area changes based on active header tab.

**Rationale**:
- Keeps the AI thread continuous.
- Avoids user confusion when moving between tools.

---

## 3) Chat Context Bar (Local Controls)

**Decision**: The UI above chat is **not a nav bar**. It becomes a **context bar**.

**Context bar contents**:
- Persona selector (default auto‑sets by tab, but user override allowed)
- Skill chips (active skills)
- Context indicators (sector/doc/ticket/asset, etc.)

**Rationale**:
- Clear hierarchy: header = global nav; context bar = chat behavior.

---

## 4) Persona Auto‑Switching (Non‑Blocking)

**Decision**: Persona is **suggested** by tab, not forced.

**Defaults by tab**:
- Station → Engineer (modularity/architecture, sectors, gates)
- Agents → Builder (workflow/agent orchestration)
- Skills → Librarian (skills/doc lookup)
- Dashboard → Planner/Release Captain (status, process)

**Behavior**:
- Tab change updates suggested persona in header.
- If user manually selects a persona, it remains until changed.
- Persona switch does **not** interrupt active response.

---

## 5) Skills UX (Visible + Configurable)

**Decision**: Skills show as **chips above input**, with optional side panel for details.

**Behavior**:
- Skills attach/detach with tab context.
- Active skills always visible as chips (quick remove).
- “Details” drawer shows parameters and descriptions.

**Rationale**:
- Chips keep active state visible without clutter.
- Drawer keeps advanced config available but optional.

---

## 6) Docs + Tickets Placement

**Decision**: Docs (Librarian) and Tickets remain in Dashboard but are reachable from chat.

**Behavior**:
- Dashboard is the full management view.
- Chat provides shortcuts: “Attach doc”, “Create ticket”, “Open ticket”.

**Rationale**:
- Keeps major features centralized while reducing navigation friction.

---

## 7) Interaction Rules (Non‑Negotiable)

- **No duplicate navigation bars** with overlapping responsibilities.
- **Chat never resets** on tab switch.
- **Context changes are additive** (skills/persona/context updates), not destructive.
- **All global changes** are visible in the header, not in chat controls.

---

## 8) Implementation Anchor (V3 Phase 0)

This document is the UX source of truth for:
- V3 Phase 0 (Persistent Chat Layout)
- V3 Persona/Skills behaviors
- Station Engineer integration (context‑driven)

Keep this aligned with `docs/V3_IMPLEMENTATION_CHECKLIST.md`.

