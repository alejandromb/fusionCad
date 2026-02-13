# fusionCad Development Status

**Last Updated**: 2026-02-13 (Visibility Bug Fix + Canvas Panning)
**Current Phase**: Phase 2 - Minimal Editor
**Phase Status**: 99% Complete

---

## 📍 Quick Context (Read This First Every Session)

This file tracks where we are in development. **Always read this file at the start of a session** to understand current state.

### What Works Right Now

**Phase 0 & 1: Complete** ✅
- ✅ Monorepo structure with npm workspaces + ESM modules
- ✅ TypeScript configured across all packages
- ✅ Core model types defined (Part, Device, SymbolDefinition, etc.)
- ✅ **CLI renamed to "fcad"** (fusionCad - better branding!)
- ✅ **Golden Circuit**: 3-wire motor starter (7 devices, 11 connections)
- ✅ **JSON Persistence**: Save/load circuits from JSON files
- ✅ **BOM Generator**: Exports CSV with parts grouped by manufacturer
- ✅ **Wire List Generator**: Exports CSV with all connections
- ✅ **3 Validation Rules**: Duplicate tags, unconnected devices, dead-end nets
- ✅ **CLI Commands**: `fcad validate`, `fcad export:bom`, `fcad export:wires`

**Phase 2: Canvas Rendering** 🟡 (in progress)
- ✅ **Symbol rendering**: Devices drawn as rectangles with tags
- ✅ **Wire rendering**: Advanced orthogonal routing with obstacle avoidance
- ✅ **Pin visualization**: Cyan dots showing connection points
- ✅ **Pin labels**: Yellow labels (A1, A2, +, -, etc.)
- ✅ **Layout engine**: Manual positioning based on signal flow
- ✅ **Wire-to-pin connections**: Wires connect to specific pins (not centers)
- ✅ **Visibility graph routing**: Wires route around device bounding boxes
- ✅ **A* pathfinding**: Optimal path calculation through visibility graph
- ✅ **Wire separation (nudging)**: Overlapping segments automatically offset
- ✅ **Color-coded wires**: 11 unique colors for wire identification (with legend in sidebar)
- ✅ **Pan/zoom controls**: Mouse wheel zoom, click-drag pan
- ✅ **Debug mode toggle**: Show/hide wire labels for clean screenshots
- ✅ **Symbol placement tool**: Drag & drop symbols from palette with ghost preview
- ✅ **Wire drawing tool**: Click pin-to-pin to create connections
- ✅ **Symbol selection**: Click to select, dashed highlight, Delete to remove
- ✅ **Drag to reposition**: Move symbols by dragging
- ✅ **Snap to grid**: 20px grid for placement and dragging
- ✅ **Persistence**: Postgres + TypeORM, auto-save, project management UI
- ✅ **Copy/Paste**: Cmd+C/V/D for copy, paste, duplicate
- ✅ **Undo/Redo**: Cmd+Z and Cmd+Shift+Z (50 history entries)
- ✅ **Multi-select**: Shift+click to add/remove, Cmd+A to select all, move/delete all
  - ✅ Drag-select (marquee): Window select (left-to-right, fully enclosed) and Crossing select (right-to-left, any overlap)
- ✅ **Wire bend points**: Select wire, click to add waypoints, drag to adjust, double-click to delete
  - Orthogonal-only routing enforced (no diagonal wires)
  - Hit detection uses auto-routing for accurate clicks
- ✅ **Wire segment dragging**: Click-drag wire segments perpendicular to their direction
  - Horizontal segments drag up/down, vertical segments drag left/right
  - First/last segments auto-insert jog waypoints from pins
  - Collinear waypoints simplified on mouseup
- ✅ **Wire reconnection**: Drag wire endpoints to reconnect to different pins
  - Green handles show at endpoints when wire selected
  - Drag endpoint to new pin to reconnect
  - Preview line shows during drag
- ✅ **JSON+SVG Symbol Format**: Symbols defined with SVG path data
  - `SymbolPath` interface with `d` (SVG path), `stroke`, `fill`, `strokeWidth`
  - `SymbolText` interface for text labels
  - SVG path parser supports M, L, H, V, A, C, Q, Z commands
  - All 6 IEC symbols converted to JSON+SVG format
  - Foundation for importing external SVG libraries
- ✅ **Playwright E2E Tests**: 28 tests across 8 spec files
  - Separate test database (`fusion_cad_test`) and ports (API 3003, Vite 5174)
  - State bridge (`window.__fusionCadState`) for asserting on canvas state
  - Tests: app loading, placement, select/delete, copy/paste, undo/redo, multi-select, wires, persistence
  - Commands: `npm run test:e2e`, `test:e2e:headed`, `test:e2e:slow`, `test:e2e:ui`
  - `SLOWMO=<ms>` env var for human-supervised runs
- ✅ **JSON-based Symbol Library** (55 IEC 60617 symbols):
  - Symbols loaded from `builtin-symbols.json` at startup
  - Each symbol has: id, name, category, svgPath, pins, tagPrefix
  - `loadSymbolsFromJson()` converts JSON to internal SymbolDefinition
  - Renderer uses `lookupSymbol()` (ID first, then category fallback)
- ✅ **Insert Symbol Dialog**:
  - Searchable modal for selecting symbols (replaces old sidebar palette)
  - Category filtering, symbol preview with SVG rendering
  - Symbol ID passed through for correct rendering and tag generation
- ✅ **Symbol Editor** (Visual Symbol Builder):
  - Drawing tools: Line, Rectangle, Circle, Polyline
  - Pin placement with name, direction, type properties
  - Symbol metadata: name, category, tag prefix, dimensions
  - Real-time preview, save to library
  - Access from Symbol Library: "Create Symbol" and "Edit Symbol" buttons
- ✅ **Wire Preview**: Dashed green line from start pin to mouse during wire creation
- ✅ **Object Inspector (Editable Properties Panel)**:
  - Inline-editable device tag/function/location (click to edit, Enter/blur to commit, Escape to cancel)
  - Annotation selection on canvas click with cyan dashed highlight
  - Annotation properties sidebar (content, font size, font weight, delete)
  - Multi-select summary with tag chips when 2+ devices selected
  - Fixed createSnapshot() to include sheets/annotations/terminals in undo/redo
  - Fixed updateAnnotation() to push history (annotation edits now undoable)
  - 35 E2E tests passing

### What We're Working On
- ✅ ~~VISIBILITY BUG~~ — Fixed! RAF coalescing `needsRenderRef` was stuck at `true`
- ✅ Canvas panning — click+drag on empty space, Space+drag, middle-click
- Dual storage architecture planning (IndexedDB for free tier, Postgres for paid)

### Next Immediate Steps
1. **Add E2E visibility test** — verify that placed devices are actually visible on canvas
2. Wire preview improvement: Replace straight dashed line with orthogonal L-shaped preview
3. Implement IndexedDB storage for free tier (local-only)
4. Import symbols from external SVG libraries

---

## 🎯 Current Phase: Phase 0 - Foundation

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
- `ARCHITECTURE_v0.5.md` - System architecture and design principles
- `MVP_v0.2.md` - MVP scope and success criteria
- `README.md` - Project overview and north star

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
