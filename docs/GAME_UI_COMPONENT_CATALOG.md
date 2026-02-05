# Game UI Component Catalog & Implementation Pipeline

**Purpose**: Reference for building game UI via SpaceCode + Coplay MCP + NanoBanana
**Prerequisite**: Fill out the `UIUX_TEMPLATE` doc first (art direction, palette, typography)
**Status**: Design reference

---

## 1. Pipeline Overview

```
Step 1: Write UIUX doc (answer all template questions)
   ↓
Step 2: Define which components the game needs (from catalog below)
   ↓
Step 3: Define theme variables (colors, fonts, spacing)
   ↓
Step 4: Build in Unity via Coplay MCP with colored-box placeholders
   ↓
Step 5: Verify layout, flow, and interaction with placeholders
   ↓
Step 6: Generate final art via NanoBanana (spritesheets per component)
   ↓
Step 7: Swap placeholders → final sprites (theme-aware)
```

### Why Placeholders First

- Proves layout and interaction work before spending on art
- Colored boxes with labels are fast to build via MCP
- Easy to iterate on placement and sizing
- Art generation is expensive — only generate for validated layouts
- Spritesheets can be batch-generated once all dimensions are locked

---

## 2. Theme System

Every component references theme variables, not hardcoded values. Swapping themes = loading a different USS (Unity Style Sheet) file.

### Theme Variable Spec

```css
/* ── FILE: Assets/UI/Themes/DefaultTheme.uss ── */

:root {
  /* ── Brand Colors ── */
  --color-primary: #7C3AED;
  --color-primary-hover: #6D28D9;
  --color-primary-pressed: #5B21B6;
  --color-secondary: #1E293B;
  --color-accent: #F59E0B;

  /* ── Surface Colors ── */
  --color-bg: #0F172A;
  --color-surface: #1E293B;
  --color-surface-raised: #334155;
  --color-overlay: rgba(0, 0, 0, 0.6);

  /* ── Text Colors ── */
  --color-text: #F8FAFC;
  --color-text-secondary: #94A3B8;
  --color-text-disabled: #475569;
  --color-text-on-primary: #FFFFFF;

  /* ── Feedback Colors ── */
  --color-success: #22C55E;
  --color-danger: #EF4444;
  --color-warning: #F59E0B;
  --color-info: #3B82F6;

  /* ── Rarity Colors ── */
  --rarity-common: #9CA3AF;
  --rarity-uncommon: #22C55E;
  --rarity-rare: #3B82F6;
  --rarity-epic: #A855F7;
  --rarity-legendary: #F59E0B;
  --rarity-mythic: #EF4444;

  /* ── HP/MP/XP Bar Colors ── */
  --bar-hp: #EF4444;
  --bar-hp-bg: #7F1D1D;
  --bar-mp: #3B82F6;
  --bar-mp-bg: #1E3A5F;
  --bar-xp: #F59E0B;
  --bar-xp-bg: #78350F;
  --bar-stamina: #22C55E;
  --bar-stamina-bg: #14532D;

  /* ── Typography ── */
  --font-heading: resource('Fonts/HeadingFont');
  --font-body: resource('Fonts/BodyFont');
  --font-mono: resource('Fonts/MonoFont');
  --font-size-xs: 10px;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-xxl: 32px;
  --font-size-title: 48px;

  /* ── Spacing (8px grid) ── */
  --space-xxs: 2px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-xxl: 48px;

  /* ── Borders & Radius ── */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;
  --border-width: 1px;
  --border-width-thick: 2px;
  --border-color: #334155;
  --border-color-focus: var(--color-primary);

  /* ── Shadows (via background tint) ── */
  --shadow-color: rgba(0, 0, 0, 0.3);

  /* ── Animation Durations ── */
  --transition-fast: 100ms;
  --transition-normal: 200ms;
  --transition-slow: 400ms;

  /* ── Component Sizes ── */
  --button-height: 40px;
  --button-height-sm: 32px;
  --button-height-lg: 48px;
  --icon-size-sm: 16px;
  --icon-size-md: 24px;
  --icon-size-lg: 32px;
  --icon-size-xl: 48px;
  --avatar-size-sm: 32px;
  --avatar-size-md: 48px;
  --avatar-size-lg: 64px;
  --slot-size: 56px;
  --slot-size-lg: 72px;
}
```

### Theme Switching

```csharp
// ThemeManager.cs
public class ThemeManager : MonoBehaviour {
    [SerializeField] private ThemeStyleSheet[] themes;  // USS assets
    private int activeThemeIndex = 0;

    public void SetTheme(int index) {
        var root = GetComponent<UIDocument>().rootVisualElement;
        root.styleSheets.Remove(themes[activeThemeIndex]);
        root.styleSheets.Add(themes[index]);
        activeThemeIndex = index;
        PlayerPrefs.SetInt("theme", index);
    }
}
```

Users pick theme in Settings → "Theme" dropdown → loads corresponding USS.

---

## 3. Component Catalog

Mark each component with `[NEED]` or `[SKIP]` for your game during UIUX doc phase.

### 3.1 System Screens

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `SYS-001` | Splash screen | Studio logo + loading spinner | Full screen | Colored bg + text |
| `SYS-002` | Title screen | Game logo, Play / Options / Quit | Full screen, centered | Text buttons on bg |
| `SYS-003` | Loading screen | Progress bar + gameplay tips | Full screen overlay | Bar + text |
| `SYS-004` | Login panel | Email/password + social auth buttons | Center modal | Input fields + buttons |
| `SYS-005` | Server select | Server list with ping / status dot | Center panel | List rows |
| `SYS-006` | Settings panel | Tabs: Audio, Video, Controls, Language | Center modal | Tabbed panel |
| `SYS-007` | Credits scroll | Scrolling text | Full screen | ScrollView |
| `SYS-008` | Pause menu | Resume / Settings / Quit | Center modal overlay | Button stack |
| `SYS-009` | Game over screen | Score + retry / menu buttons | Full screen overlay | Text + buttons |

### 3.2 Main Menu / Lobby

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `MENU-001` | Top nav bar | Home / Play / Store / Profile tabs | Top edge | Horizontal button row |
| `MENU-002` | Bottom nav bar | 5 icon buttons (mobile style) | Bottom edge | Icon button row |
| `MENU-003` | Player card | Avatar + name + level + rank | Top-left header | Box + text |
| `MENU-004` | Currency display | Gold / gems / premium with icons | Top-right | Icon + number pairs |
| `MENU-005` | News banner carousel | Rotating event banners | Center-top | Colored rectangles |
| `MENU-006` | Daily rewards popup | Calendar grid + claim button | Center modal | Grid of boxes |
| `MENU-007` | Mail / inbox | Message list with read/unread dots | Side panel | List rows |
| `MENU-008` | Play button (CTA) | Large primary action | Center | Large button |
| `MENU-009` | Mode selector | PvP / PvE / Co-op tabs | Below play button | Tab row |

### 3.3 HUD (In-Game)

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `HUD-001` | HP bar | Health with current/max text | Top-left | Colored bar |
| `HUD-002` | MP / energy bar | Mana / stamina / energy | Below HP | Colored bar |
| `HUD-003` | XP bar | Progress to next level | Top or bottom edge | Thin bar |
| `HUD-004` | Minimap | Small overhead map view | Top-right corner | Gray square |
| `HUD-005` | Action bar / hotbar | 4-8 skill/item slots | Bottom-center | Slot row |
| `HUD-006` | Joystick (mobile) | Virtual analog stick | Bottom-left | Circle + inner circle |
| `HUD-007` | Attack button | Primary attack | Bottom-right | Large circle |
| `HUD-008` | Skill buttons | 2-4 ability buttons | Around attack button | Smaller circles |
| `HUD-009` | Timer / clock | Round timer or day/night | Top-center | Text |
| `HUD-010` | Wave tracker | "Wave 3/10" or objective | Top-center | Text + bar |
| `HUD-011` | Combo counter | Hit count + multiplier | Center, floating | Large number |
| `HUD-012` | Damage numbers | Floating text on hit | World-space | Text spawner |
| `HUD-013` | Boss HP bar | Large named bar | Top-center | Wide bar + name |
| `HUD-014` | Party frames | Ally HP bars (2-4) | Left edge | Small bar stack |
| `HUD-015` | Buff/debuff icons | Status effect icon row | Below HP bar | Small square row |
| `HUD-016` | Chat bubble | NPC/player speech | Above character | Rounded box |
| `HUD-017` | Interaction prompt | "Press E to interact" | Center-bottom | Text |
| `HUD-018` | Crosshair / cursor | Aim indicator | Screen center | Cross lines |

### 3.4 Inventory & Equipment

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `INV-001` | Grid inventory | NxM item slots | Center panel | Grid of squares |
| `INV-002` | Item tooltip | Name, stats, rarity, desc | Hover popup | Bordered box |
| `INV-003` | Equipment slots | Body part slots on silhouette | Left side of panel | Labeled squares |
| `INV-004` | Item comparison | Side-by-side stat diff (green/red) | Extended tooltip | Two-column box |
| `INV-005` | Drag-and-drop slot | Draggable item icon | Any slot | Square + icon |
| `INV-006` | Sort/filter bar | Type / rarity / level dropdowns | Above grid | Button row |
| `INV-007` | Quantity selector | Stack split slider | Small modal | Slider + number |
| `INV-008` | Rarity border | Color-coded frame per rarity | Around item slot | Colored border |
| `INV-009` | Item count badge | Stack size number | Bottom-right of slot | Small number |

### 3.5 Character & Stats

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `CHAR-001` | Character viewer | 3D/2D preview with rotation | Left side | Gray box |
| `CHAR-002` | Stat list | ATK/DEF/SPD/etc. rows | Right side | Label + value rows |
| `CHAR-003` | Skill tree | Node graph or grid | Full panel | Connected circles |
| `CHAR-004` | Level progress | Level number + XP bar | Header area | Number + bar |
| `CHAR-005` | Class/role badge | Icon + label | Below name | Icon + text |
| `CHAR-006` | Talent points | Available points counter | Above skill tree | Number badge |

### 3.6 Social

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `SOC-001` | Friends list | Online/offline with invite button | Side panel | List rows + dots |
| `SOC-002` | Chat window | Message log + input field | Bottom-left | ScrollView + input |
| `SOC-003` | Party panel | Member list with roles | Center panel | List rows |
| `SOC-004` | Guild panel | Guild name, members, rank | Center panel | Header + list |
| `SOC-005` | Leaderboard | Rank + name + score table | Center panel | Table rows |
| `SOC-006` | Player inspect | View other player's gear | Modal | Equipment view |
| `SOC-007` | Emote wheel | Radial menu (8 slots) | Center, on hold | Pie segments |
| `SOC-008` | Voice chat indicator | Speaking icon per player | Party frames | Small icon |

### 3.7 Store / Shop

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `SHOP-001` | Store tabs | Category row | Top of panel | Tab buttons |
| `SHOP-002` | Product card | Icon + name + price + buy | Grid item | Box with text |
| `SHOP-003` | Bundle display | Multi-item + discount badge | Featured card | Large box |
| `SHOP-004` | Purchase confirm | "Buy X for Y gold?" | Center modal | Dialog |
| `SHOP-005` | Currency convert | Premium-to-soft exchange | Small modal | Slider + numbers |
| `SHOP-006` | Sale badge | "50% OFF" overlay | Corner of product card | Rotated text |
| `SHOP-007` | Cart / checkout | Selected items + total | Side panel | List + total row |

### 3.8 Dialogs & Popups

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `DLG-001` | Confirmation dialog | Message + Yes/No | Center modal | Box + 2 buttons |
| `DLG-002` | Alert toast | Auto-dismiss notification | Top-center | Small bar |
| `DLG-003` | Reward popup | Item received + animation | Center overlay | Box + icon |
| `DLG-004` | Level up screen | Stat gains display | Full overlay | Big number + stat list |
| `DLG-005` | Tutorial tooltip | Arrow pointing to element | Near target | Box + arrow |
| `DLG-006` | Context menu | Right-click option list | At cursor | Vertical button list |
| `DLG-007` | Notification badge | Red dot with count | Corner of any icon | Circle + number |
| `DLG-008` | Achievement popup | Unlock banner | Top or side | Slide-in bar |

### 3.9 Map & Navigation

| ID | Component | Description | Placement | Placeholder |
|----|-----------|-------------|-----------|-------------|
| `MAP-001` | World map | Zones with unlock state | Full screen | Gray zones |
| `MAP-002` | Level select | Node path or grid | Full panel | Connected dots |
| `MAP-003` | Waypoint marker | On-screen edge indicator | Screen edge | Arrow |
| `MAP-004` | Quest tracker | Active quests + steps | Right edge | Text list |
| `MAP-005` | Objective marker | In-world indicator | World-space | Icon + distance |

### 3.10 Common Primitives

| ID | Component | Variants | Placeholder |
|----|-----------|----------|-------------|
| `PRM-001` | Button | primary, secondary, ghost, icon, danger | Colored rectangle |
| `PRM-002` | Toggle switch | on/off | Track + knob |
| `PRM-003` | Slider | horizontal, vertical | Track + handle |
| `PRM-004` | Dropdown | closed / expanded | Box + arrow |
| `PRM-005` | Text input | single line, password, search | Box + cursor |
| `PRM-006` | Checkbox | checked / unchecked | Square + checkmark |
| `PRM-007` | Radio group | 2-5 options | Circles |
| `PRM-008` | Tab bar | horizontal, vertical | Button row |
| `PRM-009` | Scroll view | vertical, horizontal | Content area + scrollbar |
| `PRM-010` | Progress bar | linear, circular | Fill bar |
| `PRM-011` | Badge / pill | count, label, status | Small rounded box |
| `PRM-012` | Divider | horizontal, vertical | Line |
| `PRM-013` | Avatar frame | circle + border (rarity-colored) | Circle |
| `PRM-014` | Tooltip | hover info | Small box |
| `PRM-015` | Modal backdrop | semi-transparent overlay | Dark overlay |
| `PRM-016` | Spinner / loader | rotating indicator | Rotating icon |
| `PRM-017` | Star rating | 1-5 stars | Star shapes |

---

## 4. Placeholder Specification

Each placeholder is a simple Unity UI Toolkit element with:
- Solid background color (from theme)
- White border (1px)
- Component ID label centered (e.g., "HUD-001: HP Bar")
- Correct dimensions matching final design
- Correct position on screen

### Placeholder Color Code

| Category | Placeholder Color | Purpose |
|----------|------------------|---------|
| System screens | `#334155` (slate) | Full-screen backgrounds |
| HUD elements | `#1E40AF` (blue) | Gameplay overlay |
| Inventory/equipment | `#7C3AED` (purple) | Item management |
| Social | `#059669` (green) | Multiplayer features |
| Store/shop | `#D97706` (amber) | Monetization |
| Dialogs/popups | `#DC2626` (red) | Alerts and modals |
| Primitives | `#6B7280` (gray) | Reusable elements |

### MCP Implementation

Build each placeholder via Coplay MCP:

```
SpaceCode → create_ui_element { type: "VisualElement", name: "HUD-001-HPBar", ... }
SpaceCode → set_rect_transform { name: "HUD-001-HPBar", x: 20, y: 20, width: 200, height: 24 }
SpaceCode → set_ui_layout { name: "HUD-001-HPBar", flexDirection: "row" }
SpaceCode → capture_ui_canvas → verify placement
```

---

## 5. NanoBanana Art Generation Pipeline

Once placeholders are verified:

### 5.1 Spritesheet Generation Order

1. **Primitives first** — buttons, sliders, toggles, input fields (used everywhere)
2. **HUD elements** — HP/MP bars, action bar slots, minimap frame
3. **Panels and frames** — inventory grid, character viewer, settings panel
4. **Icons** — buff/debuff, currency, rarity borders, navigation
5. **Screen-specific** — title screen, loading screen, store cards

### 5.2 Spritesheet Spec Per Component

Each component's spritesheet contains all its visual states:

```
Button spritesheet (PRM-001):
  ┌──────────┬──────────┬──────────┬──────────┐
  │  Normal   │  Hover   │ Pressed  │ Disabled │
  ├──────────┼──────────┼──────────┼──────────┤
  │ Primary  │ Primary  │ Primary  │ Primary  │
  ├──────────┼──────────┼──────────┼──────────┤
  │Secondary │Secondary │Secondary │Secondary │
  ├──────────┼──────────┼──────────┼──────────┤
  │  Ghost   │  Ghost   │  Ghost   │  Ghost   │
  ├──────────┼──────────┼──────────┼──────────┤
  │  Danger  │  Danger  │  Danger  │  Danger  │
  └──────────┴──────────┴──────────┴──────────┘
```

```
HP Bar spritesheet (HUD-001):
  ┌──────────────────────────────────────┐
  │  Background (empty bar)              │
  ├──────────────────────────────────────┤
  │  Fill (full bar)                     │
  ├──────────────────────────────────────┤
  │  Frame / border                      │
  ├──────────────────────────────────────┤
  │  Low HP variant (pulsing red)        │
  └──────────────────────────────────────┘
```

### 5.3 NanoBanana Prompt Template

For each component, generate with:

```
"[GAME_STYLE] UI [COMPONENT_NAME] spritesheet, [DIMENSIONS]px,
 states: [STATE_LIST], [THEME_DESCRIPTION], transparent background,
 pixel-perfect, game UI asset, flat design"
```

Example:
```
"Fantasy RPG UI button spritesheet, 160x40px per state,
 states: normal/hover/pressed/disabled, variants: primary(purple)/secondary(dark)/ghost(transparent)/danger(red),
 dark theme with gold accents, transparent background, pixel-perfect, game UI asset"
```

### 5.4 Asset Swap Process

```
1. NanoBanana generates spritesheet PNG
2. Import to Unity: Assets/UI/Sprites/[ComponentID]/
3. Slice spritesheet in Sprite Editor (set pivot, borders for 9-slice)
4. Update USS to reference new sprite:
     background-image: resource('UI/Sprites/PRM-001/button-primary-normal');
5. Verify in Unity (capture_ui_canvas via MCP)
6. Repeat for each component
```

---

## 6. Screen Flow Map

Define which screens contain which components:

```
SPLASH (SYS-001)
  ↓
TITLE (SYS-002)
  ↓
LOGIN (SYS-004) ──→ SERVER SELECT (SYS-005)
  ↓
MAIN MENU
  ├── MENU-001 (top nav)
  ├── MENU-003 (player card)
  ├── MENU-004 (currency)
  ├── MENU-005 (news banner)
  ├── MENU-008 (play button)
  │
  ├── [Play] → MODE SELECT (MENU-009) → LOADING (SYS-003) → GAMEPLAY
  │   └── HUD-001..018 (all HUD elements)
  │   └── PAUSE (SYS-008)
  │   └── GAME OVER (SYS-009)
  │
  ├── [Store] → SHOP-001..007
  ├── [Character] → CHAR-001..006 + INV-001..009
  ├── [Social] → SOC-001..008
  ├── [Map] → MAP-001..005
  ├── [Mail] → MENU-007
  ├── [Settings] → SYS-006
  └── [Daily] → MENU-006
```

---

## 7. Implementation Checklist

Use this when building via MCP:

### Phase A: Primitives
- [ ] PRM-001 through PRM-017 — all primitive components
- [ ] Theme USS file with all variables
- [ ] ThemeManager.cs for runtime theme switching

### Phase B: System Screens
- [ ] SYS-001 through SYS-009
- [ ] Screen flow transitions

### Phase C: Main Menu
- [ ] MENU-001 through MENU-009
- [ ] Navigation between sections

### Phase D: HUD
- [ ] HUD-001 through HUD-018
- [ ] Positioning for target resolution

### Phase E: Panels
- [ ] INV-001 through INV-009
- [ ] CHAR-001 through CHAR-006
- [ ] SOC-001 through SOC-008
- [ ] SHOP-001 through SHOP-007

### Phase F: Dialogs
- [ ] DLG-001 through DLG-008

### Phase G: Map
- [ ] MAP-001 through MAP-005

### Phase H: Art Replacement
- [ ] Generate spritesheets via NanoBanana (primitives first)
- [ ] Slice and import to Unity
- [ ] Update USS references
- [ ] Verify each component
- [ ] Second theme variant

---

*Last updated: 2026-02-04*
