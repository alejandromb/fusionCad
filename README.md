# Electrical CAD (Controls-First) — Local-First, Automation-First

A modern, AI-assisted electrical CAD tool focused on **control schematics** where the real value is:
- **Automated deliverables** (BOM, wire lists, terminal plans, PLC I/O, labels)
- **Database-driven correctness** (tags, cross-refs, consistency)
- **Rule-based validation** (deterministic, explainable)
- **Affordable access** (useful free tier + low-cost paid tier later)
- **Practical exchange** (DXF now, DWG later)

## Product North Star — Where the Opportunity Really Is

A simple schematic editor alone likely won’t attract many professional users — tools exist already.  
The gap is a tool that combines **automation + usability + low cost**.

See: `MVP.md` for the full MVP goals/scope.

## Architecture Contracts (Agents must follow)

These documents are the shared contract for humans + AI agents:
- `ARCHITECTURE_v0.5.md`
- `INVARIANTS_v0.3.md`

Key principle:
> The drawing editor is a *view* over a canonical electrical model. DXF/DWG are deliverables, not the source of truth.

## Tech Direction (MVP)

- Language: **TypeScript**
- Web shell: **React + Vite** (PWA-capable, offline-first)
- Desktop later (optional): **Tauri** wrapper (same UI + same core)
- Persistence: local-first via **IndexedDB/OPFS** or **SQLite WASM** (no server required for free tier)
- Core packaging: a **headless TS core** that can run in browser, desktop, Node CLI, and (optionally) server.

## Repo Layout (recommended)

- `packages/` — headless core (model/graph/commands/rules/reports/project-io)
- `apps/web/` — React UI shell
- `apps/api/` — Express REST API (Postgres + TypeORM)
- `apps/cli/` — Node CLI "truth harness" (validate + export deliverables)
- `e2e/` — Playwright end-to-end tests

## Getting Started

```bash
npm install                # install all dependencies
npm run db:up              # start Postgres (Docker)
npm run dev:all            # start API + web dev servers
```

Open `http://localhost:5173` in your browser.

## Testing

### E2E Tests (Playwright)

End-to-end tests exercise the full stack through a real browser — placing symbols, drawing wires, undo/redo, copy/paste, persistence, and more.

```bash
npm run db:up              # ensure Postgres is running
npm run test:e2e           # headless (fast, CI-friendly)
npm run test:e2e:headed    # watch in a browser window
npm run test:e2e:slow      # headed + 500ms delay between actions
npm run test:e2e:ui        # Playwright UI mode (step-through debugging)
```

Custom speed: set the `SLOWMO` env var to any value in milliseconds:

```bash
SLOWMO=1000 npx playwright test --headed   # 1 second between actions
```

**Architecture**: Tests use a separate test database (`fusion_cad_test`) and dedicated ports (API on 3003, Vite on 5174) so they never conflict with your dev servers. A state bridge (`window.__fusionCadState`) exposes React state in dev mode for assertions on canvas-rendered data.

**28 tests across 8 files**: app loading, symbol placement, select/delete, copy/paste, undo/redo, multi-select, wire creation, and persistence.

## MVP Success Criteria

The MVP is successful when a controls engineer can:
1) draw a real control circuit,
2) run validation,
3) export BOM + wire list + terminal plan,
…faster and cheaper than legacy tools.

## Contributing (early)

- Keep product logic in headless core packages (UI must not own electrical truth).
- All edits should be deterministic commands (undo/redo friendly).
- Rules are pure + deterministic; UI discovers them from registry metadata.

## License

TBD.
