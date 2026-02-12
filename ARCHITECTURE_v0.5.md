# ARCHITECTURE

Electrical CAD (Controls-first) — canonical model, layers, and boundaries
Version: 0.5  |  Status: Draft (intended to be the shared contract for all contributors and AI agents)

# Purpose

This document defines the system architecture for a controls-first electrical CAD tool whose core value is automation, correctness, and affordability. The drawing editor is a view over a canonical electrical model; interchange formats (DXF/DWG) are deliverables, not the source of truth.

# Product Goals for the MVP

- Create control schematics with deterministic electrical semantics (devices, pins, nets, terminals).
- Generate production-usable deliverables: BOM, wire list, terminal plan, PLC I/O list, label exports.
- Provide fast, explainable rule checks (connectivity, tagging, potential shorts, completeness).
- Support practical file exchange: DXF import/export first; DWG via conversion later.
- Stay local-first (SQLite project file), portable, and simple to version control.
- Run as a web app first (PWA-capable) with zero required server dependency for the free tier.

# Non-Goals (MVP)

- Full DWG round-trip editing.
- 3D cabinet routing, thermal analysis, or manufacturing tooling integration.
- PCB layout (separate product line later).
- Enterprise collaboration features (SSO, permissions, audit trails) beyond basic project versioning.

# Core Principle: Canonical Model First

All electrical intelligence lives in the canonical model and database. The editor renders and edits that model. DXF/DWG/PDF are exports (and limited imports). Rule checks and reports operate only on the canonical model.

# Layered Architecture

The system is intentionally layered to keep electrical correctness deterministic and testable.

# Canonical Data Model Overview

The model is device-centric and graph-based.

- Part: catalog item (manufacturer, part number, attributes). Each part can reference two symbols: `symbolCategory` (schematic) and `layoutSymbolId` (panel footprint). Many parts can share the same symbols — e.g., 10 circuit breakers may share one schematic symbol and one layout footprint.
- Device: a project instance (tag, function, location, assigned part).
- SymbolDefinition: reusable symbol geometry + logical pins. Used for both schematic symbols and layout footprints (distinguished by category/convention).
- SymbolInstance: placed symbol tied to a device (position/rotation/overrides).
- PinInstance: pin on a symbol instance (type: input/output/passive/power/pe/etc.).
- Node/Junction: connection nodes in the graph (including pin nodes).
- WireSegment: polyline segment(s) connecting nodes; belongs to a net.
- Net: electrical net/potential (name, type, attributes like potential group).
- Terminal: specialized device + index (X1:1, X1:2) mapping to nets.
- Cable: optional grouping of conductors/cores tied to nets.

# Project File Format

- Project is stored as a single portable file with extension .vcad.
- .vcad is a zip container with: project data (SQLite or JSON/object-store), symbol/library assets, and optional cached renders.
- The local persistence layer is authoritative for canonical model state (not DXF).
- All objects have stable IDs suitable for diffing, merging, and reference integrity.


# Deployment Targets

The MVP is designed to run **in the web browser first** (inspired by tools like EasyEDA), while keeping a clean path to desktop and team collaboration later.

## Web App (MVP / Free Tier)

- Primary target: **browser-based editor** with offline-first storage.
- Optional: **PWA** (installable) so users can work offline and on low-connectivity shop floors.
- No required backend for core workflows: editing, validation, and report export run locally.

## Desktop (Optional)

- A desktop wrapper (Tauri/Electron) may be added later for:
  - File system integration (open/save without browser sandbox friction)
  - Large-project performance
  - Native printing/label integrations
- Desktop should reuse the same core engine and persistence adapters.

## Server (Optional / Paid Tier)

- Backend is optional and introduced primarily for:
  - Cloud sync and sharing
  - Team collaboration features
  - Project history / approvals / audit trail
- Server must **not** be a hard dependency for basic single-user use.

# Technology Stack (MVP)

The MVP will be implemented in **TypeScript** to maximize browser compatibility, developer velocity, and AI-agent productivity (Cursor/Claude/Codex).

## Language and Tooling

- **TypeScript** for all application code (core engine + UI).
- Build tooling: **Vite** (fast dev server + modern bundling).
- Packaging (later): **Tauri** (preferred) or Electron as an alternative.

## UI Framework Choice

Default recommendation: **React** (with TypeScript).

Rationale:

- Strong ecosystem for complex apps, state management, and testing.
- Large talent pool and community.
- Works well with a canvas/WebGL drawing surface and a traditional UI (panels, properties, tables).

Alternatives (viable, but not the default):

- **Svelte**: lighter and fast, great DX; smaller ecosystem.
- **Angular**: solid enterprise framework, but heavier and slower iteration for a CAD-style app.

## Rendering Strategy (Schematic Editor)

- Use a dedicated drawing surface for schematics:
  - HTML Canvas 2D to start, or
  - WebGL (via a library) if performance requires it.
- Keep the renderer decoupled from the canonical model:
  - Model changes produce render updates.
  - Renderer never creates electrical truth; it only visualizes and forwards user edits as commands.

## State Management (UI)

- Keep canonical data in the core engine.
- Use a lightweight UI state store (e.g., Zustand/Redux-style) for selection, viewport, tool mode, dialogs.
- All edits go through a command pipeline to preserve undo/redo and invariants.

# Shell Strategy (Web-first, Desktop-ready)

We target the browser first, but structure the codebase so a desktop wrapper is a packaging decision, not a rewrite.

## Web Shell (MVP)

- SPA + optional **PWA** install mode.
- Local-first persistence (IndexedDB/OPFS or SQLite WASM).
- Exports (DXF/CSV/PDF) run locally.

## Desktop Shell (Later)

- Wrap the same web UI in **Tauri** for:
  - native file system access,
  - better printing/label integrations,
  - large-project performance headroom,
  - enterprise-friendly installers.

**Constraint:** Core engine and persistence adapters must not depend on the shell (web vs desktop).
# Core Package Strategy

The CAD “brain” must live in a **headless TypeScript core** that can run in multiple environments:

- Browser (web/PWA)
- Desktop (Tauri/Electron wrapper)
- Node.js (CLI tooling / CI validation)
- Server (optional later for batch processing or collaboration)

**Goal:** avoid coupling product logic to React/UI. The UI is a shell; the core is the product.

## What Lives in the Core

- Canonical model types (devices, parts, symbol instances, pins, nodes, nets, terminals)
- Command pipeline (undo/redo), deterministic edits
- Connectivity graph builder
- Rule engine + built-in rule packs
- Report generators (BOM, wire list, terminal plan, PLC I/O list, labels)
- Project IO (load/save, bundle export/import, schema versioning + migrations)

## What Does NOT Live in the Core

- React components / menus / dialogs
- Canvas rendering and interaction widgets (can be in a separate renderer package)
- Browser- or OS-specific file pickers / printing integration
- Auth, payments, marketplace UX

## Suggested Monorepo Layout (Agent-friendly)

Use a workspace monorepo so AI agents can work in isolated packages with clear boundaries:

- `packages/core-model/` — types + entity schemas
- `packages/core-engine/` — graph, commands, invariants enforcement helpers
- `packages/rules/` — rule interfaces + rule packs
- `packages/reports/` — BOM/wire/terminal/labels generators
- `packages/project-io/` — persistence adapters + bundle format
- `packages/renderer/` — canvas/WebGL drawing + hit testing (no business logic)
- `apps/web/` — React UI shell
- `apps/cli/` — Node CLI: validate + export deliverables

Start simpler if needed (fewer packages), but keep the boundary concept intact.

## CLI as a “Truth Harness”

Create a minimal Node CLI early:

- `validate <project>` — runs invariants + rules
- `export:bom <project>` — writes BOM CSV
- `export:wires <project>` — writes wire list CSV
- `export:terminals <project>` — writes terminal plan CSV
- `export:bundle <project>` — produces a release/handoff bundle

This keeps the core deterministic and testable while the UI is evolving.



# Persistence Strategy

**Canonical model objects** are the source of truth. Persistence is implemented via pluggable adapters so we can start lightweight and evolve without rewriting the engine.

## Persistence Adapter Contract

All storage implementations must support:

- CRUD for core entities (devices, symbol instances, pins, nets, nodes, wire segments, terminals, parts, etc.)
- Stable ID preservation (no re-ID on save/load)
- Schema versioning + migrations
- Atomic commits (or best-effort transactional semantics) so partial writes do not corrupt projects
- Deterministic export/import (bundle is lossless)

Suggested interface shape (conceptual):

- `beginTransaction()` / `commit()` / `rollback()` (or equivalent)
- `getEntity(type, id)` / `putEntity(type, entity)` / `deleteEntity(type, id)`
- `queryIndex(indexName, key)` (optional, implementation-specific)
- `exportBundle()` / `importBundle()`

## MVP Recommendation: Local-first, Web-native

Start with **Local-first storage in the browser**, and ship a portable project bundle for sharing/backups.

### Option A: IndexedDB / OPFS Object Store (NoSQL-like)

- Store each entity as an individual record keyed by stable ID (e.g., `devices:{id}`).
- Maintain a small set of secondary indexes (by tag, by net, by strip, by page) as needed for performance.
- Export/import as a single `.vcad` bundle or `.vcad.json` for portability.

**Pros:** minimal complexity, no SQL, web-native, zero server.  
**Cons:** you implement migrations and indexes yourself.

### Option B: SQLite in the Browser (WASM)

- Store the canonical model in SQLite running locally via WASM.
- Persist the database file using OPFS/IndexedDB.
- Reports become straightforward, fast queries; integrity constraints and migrations become easier.

**Pros:** strong integrity, fast queries, robust migrations, single-file portability.  
**Cons:** slightly more setup; you still keep “canonical model” above the DB.

> **Important:** SQLite does not imply server dependence. It can run entirely client-side.

### Option C: Desktop SQLite (Later)

- Same schema as browser SQLite (if used), stored as a local file.
- Enables large project handling, native file IO, and enterprise IT-friendly deployment.

## Canonical Bundle Format

Regardless of the persistence backend, support a portable export:

- `.vcad` (zip container) containing either:
  - `project.sqlite` (SQLite-backed projects), or
  - `project.json` + `entities/` (object-store projects), plus assets.
- Bundles must be **lossless** and include:
  - project settings + schema version
  - all entities + assets needed to render and regenerate deliverables
  - deterministic ordering or stable IDs so diffs are meaningful

# Cloud Sync and Collaboration Roadmap

Cloud is introduced when it provides clear user value (sharing, teamwork), not as a requirement.

## Phase 1: Share/Backup

- Optional sign-in for backups and device-to-device sync
- Keep the canonical model unchanged
- Sync is “single-writer” initially (no concurrent edits)

## Phase 2: Team Collaboration (Paid)

- Project history (diffs, approvals)
- Roles/permissions
- Comments/reviews

## Phase 3: True Concurrent Editing (Future)

- Consider an event log (command stream) as the sync primitive
- Conflict detection/resolution strategies:
  - conservative locking per page/diagram region, or
  - CRDT/OT approaches (only if required)
- Regardless of approach: invariants and deterministic rules remain authoritative

## Backend Fit (Future)

If/when cloud sync is added, a DynamoDB-style document model can work well:

- Entities stored by ID
- Secondary indexes for tags and project membership
- Version stamps for optimistic concurrency

This is compatible with the “object store” approach and can be layered without changing the core engine.



# IDs, Versioning, and Reproducibility

- Every entity has a globally unique, stable ID (UUID/ULID). IDs never change after creation.
- Exports are reproducible: given identical canonical state, generated DXF/CSV outputs are byte-stable or logically stable (ordered deterministically).
- Undo/redo uses a command log against the canonical model (not ad-hoc UI state).
- Schema changes are handled through forward-only migrations.

# Rule Engine

Rules provide trust. They must be deterministic, fast, and explainable.

- Rules operate on the canonical graph (devices/pins/nets/nodes).
- Each rule produces: severity (error/warn/info), stable code, human message, and optional fix suggestions.
- Rule execution is side-effect free (no mutations).
- Rules are unit-tested with golden test projects.

# Automated Deliverables

Reports are first-class outputs derived from the canonical model.

- BOM (grouped by part, with quantities and device tags).
- Wire list (from pin/to pin, wire number, net name/potential).
- Terminal plan (terminal strip mapping and jumpers).
- PLC I/O list (module/channel/signal/terminal mapping).
- Label exports (CSV templates for common label printers).

# DXF/DWG Strategy

- MVP: DXF import for backgrounds/title blocks only; DXF export for drawings and layouts.
- DXF is treated as geometry + annotations, not as connectivity truth.
- Optional later: sidecar metadata (e.g., drawing.dxf + drawing.vcad.json) using stable IDs for round-trip assistance.
- DWG: later via a licensed converter/SDK; do not block MVP on perfect DWG.

# Testing Strategy

- Golden-project tests: store small reference projects and assert report outputs and rule results.
- Property-based tests for graph invariants (no duplicate IDs, valid pin references, etc.).
- Snapshot tests for exports (CSV) with deterministic ordering.
- UI tests only for critical editor interactions (wire snapping, selection, property edit).

# Security and Privacy

- Local-first: projects stay on the user machine by default.
- AI features are opt-in and designed to operate on minimal context required.
- No silent uploads of entire projects; when cloud features exist, they are explicit and auditable.

# Milestones

1. Engine MVP: canonical model + connectivity graph + 10 rules + BOM/wire list/terminal plan exports.
1. Editor MVP: symbol placement + wiring + properties panel + validation pane.
1. AI MVP: 2-3 macro generators + error explanation + safe patch application.
1. Interchange MVP: DXF background import + DXF export.
1. Stabilization: library expansion + more rules + performance and UX polish.

# Future: Marketplace and Manufacturing Network

This section captures long-term platform goals and the **architectural constraints** we must respect today so that a future network of control-panel designers, electricians, and shops can be built without rewriting the CAD core.

## Vision

Enable a workflow where:

- A **designer** creates a project (schematic + outputs) and prepares a manufacturing-ready package.
- A **shop** can quote/build a control panel from a release package.
- An **electrician/installer** can consume the same release package to install/commission and record as-built changes.
- The platform supports discovery, handoff, and optional collaboration while keeping the **free tier server-independent**.

## What This Means for the CAD Core

The CAD tool is not just a drawing editor; it is the **source of manufacturing intent**. To support downstream handoff and accountability, the system must preserve:

- Traceability (what changed, when, and why)
- Reproducible outputs (so a shop can trust a release)
- Stable identifiers across revisions (so BOM/wires/terminals map reliably)
- A clean separation between **design** and **release** artifacts

## Minimum Marketplace-Ready Constraints (Design Now)

### 1) Project Lifecycle States

The project metadata must support lifecycle states, even if initially single-user:

- Draft
- Review
- Approved
- Released (for build)

**Constraint:** “Released” artifacts are immutable; edits require a new revision/release.

### 2) Releases and Immutable Snapshots

Introduce a release concept in the canonical model:

- Release ID / version (e.g., R1, R2 or semantic versioning)
- Based-on project revision hash
- Released-by / released-at metadata
- Release notes (human text)

**Constraint:** A release must be reproducible and verifiable later.

### 3) Manufacturing / Handoff Package Spec

Define a deterministic handoff bundle generated from a release:

**`release.bundle.zip`** (name illustrative) containing:

- `schematics.pdf`
- `schematics.dxf` (or multiple DXFs per page)
- `bom.csv`
- `wire_list.csv`
- `terminal_plan.csv`
- `plc_io_list.csv`
- `labels.csv`
- `assembly_notes.md` (optional)
- `manifest.json` (required): schema version, release ID, project IDs, checksums

**Constraint:** Shops/installers should be able to build/install using only the bundle.

### 4) Stable IDs and Change Tracking

All canonical entities already require stable IDs. For marketplace workflows, additionally:

- Entities must preserve identity across edits (no re-ID).
- When items are renumbered (wire numbers, terminal indexes), the system should record the change as a deterministic edit (command), not as an implicit side effect.

Add minimal metadata fields (can default to “local user” in free tier):

- `createdAt`, `createdBy`
- `modifiedAt`, `modifiedBy`
- `changeNote` (optional)

### 5) Roles and Permissions Model (Placeholder)

Define the intent of roles now (implementation later):

- Designer (creates/edits draft)
- Reviewer/Engineer (approves)
- Shop/Builder (consumes releases, can propose as-built notes)
- Electrician/Installer (consumes releases, can propose as-built notes)

**Constraint:** The CAD core must support “read-only release consumption” distinct from editable drafts.

### 6) As-Built Feedback (Future)

Down the road, the system should support a structured “as-built” feedback loop:

- Shop/Electrician submits a proposed change set (patch) against a release or draft.
- Designer accepts/rejects changes to produce a new revision and new release.

**Constraint:** All edits (manual or AI) should be representable as reviewable patches/commands.

## What We Will NOT Build in the MVP

To avoid scope creep, the MVP explicitly excludes:

- Payments, escrow, invoicing, tax handling
- Bidding/marketplace matching algorithms
- Real-time multi-user editing
- Shop scheduling, logistics, procurement integrations
- Full enterprise compliance workflows

## Suggested Roadmap (Platform Layer)

### Phase A: Shareable Releases (Low Risk)

- Generate release bundles
- Allow link-based sharing (optional)
- Collect “issues/notes” from recipients (optional, later)

### Phase B: Quotes and Build Handoff

- Shop can attach a quote to a release bundle
- Status tracking: quoted → accepted → in build → shipped

### Phase C: As-Built and Commissioning

- Installer submits as-built deltas
- Release comparison and acceptance workflow

### Phase D: Multi-tenant + Collaboration

- Org/workspace model
- Permissions, approvals, audit trail
- Optional SSO for enterprise

## Data Model Implications (Future-Friendly)

When cloud is added, a DynamoDB-style entity store can work well:

- Partition by `projectId`
- Entities keyed by `entityType#entityId`
- Secondary indexes for: device tags, parts, terminal strips, releases
- Optimistic concurrency via version numbers on entities

This aligns naturally with an object-store approach and preserves the canonical model.
