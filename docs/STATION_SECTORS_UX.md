# Station Sectors — UX Redesign

## Summary

SpaceCode already has a complete Sectors + Asmdef backend. This document proposes a UX redesign that promotes it from a hidden utility into the **hero feature of Station** — a visual architecture map of any project.

---

## Problem

Currently, the asmdef tools are buried inside Station as flat lists and utility buttons. Users must know what "asmdef" means to use them. The dependency graph exists but is secondary. Violations are shown as raw text. There is no at-a-glance project health view.

The backend is solid. The presentation undersells it.

---

## Design Principles

### 1. Station-first naming, technical-second

Every label uses the **space station metaphor first**, with the technical name in small grey text below or beside it.

```
┌──────────────────────────┐
│  ARMORY                  │
│  combat · asmdef: Combat │
│  ████████░░  Health: 87% │
└──────────────────────────┘
```

The user sees "ARMORY." The developer sees "asmdef: Combat" if they need it.

### 2. Sectors are the primary unit, not asmdefs

A Sector is a logical boundary. An asmdef is one possible enforcement mechanism. The UI shows Sectors. Asmdefs are shown as a detail inside each Sector card when available.

### 3. The dependency graph is the landing view

When users open Station, the first thing they see is a map of their project's architecture — not a list of buttons. This is the "control room" experience.

---

## Naming Convention

| UI Label | Technical term | Where shown |
|---|---|---|
| Sector | Module / Assembly | Card titles, graph nodes |
| Sector Map | Dependency graph | Station landing view |
| Boundary | Asmdef reference | Sector detail panel |
| Violation | Illegal cross-reference | Health badges, alerts |
| Policy | asmdef-policy.json | Settings/config area |
| Health | Validation pass rate | Badges on sector cards |

### In practice

- Tab name: **"Sectors"** (replaces current asmdef section)
- Landing view title: **"Sector Map"**
- Each node: **Station name** (large) + **technical name** (small, grey)
- Buttons say "Scan Sectors" not "Load Asmdefs"
- Violations say "ARMORY → CORE boundary breach" not "Combat.asmdef references Core illegally"

---

## Layout

### Station Tab Structure (revised)

```
Station
├── Sector Map        ← NEW: landing view (dependency graph + health overview)
├── Sector Detail     ← NEW: drill-down when clicking a sector
├── Docs              (existing)
├── Tickets           (existing)
├── DB                (existing)
├── MCP               (existing)
├── Logs              (existing)
├── Settings          (existing)
└── Info              (existing)
```

### Sector Map (landing view)

This replaces the current flat asmdef list as the default Station view.

```
┌─────────────────────────────────────────────────────────┐
│  SECTOR MAP                              [Scan] [Policy]│
│                                                         │
│  ┌──────┐     ┌──────┐     ┌──────┐     ┌──────┐      │
│  │ CORE │────→│HANGAR│     │CARGO │     │ YARD │      │
│  │  ●   │     │  ●   │────→│  ●   │     │  ◐   │      │
│  └──┬───┘     └──────┘     └──┬───┘     └──────┘      │
│     │                         │                         │
│     ▼                         ▼                         │
│  ┌──────┐     ┌──────┐     ┌──────┐                    │
│  │ARMORY│────→│COMMS │     │NAVIG.│                    │
│  │  ●   │     │  ◐   │     │  ●   │                    │
│  └──────┘     └──────┘     └──────┘                    │
│                                                         │
│  Legend: ● healthy  ◐ warnings  ○ violations            │
│  Sectors: 12 | Boundaries: 18 | Violations: 2          │
└─────────────────────────────────────────────────────────┘
```

Each node in the graph:
- Shows the **Station name** (ARMORY, CORE, etc.)
- Color-coded per sector (using existing `color` field from SectorConfig)
- Health indicator dot (green/yellow/red)
- Click to drill down
- Hover shows: sector description + asmdef name + reference count

### Sector Card (detail view)

When a user clicks a sector node, the right panel (or an overlay) shows:

```
┌─────────────────────────────────────────┐
│  ← Back to Map                          │
│                                         │
│  ARMORY                                 │
│  combat · asmdef: Combat                │
│                                         │
│  Health: ██████████░░░  78%             │
│                                         │
│  ┌─ Boundaries (allowed) ─────────────┐ │
│  │  → CORE          ✓                 │ │
│  │  → HANGAR        ✓                 │ │
│  │  → CARGO         ✓                 │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Violations ───────────────────────┐ │
│  │  ✗ → COMMS (not in allowed list)   │ │
│  │    Fix: Add to policy or remove    │ │
│  │    reference from Combat.asmdef    │ │
│  └────────────────────────────────────┘ │
│                                         │
│  ┌─ Scripts (14 files) ──────────────┐  │
│  │  CombatManager.cs                 │  │
│  │  DamageCalculator.cs              │  │
│  │  AbilitySystem.cs                 │  │
│  │  ...                              │  │
│  └────────────────────────────────────┘ │
│                                         │
│  [Open Folder]  [Open Asmdef]  [Edit]   │
└─────────────────────────────────────────┘
```

### Health Badge Logic

| Status | Color | Condition |
|---|---|---|
| Healthy | Green ● | 0 violations, 0 warnings |
| Warning | Yellow ◐ | 0 violations, >0 warnings (e.g., GUID refs, missing policy entry) |
| Critical | Red ○ | >0 violations (illegal cross-sector dependency) |
| Unknown | Grey ◌ | No asmdef found / no policy configured |

---

## Sectors Without Asmdefs

### The question

Should Sectors work for projects without `.asmdef` files? (e.g., TypeScript, non-Unity)

### Recommendation: Yes — Sectors are the abstraction, asmdefs are one backend.

The `SectorConfig` already defines sectors purely through **folder path patterns** — it doesn't require asmdefs to exist. The current `SectorManager.detectSector()` uses glob matching on paths, not asmdef parsing.

This means we can have three tiers:

| Tier | Has asmdef? | Has policy? | What works |
|---|---|---|---|
| **Full** | Yes | Yes | Graph, violations, health, enforcement |
| **Mapped** | No | No | Sector detection by folder, visual map, AI context rules |
| **Empty** | No | No config | Nothing — prompt user to configure |

### How this works in practice

**Unity project with asmdefs (Tier: Full)**
- Sectors auto-detected from folder patterns AND validated against asmdefs
- Dependency graph built from asmdef references
- Violations enforced via policy
- Full health badges

**Unity project without asmdefs (Tier: Mapped)**
- Sectors detected from folder patterns only
- Dependency graph built from `SectorConfig.dependencies` (the ideological map)
- No enforcement — graph shows intended architecture, not actual
- Health badges show "Unknown" (grey) for enforcement
- Prompt: "Add asmdefs to enable boundary enforcement"

**TypeScript / other project (Tier: Mapped)**
- Sectors detected from folder patterns (user configures paths)
- Dependency graph from config only
- No enforcement (no asmdef equivalent)
- Still useful for: visual map, AI context injection, onboarding
- Future: could parse `tsconfig.json` references or `package.json` workspaces for enforcement

### UX for non-asmdef projects

The Sector Map still renders. It just shows the **intended** architecture (from config) rather than the **enforced** architecture (from asmdefs). A subtle banner explains the difference:

```
┌─────────────────────────────────────────────────┐
│  ℹ Showing intended architecture from config.   │
│  Add .asmdef files to enable enforcement.       │
└─────────────────────────────────────────────────┘
```

For TypeScript projects, the banner would say:

```
┌─────────────────────────────────────────────────┐
│  ℹ Showing architecture map from sectors.json.  │
│  Enforcement is not available for this project   │
│  type. Sector rules are applied to AI context.   │
└─────────────────────────────────────────────────┘
```

### Should we create a separate TypeScript station view?

**No.** The Station metaphor works for any project. The Sector system is already language-agnostic at the config level (`paths` are globs, `rules` are strings, `dependencies` are sector IDs). Only the enforcement layer (asmdef parsing) is Unity-specific.

The right approach:
- **One Station, one Sector Map** for any project
- **Enforcement backends** are pluggable: asmdef for Unity, potentially tsconfig/workspaces for TS in the future
- The visual map and AI context injection work everywhere

---

## Implementation Plan

### Phase 1 — Rename and restructure (UI only)

No backend changes. Just reorganize what exists.

1. Rename Station's asmdef section to **"Sectors"**
2. Make the dependency graph the **default landing view** when entering Station
3. Apply Station-first naming throughout:
   - "Load Asmdefs" → "Scan Sectors"
   - "Asmdef Policy" → "Sector Policy"
   - "Asmdef Graph" → "Sector Map"
   - Graph nodes show `sector.name` (ARMORY) with `asmdef.name` in small grey
4. Add health badge dots to graph nodes using existing validation data
5. Move utility buttons (Generate Policy, Normalize GUIDs, etc.) into a "Sector Settings" sub-panel — not the main view
6. Add summary bar at bottom: "Sectors: 12 | Boundaries: 18 | Violations: 2"

### Phase 2 — Sector cards and drill-down

1. Implement Sector Card component (as described above)
2. Click a graph node → opens Sector Card in detail panel
3. Card shows: sector info, allowed boundaries, violations, scripts list
4. Quick actions on card: Open Folder, Open Asmdef, Edit Policy
5. Back button returns to Sector Map

### Phase 3 — Health system

1. Compute health percentage per sector:
   - 100% = no violations, no warnings
   - Deduct per violation and warning
2. Color-code graph nodes by health (green → yellow → red gradient)
3. Add overall project health indicator in Station header
4. Show health trend over time (optional, stored in globalState)

### Phase 4 — Non-asmdef support

1. Detect project type on Station load (check for `.asmdef` files)
2. If no asmdefs: render Sector Map from `SectorConfig.dependencies` only
3. Show appropriate info banner
4. All AI context injection works regardless
5. Graph edges styled differently: solid for enforced (asmdef), dashed for intended (config-only)

### Phase 5 — Sector configuration UI

1. Allow users to create/edit sectors from the UI (currently code-only)
2. Import/export `sectors.json` (using existing `SectorManager.exportConfig()`)
3. Auto-detect sectors from folder structure (suggest sectors based on existing folders)
4. Template presets: RPG (current default), Platformer, Multiplayer, etc.

---

## Files Affected

| File | Change |
|---|---|
| `src/webview/panel/features/station.ts` | Restructure Station layout, rename labels |
| `src/webview/panel/features/asmdef.ts` | Rename to `sectors-ui.ts`, update rendering |
| `src/mastercode_port/ui/handlers/asmdef.ts` | Add new message types for drill-down |
| `src/verification/AsmdefGate.ts` | Add per-sector health computation |
| `src/sectors/SectorConfig.ts` | No changes needed (already well-designed) |
| `media/panel.css` | New styles for sector cards, health badges, graph nodes |
| `media/panel.js` | Update dashboard subtab references |
| `src/mastercode_port/ui/mainPanel.ts` | Update Station HTML template |

---

## Existing Code That Stays As-Is

The following are already well-implemented and need no changes:

- `SectorConfig.ts` — Sector interface, SectorManager, glob matching, dependency tracking
- `AsmdefGate.ts` — asmdef parsing, policy validation, violation detection, graph building
- `coordinatorClient.ts` — policy/inventory/graph sync
- `contextGatherer.ts` — assembly-aware AI context
- `station-map.json` — scene-to-sector mapping

The redesign is **purely presentation**. The backend is ready.

---

## Open Decisions

1. **Should the Sector Map replace the station room image navigation?**
   - Option A: Sector Map IS the station view (rooms are sectors)
   - Option B: Station rooms are the visual shell, Sector Map is a sub-tab
   - Recommendation: **Option B** for now — keep the visual station, add Sectors as a dedicated sub-tab that becomes the power-user view

2. **Should Sector cards be inline or overlay?**
   - Option A: Replace graph view with card (back button to return)
   - Option B: Split view — graph on left, card on right
   - Recommendation: **Option B** if screen space allows, **Option A** on narrow layouts

3. **Sector config location**
   - Currently: hardcoded `DEFAULT_RPG_SECTORS` in TypeScript
   - Proposed: `.spacecode/sectors.json` in the project root (version-controlled, editable)
   - The default RPG sectors become a template that generates the initial config
