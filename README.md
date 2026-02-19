# fusionCad — Controls-First Electrical CAD

A modern, AI-assisted electrical CAD tool focused on **control schematics** where the real value is:
- **Automated deliverables** (BOM, wire lists, terminal plans, PLC I/O, labels)
- **Database-driven correctness** (tags, cross-refs, consistency)
- **Rule-based validation** (deterministic, explainable)
- **Affordable access** (full-featured free tier + low-cost paid tier)
- **AI-assisted generation** (natural language → complete schematics via MCP tools)

## Product North Star

The gap in the market is a tool that combines **automation + usability + low cost**. A simple schematic editor alone won't attract professional users — the value is in what gets automated: reports, validation, terminal calculations, and eventually AI-generated schematics from requirements.

## Architecture

See `ARCHITECTURE_v0.6.md` for the full system architecture.

Key principle:
> The drawing editor is a *view* over a canonical electrical model. DXF/DWG are deliverables, not the source of truth.

### Dual Storage Architecture

- **Free tier**: IndexedDB (browser-local, no server, no account required). Full editor functionality.
- **Paid tier**: Postgres via REST API. Adds cloud sync, organization isolation (`org_id`), collaboration, AI features.

Both tiers use the same `StorageProvider` interface — the app auto-detects the backend at startup.

## Tech Stack

- **TypeScript** — all application code
- **React + Vite** — web UI (PWA-capable)
- **HTML Canvas 2D** — schematic rendering
- **Express + TypeORM + Postgres** — API server (paid tier)
- **IndexedDB** — browser storage (free tier)
- **MCP Server** — 30 tools for AI-driven circuit manipulation

## Repo Layout

```
packages/core-model/     — types, entity schemas, motor data, parts catalog
packages/core-engine/    — graph algorithms, ladder layout, wire routing
packages/mcp-server/     — MCP server (AI agent tools)
apps/web/                — React UI shell
apps/api/                — Express REST API (Postgres + TypeORM)
e2e/                     — Playwright end-to-end tests
```

## Getting Started

```bash
npm install                # install all dependencies
npm run db:up              # start Postgres (Docker) — optional for free tier
npm run dev:all            # start API + web dev servers
```

Open `http://localhost:5173` in your browser.

For free-tier development (no Docker/Postgres needed):
```bash
npm install
npm run dev:web            # start web dev server only (IndexedDB storage)
```

## Testing

### E2E Tests (Playwright)

35 tests covering symbol placement, wiring, undo/redo, copy/paste, multi-select, persistence, sheet management, ladder diagrams, and more.

```bash
npm run db:up              # ensure Postgres is running
npm run test:e2e           # headless (fast, CI-friendly)
npm run test:e2e:headed    # watch in a browser window
npm run test:e2e:slow      # headed + 500ms delay between actions
npm run test:e2e:ui        # Playwright UI mode (step-through debugging)
```

Tests use a separate database (`fusion_cad_test`) and dedicated ports (API on 3003, Vite on 5174) so they never conflict with dev servers.

## MCP Server (AI Integration)

The MCP server exposes circuit operations as tools for AI agents (Claude Code, etc.):

```bash
npm run dev:api            # start API server (required)
# Then restart Claude Code — it discovers .mcp.json automatically
```

30 tools including: project CRUD, device placement, wiring, part assignment, ladder diagrams, motor starter generation (with real Schneider Electric parts), and reports.

## Key Documents

- `ARCHITECTURE_v0.6.md` — System architecture and design principles
- `ROADMAP.md` — Development phases and priorities
- `STATUS.md` — Current state and session logs

## Contributing

- Keep product logic in headless core packages (UI must not own electrical truth).
- All edits should be deterministic commands (undo/redo friendly).
- Rules are pure + deterministic; UI discovers them from registry metadata.
- Run `npx tsc --noEmit && npm run test:e2e` before committing.

## License

TBD.
