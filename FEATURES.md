# fusionCad Features

Complete feature inventory for landing page, marketing, and ad copy.

---

## Core Schematic Editor

- **Canvas-based rendering** — Fast HTML Canvas 2D drawing engine, no DOM overhead
- **IEC 60617 symbol library** — 55+ standard electrical symbols (contactors, breakers, motors, PLCs, terminals, relays, sensors)
- **Drag-and-drop placement** — Ghost preview snaps to 20px grid
- **Professional wire routing** — 3-stage algorithm: visibility graph + A* pathfinding + automatic nudging/separation for overlapping segments
- **Orthogonal-only wires** — Clean, professional-looking schematics with no diagonal wires
- **Wire bend editing** — Click to add waypoints, drag to adjust, double-click to remove
- **Wire segment dragging** — Drag wire segments perpendicular to reshape routes
- **Wire reconnection** — Drag green endpoint handles to reconnect wires to different pins
- **Multi-sheet projects** — Tabbed sheets within a single project, each with its own title block
- **Copy/Paste/Duplicate** — Cmd+C, Cmd+V, Cmd+D with smart offset
- **Undo/Redo** — 50-level history for all operations (Cmd+Z / Cmd+Shift+Z)
- **Marquee selection** — Left-to-right for enclosed, right-to-left for crossing (AutoCAD-style)
- **Device rotation and mirror** — R key to rotate, F key to mirror
- **Pan and zoom** — Mouse wheel zoom (0.1x–5x), Space+drag pan, middle-click pan, zoom-to-fit
- **Text annotations** — Place and edit text labels anywhere on the schematic
- **Part number labels** — Assigned parts render below symbols on canvas
- **Context menus** — Right-click for contextual actions
- **Keyboard shortcuts** — Full shortcut set with ? key overlay

---

## Ladder Diagram System

- **L1/L2 power rails** — Standard ladder format with voltage labels
- **Rung-based layout** — Auto-layout engine distributes devices on rungs
- **Branch rungs** — Parallel branches for seal-in and interlocking circuits
- **Diagram blocks** — Multiple ladder/panel blocks on a single sheet
- **Power distribution ladder** — L1/N rails with branch rungs for SPD, outlet, light, fan, power supply

---

## Motor Starter Auto-Generation

- **One-click motor starters** — Provide HP + voltage, get a complete BOM-ready schematic
- **216 Schneider Electric configurations** — 12 regions (USA/Canada, single/three-phase, multiple voltages) x HP ratings
- **289-part catalog** — Real Schneider Electric part numbers with datasheet URLs
- **4 starter types** — IEC open, IEC enclosed, NEMA open, NEMA enclosed
- **Full panel generation** — Optional HOA switch, pilot light, PLC remote contact, E-stop
- **Power distribution generation** — Main breaker, surge protection, transformer, 24VDC power supplies, branch circuits

---

## Automatic Terminal Block Calculation

- **Panel vs field classification** — Automatically identifies which devices are inside the panel and which are in the field
- **Boundary wire detection** — Finds every wire that crosses the panel boundary
- **Wire classification** — Power, control, and ground wires sorted into appropriate terminal strips
- **Phoenix Contact part selection** — UT 4 (power), UT 2.5 (control), UTTB 2.5-PE (ground) with real part numbers
- **Configurable spare terminals** — Default 10%, adjustable 0–50%
- **Strip naming** — Functional (X1=power, X2=control, XPE=ground) or sequential
- **BOM integration** — Generated terminals appear in Bill of Materials automatically

---

## AI-Powered Generation

- **Natural language input** — Describe what you need, get a complete schematic
- **Motor starter from specs** — "20 HP, 480V, three-phase motor starter" → full design with real parts
- **Power distribution from specs** — "480V panel with transformer, outlet, cabinet light" → complete layout
- **Claude API backend** — Powered by Anthropic's Claude for intelligent request classification

---

## Parts Database and Catalog

- **Multi-manufacturer catalog** — Schneider Electric, Phoenix Contact, Allen-Bradley, ABB
- **Part assignment** — Assign real catalog parts to any device
- **Datasheet links** — Direct URLs to manufacturer datasheets
- **Electrical specifications** — Voltage, current, power rating, certifications, temperature range
- **Dual symbol architecture** — Schematic symbol + panel layout footprint per part

---

## Linked Device Representations

- **Multi-representation devices** — Contactor coil, power contacts, and aux contacts as separate symbols sharing one tag
- **Unified BOM** — Linked representations count as 1 physical item
- **Cross-sheet awareness** — Device representations can span multiple sheets

---

## Electrical Rules Check (ERC)

- **Duplicate tag detection** — Flags duplicate device tags (linked-device aware)
- **Unconnected pin detection** — Flags pins that should be connected but aren't
- **Dead-end net detection** — Flags nets with only a single connection
- **Missing part warnings** — Flags devices without assigned catalog parts
- **Short circuit detection** — Detects devices bridging different power potentials
- **Hot-to-neutral path analysis** — BFS graph traversal flags paths from L1 to L2/N with no load or protection device
- **Device classification engine** — Categorizes devices as load, protection, switching, passive, or source

---

## Reports and Export

- **Bill of Materials (CSV)** — Parts grouped by manufacturer with quantities
- **Wire list (CSV)** — All connections with auto-numbered wires
- **Terminal plan (CSV)** — Terminal strip layout with cross-references
- **Cable schedule (CSV)** — Cable assignments and routing
- **PLC I/O list (CSV)** — Rack, slot, and channel data

---

## Symbol Editor

- **Visual symbol builder** — Draw symbols with line, rectangle, circle, polyline tools
- **Pin placement** — Define pin positions with name, direction, and electrical type
- **Real-time preview** — See the symbol as it will appear on the schematic
- **Save to library** — Custom symbols stored alongside built-in IEC symbols
- **Edit existing symbols** — Modify any symbol in the library

---

## MCP Server (AI Agent Integration)

- **30 programmatic tools** — Full circuit CRUD accessible to AI agents
- **Read operations** — List projects, devices, connections, symbols, parts; run ERC; generate BOM
- **Write operations** — Create projects, place devices, draw wires, assign parts, generate schematics
- **Claude Code integration** — Auto-discovered via `.mcp.json` for seamless AI-assisted design
- **Pure function architecture** — All circuit mutations are testable, composable pure functions

---

## Persistence and Cloud

- **Postgres + TypeORM** — Reliable cloud storage with auto-save (1-second debounce)
- **Project management** — Create, rename, delete, switch between projects
- **Cloud-ready** — Dockerfile, managed Postgres support, health endpoint, CORS configuration
- **Database migrations** — Schema versioning with TypeORM migrations

---

## Authentication

- **AWS Cognito** — User pool authentication with Amplify
- **Google and GitHub OAuth** — One-click social login
- **Email/password fallback** — Standard credential-based login
- **Free tier** — 3 cloud projects with full editor (no AI)
- **Paid tier** — Unlimited projects + AI generation

---

## UI/UX

- **Multi-theme system** — 5 presets (dark, light, etc.) + custom theme with CSS variables
- **Object inspector** — Inline-editable properties panel for selected devices
- **Searchable symbol palette** — Filter by name or category
- **Wire color legend** — 11 unique colors for wire identification
- **Status bar** — Cursor position, zoom level, interaction mode, selection count
- **Collapsible panels** — Right sidebar can be collapsed for more canvas space

---

## Key Differentiators

1. **Automation-first** — Not just a drawing tool; automates BOM, terminal blocks, wire numbering, and part selection
2. **AI-assisted design** — Natural language to complete schematic (no other tool does this)
3. **Real manufacturer parts** — Actual Schneider Electric, Phoenix Contact part numbers with datasheets
4. **Professional wire routing** — Research-backed algorithm (Wybrow et al. 2009) used in commercial CAD
5. **Automatic terminal block calculation** — Analyzes wiring to determine exactly which terminals to order
6. **IEC 60617 compliance** — International standard symbols, not proprietary
7. **Cloud-native** — No installation, works in the browser, auto-saves to cloud
8. **AI agent integration** — 30-tool MCP server enables programmatic circuit manipulation
9. **Free tier** — Full editor with 3 projects, no credit card required

---

## Testing and Quality

- **125 E2E tests** — Playwright browser tests covering all editor features
- **142 unit tests** — Vitest tests for ERC, device classification, terminal calculation, symbol validation
- **Isolated test environment** — Separate ports and database for test runs
- **TypeScript throughout** — Full type safety across all packages

---

*Last updated: 2026-03-03*
