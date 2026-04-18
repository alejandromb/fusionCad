# fusionCad Session Log

**Priorities, bugs, and project context have moved to `.claude/CLAUDE.md` — the single source of truth.**

This file is now a session log archive only.

---

## Session 29 — 2026-03-24: Schematic Features, Metric Migration, Session Tooling

**Duration**: Full session (marathon)
**Focus**: Complete all 6 Next Up items, contact pin numbering, terminal symmetry fix, metric coordinate migration, session skill consolidation

### Completed — Schematic Features (all 6 Next Up items)
- **No-connect flags** — `no-connect-flag` symbol, ERC suppression (checkUnconnectedPins + checkMissingParts skip NC devices), BOM exclusion, 4 unit tests
- **Cross-references (coil ↔ contact)** — Wired existing engine into renderer, auto-computes "/2, /3" text next to multi-sheet devices, 6 unit tests
- **Wire numbers (rung-based)** — Rewrote autoAssignWireNumbers with rung-based numbering, power nets keep names, renderer auto-computes, 5 unit tests
- **Symbol editor resize bounding box** — 8 handles (corners + edges), orange styling, drag to resize width/height
- **NEMA symbol accuracy** — 5 new ANSI symbols: Push Button NO/NC, Pilot Light, Timer TON/TOF
- **Drag vs Move keys** — G = grab with wires, M = move detach, Shift+G = snap toggle

### Completed — Contact Pin Numbering (P0)
- `Device.pinAliases` field in core-model
- `drawSymbol`/`drawPins`/`drawTransformedPins` use pinAliases for display
- `relay-pin-config.ts` utility (NO: 13-14, NC: 11-12, etc.)
- Renderer passes device.pinAliases through to symbol rendering

### Completed — Terminal Hexagon Fix
- All 3 terminal symbols (single, ground, fuse) converted to mathematically regular hexagons
- Verified side lengths equal (≤0.2% error from decimal rounding)
- Removed dual/triple terminal symbols — multi-level uses linked single-terminal devices
- Updated both builtin-symbols.json AND terminal-symbols.ts
- Pushed updates to DB via API PUT

### Completed — Metric Migration (Infrastructure)
- `units.ts` in core-model: M=2.5mm, GRID_MM=5, MM_TO_PX=4, SHEET_SIZES_MM, DEFAULT_LADDER_MM, SYMBOL_SIZES_MM, LAYOUT_MM
- Renderer: `mmScale = viewport.scale * MM_TO_PX` baked into canvas transform
- Grid, hit detection, font sizes, pin offsets all converted to mm
- Ladder renderer: all offsets and fonts in mm
- Sheet sizes: direct mm values (no more 96 DPI conversion)
- PDF export: uses mm sheet sizes directly
- MCP server + templates: grid and placement constants in mm

### Completed — Session Tooling
- Consolidated CLAUDE.md as single source of truth (removed STATUS.md as priority source)
- Updated all 4 session skills (session-start, session-end, session-update, update-status) to read CLAUDE.md only

### Key Decisions
- Coordinate system is now millimeters, not pixels. MM_TO_PX=4 at render boundary.
- IEC 60617 module M=2.5mm as base unit. Grid=2M=5mm. Pin pitch=5mm.
- Terminal symbols stay as hexagons (fusionCad signature), not IEC circles
- SVG/DXF as import formats for manufacturer symbols (SVG preferred, DXF backup)
- Manufacturer CAD downloads are panel layout symbols, NOT schematic — schematic symbols come from datasheets or EPLAN macro libraries

**Tests**: 154 E2E + 75 unit (15 new), 86 symbols (6 new)

---

## Session 28 — 2026-03-23: Architecture Hardening, Complete Project, Print/PDF, Manual Editing

**Duration**: Full session (marathon)
**Focus**: Architecture fixes, 4-sheet project, print/PDF, manual editing UX, NEMA symbols, verification discipline

### Architecture Hardening
- **Symbol format normalization** — API PUT normalizes to converted format. ONE format everywhere.
- **Shared ladder template builder** (`buildLadderSheet`) — eliminated 53 lines of duplication
- **Junction tag safety** — block-scoped tags (`JL_{blockId}_N`) replace fragile prefix hack
- **Waypoint semantics documented** — three-state semantic on Connection type
- **Pin safety in createLadderRails** — skip devices without standard pin 1/2
- **VERIFICATION rules added to CLAUDE.md** — never assume, always check. Tools table for verification.
- **5 new unit tests** — multi-rung rails, empty rungs, re-call safety, waypoints

### New Features
- **KiCad-style drag with wires** — dragging a device rubber-bands connected wires
- **Net Label symbol** — connect distant wires by name (rectangular flag)
- **Power symbols** — +VDC (upward arrow) and Ground (three lines)
- **generatePLCRelaySheet** — Micro870 PLC + 10 relay coils + 2 inputs
- **generateLoadCircuitSheet** — relay contacts → load terminals
- **Print capability** — dedicated Print icon, print theme (white/black), multi-sheet
- **PDF multi-page export** — all sheets in one PDF with print theme
- **Render audit system** — wire paths, device bounds, overlaps, unconnected devices
- **Arc tool in symbol editor** — click center, drag radius
- **Select All + Center All** in symbol editor
- **NEMA/ANSI as default** symbol palette tab
- **ANSI NO/NC contacts redesigned** — proper NEMA style
- **Smarter orthogonal routing** — direction based on axis delta
- **Rung descriptions** — brighter, word-wrapped
- **Junction dots fixed** — removed hardcoded green, now discrete dots matching wire color

### Complete 4-Sheet Project
- Sheet 1: Power Distribution (120VAC → 24VDC, source/destination arrows wired)
- Sheet 2: PLC & Relay Outputs (Micro870 DO0-DO9 → CR1-CR10, DI0-DI1 inputs)
- Sheet 3: Load Circuits 1-5 (CR1-1 to CR5-1 contacts → load terminals)
- Sheet 4: Load Circuits 6-10 (CR6-1 to CR10-1 contacts → load terminals)

### KiCad Research
- 12 features identified (drag vs move ✅, net labels ✅, power symbols ✅, no-connect flags, etc.)

### Key Lessons
- **Never declare done without verification** — junction green bug, Vite HMR unreliable
- **Check at the right layer** — theme vs primitive vs DB vs rendered output
- **Hardcoded values override themes** — always check symbol primitives too

**Tests**: 154 E2E + 60 unit tests, 80 built-in symbols

---

## Session 27 — 2026-03-22/23: Schematic Quality, Wire UX, Symbol Editor

**Duration**: Full session (marathon)
**Focus**: Building real 10-relay control panel project, fixing rendering quality, wire routing UX, symbol editor

### Completed
- **Wire branching from existing wires** — KiCad-inspired: click wire → split at point → junction as wireStart → click device pin. Based on research of KiCad's BreakSegment approach.
- **Auto-router bypass for manual wires** — Manually-drawn wires get empty waypoints, bypassing the auto-router entirely. Prevents the router from fighting user placement.
- **Schematic rendering cleanup** — Single wire color (no rainbow), no auto-generated wire labels, smaller pin dots/labels, smaller wire endpoints.
- **Device function text rendering** — Shows device function above tags (e.g., "PS1 Breaker", "OUTPUT 1").
- **Title block population** — Templates auto-populate title, dwg#, revision, date, drawnBy.
- **Empty rung junction elimination** — Spacer rungs no longer create unnecessary junction dots.
- **ANSI coil orientation fix** — Horizontal symbols (pins left/right) skip -90° rotation in ladder layout.
- **Selection box rotation** — Dashed selection highlight now rotates with the device.
- **Symbol loading fix** — API symbols in raw format converted properly via loadSingleSymbol().
- **getLayoutReport() dev tool** — Structured render feedback via state bridge for data-driven iteration.
- **generateRelayOutputSheet MCP tool** — Complete relay coil sheets with wiring.
- **13 symbol editor E2E tests** — Open/close, draw tools, pins, undo/redo, save/load, validation.
- **ANSI thermal-magnetic CB symbol** — New symbol with arc + double circles.
- **createWire() waypoints parameter** — Proper API for straight-line wire routing.

### Discovered Issues
- **Vite HMR unreliable for renderer modules** — Changes to circuit-renderer.ts and symbols.ts often require full Vite restart.
- **Symbol editor save doesn't persist changes** — User reported edits not saving. Needs investigation.
- **Symbol editor missing features** — No undo (partially works), no resize bounding box, no arc tool in editor.
- **Auto-router still affects template-generated wires** — Wires without explicit waypoints still get routed.

### Architecture Decisions
- **Empty waypoints `[]` = user-drawn wire** — Bypasses auto-router, uses toOrthogonalPath instead.
- **connectToWire() accepts optional startPin** — null = split only (no branch wire), returns junction ID.
- **Horizontal symbols skip rotation** — Symbols with pins facing left/right don't get -90° rotation in ladder.

**Tests**: 148 E2E + 7 blueprint unit tests, all passing

---

## Session 31 — 2026-03-25: Rung Numbers, Layout Toggle, Print/PDF Fixes

**Duration**: ~3 hours
**Focus**: Visible rung numbering on ladder diagrams, per-sheet layout control, print/export mm migration fixes

### Completed
- Rung numbers render on ladder sheets even with no devices (rungCount config, default 18)
- New projects auto-create Sheet 1 with a ladder block
- Fixed render order: title block was painting over ladder overlay
- Full-page ladder layout (L1=20mm, L2=395mm fills Tabloid)
- Layout dropdown in sidebar: "Ladder (1 col)", "Ladder (2 col)", "Plain"
- Simplified ladder overlay to just rung numbers + guide lines (no rail lines/labels)
- Fixed print/PDF canvas sizing for mm coordinates (MM_TO_PX factor was missing)
- Print theme now only overrides colors, inherits mm-based sizes from screen theme
- Removed dashed guide lines from print output
- Fixed symbol preview stroke widths (2→0.5 for mm-based symbols)
- Fixed ANSI coil symbol (removed spurious arcs inside circle)

### Key Decisions
- Ladder overlay = just rung numbers, no vertical rail lines (user preference — rails aren't real wires)
- Print theme inherits sizes from base theme, only overrides colors (avoids px/mm mismatch)
- Layout is a smart block object per sheet, not a simple flag (supports future wiring integration)

**Tests**: 154 E2E + 75 unit, 86 symbols

---

## Session 26 — 2026-03-20: Multi-Select Copy/Paste, Alignment, Ghost Paste, Rung Enumeration

**Duration**: Full session
**Focus**: P1 copy/paste fix, alignment tools, paste UX, rung numbering schemes

### Completed
- **Multi-select copy/paste (P1 fix)** — Clipboard now stores all selected devices, parts, connections, and transforms. Paste remaps IDs, tags, connection references, and waypoints. Duplicate (Cmd+D) also handles multi-device with wires.
- **Ghost paste preview** — Cmd+V enters preview mode with semi-transparent ghosts following cursor. Click to commit, Escape to cancel. Context menu paste remains instant.
- **Alignment tools** — 6 directions (left, center-x, right, top, center-y, bottom) in Draw toolbar and device context menu. Appear when 2+ devices selected. Grid-snapped, undo-supported.
- **Hit detection fix** — Inset capped at 25% of symbol size so small symbols remain clickable at low zoom levels.
- **Transform copy** — Device rotation/mirror preserved during paste and duplicate.
- **Rung enumeration** — Three numbering schemes: sequential (default), page-based (100,101... per page), page-tens (100,110,120...). `firstRungNumber` override. Right-side page-qualified labels ("3 25" format). Fixed critical bug where `rung.number` was used for Y positioning instead of sequential index — caused rungs numbered 100+ to render off-screen.
- **6 new E2E tests** — Multi-device copy, duplicate, wire preservation, 3 alignment tests. 135 total, all passing.

### Discovered Issues
- **Rung Y positioning bug** — `rung.number` was used in `firstRungY + (rung.number - 1) * rungSpacing` across 4 files. When rungs had display numbers like 100, devices rendered at Y=11,980px. Fixed to use sequential index instead.

### Files Created
- `e2e/tests/multi-copy-paste.spec.ts` — 6 E2E tests

### Files Modified
- `apps/web/src/hooks/useClipboard.ts` — Multi-device clipboard, transform copy
- `apps/web/src/hooks/useCircuitState.ts` — `alignSelectedDevices()` function
- `apps/web/src/hooks/useCanvasInteraction.ts` — Paste preview mode, mouse tracking
- `apps/web/src/renderer/circuit-renderer.ts` — Ghost paste rendering, sheetNumber pass-through
- `apps/web/src/renderer/ladder-renderer.ts` — Numbering schemes, index-based Y positioning
- `apps/web/src/components/Canvas.tsx` — ghostPaste prop, alignment context menu
- `apps/web/src/components/MenuBar.tsx` — Alignment toolbar buttons + icons
- `apps/web/src/App.tsx` — ghostPaste memo, alignment wiring
- `apps/web/src/types.ts` — Hit detection inset cap
- `packages/core-engine/src/ladder-layout.ts` — Index-based rung Y positioning
- `packages/mcp-server/src/circuit-helpers.ts` — Index-based rung Y positioning
- `packages/mcp-server/src/server.ts` — `numberingScheme`, `firstRungNumber` in MCP schema
- `apps/api/src/ai-generate.ts` — Index-based rung Y positioning
- `e2e/tests/copy-paste.spec.ts` — Updated for paste preview flow

**Tests**: 135 E2E + 7 blueprint unit tests, all passing

---

## Session 25 — 2026-03-20: Blueprint Architecture + Manual Editing Fixes

**Duration**: Full session
**Focus**: Declarative blueprint system, layout fixes, wire selection improvements

### Completed
- **Blueprint Architecture (new)** — Declarative JSON template system replacing imperative generation functions
  - Type definitions: `packages/core-model/src/blueprint/types.ts`
  - Engine: `apps/api/src/blueprint/engine.ts` — `instantiateBlueprint()` orchestrates existing primitives
  - Registry: `apps/api/src/blueprint/registry.ts` — loads built-in blueprints
  - 3 built-in blueprints: `relay-output`, `relay-bank` (composes relay-output × N), `power-section`
  - AI chat tool: `instantiate_blueprint` — primary circuit generation tool
  - 7 unit tests (template resolution, relay-output, power-section, relay-bank composition)
- **Multi-rung PLC layout** — `auto_layout_ladder` handles PLC modules spanning multiple rungs: centered vertically, stays upright (no -90° rotation)
- **AI prompt TOOL SELECTION** — Prioritizes `instantiate_blueprint` > legacy tools > manual placement
- **Terminal rotation hack removed** — Deleted 180° rotation on return/field terminals + dead `setTransform` function
- **Wire selection priority** — Wire wins over device when click is within 4px of wire path. Junction exception (always prefer junction). Applied to left-click and right-click.
- **Device hit box inset** — 10px inset shrinks device bounding boxes to exclude pin stub areas
- **Screen-space constant hit radii** — All thresholds divided by `viewport.scale` for consistent feel at any zoom
- **New `getWireHitWithDistance()`** — Returns wire index + distance for priority-based selection

### Discovered Issues
- **P1: Multi-select copy/paste broken** — Selecting 4 devices + Cmd+C/V copies only 1, no wires. Blocks manual editing workflow.
- **P1: Contact pin numbering** — Relay contacts show generic "1"/"2" instead of real pins (13-14, 21-22). Need editable pin IDs + part-aware auto-population.
- **Reference: gstack** — Garry Tan's Claude Code parallel sprint framework. Install alongside project for `/qa`, `/review`, `/ship` skills + Conductor multi-agent workflow.

### Files Created
- `packages/core-model/src/blueprint/types.ts` — Blueprint type system
- `packages/core-model/src/blueprint/builtins/relay-output.json` — Relay output template
- `packages/core-model/src/blueprint/builtins/relay-bank.json` — Composable relay bank
- `packages/core-model/src/blueprint/builtins/power-section.json` — Power supply template
- `apps/api/src/blueprint/engine.ts` — Blueprint instantiation engine
- `apps/api/src/blueprint/registry.ts` — Blueprint registry
- `apps/api/src/blueprint/engine.test.ts` — 7 unit tests
- `apps/api/vitest.config.ts` — Vitest config for API package

### Files Modified
- `apps/api/src/ai-chat.ts` — `instantiate_blueprint` tool, system prompt, multi-rung transform fix
- `apps/api/src/ai-circuit-patterns.ts` — Removed terminal rotation hack + dead code
- `apps/api/src/ai-generate.ts` — Multi-rung transform fix
- `apps/web/src/hooks/useCanvasInteraction.ts` — Wire selection priority, screen-space hit radii
- `apps/web/src/renderer/circuit-renderer.ts` — `getWireHitWithDistance()`
- `apps/web/src/types.ts` — Device hit box inset, viewport-scaled pin/symbol detection
- `packages/core-engine/src/ladder-layout.ts` — Multi-rung device detection + positioning
- `packages/core-model/src/index.ts` — Blueprint type exports
- `packages/mcp-server/src/circuit-helpers.ts` — Multi-rung transform skip

**Tests**: 129 E2E + 7 blueprint unit tests, all passing

---

## Session 24 — 2026-03-19: Wiring Architecture Deep Dive

**Duration**: Full session
**Focus**: Wire integrity, bus connections, T-junctions, source/destination arrows

### Completed
- **Wire sheetId fixes** — All wire creation paths (UI, MCP, T-junction) now set `sheetId`. Sheet filtering changed from OR→AND logic.
- **Source/Destination arrows** — 2 new symbols (`source-arrow`, `destination-arrow`) for multi-sheet power continuation with voltage labels and cross-references.
- **Group drag waypoints** — Wire waypoints now move with devices when dragging a selection.
- **T-junction snap-to-wire** — Junctions project onto the wire path via perpendicular projection (standard CAD algorithm).
- **L1/L2 vertical rail lines** — Bold vertical lines at rail positions in ladder overlay. `ladderRailLineColor` added to all 5 theme presets.
- **Wire persistence types** — API `ConnectionData` now typed with `wireNumber`, `sheetId`, `fromDeviceId`, `toDeviceId`, `waypoints`.
- **Straight-line bus rendering** — Wire segments with aligned endpoints (same X or Y) bypass auto-router entirely. Prevents bus segment routing around obstacles. Applied to both rendering and hit detection.

### T-Junction Architecture Investigation
- Researched KiCad (`bus-wire-junction.cpp`, `BreakSegment()`, `CONNECTION_GRAPH`), QElectroTech (`Conductor` class), and EPLAN approaches.
- **Key insight**: Professional EDA tools use independent line segments, not auto-routed connections. KiCad's `BreakSegment()` splits wires at junction points; connectivity is resolved at runtime via `CONNECTION_GRAPH`.
- **fusionCad adaptation**: Since we use auto-routing, added straight-line bypass for aligned endpoints + waypoints on split halves to prevent re-routing.
- **Remaining issue**: T-junction UX still needs work for multi-junction bus patterns. The split approach creates segment chains that are fragile. Architecture decision needed: bus-as-entity vs KiCad-style segments vs hybrid.

### Industrial Schematic Reference
- Analyzed professional SolisPLC control panel schematic — documented every element fusionCad must reproduce.
- Saved to memory: `reference_industrial_schematic_anatomy.md`
- Key gaps identified: source/dest arrows (done), wire numbers, rung descriptions, dual-column layout, wire gauge annotations.

### Files Modified
- `apps/web/src/hooks/useCanvasInteraction.ts` — T-junction projection, group drag waypoints, sheetConnections
- `apps/web/src/hooks/useCircuitState.ts` — T-junction redesign, sheetId on wires, grid snap
- `apps/web/src/renderer/circuit-renderer.ts` — Straight-line rendering, arrow labels, sheetId AND logic
- `apps/web/src/renderer/symbols.ts` — Arrow symbol skip tag rendering
- `apps/web/src/renderer/ladder-renderer.ts` — L1/L2 vertical rail lines
- `apps/web/src/renderer/theme.ts` — `ladderRailLineColor` in all presets
- `apps/api/src/entities/Project.ts` — ConnectionData fields, blocks
- `packages/core-model/src/symbols/builtin-symbols.json` — source-arrow, destination-arrow
- `packages/mcp-server/src/circuit-helpers.ts` — sheetId on MCP wires
- `e2e/tests/t-junction.spec.ts` — Updated for split approach
- `e2e/tests/wire-selection.spec.ts` — Existing tests maintained

**Tests**: 129 E2E all passing

---

## 🎯 Phase 0 - Foundation

**Goal**: Set up project structure, tooling, and "hello world" baseline.

**Started**: 2026-01-26
**Completed**: 2026-01-26

### Progress Checklist

#### 0.1 Project Setup (3/3)
- [x] Initialize monorepo structure (npm workspaces)
- [x] Configure TypeScript, ESLint, Prettier
- [x] Set up packages structure:
  - [x] `packages/core-model/`
  - [x] `packages/core-engine/`
  - [x] `packages/rules/`
  - [x] `packages/reports/`
  - [x] `packages/project-io/`
  - [x] `apps/web/`
  - [x] `apps/cli/`

#### 0.2 Core Model Types (3/3)
- [x] Define basic entity interfaces (Part, Device, SymbolDefinition, SymbolInstance, PinInstance, Node, WireSegment, Net, Terminal)
- [x] Stable ID generation (ULID)
- [x] Basic type tests (types compile)

#### 0.3 Web Shell Bootstrap (3/3)
- [x] Vite + React app scaffold
- [x] Basic layout: canvas area + sidebar
- [x] Simple canvas (HTML Canvas 2D) rendering "hello world"

### Definition of Done (Phase 0)
- [x] `npm install` works in root
- [x] `npm run build` builds all packages
- [x] `npm run dev` in `apps/web` shows canvas with message in browser
- [x] CLI works: `node apps/cli/dist/index.js --version` prints "0.1.0"
- [x] Core model types compile with no errors

---

## 📝 Session Log

### Session 1 - 2026-01-26
**Duration**: 2 hours (planning + implementation)
**Completed**:
- ✅ Reviewed all architecture and MVP documents
- ✅ Created ROADMAP.md with 8-phase plan
- ✅ Created STATUS.md for session tracking
- ✅ Confirmed golden circuit strategy (3-wire motor starter)
- ✅ Initialized monorepo with npm workspaces
- ✅ Created all package directories (5 packages + 2 apps)
- ✅ Set up TypeScript configuration across all packages
- ✅ Defined core model types (Part, Device, SymbolDefinition, Net, etc.)
- ✅ Created CLI scaffold with commander.js
- ✅ Created web app with React + Vite
- ✅ Canvas rendering works (shows "Hello World")
- ✅ Build system works (`npm run build` succeeds)
- ✅ **Phase 0 Complete!**

**Next Session**:
- Start Phase 1: Golden Circuit implementation
- Create hardcoded motor starter circuit
- Implement BOM generator
- Implement wire list generator

**Blockers/Questions**: None

### Session 2 - 2026-01-26 (continued)
**Duration**: ~2 hours
**Completed**:
- ✅ Created golden circuit: 3-wire motor starter (hardcoded)
  - 7 devices: K1, S1, S2, F1, M1, X1, PS1
  - 7 nets: 24V, 0V, control signals, L1/L2/L3
  - 11 connections with proper pin mappings
  - 5 terminals on X1 strip
- ✅ Implemented BOM generator
  - Groups devices by part
  - Outputs CSV with quantities and device tags
  - Tested successfully: 7 items, 7 unique parts
- ✅ Implemented wire list generator
  - Lists all connections from/to device:pin
  - Auto-numbered wires (W001-W011)
  - Shows net names and types
- ✅ Implemented 3 validation rules
  - Rule 1: Duplicate device tags
  - Rule 2: Unconnected devices
  - Rule 3: Dead-end nets (single connection)
- ✅ Fixed ESM module issues (added `"type": "module"` to all packages)
- ✅ **Renamed CLI from "vcad" to "fcad"** (better branding!)
- ✅ All CLI commands working:
  - `fcad --help`
  - `fcad validate` (0 errors, 5 warnings - expected)
  - `fcad export:bom` → CSV file
  - `fcad export:wires` → CSV file

**Still Need** (to complete Phase 1):
- [ ] Save golden circuit to JSON file
- [ ] JSON persistence adapter
- [ ] CLI loads from JSON file

**Next Session**:
- Complete Phase 1: JSON persistence
- Then move to Phase 2: Minimal Editor

**Blockers/Questions**: None

### Session 3 - 2026-01-26 (Phase 2 start)
**Duration**: ~2 hours
**Completed**:
- ✅ **Phase 1 COMPLETE!** (100%)
  - Fixed ESM module issues for browser compatibility
  - JSON persistence working (save/load circuits)
  - CLI loads from JSON files successfully
  - All Definition of Done items checked
- ✅ **Phase 2 Started: Canvas Rendering**
  - Created renderer architecture (types, symbols, circuit-renderer)
  - Implemented symbol library with pin definitions
  - Built layout engine (manual positioning for motor starter)
  - Rendered golden circuit visually:
    - 7 devices as rectangles with tags
    - 11 connections as blue wires
    - Red pin dots on symbols
    - Yellow pin labels (A1, A2, +, -, etc.)
  - Implemented orthogonal wire routing (90-degree angles)
  - Wires connect to actual pins (not device centers)
  - Fixed web app to load golden circuit on mount
  - Visual feedback loop working perfectly

**Progress**:
- Phase 1: ✅ 100% Complete
- Phase 2: 🟡 40% Complete (rendering done, need interactions)

**Next Session**:
- Add pan/zoom controls for navigation
- Improve symbol shapes (actual schematic symbols)
- Start symbol placement tool

**Blockers/Questions**:
- Wire routing needs improvement: multiple wires overlap at X1 terminal strip, creating visual ambiguity
- Need smarter routing algorithm to separate overlapping wire segments
- Simple staggering attempt caused chaos - needs different approach

**Session End Notes**:
- Canvas rendering fundamentally works (pin-to-pin connections correct)
- Visual clarity is the remaining challenge, not electrical correctness
- X1 terminal strip connections visible in wire list CSV, but hard to see on canvas
- Human-AI interpretation gap: code correctness ≠ visual usability
- Next session: focus on wire routing separation OR move to pan/zoom first

### Session 4 - 2026-01-27 (Wire Routing Algorithm)
**Duration**: ~3 hours
**Completed**:
- ✅ **Implemented professional wire routing algorithm** (3-stage approach from academic paper)
  - Stage 1: Orthogonal visibility graph builder (around obstacles)
  - Stage 2: A* pathfinding through visibility graph (shortest paths)
  - Stage 3: Nudging algorithm to separate overlapping segments
- ✅ **Core routing module** (`packages/core-engine/src/routing/`)
  - `visibility-graph.ts`: Builds orthogonal routing grid with obstacle avoidance
  - `astar.ts`: A* pathfinding with Manhattan distance heuristic
  - `orthogonal-router.ts`: Main router combining visibility graph + A*
  - `nudging.ts`: Wire separation algorithm (detects overlaps, assigns offsets)
- ✅ **Fixed critical bugs**:
  - Pins on device edges weren't connecting to graph (fixed with zero-padding for start/end)
  - Nudging created diagonal segments (fixed with orthogonal reconnection)
  - All 11 wires now successfully route with proper separation
- ✅ **Pan/zoom controls** added:
  - Mouse wheel zoom (0.1x - 5x range)
  - Click-drag panning
  - Cursor changes (grab/grabbing)
- ✅ **Debug mode toggle**: Labels now default to OFF for clean screenshots
- ✅ **Wire separation working**: 9 overlap bundles detected and separated (up to 5 wires in one bundle)
- ✅ **Wire color coding**: 11 unique colors for easy wire identification
- ✅ **Routing debugging**: Analyzed W001 jog issue - determined it's due to waypoint grid constraints (optimal point inside obstacle)
- ✅ **Console logging cleanup**: Removed all debug logs to reduce token usage

**Progress**:
- Phase 2: 🟡 60% Complete (routing foundation solid, ready for editor tools)

**Next Session**:
- Improve symbol shapes (actual schematic symbols)
- Fine-tune routing (spacing adjustments, path simplification)
- Start symbol placement tool

**Blockers/Questions**: None - routing foundation is solid!

**Session End Notes**:
- Major milestone: Professional routing algorithm working end-to-end
- Wire separation at X1 terminal clearly visible (5 wires properly offset)
- All routing is orthogonal (90-degree angles only)
- Obstacle avoidance working correctly
- Foundation is ready for interactive editing features
- Research-backed approach (Wybrow, Marriott, Stuckey 2009 paper + libavoid C++ implementation)
- **Routing aesthetic note**: Some wires have visible jogs (e.g., W001 goes down → left → down instead of straight down then left). This happens when optimal waypoints are inside obstacles. Connections are electrically correct - just not maximally straight. Acceptable for now to avoid complex post-processing.

### Session 4 (continued) - 2026-01-27 (Debugging & Skills)
**Duration**: ~1.5 hours
**Completed**:
- ✅ **Deep dive into W001 jog issue**:
  - Added visibility graph debug logging to understand waypoint grid
  - Identified missing waypoint at (60, 100) - inside PS1 obstacle bounds
  - Tested A* heuristic improvements (alignment bias, major axis preference)
  - Reverted heuristic changes - broke other wire connections
  - Conclusion: Jog is due to grid constraints, electrically correct, acceptable for now
- ✅ **Console logging cleanup**:
  - Removed all debug console.log statements from routing code
  - Cleaned visibility-graph.ts, astar.ts, orthogonal-router.ts
  - Reduced token usage for future sessions
- ✅ **Created 4 custom skills** (in ~/.claude/skills/):
  - `cleanup-console`: Automate debug log removal after debugging
  - `session-start`: Load STATUS.md context at session start
  - `update-status`: Update STATUS.md at session end
  - `check-architecture`: Validate changes against architecture principles
- ✅ **Documented terminal block automation feature**:
  - Added to STATUS.md "High Priority Automation Features"
  - Key workflow: Auto-calculate terminal block quantities from terminal count + block type
  - Marked as high priority for Phase 3-4

**Progress**:
- Phase 2: 🟡 60% Complete (routing solid, skills ready for workflow)

**Next Session**:
- Test new skills (especially /session-start at beginning)
- Improve symbol shapes (actual schematic symbols)
- Or start symbol placement tool

**Blockers/Questions**: None

**Session End Notes**:
- Routing algorithm proven to be working correctly
- Decision: Accept aesthetic jogs rather than add post-processing complexity
- Skills will improve session efficiency (faster context loading, easier cleanup)
- Terminal block automation documented as critical automation-first feature

### Session 4 (continued) - 2026-01-27 (Symbol Improvement - IN PROGRESS)
**Duration**: ~30 minutes
**Completed**:
- ✅ **Documented terminal block automation** and **panel layout editor** as high-priority features
- ✅ **Created CLAUDE.md** - Big "STOP READ THIS FIRST" reminder for session starts
- 🔄 **Started improving electrical symbols** to match IEC 60617 standards:
  - Researched IEC 60617 official database and SVG libraries
  - Found GitHub library (chille/electricalsymbols) with 33 symbols
  - Coded new symbol drawing functions for contactor, button, overload, terminal, power supply
  - User feedback: Motor symbol OK, others "funky and not right"
  - Status: PAUSED mid-task, needs proper IEC symbol reference

**Progress**:
- Phase 2: 🟡 60% Complete (symbols work in progress)

**Next Session**:
- Continue symbol improvement with proper IEC 60617 references
- Redraw contactor, pushbutton, overload, terminal, power supply symbols correctly
- Test in browser and iterate until symbols look professional

**Files Modified**:
- `apps/web/src/renderer/symbols.ts` - Updated drawSymbol() with category-specific functions
- `.claude/CLAUDE.md` - Created session start reminder
- `STATUS.md` - Documented terminal automation and panel layout features

**Resources Found**:
- IEC 60617 Database: https://library.iec.ch/iec60617
- GitHub SVG Library: https://github.com/chille/electricalsymbols
- Siemens Symbols: https://symbols.radicasoftware.com/225/iec-symbols

**Blockers/Questions**:
- Need visual reference for proper IEC symbol drawings (not just descriptions)
- May need to examine SVG files from GitHub library or commercial software

**Session End Notes**:
- User needs to leave - saved progress mid-task
- CLAUDE.md created for better session continuity
- Symbol work 50% done - motor OK, others need refinement

### Session 5 - 2026-01-28 (Canvas Interaction Tools)
**Duration**: ~1 hour
**Completed**:
- ✅ **Implemented full canvas interaction system**:
  - Interaction modes: select, place, wire
  - Hit detection for pins (8px radius) and symbols (bounding box)
  - Selection state with visual highlight (dashed cyan border)
  - Wire tool with visual feedback (orange highlight on start pin)
  - Ghost preview for symbol placement (50% opacity)
  - Snap to 20px grid for placement and dragging
- ✅ **Wire tool working**: Click first pin, click second pin = connection created
  - Creates new net and connection automatically
  - Visual feedback shows wire-in-progress state
  - ESC cancels wire in progress
- ✅ **Drag to reposition**: Click and drag any symbol to move it
  - Tracks offset from click point (no jumping)
  - Wires automatically re-route when symbols move
- ✅ **Delete symbols**: Select + Delete/Backspace removes device and its wires
- ✅ **Toolbar UI**: Select/Wire mode buttons + symbol palette in sidebar
- ✅ **Created `/session-end` skill** for end-of-session updates

**Progress**:
- Phase 2: 🟡 85% Complete (interaction tools done, symbols need polish)

**Next Session**:
- **PRIORITY: Persistence** - circuits disappear on refresh, need to save work
  - Decision needed: IndexedDB (local) vs cloud storage vs hybrid
  - Cloud consideration: Allow 1 free project for free users?
  - Cloud will be needed eventually for symbol library (can't live in core forever)
- Add wire nodes/bend points (intermediate points in wires)
- Improve symbol shapes to match IEC 60617

**Files Modified**:
- `apps/web/src/App.tsx` - Major refactor: interaction modes, hit detection, state management
- `apps/web/src/App.css` - Toolbar and status message styles
- `apps/web/src/renderer/circuit-renderer.ts` - Selection highlight, wire preview, ghost symbol
- `~/.claude/skills/session-end/skill.md` - New skill created

**Blockers/Questions**: None

**Session End Notes**:
- Wire tool working pin-to-pin (no intermediate nodes yet)
- User confirmed wire tool is working well
- Major milestone: fusionCad now has functional interactive editing!
- Routing algorithm automatically handles wire paths when symbols move
- Symbol shapes still "funky" - IEC 60617 cleanup still pending from last session

### Session 6 - 2026-01-29 (Persistence, UI, Copy/Paste, Undo/Redo, Multi-Select, Wire Bend Points)
**Duration**: ~3 hours
**Completed**:
- ✅ **Persistence implemented** with TypeORM + Postgres:
  - Docker Postgres on port 5433
  - Express REST API (apps/api) on port 3001
  - Auto-save with 1-second debounce
  - Project management UI (create, rename, delete, switch projects)
  - Circuit data stored as JSONB
- ✅ **UI Cleanup**:
  - Project dropdown in header
  - Reorganized sidebar: Tools → Symbols → Status → Properties → Debug
  - Properties panel shows selected device details
  - Removed canvas overlay text
- ✅ **Copy/Paste**:
  - Cmd+C to copy selected device
  - Cmd+V to paste at cursor position
  - Cmd+D to duplicate in place (with offset)
- ✅ **Undo/Redo**:
  - Cmd+Z to undo (up to 50 history entries)
  - Cmd+Shift+Z to redo
  - Works for all device/wire operations
- ✅ **Multi-Select** (partial):
  - Shift+click to add/remove from selection ✅
  - Cmd+A to select all ✅
  - Move all selected devices together ✅
  - Delete all selected devices ✅
  - ⚠️ **NOT IMPLEMENTED**: Drag-select (marquee/rubber band selection)
- ✅ **Wire Bend Points** (complete):
  - Wire selection (click to select, turns white) ✅
  - Add waypoints by clicking selected wire ✅
  - **Drag waypoints** to reposition ✅
  - **Double-click to delete** waypoints ✅
  - Waypoints persist to database ✅
  - **Orthogonal-only routing enforced** (no diagonal wires) ✅
  - **Improved hit detection** - uses auto-routing for accurate wire clicks ✅

**Progress**:
- Phase 2: 🟡 95% Complete (wire bend points complete, need marquee select + symbol polish)

**Next Session**:
- Test wire reconnection manually (browser automation has precision limits)
- Add drag-select (marquee/rubber band selection) for multi-select
- Improve symbol shapes to match IEC 60617

**Files Modified**:
- `docker-compose.yml` - New: Postgres container
- `apps/api/*` - New: Express + TypeORM REST API
- `apps/web/src/App.tsx` - Persistence, UI, copy/paste, undo/redo, multi-select, wire selection
- `apps/web/src/App.css` - Complete rewrite for new UI
- `apps/web/src/api/projects.ts` - New: API client
- `apps/web/src/renderer/circuit-renderer.ts` - Multi-select highlights, wire selection, orthogonal waypoint routing

**Blockers/Questions**: None

**Session End Notes**:
- Major milestone: Full persistence working - circuits no longer lost on refresh!
- Multi-select functional for shift+click, but marquee selection would be nicer
- **Wire bend points fully working**: add/drag/delete waypoints all tested and verified
- Hit detection improved to use auto-routing for accurate wire selection
- Orthogonal-only routing enforced - much cleaner schematics
- **Wire reconnection implemented**: drag endpoints to reconnect wires to different pins

### Session 7 - 2026-01-29 (JSON+SVG Symbol Format)
**Duration**: ~45 minutes
**Completed**:
- ✅ **Implemented JSON+SVG symbol format** for declarative symbol definitions:
  - Added `SymbolPath` interface (`d`, `stroke`, `fill`, `strokeWidth`)
  - Added `SymbolText` interface (`content`, `x`, `y`, `fontSize`, `fontWeight`)
  - Added optional `paths` and `texts` arrays to `SymbolDefinition`
- ✅ **Created SVG path parser** in `symbols.ts`:
  - `parseSVGPath()` - parses M, L, H, V, A, C, Q, Z commands (uppercase/lowercase)
  - `renderPathCommands()` - converts parsed commands to Canvas API
  - `svgArcToCanvasArc()` - converts SVG arc parameters to Canvas arc
  - `renderPaths()` and `renderTexts()` - render to canvas
- ✅ **Updated `drawSymbol()`** to use paths when available:
  - Priority: paths array → custom draw function → generic rectangle
  - Backward compatible (custom draw functions still work as fallback)
- ✅ **Converted all 6 IEC symbols** to JSON+SVG format:
  - Motor: circle + "M" text
  - Button: circle + contact line + actuator
  - Contactor: coil rectangle + contact bars + aux box
  - Overload: rectangle + zigzag thermal element
  - Terminal: rectangle + vertical bars + screw circles
  - Power Supply: rectangle + AC wave + +/- text
- ✅ **Tested in browser**: All symbols render correctly, zoom scales cleanly

**Progress**:
- Phase 2: 🟡 97% Complete (symbols JSON+SVG done, need marquee select)

**Next Session**:
- Add drag-select (marquee/rubber band selection)
- Consider importing symbols from external SVG libraries
- Wire properties panel when wire selected

**Files Modified**:
- `packages/core-model/src/types.ts` - Added SymbolPath, SymbolText interfaces
- `apps/web/src/renderer/symbols.ts` - SVG path parser and renderer
- `packages/core-model/src/symbols/iec-symbols.ts` - Converted all 6 symbols to paths

**Blockers/Questions**: None

**Session End Notes**:
- Major foundation for symbol library: symbols can now be defined as JSON with SVG paths
- Enables future import from external SVG libraries (KiCad, electricalsymbols repo)
- Human-editable symbol definitions - no code changes needed for new symbols
- Foundation for symbol editor UI (users could create/edit symbols visually)
- SVG path parser handles most common commands (M, L, H, V, A, C, Q, Z)
- Arc conversion works for circles; elliptical arcs fall back to lines (rare case)

### Session 8 - 2026-02-05 (Playwright E2E Testing)
**Duration**: ~1.5 hours
**Completed**:
- ✅ **Playwright E2E testing framework** fully set up:
  - Installed `@playwright/test` + Chromium browser binaries
  - `playwright.config.ts` with separate test ports (API 3003, Vite 5174)
  - `e2e/global-setup.ts` creates `fusion_cad_test` database via Docker
  - `--strictPort` on Vite to prevent silent port fallback
- ✅ **State bridge** (`window.__fusionCadState`) added to `App.tsx`:
  - Gated on `import.meta.env.DEV` (stripped in production builds)
  - Exposes: circuit, devicePositions, interactionMode, selectedDevices, selectedWireIndex, viewport, projectId, projectName, saveStatus, historyLength, historyIndex
- ✅ **Test helpers** created:
  - `e2e/helpers/canvas-helpers.ts`: worldToScreen, placeSymbol, createWire, clickCanvas (with modifier key support via keyboard.down/up), waitForDeviceCount, waitForSaveStatus
  - `e2e/helpers/api-helpers.ts`: deleteAllProjects, createEmptyProject, getProject
  - `e2e/fixtures/fusion-cad.fixture.ts`: auto-fixture gives each test a clean project
- ✅ **28 tests across 8 spec files**, all passing:
  - `app-loads.spec.ts` (5): canvas visible, sidebar, palette, state bridge, empty project
  - `place-symbol.spec.ts` (4): place, grid snap, auto-tags, mode reset
  - `select-delete.spec.ts` (5): click select, Delete, Backspace, deselect, Escape
  - `copy-paste.spec.ts` (2): Cmd+C/V, Cmd+D duplicate
  - `undo-redo.spec.ts` (3): undo place, redo, undo delete
  - `multi-select.spec.ts` (3): Shift+click, Cmd+A, group delete
  - `wire-creation.spec.ts` (3): wire pins, new net, Escape cancel
  - `persistence.spec.ts` (3): auto-save to API, reload persistence, save status
- ✅ **npm scripts** added:
  - `test:e2e` (headless), `test:e2e:headed`, `test:e2e:slow` (500ms delay), `test:e2e:ui`
  - `SLOWMO=<ms>` env var for custom speed

**Key bugs fixed during setup**:
- Auto-fixture needed `{ auto: true }` to run for all tests (not just those requesting `projectId`)
- `page.mouse.click()` doesn't support `modifiers` — used `keyboard.down()/up()` instead
- Save status starts as `'unsaved'` briefly after load — tests wait for initial save cycle

**Files Created**:
- `playwright.config.ts`
- `e2e/global-setup.ts`
- `e2e/helpers/canvas-helpers.ts`
- `e2e/helpers/api-helpers.ts`
- `e2e/fixtures/fusion-cad.fixture.ts`
- `e2e/tests/*.spec.ts` (8 files)

**Files Modified**:
- `apps/web/src/App.tsx` - Added state bridge useEffect
- `package.json` - Added @playwright/test, test scripts
- `.gitignore` - Added Playwright artifacts

**Blockers/Questions**: None

**Session End Notes**:
- Full E2E test coverage for all Phase 2 features
- Tests use isolated ports/database, safe to run alongside dev servers
- SLOWMO support makes it easy for humans to supervise test runs
- Foundation ready for adding more tests as new features land

### Session 9 - 2026-02-06 (Symbol Editor, JSON Symbols, Insert Dialog)
**Duration**: ~2 hours
**Completed**:
- ✅ **Downloaded 126 IEC symbols** from Radica Software stencil 229:
  - Python scripts in `scripts/radica-symbols/` for batch download
  - 55 symbols converted to fusionCad JSON format in `builtin-symbols.json`
- ✅ **JSON-based Symbol Library**:
  - Moved symbols from hardcoded TypeScript to `builtin-symbols.json`
  - Added `tagPrefix` field to SymbolDefinition and JSON (e.g., "PS" for power supply)
  - `symbol-loader.ts` converts JSON to internal SymbolDefinition format
  - `getSymbolById()` added for direct ID lookup (not just category)
  - Renderer's `lookupSymbol()` tries ID first, then category for backward compat
- ✅ **Insert Symbol Dialog** (replaces old sidebar palette):
  - Searchable modal with category filtering
  - SVG preview for each symbol
  - Passes symbol ID (not display category) for correct rendering
- ✅ **Fixed Insert Symbol bug**: Power supply was rendering as contactor
  - Root cause: dialog passed display category "Power" instead of symbol ID
  - Fix: Pass symbol ID through system, renderer looks up by ID first
- ✅ **Wire Preview**: Dashed green line from start pin to cursor during wire creation
  - Fixed: `setMouseWorldPos` now tracks position in wire mode (was only in place mode)
- ✅ **Symbol Editor** (Visual Symbol Builder):
  - Canvas with 5px grid for drawing
  - Tools: Select, Line, Rectangle, Circle, Polyline, Pin
  - Pin properties: name, direction (top/bottom/left/right), type (passive/input/output/power/ground/pe)
  - Symbol properties: name, category, tag prefix, width, height
  - Real-time preview at actual size
  - Save to library (registers with registerSymbol)
  - Edit existing symbols (loads paths and pins)
  - Integrated into Symbol Library with "Create Symbol" and "Edit Symbol" buttons
- ✅ **Discussed licensing model**:
  - Free tier: IndexedDB (local storage), all built-in symbols, no export
  - Pro tier ($19/mo): Postgres cloud sync, PDF/CSV exports, custom symbols

**Progress**:
- Phase 2: 🟢 98% Complete (Symbol Editor done, marquee select still pending)

**Files Created**:
- `packages/core-model/src/symbols/builtin-symbols.json` - 55 IEC symbols
- `packages/core-model/src/symbols/symbol-loader.ts` - JSON → SymbolDefinition
- `apps/web/src/components/InsertSymbolDialog.tsx` - Searchable symbol picker
- `apps/web/src/components/SymbolEditor.tsx` - Visual symbol builder
- `scripts/radica-symbols/` - Python download/conversion tools

**Files Modified**:
- `packages/core-model/src/types.ts` - Added tagPrefix to SymbolDefinition
- `packages/core-model/src/symbol-library.ts` - Added getSymbolById()
- `packages/core-model/src/symbols/iec-symbols.ts` - Loads from JSON
- `apps/web/src/renderer/symbols.ts` - lookupSymbol() for ID-first lookup
- `apps/web/src/components/Sidebar.tsx` - Insert Symbol button
- `apps/web/src/components/SymbolLibrary.tsx` - Integrated Symbol Editor
- `apps/web/src/hooks/useCanvasInteraction.ts` - Wire preview mouse tracking
- `apps/web/src/hooks/useCircuitState.ts` - Tag generation from symbol's tagPrefix
- `apps/web/src/App.css` - Symbol Editor styles

**Blockers/Questions**: None

**Session End Notes**:
- Major milestone: Users can now create and edit symbols visually!
- Symbol Editor enables fine-tuning without touching JSON/code
- Licensing model clarified: free local tier, paid cloud tier
- JSON symbol format enables future features: import from KiCad/SVG, custom symbols for paid users
- Wire preview improves UX during wire creation

### Session 10 - 2026-02-08 (E2E Test Updates for Insert Symbol Dialog)
**Duration**: ~30 minutes
**Completed**:
- ✅ **Fixed E2E tests after Insert Symbol Dialog changes**:
  - Updated `placeSymbol()` helper to use new Insert Symbol Dialog flow
  - Changed from clicking `.symbol-palette .symbol-btn` to opening dialog and searching
  - Updated `app-loads.spec.ts` to test Insert Symbol Dialog instead of old palette
  - Fixed symbol name mappings (button → "Manual Switch" for correct `S` tagPrefix)
  - Updated wire creation tests with correct pin coordinates for Manual Switch symbol
- ✅ **All 28 E2E tests passing** after UI changes
- ✅ **Documented fusionCad port assignments** in CLAUDE.md:
  - Dev: API 3001, Vite 5173
  - Test: API 3003, Vite 5174
  - Safe kill command for stuck test servers only

**Files Modified**:
- `e2e/helpers/canvas-helpers.ts` - Updated placeSymbol for new dialog
- `e2e/tests/app-loads.spec.ts` - Test Insert Symbol Dialog instead of old palette
- `e2e/tests/wire-creation.spec.ts` - Correct pin coordinates for Manual Switch
- `.claude/CLAUDE.md` - Added port assignments documentation

**Blockers/Questions**: None

**Session End Notes**:
- Established rule: Always run E2E tests before committing UI changes
- Tests adapted to new Insert Symbol Dialog UX
- Port documentation prevents accidentally killing unrelated dev servers

### Checkpoint: 2026-02-11 - MCP Server Implementation

**Changes Made**:
- Built `packages/mcp-server/` — MCP server exposing 18 tools for AI-driven circuit manipulation
- Created `.mcp.json` at repo root for Claude Code auto-discovery

**Architecture Updates**:
- New package: `@fusion-cad/mcp-server` depends on core-model, core-engine, reports
- Pattern: Load project from API → mutate circuitData in memory → save back
- Device tags used as human-readable identifiers (not ULIDs) in MCP tools
- Pure function helpers in `circuit-helpers.ts` (no React dependencies)

**Completed**:
- [x] MCP server with 18 tools (9 read-only, 9 write)
- [x] Read tools: list_projects, get_project_summary, list_devices, list_connections, list_symbols, search_symbols, run_erc, generate_bom, list_parts_catalog
- [x] Write tools: create_project, place_device, delete_device, update_device, create_wire, delete_wire, assign_part, add_sheet, add_annotation
- [x] API client for HTTP communication with fusionCad API
- [x] Circuit helpers extracted from useCircuitState.ts as pure functions
- [x] `.mcp.json` for Claude Code auto-discovery
- [x] Clean build, 35 E2E tests still passing

**Files Created**:
- `packages/mcp-server/package.json`
- `packages/mcp-server/tsconfig.json`
- `packages/mcp-server/src/index.ts` — stdio entry point
- `packages/mcp-server/src/api-client.ts` — HTTP client
- `packages/mcp-server/src/circuit-helpers.ts` — pure circuit manipulation functions
- `packages/mcp-server/src/server.ts` — McpServer with 18 tool registrations
- `.mcp.json` — Claude Code MCP discovery

### Checkpoint: 2026-02-12 - Ladder Diagram Layout System & Interactive Fixes

**Changes Made**:
- Implemented complete ladder diagram layout system (data model, layout engine, renderer, MCP tools)
- Fixed symbol rotation for horizontal current flow (devices rotated -90° on ladder rungs)
- Fixed rail-to-device stub wires (L1→first device, last device→L2)
- Added `branchOf` field to Rung type for parallel branch rungs (seal-in circuits)
- Fixed motor starter template: coil on rung 1 only, rung 2 is branch
- Added transform-aware hit-testing for devices, wires, and pins (rotated symbols now selectable)
- Added wire deletion via Delete/Backspace key and toolbar button
- Persisted `transforms` and `rungs` in circuitData across all interfaces

**Architecture Updates**:
- New types: `DiagramType`, `LadderConfig`, `Rung` (with `branchOf`)
- New package: `packages/core-engine/src/ladder-layout.ts` — pure layout function
- New renderer: `apps/web/src/renderer/ladder-renderer.ts` — rails, rung numbers, rail stubs
- New templates: `packages/mcp-server/src/circuit-templates.ts` — motor starter, control rung generators
- 5 new MCP tools: `set_sheet_type`, `add_rung`, `auto_layout_ladder`, `generate_motor_starter`, `add_control_rung`
- `CircuitData` now includes `transforms` and `rungs` fields (persisted)

**Completed**:
- [x] Ladder data model (DiagramType, LadderConfig, Rung)
- [x] Layout engine (pure function: rungs + config → device positions)
- [x] Power rail & rung rendering (L1/L2 rails, rung numbers, voltage labels)
- [x] MCP tools for ladder operations (low-level + high-level)
- [x] Motor starter circuit template (3-wire, 8 devices, 3 rungs, 6 wires)
- [x] Transform-aware hit-testing (select/wire/delete on rotated devices)
- [x] Wire deletion (Delete key + toolbar button)
- [x] 35 E2E tests passing

**Still In Progress**:
- [ ] End-to-end MCP test: clean DB → generate motor starter via MCP tools → verify in browser
- [ ] New MCP tools need server restart to be available (restart Claude Code)

---

### Checkpoint: 2026-02-12 - Linked Device Representations (ID-Keyed Architecture)

**Changes Made**:
- Migrated entire codebase from tag-keyed to ID-keyed device lookups (7-phase plan)
- Added `deviceGroupId` field to Device type for linking representations of same physical device
- New MCP tool: `place_linked_device` (19 tools total now)
- ERC updated: duplicate tag check skips devices sharing same `deviceGroupId`
- BOM updated: linked device groups count as 1 physical item
- All 35 E2E tests passing after migration

**Architecture Updates**:
- Positions: `Map<deviceId, Point>` / `Record<deviceId, {x,y}>` (was tag-keyed)
- Connections: Added `fromDeviceId`/`toDeviceId` fields (tag fields kept for display)
- Selection: `selectedDevices` now contains device IDs (not tags)
- Hit testing: returns device IDs (not tags)
- Backward compat: `migratePositions()` auto-detects ULID vs tag keys on load
- `resolveDevice()` helper resolves connections by ID first, then tag fallback

**Completed**:
- [x] Phase 1: Foundation — ID-Keyed Positions + deviceGroupId
- [x] Phase 2: ID-Based Connections
- [x] Phase 3: ID-Based Selection & Hit Testing
- [x] Phase 4: Relax Tag Uniqueness (ERC deviceGroupId-aware)
- [x] Phase 5: Place Linked Device MCP Tool
- [x] Phase 6: BOM Grouping by deviceGroupId
- [x] Phase 7: Fix E2E Tests

**Key Files Modified** (~15 files):
- `packages/core-model/src/types.ts` — deviceGroupId field
- `apps/web/src/hooks/useCircuitState.ts` — largest change, all operations ID-based
- `apps/web/src/hooks/useCanvasInteraction.ts` — drag/click/marquee use IDs
- `apps/web/src/renderer/circuit-renderer.ts` — rendering uses ID-based positions
- `apps/web/src/types.ts` — hit testing returns device IDs
- `packages/mcp-server/src/circuit-helpers.ts` — placeLinkedDevice + ID-based ops
- `packages/mcp-server/src/server.ts` — place_linked_device tool
- `packages/core-engine/src/erc.ts` — deviceGroupId-aware duplicate check
- `packages/reports/src/bom.ts` — linked device group = 1 BOM item

### Checkpoint: 2026-02-12 - Wire Segment Dragging

**Changes Made**:
- Implemented wire segment dragging: click-drag segments on selected wires to move them perpendicular to their direction
- Exported `resolveDevice`, `getPinWorldPosition`, `toOrthogonalPath` from `circuit-renderer.ts`
- Added `replaceWaypoints()` to `useCircuitState.ts` (bulk waypoint replacement without history push)
- Added `computeWirePinPositions()` and `simplifyWaypoints()` helpers to `useCanvasInteraction.ts`

**Completed**:
- [x] Segment detection on mousedown (reuses existing `getWireSegmentAtPoint`)
- [x] Path materialization (orthogonal path → waypoints on drag start)
- [x] Perpendicular drag with grid snapping
- [x] Jog insertion for first/last segments (maintains orthogonal routing from pins)
- [x] Collinear waypoint simplification on mouseup
- [x] Undo/redo support (history pushed on first move)
- [x] 35 E2E tests passing

**Files Modified**:
- `apps/web/src/renderer/circuit-renderer.ts` — exported 3 helper functions
- `apps/web/src/hooks/useCircuitState.ts` — added `replaceWaypoints()`
- `apps/web/src/hooks/useCanvasInteraction.ts` — segment drag state, mousedown/mousemove/mouseup handlers, helper functions
- `apps/web/src/App.tsx` — wired `replaceWaypoints` to interaction deps

### Checkpoint: 2026-02-13 - Motor Starter Auto-Generation with Real Parts

**Changes Made**:
- Built motor data module in core-model: lookup engine queries 216 Schneider Electric motor starter configurations
- Created expanded Schneider parts catalog: 289 parts with datasheet URLs
- Enhanced `generateMotorStarter()` to auto-assign real catalog parts when motor data provided
- Added 2 new MCP tools: `lookup_motor_starter` (read-only) and `generate_motor_starter_from_spec` (write)

**Architecture**:
- `packages/core-model/src/motor-data/` — types, lookup engine, motor-database.json, wire-data.json
- `packages/core-model/src/parts/schneider-motor-catalog.ts` — 289 parts extracted from motor data
- Lookup: `{ hp, voltage, country?, phase?, starterType? }` → `{ motorFLA, wireSize, components: { circuitBreaker, contactor, overloadRelay, ... } }`
- Supports: USA/Canada, single/three-phase, 6 voltages, 4 starter types (iec-open/enclosed, nema-open/enclosed)
- LR9 electronic overload fallback for large motors where LRD is unavailable (>100 HP)
- All parts have `datasheetUrl` pointing to `https://www.se.com/us/en/product/{partNumber}/`

**Completed**:
- [x] Motor data types (MotorSpec, MotorStarterResult, ComponentSelection)
- [x] Motor database JSON (216 configs: 12 regions × 12-21 HP ratings)
- [x] Lookup engine with HP normalization (handles fractions like "1/2" ↔ "0.5")
- [x] 289-part Schneider motor catalog (breakers, contactors, overloads, switches, starters, thermal units)
- [x] Part catalog integrated into ALL_MANUFACTURER_PARTS
- [x] generateMotorStarter enhanced with optional motorData param for real part assignment
- [x] MCP tool: lookup_motor_starter (read-only lookup)
- [x] MCP tool: generate_motor_starter_from_spec (full generation with parts)
- [x] TypeScript clean (core-model + mcp-server compile)
- [x] 35 E2E tests passing (no regressions)
- [x] Verified: 20HP 208V → HDL36100 + LC1D65A + LRD365

**Files Created**:
- `packages/core-model/src/motor-data/types.ts`
- `packages/core-model/src/motor-data/lookup.ts`
- `packages/core-model/src/motor-data/index.ts`
- `packages/core-model/src/motor-data/motor-database.json`
- `packages/core-model/src/motor-data/wire-data.json`
- `packages/core-model/src/parts/schneider-motor-catalog.ts`

**Files Modified**:
- `packages/core-model/src/index.ts` — added motor-data exports
- `packages/core-model/src/parts/index.ts` — merged schneiderMotorCatalogParts
- `packages/mcp-server/src/circuit-templates.ts` — motorData param + assignPart calls
- `packages/mcp-server/src/server.ts` — 2 new MCP tools (26 total now)

### Checkpoint: 2026-02-13 - AI-Driven Motor Starter Panel Generation

**Changes Made**:
- Implemented full AI panel generation pipeline (5 phases):
  1. 12 panel symbols in builtin-symbols.json (enclosures, subpanels, DIN rails, door cutouts)
  2. `generateMotorStarterPanel()` template with HOA/pilot light/PLC/E-stop options
  3. `AIPromptDialog.tsx` modal with Claude API NLP → circuit generation
  4. `apps/api/src/ai-generate.ts` backend with Anthropic SDK
  5. Panel layout sheet generation with enclosure + component labels
- Multi-theme system: 5 presets + custom theme (theme.ts, ThemePicker.tsx, useTheme.ts)
- Performance fixes: Symbol geometry cache in symbols.ts + RAF render coalescing in Canvas.tsx

**Files Created**:
- `apps/web/src/components/AIPromptDialog.tsx` — AI prompt modal
- `apps/web/src/components/ThemePicker.tsx` — Theme selector UI
- `apps/web/src/hooks/useTheme.ts` — Theme hook
- `apps/web/src/renderer/theme.ts` — 5 preset themes + custom derivation + CSS vars
- `apps/api/src/ai-generate.ts` — Claude API backend for NLP circuit generation

**Files Modified**:
- `packages/core-model/src/symbols/builtin-symbols.json` — 12 new panel symbols
- `packages/mcp-server/src/circuit-templates.ts` — generateMotorStarterPanel()
- `packages/mcp-server/src/server.ts` — generate_motor_starter_panel tool (30 total)
- `apps/api/src/index.ts` — POST /api/projects/:id/ai-generate route
- `apps/api/package.json` — @anthropic-ai/sdk dependency
- `apps/web/src/App.tsx` — AI prompt dialog + theme integration
- `apps/web/src/App.css` — AI dialog + theme styles
- `apps/web/src/components/Header.tsx` — AI Generate button
- `apps/web/src/hooks/useProjectPersistence.ts` — reloadProject()
- `apps/web/src/renderer/symbols.ts` — geometry cache for performance
- `apps/web/src/components/Canvas.tsx` — RAF render coalescing

**Known Issue**:
- ~~🔴 VISIBILITY BUG~~ → **FIXED** in next checkpoint

### Session - 2026-02-25 (Symbol Resolution Pipeline + Parametric Generators)

**Problem**: Parts like Allen-Bradley 1769-PA4 rendered as blank 40x40 boxes because part categories (`plc-ps`, `contactor`) didn't match any symbol ID or display category (`PLC`, `Power`, `Control`).

**Completed**:
- ✅ **Category alias bridge** — 27 aliases mapping part-catalog categories to symbol IDs (e.g., `contactor` → `iec-contactor-3p`, `plc-ps` → `iec-power-supply-ac-dc`)
- ✅ **`registerCategoryAlias()`** in symbol-library.ts — bridges part categories to symbols
- ✅ **`symbolCategory` preference** — All symbol/geometry lookups now try `part.symbolCategory` before `part.category` (fixed in circuit-renderer, useCanvasInteraction, useCircuitState, types.ts)
- ✅ **Parametric symbol generators** — `generatePLCDigitalSymbol(type, channels)` and `generatePLCAnalogSymbol(type, channels)` auto-generate PLC I/O symbols with correct pin counts
- ✅ **4-tier `resolveSymbol()` pipeline** — Exact ID → Category alias → Parametric generation → Smart fallback. Never returns undefined.
- ✅ **Smart generic fallback** — Dashed-border placeholder with category label and 4 generic pins (replaces blank box)
- ✅ **Auto-caching** — Generated symbols register themselves on first use
- ✅ 122 E2E tests passing

**Key results**:
- `plc-di-16` → 17-pin symbol (COM + DI0-DI15) — all channels wirable
- `plc-do-32` → auto-generates 33-pin symbol on the fly
- Unknown categories get labeled placeholders instead of blank boxes
- Allen-Bradley 1769-PA4 now renders as power supply symbol (50x60, 4 pins)
- ✅ **Part number labels on canvas** — Part number (e.g., "1769-IF8") renders below symbol, tag renders above. Theme-aware styling across all 6 presets. Only shown when part is assigned.

**Files Created**: `packages/core-model/src/symbols/symbol-generators.ts`
**Files Modified**: `symbol-library.ts`, `iec-symbols.ts`, `circuit-renderer.ts`, `symbols.ts`, `useCanvasInteraction.ts`, `useCircuitState.ts`, `types.ts`, `index.ts`, `theme.ts`

**Next priority**: ERC hot-to-neutral short circuit detection (added to High Priority features)

### Session 11 - 2026-02-28 (Cloud Deployment + ERC Short Circuit + Google/GitHub OAuth)
**Duration**: ~3 hours (planning + implementation across 2 context windows)
**Completed**:
- Implemented all 3 planned items from storage architecture rethink:
  1. **Cloud Deployment** — Production-safe data-source.ts, Dockerfile, initial DB migration, Railway config
  2. **ERC Hot-to-Neutral Short Circuit** — Device classifier, circuit graph builder, BFS path analysis
  3. **Google/GitHub OAuth** — Amplify config, useAuth methods, AuthModal buttons

**Architecture Updates**:
- `apps/api/src/data-source.ts` — Supports `DATABASE_URL` env var, disables `synchronize` in production, adds SSL for managed Postgres
- `apps/api/src/index.ts` — CORS restricted via `CORS_ORIGINS` env var, `/health` verifies DB connection
- `packages/core-engine/src/device-classifier.ts` (new) — Classifies devices as load/protection/switching/passive/source/unknown by symbol keyword, part category, or tag prefix
- `packages/core-engine/src/circuit-graph.ts` (new) — Builds adjacency map from connections, BFS path finder between power rails
- `packages/core-engine/src/erc.ts` — New `checkHotToNeutralShort()` rule: identifies hot/neutral nets, finds paths, flags paths with no load AND no protection
- `apps/web/src/auth/amplify-config.ts` — Reads `VITE_COGNITO_OAUTH_DOMAIN`, adds OAuth config to Amplify when present
- `apps/web/src/auth/useAuth.ts` — `loginWithGoogle`/`loginWithGitHub` via `signInWithRedirect`, Hub listener for OAuth callbacks
- `apps/web/src/components/AuthModal.tsx` — OAuth buttons (Google/GitHub) with SVG icons, only shown when `oauthEnabled`

**Files Created**:
- `Dockerfile` — Multi-stage build (builder + node:20-alpine runtime)
- `.dockerignore` — Excludes node_modules, .git, e2e, .claude
- `.env.example` — Documents all env vars (DB, CORS, Auth, AI, OAuth)
- `apps/api/src/migrations/1709000000000-InitialSchema.ts` — Baseline migration
- `railway.json` — Railway deployment config
- `e2e/tests/health.spec.ts` — Health endpoint E2E test
- `e2e/tests/auth.spec.ts` — OAuth button visibility + modal open/close E2E tests
- `packages/core-engine/src/device-classifier.ts` — Device role classification
- `packages/core-engine/src/circuit-graph.ts` — Circuit graph building + path analysis
- `packages/core-engine/src/device-classifier.test.ts` — 32 unit tests
- `packages/core-engine/src/circuit-graph.test.ts` — 7 unit tests
- `packages/core-engine/src/erc-short-circuit.test.ts` — 6 integration tests
- `packages/core-engine/vitest.config.ts` — Vitest config for core-engine

**Files Modified**:
- `apps/api/src/data-source.ts` — DATABASE_URL, SSL, synchronize:false in prod
- `apps/api/src/index.ts` — CORS_ORIGINS, enhanced /health
- `apps/api/package.json` — Migration scripts
- `packages/core-engine/src/erc.ts` — Added checkHotToNeutralShort rule
- `packages/core-engine/src/index.ts` — Exported new modules
- `packages/core-engine/package.json` — Added vitest + test scripts
- `apps/web/src/auth/amplify-config.ts` — OAuth config + isOAuthEnabled()
- `apps/web/src/auth/useAuth.ts` — OAuth methods + Hub listener
- `apps/web/src/components/AuthModal.tsx` — OAuth buttons UI
- `apps/web/src/App.css` — OAuth button styles

**Test Results**:
- 125 E2E tests passing (2 new auth + 1 health + existing 122)
- 45 core-engine unit tests passing (32 device-classifier + 7 circuit-graph + 6 ERC integration)

**Blockers/Questions**: None

**Next Session**:
1. Deploy API to cloud (Railway/Fly.io + managed Postgres)
2. Configure Cognito OAuth providers in AWS Console
3. Gate AI features behind auth
4. Improve selector switch symbol visuals

**Session End Notes**:
- All code is committed and pushed to origin/main
- Dockerfile builds but hasn't been deployed yet — needs cloud provider setup
- OAuth UI is ready but dormant until VITE_COGNITO_OAUTH_DOMAIN is set in env
- ERC short circuit detection is conservative: unknown device roles don't trigger false positives
- Root-level `npx tsc --noEmit` has pre-existing errors (TypeORM decorators, JSX flags) — use per-package tsconfigs instead

---

### Session 22 - 2026-03-18 (Grid-Aligned Symbols + Pin-Based Templates + Terminal Redesign)
**Completed**:
- **Pin-based alignment in ALL templates** — Replaced hardcoded Y offsets (40, 140, 260...) with `alignDeviceToPin()` / `getPinWorldY()` chain in `circuit-templates.ts` and `ai-generate.ts`. Alignment functions moved to core-model for sharing.
- **63 symbols grid-aligned** — All pin positions rounded to multiples of 20px. Automated script (`scripts/fix-symbol-grid.mjs`) scaled primitives proportionally. Fixes manual alignment — devices now snap to positions where pins align with each other.
- **PLC generator grid-aligned** — `HEADER_HEIGHT` 75→80 in `symbol-generators.ts`. PLC DO pins now align with coils on 20px grid.
- **Terminal redesign (hexagon)** — `iec-terminal-single` changed from rectangle to pointy-top hexagon (40x40), single pin at top vertex (20,0). No cross-bar. Dual-level terminal removed. All template wiring updated: pin '2' → pin '1'.
- **Symbol Editor crash fixed** — `pushEditorHistory` referenced before initialization (temporal dead zone). Moved declaration above the callback that uses it.
- **Symbol Editor "Save to Library"** — New button saves symbol directly to DB via `PUT /api/symbols/:id`. No rebuild/seed needed. "Export JSON" button kept for deployment workflow.
- **Wire hit detection: closest match** — `getWireAtPoint` now returns closest wire by distance instead of first match. Helps with densely packed wires.
- **Consolidated roadmap** — All requirements merged into single `memory/roadmap-priorities.md` (P0/P1/P2).

**Discovered Bugs**:
- **P0: Wire selection index mismatch** — Clicking a wire selects the WRONG wire. Renderer uses sheet-filtered connection indices but hit detection uses global indices. Full analysis in `memory/bug-wire-selection-mismatch.md`. Fix next session.

**Key Decisions**:
- All symbol pin positions MUST be multiples of 20px (grid size) — this is now a design principle
- Terminals are single-pin hexagons. Dual-level = two singles linked by `deviceGroupId`
- Symbol Editor saves directly to DB for live editing; JSON export for deployment

**Next Session (Priority Order)**:
1. **P0 FIX: Wire selection index mismatch** — Share sheet-filtered connections between renderer and interaction handler
2. L1/L2 vertical rail rendering
3. Wire numbers visible on canvas (persistence)
4. Cross-references (coil ↔ contact)

### Session 21 - 2026-03-18 (Wire Routing Direction Constraints + Snap Toggle + Pin-Based Alignment)
**Completed**:
- **Wire routing direction constraints** — Implemented libavoid-style edge filtering in visibility graph. Pins now constrain which direction wires can exit/enter. Core algorithm (visibility-graph, A*, nudging) untouched — constraints enforced by removing edges from the graph before A* runs.
- **37 routing unit tests** — First test coverage for routing system: isEdgeAllowed (14), visibility graph (6), basic routing (5), direction-constrained routing (6), multi-wire nudging (3), real-world scenarios (3). All pass.
- **Snap-to-grid toggle** — View menu button, G keyboard shortcut, clickable status bar indicator. Persists to localStorage. Uses global flag so all ~20 snapToGrid call sites work without changes.
- **Pin-based device alignment** — Replaced hardcoded Y offsets in templates with `alignDeviceToPin()` and `getPinOffsetY()` that read actual pin positions from symbol definitions. Coils, terminals, contacts all align pin-to-pin. If symbol geometry changes, alignment stays correct.
- **`getPlcPinWorldYs()`** — Reads actual PLC pin positions from symbol data instead of assuming HEADER_HEIGHT + i * PIN_SPACING.
- **Reverted previous offset routing approach** — Session 20's start/end point offset approach caused regressions (COM wires overshooting). Reverted to clean algorithm, then researched proper approach (libavoid papers).
- **Wire routing evolution document** — `memory/wire-routing-evolution.md` tracks all routing approaches tried, what worked/failed, current state.
- **CLAUDE.md engineering standards updated** — No redundant confirmations, no fetch permission prompts, minimize back-and-forth.
- **Settings optimized** — Replaced ~60 individual permission rules with 15 wildcards + `acceptEdits` mode.

**Key Discovery**: The wire bending issue was TWO problems: (1) routing direction — fixed with edge filtering, (2) device placement alignment — fixed with pin-based positioning. Template math was correct for plcY=45 but user's project had stale plcY=40 from older session.

**Files Modified**:
- `packages/core-engine/src/routing/types.ts` — ConnDirection type, startDirection/endDirection on RouteRequest
- `packages/core-engine/src/routing/visibility-graph.ts` — isEdgeAllowed(), edge filtering in buildVisibilityGraph()
- `packages/core-engine/src/routing/orthogonal-router.ts` — Pass direction constraints through
- `packages/core-engine/src/routing/routing.test.ts` — NEW: 37 routing tests
- `apps/web/src/renderer/circuit-renderer.ts` — rotatePinDirection(), pass pin directions to RouteRequest
- `apps/web/src/types.ts` — isSnapEnabled/setSnapEnabled global flag, conditional snapToGrid
- `apps/web/src/App.tsx` — Snap state, event listener for G key sync
- `apps/web/src/components/MenuBar.tsx` — Snap toggle in View tab
- `apps/web/src/components/StatusBar.tsx` — Clickable snap indicator, fixed missing 'pan' mode
- `apps/web/src/hooks/useCanvasInteraction.ts` — G keyboard shortcut for snap toggle
- `apps/api/src/ai-circuit-patterns.ts` — alignDeviceToPin(), getPinOffsetY(), getPlcPinWorldYs(), pin-based alignment in generateRelayOutput/generateRelayBank

**Next Session**:
1. **Alignment as a design principle** — Ensure ALL templates/AI generation uses pin-based alignment. Research professional schematic layout standards.
2. **L1/L2 power rails rendering** — Ladder blocks exist in data but rails may not render properly
3. **Wire numbers visible on canvas** — Renderer feature to show wire labels
4. **Cross-references** — Coil ↔ contact references on schematic
5. **Print/PDF output** — Verify Tabloid paper size, margins, scale-to-fit

---

### Session 20 - 2026-03-17 (AI Electrical Intelligence + Symbol Scaling + Layout System)
**Duration**: ~8 hours
**Completed**:
- **AI Electrical Intelligence P0-P4**: Enhanced system prompt (circuit rules, pin reference, patterns), template tools (generate_relay_bank, generate_power_section, generate_relay_output), post-gen ERC, rich context (pin status per device), ANSI preference
- **Symbol scaling 1.5x for Tabloid**: All 75 JSON symbols + PLC generators + Micro800 generators scaled via script (scripts/scale-symbols.mjs)
- **Tabloid (11×17) paper size**: Added as default, industry standard for US control panel drawings
- **Proportional layout system**: layoutForSheet() calculates device positions from paper dimensions — change paper size, everything repositions
- **Grid alignment**: All pin absolute Y positions land on 20px grid multiples, eliminating unnecessary wire bends
- **ANSI symbols horizontal**: ansi-coil, ansi-normally-open-contact, ansi-normally-closed-contact redrawn with pins left/right
- **Terminal symbol**: Single pin (right), right-side terminals rotated 180° via transforms
- **PSU symbol**: Pins snapped to grid-aligned positions (30/60)
- **Ladder blocks + rungs**: generateRelayBank creates LadderBlock + Rung entities per DO sheet with page-based numbering (sheet 2 → 201-208)
- **AI chat tools**: move_device (with overlap warning), delete_device (cascades), delete_wire, create_ladder_block, add_rung, auto_layout_ladder
- **Schematic design rules**: 10 categories documented (IEC 61082, NFPA 79, industry standards), 8 layout rules in AI system prompt
- **symbols:refresh improvement**: Now builds core-model + waits for API auto-reload in one command
- **Production requirements documented**: P0-P2 checklist for launch (rate limiting, print, auth, deployment)

**Key Decisions**:
- Templates are the reliable foundation, AI is the productivity layer on top
- Symbols designed at 1:1 for Tabloid — no viewport scaling needed (EPLAN approach)
- ANSI/NEMA is the default standard (user preference)
- Fix the tool, never the individual project (all improvements are permanent)

**Next Session P0**: Wire router pin exit direction — wires from PLC DO pins bend downward instead of going straight horizontal. Router needs to respect pin exit direction and not route around parent device bounding box.

**Blockers/Questions**: Anthropic API credits showed "too low" error despite $19 balance — may be a workspace/key mismatch.

### Session 19 - 2026-03-16 (AI Chat Panel + Electrical Intelligence Plan)
**Duration**: ~3 hours
**Completed**:
- **AI Chat Panel** — Persistent sidebar chat with Claude tool use (place_device, create_wire, add_annotation, add_sheet, list_symbols). AI modifies drawings directly and reloads project on completion.
- **Resizable right panel** — Drag left edge, 200-600px range, persists to localStorage
- **AI tab first position** — AI is leftmost tab in right panel
- **Centralized AI model ID** — `apps/api/src/ai-config.ts` single source of truth for model string
- **Sheet targeting fix** — AI chat place_device/add_annotation accept `sheetName` to target correct sheet
- **ANSI preference** — User prefers ANSI/NEMA symbols (circle coils, CR tags), saved to memory
- **Micro870 16-relay project** — Built via MCP: 3 sheets, 2 PLC DO-8 modules, 16 ANSI relay coils, 16 wires
- **Print capabilities** — Added to TODO list (user needs printed drawings)

**Key Discovery**:
AI generates electrically incomplete circuits — open coil returns, no power connections, missing relay contacts. Planned comprehensive 6-priority roadmap (P0-P5) for AI Electrical Intelligence. See `memory/ai-electrical-intelligence-plan.md`.

**Next Session**:
1. P0: Enhanced system prompt with electrical rules + circuit patterns
2. P2: Template tools (generate_relay_output, generate_plc_relay_bank, run_erc_check)
3. P1: Rich circuit context (pin connection status per device)
4. P3: Post-generation ERC + auto-fix loop

**Session End Notes**:
- User is building a REAL panel — Micro870 controlling 16 refrigeration machine relays
- User prefers ANSI/NEMA symbols, not IEC
- AI chat model ID was wrong (claude-sonnet-4-5-20250514 → 20250929), now centralized in ai-config.ts
- The AI chat's tool_use works well but needs electrical knowledge to generate correct circuits

### Session 17 - 2026-03-08 (Symbol Accuracy Audit Batch 2)
**Duration**: ~30 min
**Completed**:
- **iec-changeover-contact** — Removed incorrect wide horizontal bar spanning full width at y=25; arm now goes directly from common pivot to NC contact bar
- **iec-contactor-3p** — Replaced non-standard 12x12 rectangles + U-shaped bridges on each pole with standard IEC NO contact parallel bars + dashed mechanical linkage line
- **iec-selector-switch-3pos** — Changed from contact-style parallel bars to switch-style terminal dots + diagonal arm (consistent with Session 16 switch fixes)
- **iec-transformer-3ph** — Expanded from 2 pins (H1, X1) to proper 6 pins (H1-H3, X1-X3); widened to 60px; 3 primary + 3 secondary coils with core lines

**Files Modified**:
- `packages/core-model/src/symbols/builtin-symbols.json` — 4 symbols updated

**Tests**: 125 E2E all passing

**Still In Progress**:
- Continue verifying remaining symbols (transformer-1ph full circles, surge arrester, horn, etc.)

---

### Session 16 - 2026-03-06 (Symbol Accuracy Fix — Switches vs Contacts)
**Duration**: ~1 hour
**Completed**:
- **Switch symbol audit & fix** — Identified that 10 switch-type symbols incorrectly used contact-style parallel bars instead of proper switch-style arm/lever with contact dots
- **Fixed 10 symbols** — iec-emergency-stop, iec-limit-switch, iec-manual-switch, iec-selector-switch, iec-key-switch, iec-foot-switch, iec-level-switch, iec-flow-switch, iec-pressure-switch, iec-temperature-switch
- **Key distinction**: Contacts (relay/contactor) use parallel bars = correct. Switches (pushbutton, limit, etc.) use diagonal arm with terminal dots = correct.
- **Database sync workflow discovered** — Editing builtin-symbols.json doesn't auto-update the running app; must rebuild core-model + PUT to API with converted format (geometry, position on pins)
- **Documented in memory** — Added "Symbol JSON → Database Sync" section to MEMORY.md

**Files Modified**:
- `packages/core-model/src/symbols/builtin-symbols.json` — 10 switch symbols updated
- `memory/MEMORY.md` — New section on symbol DB sync workflow

**Tests**: 125 E2E all passing

**Still In Progress**:
- Continue verifying remaining symbols against IEC 60617 references
- User reviewing updated symbols in browser

---

### Session 15 - 2026-03-04 (Symbol Editor Enhancements + Canvas Rendering Polish)
**Duration**: ~2 hours
**Completed**:
- **Symbol Editor Resize Handles** — 8 handles for rectangles (4 corners + 4 edge midpoints), 4 cardinal handles for circles. Drag to resize with grid snap support. Min size constraint of 5px.
- **Vertex Editing** — Draggable vertex handles on polyline/line points. Double-click a polyline segment to insert a new vertex. Lines auto-promote to polyline when vertex added.
- **Numeric Inputs** — Properties panel shows coordinate/dimension fields: X/Y/W/H for rects, CX/CY for circles, X1/Y1/X2/Y2 for lines, scrollable vertex list for polylines, X/Y for text and pins.
- **Duplicate (Cmd+D)** — Copies selected paths with +20 offset, new IDs, selects duplicates. Also added toolbar button.
- **SVG Tool Icons** — Replaced text labels (Line, Rect, etc.) with inline SVG icons for drawing tools.
- **Canvas Rendering Polish** — Applied `lineCap: 'round'` and `lineJoin: 'round'` to main circuit renderer. Bumped `symbolStrokeWidth` and `wireWidth` from 1.5→2, `wireWidthSelected` from 2→2.5 across all 5 themes.
- **E2E Test Fixes** — Fixed 3 pre-existing failures from Session 14 UI restructure: tab name "Favorites"→"Favs", property selectors `.sidebar`→`.right-panel`, delete button strict mode.
- **Handle Architecture** — Unified `HandleInfo` type + `getHandleAtPoint()` function for hit testing across rect/circle/polyline/line handles. Cursor management for directional resize cursors.

**Files Modified**:
- `apps/web/src/components/SymbolEditor.tsx` — +409 lines: resize handles, vertex editing, numeric inputs, duplicate, SVG icons
- `apps/web/src/App.css` — Styles for numeric inputs, SVG tool buttons, vertex list
- `apps/web/src/renderer/circuit-renderer.ts` — Added round lineCap/lineJoin
- `apps/web/src/renderer/theme.ts` — Stroke width updates across all themes
- `e2e/tests/app-loads.spec.ts` — Tab name fix
- `e2e/tests/property-editing.spec.ts` — Selector fixes for right panel

**Tests**: 125 E2E all passing, TypeScript clean

**Next Session**:
1. Delete vertices (right-click or select+Delete on polyline vertex)
2. Design system CSS variable implementation
3. Inline annotation editing
4. Symbol creation/verification tool

---

### Session 14 - 2026-03-04 (UI Layout Restructure + Design System)
**Duration**: ~2 hours (across 2 context windows)
**Completed**:
- **Left Sidebar Restructured** — Converted from properties panel to page explorer: sheet tree (click=switch, double-click=rename, x=delete), title block editor for active sheet, theme/debug footer. Removed all selection/device/wire/annotation props.
- **Right Panel Properties Tab** — Added 4th tab "Props" to right panel (Symbols/Favs/Parts/Props). Moved all device, wire, and annotation property editing here. Auto-switches to Properties on selection with `previousTabRef` restore pattern on deselect.
- **SheetTabs Close Buttons** — Added x close button on each sheet tab (hidden when 1 sheet), right-click context menu for rename/delete.
- **App.tsx Props Rerouted** — Selection/circuit props moved from Sidebar to RightPanel, sheet CRUD props added to Sidebar.
- **Design System Established** — Read full Refactoring UI book (252 pages), extracted comprehensive design tokens. Cross-referenced with 2025-2026 modern patterns (progressive disclosure, contextual UI, command palettes, micro-interactions, dark-first). Saved to `memory/design-system.md`.

**Design System Key Decisions**:
- Canvas theme = document (user-controlled). Chrome theme = application (fixed dark mode).
- Spacing scale: 4/8/12/16/24/32/48px
- HSL color palette: 10 blue-tinted greys + primary blue (7 shades) + semantic (success/warning/danger/info)
- Typography: system font stack, 11-18px scale
- Shadows: 5-level elevation system (xs through xl, two-part)
- Progressive disclosure: show only what's relevant to current task
- Contextual UI: controls near the action, not just in fixed panels

**Files Modified**:
- `apps/web/src/components/Sidebar.tsx` — Rewritten as page explorer
- `apps/web/src/components/RightPanel.tsx` — Added Properties tab with auto-switch
- `apps/web/src/components/SheetTabs.tsx` — Added close buttons + context menu
- `apps/web/src/components/PropertiesPanel.tsx` — Read (unchanged, moved to RightPanel)
- `apps/web/src/App.tsx` — Props rerouted between Sidebar and RightPanel
- `memory/design-system.md` — New design system reference document

**Blockers/Questions**: None

**Next Session**:
1. Implement CSS variable system with design tokens
2. Separate canvas theme from UI chrome
3. Inline annotation editing (replace prompt windows)
4. Apply spacing/typography/shadow consistency

---

### Session 13 - 2026-03-03 (SymbolEditor Multi-Select + Marquee + Rotate + Snap Toggle)
**Duration**: ~30 minutes
**Completed**:
- **Multi-select in SymbolEditor** — Replaced `selectedPathId: string | null` with `selectedPathIds: Set<string>`. Updated all 20+ references: rendering highlights, drag, delete, flip, properties panel, undo/redo, keyboard shortcuts, clear.
- **Marquee selection** — Drag on empty space in select mode draws a blue dashed rectangle with semi-transparent fill. On release, all paths whose AABB intersects the marquee are selected. Shift+drag adds to existing selection.
- **`getPathBounds()` helper** — Computes axis-aligned bounding box for any path type (line, rect, circle, arc, text, polyline). Used for marquee intersection via `rectsIntersect()` AABB test.
- **Shift+click toggle** — Shift+clicking a path toggles it in/out of the selection set without replacing existing selection.
- **Multi-select operations** — Drag moves ALL selected paths. Delete removes ALL selected. Flip V/H applies to all selected. Properties panel shows "N items selected" summary with shared dashed toggle.
- **Rotate** — New "Rotate" button in toolbar + R key shortcut. Rotates selected paths 90° CW around their collective center. Arc angles adjusted during rotation.
- **Snap-to-grid toggle** — "Snap to Grid" checkbox below tool actions. When unchecked, positions are not snapped to grid, allowing freeform placement. Affects drawing, dragging, and rotation.

**Files Modified**:
- `apps/web/src/components/SymbolEditor.tsx` — All changes in this single file (~100 lines added/modified)

**Test Results**:
- 125 E2E tests passing (all green)
- TypeScript clean (no new errors in SymbolEditor.tsx)

**Blockers/Questions**: None

**Next Session**:
1. Symbol creation/verification tool — reliable tooling for building and validating symbols
2. Automatic terminal block calculation (Phase 3-4)
3. Cloud deployment (AWS Lambda + CDK)

**Session End Notes**:
- All changes are in one file (SymbolEditor.tsx) making review straightforward
- The `getPathBounds` function uses conservative bounds (full circle for arcs) — good enough for marquee selection
- Rotation rotates around the collective center of all selected paths' points, snapped to grid

---

### Session 12 - 2026-03-01 (Power Distribution Ladder Rewrite + Architecture Assessment)
**Duration**: ~1.5 hours
**Completed**:
- **Power Distribution Ladder Rewrite** — Replaced vertical schematic layout in `generatePowerDistribution()` with ladder-block layout using L1/N rails. Each branch circuit (SPD, outlet, light, fan, PS1, PS2) is a horizontal rung with a 1P breaker feeding the load. Uses the full ladder pipeline: `createLadderBlock` → rungs → `autoLayoutLadder` → series wiring → `createLadderRails`.
- **Transformer Handling** — Placed separately after standard rungs because H1/H2 pins don't match the standard '1'/'2' convention that `createLadderRails` expects. Manual junction creation + wiring to extend rails.
- **PS Output Terminals** — +/- DC terminals placed below power supply rung positions, wired to PS pins 3/4.
- **Architecture Assessment** — Thorough code review of all layers. Overall score: 8.7/10. Foundation is general-purpose with motor-starter logic properly isolated in templates.

**Architecture Assessment Summary**:
- Data model (types.ts): 9/10 — Device, Net, Connection, Part are domain-neutral
- Symbol system: 9/10 — JSON library, parametric generators, 4-tier resolution
- Circuit operations: 10/10 — Zero domain assumptions
- Rendering: 9/10 — Canvas-based, symbol-generic
- Template isolation: 9/10 — Motor logic in templates, not core
- ERC: 8/10 — Strong core checks, device classifier could be schema-aware

**Files Modified**:
- `packages/mcp-server/src/circuit-templates.ts` — Rewrote `generatePowerDistribution()` (ladder layout)

**Test Results**:
- 3 direct function tests: default (4 rungs/18 devices/20 wires), all options (6 rungs/33 devices/38 wires), minimal (1 rung/6 devices/5 wires) — all pass
- 125 E2E tests passing
- 45 core-engine unit tests passing
- TypeScript clean, build passes

**Blockers/Questions**: None

**Next Session**:
1. Commit all uncommitted changes (new symbols + power dist rewrite)
2. Deploy API to cloud (Railway/Fly.io + managed Postgres)
3. Configure Cognito OAuth providers in AWS Console
4. Gate AI features behind auth

**Session End Notes**:
- Changes are NOT committed yet — multiple files modified across sessions
- The `createLadderRails()` function assumes devices use pin '1' (L1 side) and pin '2' (L2 side) — this works for all standard 2-pin devices and power supplies, but NOT for transformers (H1/H2 pins). Transformer rungs require manual junction/wiring.
- Architecture is sound — proceed with breadth (more symbols, more templates, more vendor integrations) rather than architectural refactoring

---

### Checkpoint: 2026-02-13 - Visibility Bug Fix + Canvas Panning

**Changes Made**:
- Fixed visibility bug: RAF coalescing in Canvas.tsx had `needsRenderRef` boolean stuck at `true`
  - Root cause: `cancelAnimationFrame` in effect cleanup cancelled pending RAF before it could reset the flag
  - Fix: Replaced with cancel-and-reschedule pattern — each effect run cancels pending RAF and schedules new one
  - Bonus: Canvas buffer only resets on actual container resize (uses `clearRect` otherwise)
- Implemented canvas panning:
  - Click+drag on empty space = pan (was always marquee, making pan impossible)
  - Space+drag = pan from anywhere (even over devices)
  - Middle-mouse-button drag = pan from anywhere
  - Shift+drag on empty space = marquee selection (was the old default)
- Removed dead pan code that was unreachable (line 628-661 in old useCanvasInteraction.ts)

**Files Modified**:
- `apps/web/src/components/Canvas.tsx` — Fixed RAF rendering, buffer optimization
- `apps/web/src/hooks/useCanvasInteraction.ts` — Added panning (3 methods), changed marquee to Shift+drag
- `e2e/helpers/canvas-helpers.ts` — Updated dragMarquee to hold Shift automatically

**Debugging Process** (documented for future reference):
1. Browser screenshot showed empty canvas despite "19 devices · 24 wires" in header
2. JS eval showed canvas buffer stuck at 300x150 (HTML default) while CSS stretched to 1270x682
3. Manual `fillRect` test proved canvas element worked — rendering code never executed
4. React fiber inspection found `needsRenderRef.current === true` (stuck!)
5. Traced to `cancelAnimationFrame` in cleanup cancelling the RAF that would have reset the flag
6. Reverted to direct render approach, then re-added RAF with safe cancel-and-reschedule pattern

---

## 🗺️ Roadmap Overview

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| 0 | Foundation | 🟢 Complete | Week 1-2 |
| 1 | Golden Circuit (CLI) | 🟢 Complete | Week 3-4 |
| 2 | Minimal Editor | 🟡 In Progress (40%) | Week 5-7 |
| 3 | Engine Expansion | ⚪ Not Started | Week 8-10 |
| 4 | Symbol Library & Parts DB | ⚪ Not Started | Week 11-13 |
| 5 | AI Assistance | ⚪ Not Started | Week 14-15 |
| 6 | DXF Import/Export | ⚪ Not Started | Week 16-17 |
| 7 | Polish & Usability | ⚪ Not Started | Week 18-20 |
| 8 | Alpha Release | ⚪ Not Started | Week 21-22 |

**Legend**: 🔴 Current | 🟡 In Progress | 🟢 Complete | ⚪ Not Started

---

## 🧪 Golden Circuits (Regression Tests)

These are our end-to-end test cases. Each must always validate and export correctly.

### 1. Three-Wire Motor Starter (Phase 1)
**Status**: ✅ Created (hardcoded in code)
**Location**: `packages/project-io/src/golden-circuit.ts` (needs JSON export)
**Components**:
- K1 (contactor - Schneider LC1D09)
- S1 (start button - Schneider XB4BA31)
- S2 (stop/E-stop button - Schneider XB4BS142)
- F1 (overload relay - Schneider LR2D1308)
- M1 (3-phase motor, 1HP)
- X1 (terminal strip - Phoenix PT-2.5)
- PS1 (24VDC power supply - Mean Well HDR-15-24)
**Tests**:
- ✅ BOM: 7 items, properly grouped by manufacturer
- ✅ Wire list: 11 connections with proper pin mappings
- ✅ Validation: 0 errors, 5 warnings (expected - circuit simplified)

### Future Golden Circuits
- PLC I/O circuit (Phase 3)
- Multi-page circuit (Phase 3)
- Complex terminal plan (Phase 3)
- Three-phase power distribution (Phase 4)

---

## 🔧 Technical Decisions Made

| Decision | Choice | Rationale | Date |
|----------|--------|-----------|------|
| Language | TypeScript | Browser compatibility, AI-agent productivity | 2026-01-26 |
| UI Framework | React + Vite | Strong ecosystem, good for canvas/complex UI | 2026-01-26 |
| Persistence (MVP) | IndexedDB or SQLite WASM | Local-first, no server required | 2026-01-26 |
| Packaging | Monorepo (pnpm/Turborepo) | Clear boundaries, agent-friendly | 2026-01-26 |
| Canvas | HTML Canvas 2D (start) | Simple, fast enough for MVP | 2026-01-26 |
| Testing | Golden circuits + Jest | End-to-end + unit tests | 2026-01-26 |
| E2E Testing | Playwright | Canvas coord testing, state bridge, headless CI | 2026-02-05 |
| CLI name | "fcad" (not "vcad") | Better branding, aligns with "fusionCad" | 2026-01-26 |
| Module system | ESM (type: module) | Modern, better for Node + browser | 2026-01-26 |

---

## 📚 Key Documents

- `ROADMAP.md` - Detailed phase breakdown (master plan)
- `STATUS.md` - This file - current state (read every session)
- `ARCHITECTURE_v0.6.md` - System architecture, multi-tenancy, design principles
- `README.md` - Project overview and getting started

---

## 🚨 Known Issues / Blockers

**No persistence (HIGH PRIORITY):**
- Circuits disappear on page refresh - all work lost
- Need to implement save/load before users can actually use the app
- Decision pending: storage strategy (see Ideas section below)

**Routing aesthetics (low priority):**
- Some wires have unnecessary-looking jogs where they turn, continue briefly, then turn back (e.g., W001 has down→left→down pattern)
- Root cause: Optimal direct waypoints sometimes fall inside obstacle bounds, forcing detours through available grid points
- All connections are electrically correct and reach their terminals
- Decision: Acceptable for now. Post-processing to straighten paths would add complexity without functional benefit
- Future: Could be addressed with smarter waypoint placement or path smoothing algorithm

---

## 💡 Ideas / Future Considerations

### High Priority Automation Features

**ERC: Hot-to-Neutral Short Circuit Detection** ⭐⭐ (NEXT PRIORITY)
- Fundamental electrical safety rule: never connect hot to neutral/return without a load
- L1 → N = short circuit (ERROR)
- L1 → breaker → N = still a short (breaker is protection, not a load) (ERROR)
- L1 → breaker → motor → N = valid (motor is a load) (OK)
- **Implementation plan:**
  1. Build net reachability graph (BFS/Union-Find through connections)
  2. Classify device categories: `load` (motor, coil, heater, resistor, light), `protection` (breaker, fuse, disconnect), `switching` (contact, relay)
  3. New ERC rule: if two power rails of different potential are connected through a path with no load device → error
- **Infrastructure needed:** Multi-device path tracing (current ERC only checks single devices)
- **Data available:** Pin types (power, input, output), net types (power, signal, ground), ladder rail labels (L1/L2), part categories
- **Key files:** `packages/core-engine/src/erc.ts`, `packages/core-model/src/types.ts`
- User priority: CRITICAL — this is the most basic electrician rule

**Automatic Terminal Block Calculation** ⭐ (Phase 3-4)
- When you specify terminals in your design (e.g., 20 terminals on a PLC breakout)
- And specify the terminal block type (e.g., Phoenix PT-2.5 with 5 positions per block)
- BOM should automatically calculate quantity needed (e.g., 4 blocks for 20 terminals)
- This is core to "automation-first" - no manual counting/calculation
- Related: Terminal strip layout generation, wire number assignment per terminal
- User priority: HIGH - critical for real electrical work

**Panel Layout Editor** ⭐ (Phase 6-7)
- Physical arrangement of components in enclosure (different from schematic)
- DIN rail layout with proper spacing
- 3D wire routing and cable management
- Wire duct placement and sizing
- Auto-generate panel cutout drawings
- User priority: HIGH - essential for real electrical work

### Storage Strategy ✅ IMPLEMENTED (2026-01-29)

**Decision:** Postgres + TypeORM with REST API

**What's working:**
- Docker Postgres on port 5433
- Express API server (apps/api) on port 3001
- Auto-save with 1-second debounce
- Project management (create, rename, delete, switch)
- Circuit data stored as JSONB (devices, nets, parts, connections, positions)

**Future considerations:**
- Cloud deployment (user accounts, 1 free project limit)
- Symbol library in cloud (too big for core bundle)
- Offline support with sync

### Symbol Library Strategy (Phase 4+)

**Sources identified:**
- [chille/electricalsymbols](https://github.com/chille/electricalsymbols) - 33 IEC 60617 symbols, MIT license
- [upb-lea/Inkscape_electric_Symbols](https://github.com/upb-lea/Inkscape_electric_Symbols) - 100+ symbols, MIT
- [KiCAD Official](https://kicad.github.io/symbols/) - 1000+ components, CC-BY-SA/CC0

**Approach:**
1. Create JSON symbol schema (pins, geometry, metadata)
2. Convert SVG symbols from GitHub libraries
3. Build symbol browser UI
4. Eventually: cloud-hosted symbol registry

### DXF/DWG Import/Export (Phase 6+)

**Libraries identified:**
- **Export (DXF):** [@tarikjabiri/dxf](https://www.npmjs.com/package/@tarikjabiri/dxf) - MIT, pure TypeScript
- **Import (DWG/DXF):** [libredwg-web](https://github.com/mlightcad/libredwg-web) - GPL-2.0, WASM-based

**Priority:**
1. DXF export first (easier, more demand)
2. DXF import second
3. DWG import last (complex format)

### Post-MVP Considerations

- Desktop app (Tauri) - deferred to post-MVP
- ~~Cloud sync - deferred to post-MVP~~ → May need sooner for symbol library

---

## How to Use This File

**At the start of each session**:
1. Read "Quick Context" section
2. Check "Current Phase" progress
3. Review "Session Log" for last session notes
4. Look at "Next Immediate Steps"

**At the end of each session**:
1. Update progress checkboxes
2. Update "What Works Right Now"
3. Add entry to "Session Log"
4. Set "Next Immediate Steps" for next session
5. Update "Last Updated" date at top
6. Commit changes to git

**When completing a phase**:
1. Check all Definition of Done items
2. Update roadmap table status (🟢 Complete)
3. Move to next phase (🔴 Current)
4. Update ROADMAP.md current phase indicator

## Session 32 — 2026-03-26: Symbol Audit + Auto Wire Numbering

**Duration**: ~3 hours
**Focus**: Symbol audit for mm conversion artifacts, auto wire numbering from rungs

### Completed
- **Symbol audit (86 symbols)**: Fixed hardcoded `#00ff00` fills on 4 symbols (iec-diode, iec-led, iec-chassis-ground, ansi-manual-switch), removed invalid `stroke="stroke"` on source/destination arrows, hardened renderer `stroke` property handling
- **Symbol DB auto-sync**: API now upserts all builtin symbols on startup (compares JSON vs DB, only writes changes). No more forgotten syncs after editing builtin-symbols.json
- **Synced all 86 symbols to DB** including ANSI coil spurious arcs fix from Session 31
- **Auto wire numbering**: Wire number = rungDisplayNumber × 10 + L-to-R node index (e.g., rung 101 → wires 1011, 1012, 1013). Position-based rung enrichment includes nearby devices. Power nets keep names (L1, L2, +24V). 7 unit tests.
- **Ladder config merging**: Partial block configs now merge with DEFAULT_LADDER_CONFIG instead of replacing entirely — was causing missing railL1X/railL2X/firstRungY
- **Default rungSpacing**: Increased from 12.5mm to 30mm to prevent symbol overlap between rungs
- **Wire label rendering**: Labels now sit above wire instead of on top with opaque background, no longer visually interrupting the wire

### Key Decisions
- Wire numbering formula: `rungNum * 10 + nodeIndex` (industry standard, prevents bleed into next rung's number space)
- Wire numbering is automatic during render — no manual trigger needed
- Position-based rung enrichment uses device Y position within halfSpacing of rung Y
- L-to-R wire ordering uses actual X positions of endpoint devices, not array index

**Tests**: 121 E2E + 82 unit, 86 symbols

## Session 33 — 2026-03-28: Wire Routing Rewrite + PLC Symbols + UX Features

**Duration**: ~5 hours
**Focus**: Wire routing architecture overhaul, PLC symbol creation, editor UX improvements

### Completed
- **Wire routing rewrite**: Removed visibility graph + A* + nudging auto-router (-253 lines). Replaced with KiCad-style direct/L-shape routing via `toOrthogonalPath()`. No obstacle avoidance — wires go where you point them.
- **Full-width title block**: 3-column layout spanning entire page bottom (company | title | rev)
- **Auto rung count**: Fits page height, no more overflow off Tabloid
- **Rung gap slider**: 15-50mm range in sidebar with themed styling
- **2080-LC50-24QBB PLC symbols**: Separate input (14 DI) and output (10 DO) terminal blocks with dual-side layout (signals on main side, power/common on opposite side)
- **Continuous placement mode**: Stay in placement mode until Escape/V, Shift+click for single placement
- **Display toggles**: Show grid, pin labels, descriptions (all in sidebar DISPLAY section)
- **Multi-select common properties**: Props panel shows shared type/part info when multiple same-type devices selected
- **Arrow key nudging**: Move selected devices by 5mm grid step with undo support
- **Single wire color**: Removed rainbow per-wire coloring
- **Wire start indicator**: Reduced from 10mm to 3mm radius
- **Junction cleanup**: Invisible junction symbol (wire endpoints sufficient), hidden "Wire junction" label
- **Default rungSpacing = 15mm**: Matches PLC pin spacing for perfect alignment
- **Grid-aligned symbol generator**: 40mm width, 5mm grid multiples for all pin positions
- **Symbol creation rules**: `.claude/ai-rules/symbol-creation-rules.md` for AI-assisted symbol generation
- **Multi-symbol parts architecture**: Designed `deviceGroupId`-based linking for PLC CPU+IO+PSU
- **Agents API research**: Concluded raw API + tool-use is better than Agent SDK for fusionCad
- **Priority list reorganized**: P0=features, P1=quality, P2=infra, P3=business

### Key Decisions
- Professional schematic editors (KiCad, EPLAN, AutoCAD Electrical) do NOT use auto-routing for schematic wires — manual/template placement is the standard
- Visibility graph + A* routing module kept as library for future auto-layout, but removed from render path
- PLC pin spacing (15mm) should match rung spacing for natural alignment
- Bus wire entity (Phase C) and interactive wire drawing tool (Phase D) deferred to future sessions

**Tests**: 121 E2E + 82 unit, 86 symbols + 10 PLC generators

## Session 34 — 2026-03-29: Find/Replace, Symbol Importers, Panel Layout

**Duration**: ~6 hours
**Focus**: Find/Replace, multi-symbol parts, SVG/DXF importers, panel layout sheets

### Completed
- **ES2022 bump**: Web app target updated from ES2020 to ES2022
- **Find/Replace dialog (Cmd+F)**: Search device tags/functions, replace one/all, navigate results, case sensitivity
- **Multi-symbol part linking**: `requiredSymbols` field on Part type, 2080-LC50-24QBB catalog entries, PropertiesPanel companion warning (amber incomplete / green complete)
- **SVG importer**: Parse SVG → fusionCad primitives + auto-detect pins (boundary endpoints, small circles). 3 unit tests.
- **DXF importer**: Parse DXF → fusionCad primitives with Y-flip, block resolution, unit detection. Tested with real Rockwell Automation 2080-L50E-48QBB files.
- **Import dialog UI**: Tools > Import, drag-and-drop, Schematic/Layout toggle, pin editing, saves to API (database) with localStorage fallback
- **Layout symbol support**: `usage` field on SymbolDefinition ('schematic' | 'layout'), palette filtering, Layout filter button
- **Panel-layout sheet type**: New layout option in sidebar, DiagramType 'panel-layout'
- **Panel scale**: Sheet scale dropdown (1:1 to 1:10) for panel-layout sheets. Devices shrink by scale factor, sheet border stays at paper size.
- **Select All fix**: Now only selects devices on the active sheet
- **Symbol persistence**: Imported symbols save to database via API, localStorage fallback for offline
- **Category dropdown**: Import dialog has predefined categories with Schematic/Layout primary grouping

### Key Decisions
- Manufacturers distribute DWG/DXF primarily; SVG from aggregators. DXF is the priority format.
- DWG not supported — tell users to convert to DXF (free tools available)
- Panel scale = ctx.scale(1/panelScale) applied after title block, before devices
- Symbol persistence: API first, localStorage fallback. Review for production (P2 item).
- Multi-symbol parts use existing deviceGroupId infrastructure

**Tests**: 121 E2E + 85 unit, 86 symbols + 10 PLC generators

## Session 35 — 2026-04-04/05: Shape Annotations, DXF Fix, Symbol Protection

**Duration**: ~6 hours
**Focus**: Shape drawing tools, DXF import bugfix, symbol safety, layout symbols

### Completed
- **DXF import fix**: Diagonal lines caused by shared polyline endpoint references double-transformed during Y-flip. Fixed with `{ ...points[0] }` clone.
- **Shape annotations**: Rectangle, circle, line, arrow on main canvas. S key to enter/cycle tools, click-drag to draw, Escape to cancel.
- **Shape editing**: Resize handles (corners for rect, cardinal for circle, endpoints for line/arrow). Right panel: stroke width, color, dashed, fill, lock size.
- **Multi-select**: Shift+click and marquee selection for annotations. All selected shapes move together.
- **Grouping**: Cmd+G groups selected annotations (shared groupId). Click any member selects all. Cmd+Shift+G ungroups.
- **Copy/paste**: Multi-annotation copy/paste with ghost preview. GroupIds remapped on paste.
- **Symbol protection**: Import dialog defaults to Layout. Warns before overwriting built-in/generated symbols. PLC DI/DO auto-seed on API startup.
- **PLC2 restoration**: Restored deleted PLC2 device + 17 connections from April 2 backup.
- **Layout symbols**: 4 DXF imports (1606-XLS240-UPS, 1606-XLS240E, 700-HK36, 700-HN121) + 6 rectangular footprints (700-HA32Z24, 700-HN100, QCR1015, SDU1024, UTTB 2.5, UT 2.5).
- **7 new E2E tests** for shape annotations (draw, position, select, delete, tool cycling).

### Key Decisions
- Shape annotations stored as extended Annotation type (annotationType: rectangle|circle|line|arrow) — reuses existing annotation CRUD pipeline.
- Used refs for shape drawing state to avoid stale closures in useEffect event handlers.
- Annotations render at paper coordinates (undo panelScale transform) so click position matches render position on layout sheets.
- selectedAnnotationId refactored to selectedAnnotationIds (string[]) for multi-select support.
- groupId field on Annotation for persistent grouping.

### Key Bugs Found & Fixed
- DXF polyline endpoints shared JS object references → double-transform during Y-flip/normalize → diagonal lines
- Shape drawing start was in mouseUp click handler instead of mouseDown → two-click instead of drag
- mouseWorldPos not tracked in shape mode → no live preview
- shapeToolType cycling used stale closure → S key cycling broken
- Annotation hit-test was after device hit-test → couldn't select shapes overlapping devices
- Annotation drag had no live feedback (only jumped on mouseUp)
- Ghost paste only handled first annotation, not multiple

**Tests**: 135 E2E + 85 unit, 86 symbols + 10 PLC generators

## Session 36 — 2026-04-06/07: AI-Assisted Symbol Import

**Duration**: ~3 hours
**Focus**: AI-assisted symbol import pipeline, manual symbol creation, compressor project review

### Completed
- **ANSI Emergency Stop NC symbol** — Manually created `ansi-emergency-stop-nc` from manufacturer SVG. Used SVG as geometry blueprint + ANSI contact dimensions (25mm wide, pins at y=10). IEC pin numbering (11/12), mushroom dome arc, NC bar, contact circles.
- **AI-assisted symbol import** — New `POST /api/symbols/ai-import-assist` endpoint. Takes raw SVG/DXF primitives + filename, Claude identifies the symbol type and returns clean geometry with proper pins, dimensions (5mm grid), category, and tag prefix. Frontend wired in SymbolImportDialog with purple "AI Assist" button.
  - Schematic mode: tested with e-stop SVG → correctly identified as Emergency Stop NC, set tag S, IEC pins 11/12
  - Layout mode: tested with Phoenix Contact UTTB 2.5 DXF (449 primitives → 10 clean layout primitives)
  - Fixed API_BASE bug: SymbolImportDialog was using bare `/api/` URLs hitting Vite instead of API on port 3001
  - Fixed pin validation: layout symbols with 0 pins were rejected by existing validation
- **Compressor sequencer project review** — Analyzed 221-device, 3-sheet design. Power chain (CB→PSU→UPS→PLC) is solid. Identified gaps: missing descriptions, no E-stop circuit, field-side protection references.
- **PLC pin/rung alignment** — Added details to P1 #15: COM pins need double spacing, three approaches documented (symbol-aware rung placement, auto-layout stretch, per-pin Y-offset)

### Key Decisions
- AI-assisted import is more valuable than AI symbol generation from scratch — the importer already has the geometry, AI adds understanding
- Layout mode AI needs prompt tuning — currently over-simplifies manufacturer DXFs (strips too much detail)
- AI Assist button enabled for both schematic and layout modes

### Key Files Changed
- `apps/api/src/ai-symbol-generate.ts` — Added `IMPORT_ASSIST_PROMPT` and `aiSymbolImportAssist()` function
- `apps/api/src/index.ts` — Added `POST /api/symbols/ai-import-assist` endpoint
- `apps/web/src/components/SymbolImportDialog.tsx` — AI Assist button, `API_BASE` fix, SVG source capture

**Tests**: 135 E2E + 85 unit, 86 symbols + 10 PLC generators

---

## Session 43 — 2026-04-16: Wiring Preview Regressions + Single-Pin Tool

**Duration**: ~1 full session
**Focus**: Verify Problem 5 stale-closure fix, investigate wiring system deeply, find+fix the "preview doesn't show" bugs on multi-sheet / multi-wire projects.

### Completed (5 wiring fixes shipped to main)
- **Problem 5 verified + regression test** — Mutation-tested the stale-closure fix that landed on `feature/wiring-fixes` last session. Added E2E that fails without the fix and passes with it. Merged to main.
- **Sheet-switch clears wireStart + wireWaypoints** — New `useEffect([activeSheetId])` in `useCanvasInteraction.ts`. Was leaking across sheets → phantom cross-sheet connections + silent preview drop (renderer filters devices by active sheet).
- **Cross-sheet pin-coord collision filter** — `getPinAtPoint` was iterating all 270+ devices on compressor project across all sheets. Junction on sheet IO at (35,35) collided with L terminal pin on Power-and-IO. Caller now filters by `activeSheetId` before invoking, matching the `getSymbolAtPoint` pattern.
- **Pin-over-wire precedence swap** — First-click logic preferred wire over pin. Once a pin had any wire attached, clicking that pin silently spawned a junction on the wire (no wireStart, no preview). Every click spawned another junction. User in reproduction created 8 junctions attempting to draw 3 wires. Fix: pin wins when both match. Wire-branching still works when click is on bare wire.
- **Branch-from-wire sets wireStart** — `connectToWire` returns the new junction's device ID. Setting wireStart to that junction's pin 1 so users see the preview for the new branch.

### Also
- **Deep investigation** — `docs/investigations/wiring-system.md` (1101 lines) mapping 6 scopes: wire lifecycle, visibility graph (surprise: A* router exists in `core-engine` but is UNUSED by web renderer), waypoint state machine, junction paths, segment drag, snap audit.
- **Living reference** — `docs/wiring.md` (282 lines): interaction flows, hit-testing precedence, render pipeline, 3-state waypoint semantic, §7 known-pitfalls log from Sessions 42+43, §8 guardrails for future changes.
- **Single-pin tool** (on `feature/single-pin-tool`, not yet merged) — New `pin-single` symbol (minimal dot, tagPrefix P), toolbar button next to shape tools, **N** keyboard shortcut. For quick hand-drawing workflows.

### Key Decisions
- **Pin wins over wire** on first click. Matches KiCad/EPLAN intuition. Branching now requires clicking bare wire (no pin in range).
- **Sheet-aware hit-testing** is mandatory. Any function that iterates `circuit.devices` in an interactive context must be called with a sheet-filtered array.
- **Live reference doc** (`docs/wiring.md`) separate from historical investigation (`docs/investigations/wiring-system.md`) and from change plan (`docs/plans/wiring-drag-quality.md`). Guardrail: update `docs/wiring.md` in the same PR as any wiring behavior change.
- **Mutation testing is now the bar** — "test passes" without verifying it fails without the fix is insufficient. Added to §8 guardrails.

### Key Files Changed
- `apps/web/src/hooks/useCanvasInteraction.ts` — sheet-switch clear effect, sheet-filter pins on both `getPinAtPoint` callers, swap pin/wire precedence, use `connectToWire` return value
- `packages/core-model/src/symbols/builtin-symbols.json` — `pin-single` symbol
- `apps/web/src/components/MenuBar.tsx` — pin toolbar button
- `e2e/tests/wire-creation.spec.ts` — 2 new regression tests (Session 42 Problem 5, Session 43 sheet-switch)
- `docs/wiring.md`, `docs/investigations/wiring-system.md` — created

### Remaining (tracked in `docs/wiring.md` §9 and `docs/plans/wiring-drag-quality.md`)
- Parallel wire overlap on device drag — needs sequential routing with wire-as-obstacle (A* integration, ~50-100 lines)
- Segment drag tolerance (1mm→10mm, 5 lines)
- Ghost preview snap-to-grid (2 lines)
- Re-audit junction proliferation now that click-precedence is fixed

**Tests**: 137 E2E + 105 unit, 90 symbols + 10 PLC generators

---

## Session 44-45 — 2026-04-17 to 2026-04-18: Movable Labels, Sequential Routing, MVP Polish

**Duration**: 2 days
**Focus**: Finish the high-risk wiring + labeling features before the MVP demo, put safety nets in place for future changes, seed the AI-generation work with a curated design-rules doc.

### Completed (merged to main)
- **Render fingerprint test suite** (Phase 0 safety net) — 4 E2E tests that lock current rendering audit output (device bounds, tag/function label positions, pin world positions). Any future change that shifts those numbers fails the test. Locked quirks including "tag labels anchor to `device.position`, NOT rotated bounds" and "empty waypoints array triggers 'waypoint' pathType in audit even for straight wires".
- **Movable tag labels (Option A)** — `Device.labelOffsets.tag` additive field. Tight bbox hit-test via `ctx.measureText` + 2mm pad in `apps/web/src/utils/tag-hit.ts`. Click precedence: selected-device-first or click-outside-device — matches Figma-style nested selection. Shared `getDefaultTagAnchor` helper keeps renderer + hit-test in sync. Verified on destination arrows (small 5×7.5mm symbols, smallest common case).
- **Sequential wire routing on device drag release** — integrated `routeWires()` from `@fusion-cad/core-engine` (A* + nudging). Router existed with 37 passing tests but was never wired to the web renderer. 20-line integration in `handleMouseUp` + 135-line wrapper in `apps/web/src/utils/sequential-route.ts`. Parallel wires now fan into a staircase on drag release instead of collapsing onto the same L-shape. Perf guard at 30 wires; falls back to L-shape on router failure.
- **Hoffman enclosure catalog** — `packages/core-model/src/parts/hoffman.ts`. A-series Type 1 enclosures + subpanels sized to HP. Motor starter generator now assigns A201608LP/A242008LP/A302408LP + matching subpanels to PNL1/SP1 instead of TBD placeholders. 4 unit tests verify the HP→size mapping.
- **Ghost preview snap-to-grid** — 2-line fix at `circuit-renderer.ts:1392`. Preview cursor + dashed line now snap, agreeing with where a click will land.
- **Single-pin tool (N)** — `pin-single` symbol (2.5×2.5 mm, 0.6mm filled dot, tagPrefix P), toolbar button in MenuBar next to shape tools, keyboard shortcut N, continuous placement. For quick hand-drawing.
- **AI design rules doc v0** (on `feature/ai-design-rules-doc`, pushed, awaiting user curation) — 75 rules across 13 categories, US/UL primary, schematic-only scope, MUST/SHOULD/STYLE tiers. Blocks Smart AI defaults.
- **Symbol audit static analyzer** (`scripts/audit-symbols.ts`, `npm run audit:symbols`) — read-only diagnostic that catches the 3P-middle-pin class of bugs + text-overlap + direction contradictions + INFO-level conventions. Deterministic output. Exits 1 on any ERROR-level finding.

### Audit round-1 fixes
- 4 symbols had the same 3P-middle-pin drift (visuals already at x=12.5, pin metadata stuck at x=10): `iec-disconnector-3p`, `iec-fuse-3p`, `iec-transformer-3ph`, `iec-vfd`.
- `pin-single`: removed `direction:"top"` — generic marker should accept wires from any side.
- `ansi-hoa-selector-3pos`: 4 pins direction left/right → bottom.
- `layout-advantech-ppc-6151c`: removed 2 decorative diagonal "screen-X" lines that cut through the product-label text.
- Audit rule refinements: skip pin-primitive-mismatch for symbols with no visual primitives (junction), and tighten direction-mismatch to only flag OPPOSITE-half contradictions (eliminated layout-symbol false positives).
- **Audit score: 94 symbols, 0 errors, 0 warns, 25 info** (all info findings are layout-symbol intentional — inches-dimensions, large descriptive fonts).

### Key decisions
- **Additive data model** for movable labels (`labelOffsets?` optional field) + render-fingerprint tests as a gate — feature is provably non-regressive for existing projects.
- **Integrate the existing router rather than build sequential-routing from scratch** — 37 tests, mature, saves 2 weeks of work. Integration is the risk, not the algorithm.
- **Breadth over depth on AI design rules** (user call) — v0 covers 13 categories with ~75 rules. Curation and refinement come before any AI wiring.
- **Audit before library expansion** (user call) — clean symbols first, then expand parts catalog, so each new part references a known-good symbol.
- **Mutation testing** standard for new regression tests — test must FAIL without the fix. Caught a weak parallel-wire overlap test early.
- **Layout sheet for motor starter** deferred from this session — the generator places panel footprints via `placeDevice` in `addPanelLayoutSheet`; visual verification pending.

### Key files added / changed
- `apps/web/src/utils/sequential-route.ts` — new, router integration wrapper
- `apps/web/src/utils/tag-hit.ts` — new, Option A tag bbox hit-test
- `apps/web/src/hooks/useCanvasInteraction.ts` — tag drag state + tag hit-test precedence + sequential re-route on drag release
- `apps/web/src/hooks/useCircuitState.ts` — `setDeviceTagOffset`
- `apps/web/src/renderer/symbols.ts` — `getDefaultTagAnchor` extracted + `drawTag` accepts `tagOffset`
- `packages/core-model/src/types.ts` — `Device.labelOffsets?.tag`
- `packages/core-model/src/parts/hoffman.ts` — new, enclosure catalog
- `packages/mcp-server/src/circuit-templates.ts` — `generateMotorStarterPanel` assigns Hoffman parts
- `packages/core-model/src/symbols/builtin-symbols.json` — 4 pin fixes + 3 cleanups + `pin-single` added earlier in session
- `apps/web/src/components/MenuBar.tsx` — single-pin toolbar button
- `scripts/audit-symbols.ts` — new, static analyzer
- `docs/ai-design-rules.md` — new (on feature branch)
- `docs/wiring.md` — §7.6 sequential routing fixed, §9 updated with heavy-project perf follow-up + ghost-snap done

### Remaining
- **User-curates `docs/ai-design-rules.md`** — highest-value next step; gates Smart AI defaults.
- **User manually redesigns HOA selector geometry** — audit can't fix the fundamental layout.
- Small wiring items: segment drag tolerance (5-line), junction proliferation re-audit.
- Motor starter layout-sheet visual verification.
- Heavy-project perf test for the new router (no data yet on 250-device projects).

**Tests**: 147 E2E + 109 unit, 94 symbols + 10 PLC generators
