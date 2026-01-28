# fusionCad Development Status

**Last Updated**: 2026-01-28 (morning session)
**Current Phase**: Phase 2 - Minimal Editor
**Phase Status**: 85% Complete (canvas interaction tools implemented)

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
- ⚪ Wire nodes (bend points) - not yet, but pin-to-pin working

### What We're Working On
- Phase 2: Canvas interaction tools complete, finalizing editor features

### Next Immediate Steps
1. **Persistence** - circuits lost on refresh! Decision needed:
   - Option A: IndexedDB (local-only, no account needed)
   - Option B: Cloud storage (requires backend, but enables sync)
   - Option C: Hybrid (local first, optional cloud sync)
   - Note: Cloud likely needed anyway for symbol library migration
   - Business consideration: 1 free project for free users?
2. Add wire nodes/bend points (allow intermediate points in wires)
3. Improve symbol shapes (draw actual IEC 60617 schematic symbols)
4. Multi-select and undo/redo

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

### Storage Strategy Decision (PENDING - Next Session)

**The problem:** Currently "local-first" but nothing persists. Page refresh = lost work.

**Options to evaluate:**
1. **IndexedDB only** (pure local-first)
   - Pro: No backend needed, works offline, privacy
   - Con: No sync across devices, no backup, symbol library stays in core

2. **Cloud storage** (Supabase, Firebase, or custom)
   - Pro: Sync across devices, backup, can migrate symbol library to cloud
   - Con: Requires backend, account system, costs

3. **Hybrid** (local-first with optional cloud)
   - Pro: Best of both worlds, graceful degradation
   - Con: More complex to implement

**Business consideration:**
- Free tier: 1 project (cloud) or unlimited (local-only)?
- Symbol library needs to move to cloud eventually (too big for core bundle)
- Other cloud candidates: user-created symbols, shared templates

**User's initial stance:** Local-first, no cloud. But reconsidering given:
- Symbol library can't live in core forever
- 1 free project for free users seems reasonable

### Post-MVP Considerations

- Desktop app (Tauri) - deferred to post-MVP
- ~~Cloud sync - deferred to post-MVP~~ → May need sooner for symbol library
- DWG support - deferred to post-MVP (use converter)

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
