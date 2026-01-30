# SpaceCode Station Art Prompts

## Overview

Space station UI for navigating Unity game codebases. Hierarchical navigation with infinite expandable scenes.

**UX Rules:**
- Few big hotspots per scene (3-6 max)
- Breadcrumb navigation to go back
- Searchable list/panel for quick jumps
- Each hotspot triggers real code actions (not just decoration)

---

## Navigation Hierarchy

```
Level 0: STATION EXTERIOR (station.png)
    │
    ├── 7 sector hotspots
    │
    └── Click sector → Level 1

Level 1: SECTOR INTERIORS (sector-*.png)
    │
    ├── 2-4 sub-area hotspots per sector
    │
    └── Click sub-area → Level 2

Level 2: TOOL SCENES (tool-*.png)
    │
    ├── Tool-specific interface
    ├── Triggers REAL code actions
    │
    └── Click action → Level 3 (optional)

Level 3: MICRO-SCENES (micro-*.png) [optional, as needed]
    │
    └── Specific workflows (Rename symbol, Extract interface, etc.)
```

---

## Level 2: Tool Scenes

| Tool Scene | Image | Triggered From | Real Action |
|------------|-------|----------------|-------------|
| **Wrench** | `tool-wrench.png` | Reactor Core → any | Refactor Flow + multi-step job |
| **Shield** | `tool-shield.png` | Guard Tower → Tests | Run Gates (scope/deps/dup/docs/tests) |
| **Scanner** | `tool-scanner.png` | Scanner Bay → Sensors | Build Context Pack (callers/refs + Unity usage) |
| **Radio** | `tool-radio.png` | Comm Array → Docs | DocSync check + open doc file to update |
| **Medkit** | `tool-medkit.png` | Guard Tower → Perf | Bugfix workflow |
| **Gear** | `tool-gear.png` | Command Bridge → Ship Computer | Coordinator settings |
| **Antenna** | `tool-antenna.png` | Scanner Bay → Sensors | Unity Bridge connection |
| **Crate** | `tool-crate.png` | Schema Vault → Data | DTO/Schema browser |
| **Terminal** | `tool-terminal.png` | Guard Tower → Build/CI | Build pipeline control |
| **Palette** | `tool-palette.png` | Scanner Bay → Rendering | Shader/material preview |

---

## Level 3: Micro-Scenes (Created As Needed)

| Micro-Scene | Image | Triggered From | Specific Action |
|-------------|-------|----------------|-----------------|
| Rename Symbol | `micro-rename.png` | Wrench | Rename across codebase |
| Extract Interface | `micro-extract-interface.png` | Wrench | Extract interface from class |
| Fix Asmdef Dep | `micro-fix-asmdef.png` | Shield | Fix assembly definition |
| Move to Layer | `micro-move-layer.png` | Wrench | Move class to correct layer |
| Generate DTO | `micro-generate-dto.png` | Crate | Generate DTO from schema |
| ... | ... | ... | Add as needed |

---

## Image Inventory

### Core Images (MVP)

| Level | Count | Images |
|-------|-------|--------|
| 0 | 1 | `station.png` |
| 1 | 7 | `sector-bridge.png`, `sector-core.png`, `sector-vault.png`, `sector-docking.png`, `sector-guard.png`, `sector-scanner.png`, `sector-comms.png` |
| 2 | ~10 | `tool-wrench.png`, `tool-shield.png`, `tool-scanner.png`, `tool-radio.png`, `tool-medkit.png`, etc. |
| 3 | ∞ | Created as needed for specific workflows |

**MVP Total: ~18 images** (1 + 7 + 10)
**Expandable: Infinite** (add Level 2/3 scenes as features grow)

---

## Sector Mapping (Final)

| Station Sector | Color Accent | Sub-areas (interior tabs) |
|----------------|--------------|---------------------------|
| **Command Bridge** | Purple | Cockpit (SpaceCode UX), Ship Computer (Coordinator) |
| **Reactor Core** | Cyan | Core, Gameplay, AI |
| **Schema Vault** | Green | Data (schemas/DTOs/contracts) |
| **Docking Ring** | Yellow/Black | Networking, Input, UI |
| **Guard Tower** | Red/Orange | Tests, Build/CI, Tools, Performance/Stability |
| **Scanner Bay** | Blue | Sensors (Unity Bridge), Assets (Prefabs/Scenes), Rendering, Audio/VFX |
| **Comm Array** | Yellow/Gold | Docs |

**Yard/Lab** → Global mode toggle (not a sector)

---

## Image List

| # | File | Type | Clickable Areas |
|---|------|------|-----------------|
| 1 | `station.png` | Exterior | 7 sector hotspots |
| 2 | `sector-bridge.png` | Interior | Cockpit, Ship Computer |
| 3 | `sector-core.png` | Interior | Core, Gameplay, AI |
| 4 | `sector-vault.png` | Interior | Data |
| 5 | `sector-docking.png` | Interior | Networking, Input, UI |
| 6 | `sector-guard.png` | Interior | Tests, Build/CI, Tools, Perf |
| 7 | `sector-scanner.png` | Interior | Sensors, Assets, Rendering, Audio/VFX |
| 8 | `sector-comms.png` | Interior | Docs |

---

## Style Guide (All Images)

```
STYLE REQUIREMENTS:
- Photorealistic 3D render, Unreal Engine 5 quality
- Ray-traced reflections and shadows
- Cinematic lighting
- 16:9 aspect ratio, 1920x1080 resolution
- NO TEXT, NO LABELS, NO WRITING (added via UI)

COLOR PALETTE:
- Hull: gunmetal gray (#3d4555), blue-gray panels (#2a3045)
- Command Bridge: purple (#8b5cf6) accent trim/lights
- Reactor Core: cyan (#00e5ff) and aquamarine (#7fffd4) glow
- Schema Vault: green (#22c55e) status lights/trim
- Guard Tower: red (#ef4444) and orange (#f97316) warning lights
- Scanner Bay: blue (#3b82f6) scanning beams/accents
- Comm Array: yellow (#eab308) and gold (#fbbf24) signal lights
- Docking Ring: yellow/black hazard striping

MATERIALS:
- Brushed titanium hull panels
- Reinforced glass with blue-cyan tint
- Weathered surfaces with micro-meteorite pitting
- Colored accents via LIGHTS and TRIM only, not full paint
```

---

## Image Prompts

### 1. Station Exterior

**File:** `media/station.png`

```
Photorealistic 3D render of a massive sci-fi space station floating in orbit. Isometric view at 35-degree angle, station facing toward the viewer. Cinematic lighting, ultra-realistic materials, Unreal Engine 5 quality, ray-traced reflections.

Station class: Orbital research/operations hub, approximately 500 meters across. Modular ring design with 7 distinct sections clearly visible and separated.

CRITICAL: NO TEXT, NO LABELS, NO WRITING anywhere on the image. All surfaces clean. Labels will be added via UI overlay.

STRUCTURE (7 distinct sectors, clearly separated, arranged around central ring):

1. COMMAND BRIDGE (top center, most prominent):
   Elevated hexagonal command tower with panoramic windows showing warm yellow interior light. Multiple small antenna arrays on roof. PURPLE accent trim around windows and edges, purple LED strips along structure. Glass elevator shaft connecting to ring below. This is the "head" of the station.

2. REACTOR CORE (dead center, below Command Bridge):
   Large cylindrical reactor housing with bright CYAN energy visible through reinforced glass panels. Pulsing cyan energy rings around the cylinder. Cyan energy conduits radiating outward to all sections like glowing veins. The glowing heart - most visually striking element.

3. SCHEMA VAULT (lower left, front-facing):
   Heavy fortified archive section with thick vault-like doors. Geometric secure storage pods visible. Armored walls, bank-vault aesthetic. GREEN status lights on doors and panels, subtle green trim on vault edges. Industrial, secure, heavy.

4. DOCKING RING (outer ring, wrapping around):
   Complete ring structure with multiple docking bays. One small shuttle currently docked. Airlocks with status lights. YELLOW/BLACK hazard striping on docking clamps and bay edges. Visible walkways connecting to inner sections.

5. GUARD TOWER (upper right, elevated, fortified):
   Armored observation post with sensor arrays and scanning equipment on top. Reinforced gray armor plating, small window slits. RED and ORANGE warning lights throughout, orange caution trim on edges. Overlooks entire station. Military/security aesthetic.

6. SCANNER BAY (left side, scientific dome):
   Spherical dome structure with large rotating radar dish on top. Telescope array pointing outward. BLUE scanning beam visible emanating from dome. Blue accent lighting on dome surface, blue trim. Scientific equipment, clean panels. Research station aesthetic.

7. COMM ARRAY (right side, antenna forest - CLEARLY SEPARATE FROM SCANNER):
   Tall tower section covered in communication antennas and satellite dishes of varying sizes pointing in different directions. At least 5-6 visible dishes. YELLOW and GOLD signal lights blinking on antenna tips, warm yellow accent lighting on tower structure. Dense antenna cluster - obviously the communication hub.

SECTOR COLOR ACCENTS (subtle trim and lights, NOT full paint):
- Command Bridge: Purple trim and accent lights
- Reactor Core: Cyan energy glow
- Schema Vault: Green status lights on doors, subtle green trim
- Guard Tower: Red/orange warning lights and caution trim
- Scanner Bay: Blue scanning beam, blue accent lighting on dome
- Comm Array: Yellow/gold signal lights on antenna tips
- Docking Ring: Yellow/black hazard striping

Colors should be SUBTLE - accent lighting and trim only, not full painted hull sections. Station should still look like a realistic unified metallic structure with color-coded highlights that help identify each sector.

CONNECTING ELEMENTS:
- Glass-enclosed walkways with cyan lighting connecting all sections
- Exposed conduit runs with cyan energy flowing from reactor to all sectors
- Maintenance catwalks with tiny railings for scale reference
- Solar panel arrays extending from docking ring
- Navigation lights (red port, green starboard) on extremities

BACKGROUND:
- Earth-like planet visible below (partial curve showing blue ocean, white clouds)
- Deep black space with stars of varying brightness
- Subtle blue nebula wisps in far distance

NO TEXT. NO LABELS. NO WRITING. CLEAN SURFACES ONLY.

Quality: Photorealistic CGI, movie-quality VFX, 8K textures, ray-traced global illumination. 16:9 aspect ratio, 1920x1080 resolution.
```

---

### 2. Command Bridge Interior

**File:** `media/sector-bridge.png`

**Sub-areas:** Cockpit (SpaceCode UX), Ship Computer (Coordinator)

```
Photorealistic 3D render of a spaceship command bridge interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Multi-level hexagonal command center with high ceiling and panoramic windows showing stars and planet below.

CRITICAL: NO TEXT, NO LABELS. Clean surfaces. 2 distinct clickable areas must be obvious.

LAYOUT (2 clickable sub-areas):

1. COCKPIT AREA (front, facing windows):
   Captain's chair on raised platform facing massive curved windows. Pilot/navigation consoles with holographic displays. Warm yellow glow from displays. Purple accent lighting on chair and console trim. This is the "SpaceCode UX" control area.

2. SHIP COMPUTER AREA (rear/side, server bank):
   Wall of server racks and computing equipment with blinking lights. Central holographic display showing system status. Cyan and purple glow from active systems. This is the "Coordinator" backend area.

DETAILS:
- Glass floor sections showing deck below
- Purple accent trim throughout (matching exterior)
- Warm yellow interior lighting from windows
- Status displays and holographic elements
- Metallic walls with panel details

BACKGROUND: Stars and planet curve visible through windows.

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### 3. Reactor Core Interior

**File:** `media/sector-core.png`

**Sub-areas:** Core, Gameplay, AI

```
Photorealistic 3D render of a space station reactor room interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Massive cylindrical chamber dominated by central reactor. Multiple levels with catwalks.

CRITICAL: NO TEXT, NO LABELS. 3 distinct clickable areas must be obvious.

LAYOUT (3 clickable sub-areas):

1. CORE AREA (center, the reactor itself):
   Massive glowing reactor cylinder with pulsing cyan energy rings. Containment field visible. Energy conduits feeding outward. This is the "Core" domain rules area - the heart.

2. GAMEPLAY AREA (left side, control stations):
   Engineering consoles with game system readouts. Multiple workstations with holographic displays showing stats, abilities, combat data. Cyan accent glow. This is where "Gameplay" systems are monitored.

3. AI AREA (right side, neural network visual):
   Bank of specialized computers with neural-network style displays. Flowing data visualizations. Pulsing lights suggesting active AI processing. Distinct from other areas. This is the "AI" systems area.

DETAILS:
- Intense cyan glow from reactor illuminating everything
- Metal grating floors over glowing conduits
- Steam/coolant vents
- Catwalk railings for scale
- Heat distortion effects near reactor

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### 4. Schema Vault Interior

**File:** `media/sector-vault.png`

**Sub-areas:** Data (schemas/DTOs/contracts)

```
Photorealistic 3D render of a secure data vault interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: High-security archive with reinforced walls, vault doors, and organized data storage.

CRITICAL: NO TEXT, NO LABELS. 1 main area but visually rich.

LAYOUT:

DATA VAULT (entire room):
   Rows of secure data containers with green status lights. Central holographic display showing schema/contract structures. Vault door visible (thick, heavy). Filing systems and organized storage pods. Green accent lighting throughout. Bank-vault aesthetic - secure, organized, precious data.

DETAILS:
- Thick reinforced walls
- Green status lights on storage units
- Holographic data visualization in center
- Clean, organized, clinical feel
- Security scanners near door

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### 5. Docking Ring Interior

**File:** `media/sector-docking.png`

**Sub-areas:** Networking, Input, UI

```
Photorealistic 3D render of a space station docking bay interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Wide docking bay with multiple connection ports, airlocks, and transit systems.

CRITICAL: NO TEXT, NO LABELS. 3 distinct clickable areas must be obvious.

LAYOUT (3 clickable sub-areas):

1. NETWORKING AREA (center, main docking port):
   Large airlock/docking collar with connection status lights. Data transfer cables and conduits. Shuttle nose visible through window. Yellow/black hazard stripes. This represents "Networking" - connections to outside.

2. INPUT AREA (left, control terminal):
   Docking control console with joysticks, buttons, input devices. Manual override controls. This represents "Input" - how commands come in.

3. UI AREA (right, display wall):
   Wall of status screens showing docking procedures, visual interfaces. Holographic wayfinding displays. This represents "UI" - visual presentation layer.

DETAILS:
- Yellow/black hazard striping throughout
- Airlock mechanisms visible
- Status lights (red/green)
- Industrial, functional aesthetic
- Cargo handling equipment

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### 6. Guard Tower Interior

**File:** `media/sector-guard.png`

**Sub-areas:** Tests, Build/CI, Tools, Performance/Stability

```
Photorealistic 3D render of a security monitoring room interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Fortified observation post with multiple monitoring stations and security systems.

CRITICAL: NO TEXT, NO LABELS. 4 distinct clickable areas must be obvious.

LAYOUT (4 clickable sub-areas):

1. TESTS AREA (front left, testing station):
   Console with pass/fail indicators (green checks, red X marks). Test execution controls. This is the "Tests" area.

2. BUILD/CI AREA (front right, pipeline display):
   Wall display showing build pipeline stages. Progress indicators, deployment status. Orange/yellow glow. This is "Build/CI" area.

3. TOOLS AREA (back left, equipment rack):
   Rack of diagnostic tools and utilities. Specialized equipment. This is "Tools" area.

4. PERFORMANCE AREA (back right, monitoring wall):
   Performance graphs, CPU/memory gauges, stability indicators. Red/orange warning lights for alerts. This is "Performance/Stability" area.

DETAILS:
- Red and orange warning lights throughout
- Reinforced armored walls
- Multiple monitoring screens
- Alert systems and alarms
- Security aesthetic

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### 7. Scanner Bay Interior

**File:** `media/sector-scanner.png`

**Sub-areas:** Sensors (Unity Bridge), Assets (Prefabs/Scenes), Rendering, Audio/VFX

```
Photorealistic 3D render of a science/scanner station interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Domed scientific facility with scanning equipment and analysis stations.

CRITICAL: NO TEXT, NO LABELS. 4 distinct clickable areas must be obvious.

LAYOUT (4 clickable sub-areas):

1. SENSORS AREA (center, main scanner):
   Large rotating scanner dish mechanism. Connection to Unity/MCP visualized. Blue scanning beam. This is "Sensors (Unity Bridge)" area.

2. ASSETS AREA (left, prefab display):
   Holographic display showing 3D asset previews, prefab structures, scene layouts. Asset library visualization. This is "Assets (Prefabs/Scenes)" area.

3. RENDERING AREA (right, shader preview):
   Display showing material/shader previews. URP pipeline visualization. Visual quality controls. This is "Rendering (URP/Shaders)" area.

4. AUDIO/VFX AREA (back, waveform displays):
   Audio waveform visualizers. VFX particle preview screens. Sound and effects monitoring. This is "Audio/VFX" area.

DETAILS:
- Blue accent lighting throughout
- Dome ceiling with observation port
- Scientific equipment
- Clean, research aesthetic
- Holographic displays

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### 8. Comm Array Interior

**File:** `media/sector-comms.png`

**Sub-areas:** Docs

```
Photorealistic 3D render of a communications center interior. Isometric cutaway view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Communication hub with antenna controls, documentation library, and information systems.

CRITICAL: NO TEXT, NO LABELS. 1 main area but visually rich.

LAYOUT:

DOCS AREA (entire room):
   Central holographic display showing document structure/hierarchy. Library-like shelves with data tablets/books. Antenna control console. Information retrieval system. Yellow/gold accent lighting from signal equipment. This is the documentation and knowledge center.

DETAILS:
- Yellow/gold accent lighting
- Antenna feed cables from ceiling
- Library/archive aesthetic combined with tech
- Communication equipment
- Signal strength displays

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

## Hotspot Configuration

Once images are finalized, define clickable regions:

```typescript
// station.png hotspots (percentages of image)
export const STATION_HOTSPOTS = [
  { id: 'bridge', label: 'Command Bridge', color: '#8b5cf6' },
  { id: 'core', label: 'Reactor Core', color: '#00e5ff' },
  { id: 'vault', label: 'Schema Vault', color: '#22c55e' },
  { id: 'docking', label: 'Docking Ring', color: '#eab308' },
  { id: 'guard', label: 'Guard Tower', color: '#ef4444' },
  { id: 'scanner', label: 'Scanner Bay', color: '#3b82f6' },
  { id: 'comms', label: 'Comm Array', color: '#fbbf24' },
];

// Interior sub-area mapping
export const SECTOR_SUBAREAS = {
  bridge: ['cockpit', 'ship-computer'],
  core: ['core', 'gameplay', 'ai'],
  vault: ['data'],
  docking: ['networking', 'input', 'ui'],
  guard: ['tests', 'build-ci', 'tools', 'performance'],
  scanner: ['sensors', 'assets', 'rendering', 'audio-vfx'],
  comms: ['docs'],
};
```

---

## Generation Order

1. Generate `station.png` first - nail the exterior
2. Generate interiors one by one, matching style
3. Adjust hotspot coordinates after images are finalized
4. Test clickable areas in UI

---

## Level 2: Tool Scene Prompts

### Tool: Wrench (Refactor Flow)

**File:** `media/tool-wrench.png`

**Triggered from:** Any sector → Refactor action
**Real action:** Opens Refactor Flow + creates multi-step job

```
Photorealistic 3D render of a spacecraft workshop/engineering bay. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Compact engineering workshop with tools, workbenches, and holographic displays showing refactoring steps.

CRITICAL: NO TEXT, NO LABELS. 3-4 clickable action areas.

LAYOUT:
- CENTER: Holographic display showing a multi-step workflow pipeline (boxes connected by arrows, like a flowchart)
- LEFT: Workbench with precision tools, wrenches, diagnostic equipment
- RIGHT: Parts storage with modular components (representing code modules)
- BACK: Large mechanical arm or manipulator (representing automated refactoring)

COLOR: Orange/copper accent lighting (workshop feel)

DETAILS:
- Workflow pipeline is the focal point
- Tools suggest precision work
- Modular parts suggest component-based changes

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### Tool: Shield (Gates/RuleGuard)

**File:** `media/tool-shield.png`

**Triggered from:** Guard Tower → Tests
**Real action:** Run Gates (scope/deps/dup/docs/tests)

```
Photorealistic 3D render of a security checkpoint room. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Gate control room with multiple validation checkpoints and shield generators.

CRITICAL: NO TEXT, NO LABELS. 4-5 clickable gate areas.

LAYOUT:
- CENTER: Row of gate archways with scanning beams (green=pass, red=fail, yellow=warning)
- LEFT: "Scope Gate" - smaller checkpoint with boundary visualization
- CENTER-LEFT: "Deps Gate" - dependency validation scanner
- CENTER-RIGHT: "Dup Gate" - duplicate detection scanner
- RIGHT: "Docs Gate" - documentation validation
- FAR RIGHT: "Tests Gate" - test runner checkpoint

COLOR: Red/orange warning lights, green pass indicators

DETAILS:
- Each gate is visually distinct
- Shield energy effects
- Status indicators on each gate
- Security/validation aesthetic

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### Tool: Scanner (Indexer/ContextBrief)

**File:** `media/tool-scanner.png`

**Triggered from:** Scanner Bay → Sensors
**Real action:** Build Context Pack (symbol callers/refs + Unity asset usage)

```
Photorealistic 3D render of a deep-scan analysis chamber. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Scanning chamber with central holographic display showing code structure analysis.

CRITICAL: NO TEXT, NO LABELS. 3-4 clickable scan areas.

LAYOUT:
- CENTER: Large holographic sphere showing interconnected nodes (dependency graph visualization)
- LEFT: Symbol scanner station (find callers/references)
- RIGHT: Asset scanner station (Unity prefab/scene usage)
- BACK: Deep-scan array (intensive analysis equipment)

COLOR: Blue scanning beams, cyan holographic displays

DETAILS:
- Rotating holographic dependency graph is focal point
- Scanning beams emanating from equipment
- Data flowing into central display
- Scientific/analysis aesthetic

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### Tool: Radio (Docs/Reporter)

**File:** `media/tool-radio.png`

**Triggered from:** Comm Array → Docs
**Real action:** DocSync check + open exact doc file to update

```
Photorealistic 3D render of a communications/documentation center. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Radio room combined with library/archive for documentation management.

CRITICAL: NO TEXT, NO LABELS. 3-4 clickable areas.

LAYOUT:
- CENTER: Communication console with document sync status display
- LEFT: Library shelves with data tablets (documentation archive)
- RIGHT: Transmission equipment (reporter/output systems)
- BACK: Large antenna feed connection to ceiling

COLOR: Yellow/gold signal lights, warm amber displays

DETAILS:
- Document status indicators (synced/stale/missing)
- Library aesthetic combined with radio equipment
- Signal transmission visualization
- Knowledge management feel

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### Tool: Medkit (Bugfix Workflow)

**File:** `media/tool-medkit.png`

**Triggered from:** Guard Tower → Performance/Stability
**Real action:** Bugfix workflow, diagnostics, performance healing

```
Photorealistic 3D render of a spacecraft medical/repair bay. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Medical bay styled as a code "healing" center for bugfixes and performance issues.

CRITICAL: NO TEXT, NO LABELS. 3-4 clickable areas.

LAYOUT:
- CENTER: Diagnostic bed/table with holographic display showing "patient" (code health)
- LEFT: Medicine cabinet with "remedies" (fix patterns, patches)
- RIGHT: Vital signs monitor (performance metrics, memory, CPU)
- BACK: Emergency equipment (crash recovery, rollback tools)

COLOR: White/green medical lighting, red emergency indicators

DETAILS:
- Health/healing metaphor for bugfixes
- Diagnostic displays showing issues
- Treatment tools available
- Clean, clinical aesthetic

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### Tool: Terminal (Build/CI Pipeline)

**File:** `media/tool-terminal.png`

**Triggered from:** Guard Tower → Build/CI
**Real action:** Build pipeline control, deployment

```
Photorealistic 3D render of a mission control / launch center. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Launch control room for build pipelines and deployments.

CRITICAL: NO TEXT, NO LABELS. 3-4 clickable areas.

LAYOUT:
- CENTER: Large status board showing pipeline stages (Build → Test → Deploy)
- LEFT: Build trigger console with launch controls
- RIGHT: Deployment bay with "rocket" or "shuttle" ready to launch
- BACK: Log/output display wall

COLOR: Orange launch lights, green ready indicators, yellow caution

DETAILS:
- Pipeline visualization is focal point
- Launch/deployment metaphor
- Stage progression visible
- Mission control aesthetic

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

### Tool: Crate (DTO/Schema Browser)

**File:** `media/tool-crate.png`

**Triggered from:** Schema Vault → Data
**Real action:** Browse and manage DTOs, schemas, contracts

```
Photorealistic 3D render of a secure cargo manifest room. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: Cargo inventory control for managing data schemas and contracts.

CRITICAL: NO TEXT, NO LABELS. 3-4 clickable areas.

LAYOUT:
- CENTER: Holographic inventory display showing schema hierarchy
- LEFT: Crate storage with labeled containers (DTO types)
- RIGHT: Inspection station for examining schema contents
- BACK: Shipping/export area (schema versioning, migrations)

COLOR: Green status lights, industrial yellow accents

DETAILS:
- Organized cargo/inventory feel
- Schema hierarchy visualization
- Version tracking displays
- Secure, organized aesthetic

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

## Adding New Scenes

When adding new Level 2 or Level 3 scenes:

1. **Define the trigger:** Which hotspot leads here?
2. **Define the real action:** What code does this execute?
3. **Design 3-6 clickable areas** within the scene
4. **Create prompt** following the style guide
5. **Add to this document**
6. **Generate image**
7. **Define hotspots in code**

### Prompt Template for New Scenes

```
Photorealistic 3D render of a [ROOM TYPE]. Isometric view at 35-degree angle. Cinematic lighting, Unreal Engine 5 quality.

Room: [DESCRIPTION OF SPACE AND PURPOSE]

CRITICAL: NO TEXT, NO LABELS. [N] clickable areas.

LAYOUT:
- CENTER: [MAIN FOCAL ELEMENT]
- LEFT: [LEFT AREA AND PURPOSE]
- RIGHT: [RIGHT AREA AND PURPOSE]
- BACK: [BACK AREA AND PURPOSE]

COLOR: [ACCENT COLORS] matching sector theme

DETAILS:
- [KEY VISUAL ELEMENTS]
- [METAPHOR CONNECTIONS]
- [AESTHETIC STYLE]

NO TEXT. NO LABELS. 16:9, 1920x1080.
```

---

## Navigation Implementation

```typescript
// Breadcrumb state
interface NavigationState {
  level: 0 | 1 | 2 | 3;
  path: string[];  // e.g., ['station', 'guard', 'shield', 'deps-gate']
  currentImage: string;
  hotspots: Hotspot[];
}

// Example navigation flow
const exampleFlow = [
  { level: 0, image: 'station.png', label: 'Station' },
  { level: 1, image: 'sector-guard.png', label: 'Guard Tower' },
  { level: 2, image: 'tool-shield.png', label: 'Gates' },
  { level: 3, image: 'micro-fix-asmdef.png', label: 'Fix Asmdef' },
];

// Breadcrumb display: Station > Guard Tower > Gates > Fix Asmdef
// Click any breadcrumb to jump back to that level
```

---

*Last updated: 2026-01-30*
