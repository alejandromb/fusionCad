# fusionCad Development Roadmap

Version: 1.0
Date: 2026-01-26
Status: Initial Planning

---

## 🔴 CURRENT PHASE: Phase 1 - Golden Circuit (End-to-End Spike)
**Status**: Not Started
**Last Updated**: 2026-01-26
**Next Session Goal**: Create hardcoded 3-wire motor starter circuit and implement BOM generator

**Phase 0 Complete**: ✅ Monorepo structure, TypeScript, core model types, CLI scaffold, web app scaffold

---

## Overview

This roadmap breaks down the fusionCad MVP into achievable phases, balancing the need for a **functional schematic editor** (the interface) with the **automation engine** (the differentiator).

**Key Principle**: Build iteratively with working end-to-end slices, not layers in isolation.

---

## Phase 0: Foundation (Week 1-2)

**Goal**: Set up project structure, tooling, and "hello world" baseline.

### 0.1 Project Setup
- [ ] Initialize monorepo structure (pnpm/npm workspaces or Turborepo)
- [ ] Configure TypeScript, ESLint, Prettier
- [ ] Set up packages structure:
  - `packages/core-model/` - Entity types and schemas
  - `packages/core-engine/` - Graph, commands, invariants
  - `packages/rules/` - Validation rules
  - `packages/reports/` - Report generators
  - `packages/project-io/` - Persistence adapters
  - `apps/web/` - React UI
  - `apps/cli/` - Node CLI tools

### 0.2 Core Model Types (First Pass)
- [ ] Define basic entity interfaces:
  - `Part`, `Device`, `SymbolDefinition`, `SymbolInstance`
  - `PinInstance`, `Node`, `WireSegment`, `Net`
  - `Terminal`
- [ ] Stable ID generation (ULID/UUID)
- [ ] Basic type tests

### 0.3 Web Shell Bootstrap
- [ ] Vite + React app scaffold
- [ ] Basic layout: canvas area + sidebar
- [ ] Simple canvas (HTML Canvas 2D) rendering "hello world"

**Definition of Done**:
- [ ] `npm install` works in root
- [ ] `npm run build` builds all packages
- [ ] `npm run dev` in `apps/web` shows empty canvas in browser
- [ ] `npm run cli` in `apps/cli` prints "vcad CLI v0.1.0"
- [ ] Core model types compile with no errors

**Deliverable**: Empty project structure that builds and runs.

---

## Phase 1: Golden Circuit - End-to-End Spike (Week 3-4)

**Goal**: Prove the entire stack with ONE simple circuit, hardcoded if needed.

### Circuit: 3-Wire Motor Starter

**Components**:
- Motor contactor (K1)
- Start button (S1)
- Stop button (S2)
- Overload relay (F1)
- Motor (M1)
- 24VDC power supply
- Terminal strip (X1)

### 1.1 Hardcoded Golden Test
- [ ] Create a hardcoded project in code (no UI yet):
  - Devices: K1, S1, S2, F1, M1, X1
  - Nets: 24V, 0V, wire1, wire2, etc.
  - Connections defined programmatically
- [ ] Write to an in-memory model

### 1.2 First Report: BOM
- [ ] Implement BOM generator that reads the model
- [ ] Output CSV: part number, description, quantity, device tags
- [ ] CLI command: `vcad export:bom golden-circuit.json`

### 1.3 First Report: Wire List
- [ ] Implement wire list generator
- [ ] Output CSV: from device:pin, to device:pin, net, wire number
- [ ] CLI command: `vcad export:wires golden-circuit.json`

### 1.4 First Validation Rules (3 rules)
- [ ] Rule: Unconnected pins
- [ ] Rule: Duplicate device tags
- [ ] Rule: Net with only one connection
- [ ] CLI command: `vcad validate golden-circuit.json`

### 1.5 Persistence Adapter (Simple)
- [ ] JSON file adapter for project save/load
- [ ] Serialize/deserialize the golden circuit

**Definition of Done**:
- [ ] File exists: `test-data/golden-circuit-motor-starter.json`
- [ ] Command works: `vcad validate test-data/golden-circuit-motor-starter.json` (exits 0, shows 0 errors)
- [ ] Command works: `vcad export:bom test-data/golden-circuit-motor-starter.json` (creates `bom.csv`)
- [ ] Command works: `vcad export:wires test-data/golden-circuit-motor-starter.json` (creates `wires.csv`)
- [ ] BOM contains: K1 (contactor), S1/S2 (buttons), F1 (overload), M1 (motor), X1 (terminals)
- [ ] Wire list contains: at least 8 connections with from/to pins
- [ ] Validation catches: duplicate tag when you manually add one to JSON

**Deliverable**: CLI can load a hardcoded circuit, validate it, and export BOM + wire list.

---

## Phase 2: Minimal Editor - Place & Connect (Week 5-7)

**Goal**: Build just enough UI to create the golden circuit manually.

### 2.1 Symbol Library (Hardcoded)
- [ ] Define 5-6 hardcoded symbol definitions with pins:
  - Contactor (NO contact, coil)
  - Push button (NO, NC)
  - Overload relay
  - Motor symbol
  - Terminal block
  - Power symbols (+24V, 0V, PE)
- [ ] Store as JSON or TS constants

### 2.2 Canvas Rendering
- [ ] Render symbol instances on canvas (position, rotation)
- [ ] Render wires as polylines
- [ ] Render device tags as text labels
- [ ] Basic viewport (pan, zoom)

### 2.3 Symbol Placement Tool
- [ ] Drag symbol from palette to canvas
- [ ] Create device instance with auto-generated tag
- [ ] Click to place, Escape to cancel

### 2.4 Wire Tool
- [ ] Click pin to start wire
- [ ] Click pin to end wire
- [ ] Creates net and wire segment
- [ ] Snaps to pins (simple hit detection)

### 2.5 Selection & Properties
- [ ] Click to select device
- [ ] Properties panel: edit tag, assign part (from hardcoded list)
- [ ] Click wire to select net
- [ ] Properties panel: edit net name

### 2.6 Command System (Undo/Redo)
- [ ] Wrap all edits as commands
- [ ] Command history stack
- [ ] Undo (Ctrl+Z), Redo (Ctrl+Shift+Z)

**Definition of Done**:
- [ ] Can open web app at localhost:5173 (or similar)
- [ ] Can drag contactor symbol from palette and place on canvas
- [ ] Can click wire tool, click pin A, click pin B → wire appears
- [ ] Can click device → properties panel shows tag field → can edit tag
- [ ] Can save project → reload browser → project still there (IndexedDB/localStorage)
- [ ] Can manually recreate the golden motor starter circuit in UI
- [ ] Export BOM from UI-created circuit matches Phase 1 BOM (same parts, same quantities)
- [ ] Undo works: place device, press Ctrl+Z, device disappears
- [ ] Redo works: Ctrl+Shift+Z brings it back

**Deliverable**: Can manually draw the 3-wire motor starter circuit in the UI, save it, and export the same BOM/wire list as Phase 1.

---

## Phase 3: Core Engine Expansion (Week 8-10)

**Goal**: Expand the model and rules to handle real projects.

### 3.1 More Entity Types
- [ ] Multi-page projects (sheets/pages)
- [ ] Terminals with indexes (X1:1, X1:2)
- [ ] Cross-references (coil ↔ contacts)
- [ ] Cables (grouping of wires)

### 3.2 More Reports
- [ ] Terminal plan (strip, index, from/to, net)
- [ ] PLC I/O list (module, channel, signal, terminal)
- [ ] Label export (CSV for label printers)

### 3.3 Expanded Rule Set (Target: 10 rules)
- [ ] Duplicate terminal numbers
- [ ] Short between different potentials
- [ ] Coil without contacts (warning)
- [ ] Contact referencing missing coil
- [ ] Terminal with no connections
- [ ] Device without assigned part (warning)
- [ ] Unconnected PE (error)

### 3.4 Persistence: Browser Storage
- [ ] IndexedDB adapter (or SQLite WASM)
- [ ] Project list UI (local projects)
- [ ] Open/Save/New project

**Deliverable**: Can create multi-page projects with terminals and generate all core reports.

---

## Phase 4: Symbol Library & Parts Database (Week 11-13)

**Goal**: Make the tool usable for real circuits beyond hardcoded examples.

### 4.1 Symbol Editor (Basic)
- [ ] Create custom symbols
- [ ] Define pins (name, type, position)
- [ ] Save to project or global library

### 4.2 Parts Database
- [ ] Schema: manufacturer, part number, type, attributes
- [ ] Seed database with 50-100 common control parts:
  - Contactors (ABB, Schneider, Siemens)
  - Push buttons
  - Relays
  - PLCs (basic modules)
  - Terminal blocks
  - Circuit breakers
- [ ] UI: search and assign parts to devices

### 4.3 Symbol-to-Part Mapping
- [ ] Link symbol definitions to part types
- [ ] Auto-suggest compatible parts when placing symbols

**Deliverable**: Can build real control circuits using a curated parts library.

---

## Phase 5: AI Assistance - Macro Generation (Week 14-15)

**Goal**: Add targeted AI features that save real time.

### 5.1 Circuit Macros
- [ ] Prompt: "3-wire motor starter with E-stop"
- [ ] Generate: devices, wiring, tags, nets
- [ ] Insert into canvas at cursor position

### 5.2 Smart Tagging
- [ ] Auto-suggest device tags based on type and existing tags
- [ ] Auto-number terminals

### 5.3 Error Explanation
- [ ] When validation fails, provide:
  - Plain English explanation
  - Suggested fix (if deterministic)
  - Option to apply fix automatically

**Deliverable**: AI can generate common circuits and explain/fix validation errors.

---

## Phase 6: File Exchange - DXF (Week 16-17)

**Goal**: Import/export DXF for interoperability.

### 6.1 DXF Export
- [ ] Export schematic pages to DXF (geometry only)
- [ ] Layer structure: wires, symbols, text, dimensions
- [ ] Preserve scale and coordinates

### 6.2 DXF Import (Limited)
- [ ] Import DXF as background layer (read-only)
- [ ] Useful for title blocks, panel layouts
- [ ] No electrical intelligence extraction (future)

**Deliverable**: Can export schematics to DXF for use in other tools.

---

## Phase 7: Polish & Usability (Week 18-20)

**Goal**: Make the MVP production-ready.

### 7.1 UI/UX Polish
- [ ] Keyboard shortcuts (copy/paste, duplicate, align)
- [ ] Grid snapping
- [ ] Multi-select
- [ ] Better symbol palette (search, categories)

### 7.2 Performance
- [ ] Canvas culling (only render visible area)
- [ ] Optimize re-renders
- [ ] Large project testing (100+ devices)

### 7.3 Documentation
- [ ] User guide (getting started)
- [ ] Keyboard shortcuts reference
- [ ] Example projects (3-5 golden circuits)

### 7.4 Testing
- [ ] Unit tests for rules and reports
- [ ] Snapshot tests for CSV exports
- [ ] Golden project regression tests

**Deliverable**: MVP is ready for alpha users.

---

## Phase 8: Alpha Release (Week 21-22)

**Goal**: Ship to first users and gather feedback.

### 8.1 Packaging
- [ ] Deploy web app (Vercel/Netlify)
- [ ] PWA manifest (offline capable)
- [ ] Error reporting (Sentry or similar)

### 8.2 Alpha User Onboarding
- [ ] Landing page with demo video
- [ ] Sign-up for alpha access (collect feedback)
- [ ] Discord or forum for community

### 8.3 Feedback Loop
- [ ] Feature requests tracking
- [ ] Bug reports workflow
- [ ] Weekly changelog

**Deliverable**: Public alpha with 10-50 active testers.

---

## Post-MVP Roadmap (Future Phases)

### Phase 9: Desktop App (Optional)
- [ ] Tauri wrapper
- [ ] File system integration
- [ ] Native printing

### Phase 10: Cloud Sync (Paid Tier)
- [ ] User accounts
- [ ] Cloud project storage
- [ ] Device-to-device sync

### Phase 11: Collaboration Features
- [ ] Project sharing
- [ ] Comments and reviews
- [ ] Version history

### Phase 12: Marketplace Vision
- [ ] Designer → Shop handoff
- [ ] Release bundles
- [ ] As-built feedback loop

---

## Success Metrics (MVP)

**Week 8 Target** (Phase 3 Complete):
- Can draw and validate a 3-wire motor starter
- BOM, wire list, terminal plan export works
- 10 validation rules operational

**Week 17 Target** (Phase 6 Complete):
- Can draw complex control circuits (50+ devices)
- All core reports working
- DXF export functional
- AI macros save time on common patterns

**Week 22 Target** (Alpha Launch):
- 10-50 active alpha users
- Real control projects being designed in the tool
- Positive feedback on automation value

---

## Development Principles

1. **End-to-end slices**: Each phase should produce a working feature, not just infrastructure.
2. **Golden tests**: Maintain 3-5 reference projects that must always validate and export correctly.
3. **Automation first**: Reports and validation are non-negotiable; fancy UI features are secondary.
4. **Deterministic**: All edits are commands; all rules are pure functions.
5. **Local-first**: Core workflows must work offline without a server.

---

## Next Steps

1. **Immediately**: Set up Phase 0 project structure
2. **Week 1**: Implement core model types and web shell bootstrap
3. **Week 2**: Start Phase 1 golden circuit spike

Let's build something engineers will actually use.
