# fusionCad Development Roadmap

Version: 2.0
Date: 2026-02-05
Status: Active Development

---

## Current Status

**Phases 1-7**: Complete (35 E2E tests passing)
**Phase 8**: Symbol persistence via Postgres complete (2026-02-11)
**Current Focus**: Symbol quality refinement, dual-symbol architecture for panel layout

---

## Completed Phases

### Phase 1: Foundation & Golden Circuit ✅
- Monorepo structure (pnpm workspaces)
- Core model types (Device, Net, Part, Wire, Terminal, etc.)
- Golden circuit: 3-wire motor starter
- CLI tools: `fcad validate`, `fcad export:bom`, `fcad export:wires`
- JSON file persistence

### Phase 2: Minimal Editor ✅
- Canvas rendering (HTML Canvas 2D)
- Symbol placement (drag from palette)
- Wire routing (A* + visibility graph + nudging)
- Selection (click, Shift+click, Cmd+A)
- Undo/redo (Cmd+Z, Cmd+Shift+Z)
- Copy/paste/duplicate (Cmd+C/V/D)
- Properties panel
- Viewport pan/zoom

### Phase 3: Core Engine Expansion ✅
- Multi-sheet projects with tabs
- Title blocks
- Terminal entities with strip/index
- Cross-references (coil ↔ contacts)
- Wire numbering (auto-assign, manual override)

### Phase 4: Symbol Library & Parts Database ✅
- ~30 IEC 60617 symbols (PLC, power, relay, terminal, field devices)
- SVG path-based symbol definitions
- Symbol Library browser dialog
- Parts Catalog with manufacturer data (Allen-Bradley, Phoenix Contact, Schneider, ABB)
- Part assignment to devices
- **Place from Parts Catalog** → schematic (with symbol assignment)
- Generic component symbol for unassigned parts

### Phase 5: Reports & Export ✅
- BOM generator (CSV) with terminal grouping
- Wire list (CSV)
- Terminal plan (CSV)
- Cable schedule (CSV)
- PLC I/O list (CSV)
- PDF export (print-quality rendering)
- SVG export
- DXF export (basic)

### Phase 6: UI/UX Polish ✅
- **Horizontal toolbar** (CAD-style: mode, edit, transform, zoom tools)
- Zoom controls (+/−/fit buttons)
- Status bar (cursor position, zoom %, mode, selection count)
- Keyboard shortcuts overlay (? key)
- Context menus (right-click)
- Grid snapping

### Phase 7: Validation & Automation ✅
- ERC (Electrical Rules Check) dialog
- Validation rules: unconnected pins, duplicate tags, shorts, missing parts
- Device rotation (R key) and mirror (F key)
- Text/annotation tool

---

## Phase 8: Storage Architecture (Current Priority)

**Goal**: Improve persistence for larger projects and better querying.

### Current Limitations
- Single JSON blob per project (entire circuit saved on every change)
- Full payload on every auto-save
- No partial updates
- Can't query across projects
- Memory pressure on large circuits (~1000+ devices)

### Planned Improvements

#### 8.1 Delta Saves
- [ ] Track changed entities since last save
- [ ] Send only modified devices/wires/nets
- [ ] Reduce auto-save payload size by 90%+

#### 8.2 Normalized Schema (Optional)
- [ ] Separate tables: `devices`, `wires`, `nets`, `parts`, `terminals`
- [ ] Foreign key relationships
- [ ] Enables SQL queries across projects

#### 8.3 Hybrid Approach (Recommended)
- [ ] Keep JSON blob for fast full-project loads
- [ ] Index key fields (device tags, part numbers) for search
- [ ] Delta saves for incremental changes

#### 8.4 Performance Targets
- Save latency < 100ms for incremental changes
- Support 5000+ device projects
- Cross-project search (e.g., "find all uses of part 1769-IQ16")

---

## Phase 9: Symbol Quality Refinement (Ongoing)

**Goal**: Professional-grade IEC 60617 symbols that match industry standards.

### Current Status
- Symbols improved but not yet publication-quality
- Some proportions and details need refinement

### Improvements Needed
- [ ] Review all symbols against IEC 60617 standard sheets
- [ ] Consistent stroke weights across all symbols
- [ ] Better contact representations (NO/NC clarity)
- [ ] PLC module symbols (more realistic card appearance)
- [ ] Field device symbols (ISA S5.1 compliance)
- [ ] Symbol preview at multiple zoom levels
- [ ] Visual symbol editor (draw/modify symbols in UI)

---

## Phase 10: Advanced Schematic Features

**Goal**: Feature parity with professional electrical CAD.

### 10.1 Enhanced Wiring
- [ ] Wire gauge/color/type properties
- [ ] Cable assignments (group wires into cables)
- [ ] Auto-routing improvements
- [ ] Wire bend point snapping

### 10.2 Cross-References
- [ ] Clickable cross-reference navigation
- [ ] Auto-updating page/zone references
- [ ] Contact mirror display (show all contacts on coil symbol)

### 10.3 Terminal Blocks
- [ ] Visual terminal strip builder
- [ ] Drag to create linked multi-level terminals
- [ ] Jumper/bridge connections
- [ ] Terminal label positioning

### 10.4 Advanced Selection
- [ ] Marquee/rubber-band selection
- [ ] Crossing vs window select modes
- [ ] Select by type/property filters

---

## Phase 11: Panel Layout View (Future)

**Goal**: Physical layout drawings for control panels.

**Prerequisite**: Schematic features must be mature first.

### 11.1 Layout Canvas
- [ ] Physical coordinate system (mm/inches)
- [ ] Enclosure outline (NEMA 4X, UL 508A dimensions)
- [ ] DIN rail placement

### 11.2 Dual Symbol Architecture (Schematic + Layout)
Each part can reference **two symbols**:
- **`symbolCategory`** → schematic symbol (electrical diagram — coil, contacts, etc.)
- **`layoutSymbolId`** → layout symbol (physical footprint — DIN rail outline, mounting holes)

Example: 10 different circuit breakers may all share the same schematic symbol (`circuit-breaker`) and the same layout footprint (`layout-gv2-3p`), but they are different parts with different ratings, prices, and part numbers. The Part → Symbol relationship is many-to-one in both directions.

The `Part.layoutSymbolId` field is already in the type system (added 2026-02-11). Layout symbols will be stored in the same `symbols` table with a `layout-` prefix convention and a `layout` category.

- [ ] Create layout symbol primitives (rectangles with dimensions, mounting holes, terminal positions)
- [ ] Layout symbol editor mode (mm grid, physical dimensions)
- [ ] Auto-place from schematic devices using `layoutSymbolId`
- [ ] Drag to arrange on DIN rails

### 11.3 Wire Duct
- [ ] Rectangular wire duct/trough elements
- [ ] Wire routing through ducts
- [ ] Fill calculation

### 11.4 Panel BOM
- [ ] Enclosure, DIN rails, wire duct quantities
- [ ] Mounting hardware
- [ ] Labels and markers

---

## Phase 12: Alpha Release

**Goal**: Public alpha with real users.

### 12.1 Deployment
- [ ] Deploy web app (Vercel/Cloudflare)
- [ ] PWA manifest (offline capable)
- [ ] Error reporting (Sentry)

### 12.2 User Onboarding
- [ ] Landing page with demo
- [ ] Example projects (motor starter, VFD, PLC panel)
- [ ] Video tutorials

### 12.3 Feedback
- [ ] Discord community
- [ ] Feature request tracking
- [ ] Bug report workflow

---

## Long-Term Vision: AI-Assisted Drawing Generation

**Goal**: Natural language → complete schematic + panel layout drawings via AI agents.

**This is the core differentiator.** No product on the market does this today.

### Concept
User provides requirements in plain English:
> "I need a motor starter contactor controlled by a PLC output, with start/stop pushbuttons and a Hand-Off-Auto selector switch. Allen-Bradley CompactLogix, UL stainless steel 304 panel."

AI agents:
1. **Parse** requirements into structured spec (PLC model, I/O mapping, motor data, control philosophy)
2. **Select parts** from catalog (contactor, overload, HOA switch, pushbuttons, terminal blocks)
3. **Generate schematic** — place symbols, wire I/O, assign terminals, auto-number wires
4. **Generate panel layout** — place footprints on DIN rails inside enclosure
5. **Produce deliverables** — BOM, wire list, terminal plan, cable schedule, I/O list

### Architecture: Agent Skills
Each step is a composable **skill** that an orchestrating agent calls:
- `parse-requirements` — NL → structured spec (JSON)
- `select-parts` — spec → BOM with manufacturer part numbers
- `place-schematic` — devices + wiring on multi-sheet schematic
- `assign-terminals` — auto-calculate terminal blocks and wire numbers
- `generate-panel-layout` — physical footprints on DIN rails (Phase 11)
- `validate` — run ERC, flag issues, iterate
- `export` — produce all reports + drawings

### Prerequisites
- Robust symbol library ✅
- Parts database with specifications ✅
- Symbol persistence (Postgres) ✅
- Multi-sheet support ✅
- Reports generation ✅
- **Dual symbols per part** (schematic + layout) ✅ (type ready, layout symbols Phase 11)
- Programmatic circuit manipulation API (needed — not just UI events)
- Template circuits for common patterns (motor starters, VFD, PLC racks)

### Implementation Path
1. **Programmatic API** for circuit CRUD (server-side, not canvas mouse events)
2. **Template circuits** for common patterns (DOL starter, star-delta, VFD, etc.)
3. **Agent framework** — composable skills with tool-calling LLM orchestrator
4. **Requirement parser** — NL → structured spec with validation
5. **Iterative generation** — generate → validate → fix → re-validate loop
6. **Panel layout agent** — after Phase 11 panel layout view is built

---

## Development Principles

1. **Schematic first**: Panel layout comes after schematic is production-ready
2. **Automation focus**: Reports and validation are core value, not nice-to-have
3. **Real parts**: Use actual manufacturer part numbers, not generic placeholders
4. **IEC compliance**: Symbols must look professional and standard-compliant
5. **Performance**: Must handle real-world project sizes (1000+ devices)
6. **Local-first**: Core workflows work offline

---

## Quality Metrics

| Metric | Current | Target |
|--------|---------|--------|
| E2E Tests | 35 passing | 50+ |
| Symbol count | 61 (persisted in Postgres) | 100+ |
| Max project size | ~500 devices | 5000+ |
| Save latency | ~200ms (full) | <100ms (delta) |
| IEC compliance | ~70% | 95%+ |
| Parts with dual symbols | 0 (type ready) | All catalog parts |

---

## Next Actions

1. **Immediate**: Continue symbol quality improvements
2. **Short-term**: Design delta save architecture
3. **Medium-term**: Implement normalized storage schema
4. **Long-term**: Panel layout view after schematic maturity
