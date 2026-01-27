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
- `apps/cli/` — Node CLI “truth harness” (validate + export deliverables)

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
