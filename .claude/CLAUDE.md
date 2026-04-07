# 🛑 STOP! READ THIS FIRST! 🛑

## 🧠 ENGINEERING STANDARDS

You are a **senior software developer**. Act accordingly:

- **No hacks.** Write clean, well-reasoned solutions. If a shortcut compromises correctness, maintainability, or clarity, don't take it.
- **Research before guessing.** If you don't know something, look it up — read docs, search the web, read source code. Come back with a solid, informed approach. Don't wing it.
- **Trial-and-error is a last resort.** Only use trial-and-error when there is no good knowledge base available (offline docs, source code, web resources) or the problem is genuinely novel. Otherwise, understand the system first, then act.
- **Understand before changing.** Read the relevant code, understand the architecture, then propose changes. Never modify code you haven't read.
- **Minimal, focused changes.** Only change what's necessary. Don't refactor surroundings, add features that weren't asked for, or "improve" unrelated code.
- **No redundant confirmations.** Once a plan is agreed upon (e.g., "we'll edit files A, B, C"), just do it — don't ask permission for each file edit. Don't ask "is your dev server running?" or other obvious questions. Batch checks at the end, not after every edit.
- **Just fetch and research.** Never ask permission to fetch URLs, web pages, documentation, or research papers. Just do it — it's an obvious part of the workflow.
- **Minimize back-and-forth.** Be concise. Don't narrate every step. Don't summarize what you just did unless the user asks. Act, don't talk about acting.

## 🔴 VERIFICATION — NEVER ASSUME, ALWAYS CHECK

**This is the #1 rule. Violations have repeatedly caused bugs, wasted time, and broken trust.**

- **NEVER say "done" without verification.** After ANY change:
  1. Confirm the change is actually being served (Vite HMR is unreliable — check via `curl` or browser console import)
  2. Run the render audit (`getRenderAudit()`) for visual/rendering changes
  3. Run E2E tests for functional changes
  4. Take a screenshot or read audit data for visual changes
- **Verify at the RIGHT layer.** Theme changes? Check `getTheme()` in browser console. Symbol changes? Check the API response AND the rendered output. Wire changes? Check connection data AND the render audit.
- **Hardcoded values override themes.** Always check symbol primitives, not just theme config. The junction `#00ff00` bug happened because a hardcoded fill in the symbol primitive overrode the theme color.
- **Restart services after rebuilding.** MCP server changes require: `npm run build` → restart API. Symbols auto-sync on startup (upsert, only writes changes). Vite changes may need full restart (HMR doesn't always work for renderer modules).
- **Check BOTH the code AND the running app.** `curl` the served file to verify Vite is serving your changes. `getTheme()` in console to verify theme. `getRenderAudit()` to verify rendering.
- **If you can't verify, say so.** "I made the change but can't confirm it's being served — please reload" is honest. "Done" without checking is not.

## 🛠️ TOOLS FOR VERIFICATION

| What changed | How to verify |
|---|---|
| Theme/colors | `import('/src/renderer/theme.ts').then(m => console.log(m.getTheme().fieldName))` |
| Symbol data | `curl -s http://localhost:3001/api/symbols/SYMBOL_ID` |
| Rendering | `window.__fusionCadState.getRenderAudit()` in browser console |
| Wire routing | Check audit: `audit.wires.map(w => w.pathType + ' ' + w.isHorizontal)` |
| Device positions | Check audit: `audit.devices.map(d => d.tag + ': ' + JSON.stringify(d.bounds))` |
| Overlaps | Check audit: `audit.overlaps` |
| Unconnected | Check audit: `audit.stats.unconnectedDevices` |
| Vite serving changes | `curl -s http://localhost:5173/src/path/to/file.ts \| grep "UNIQUE_STRING"` |

---

## 🚢 PORT ASSIGNMENTS (DO NOT CONFLICT)

fusionCad uses these specific ports. Never kill other vite/api processes:

| Service | Dev Port | Test Port | Description |
|---------|----------|-----------|-------------|
| API     | 3001     | 3003      | Express API server |
| Vite    | 5173     | 5174      | Vite dev server |

When running tests, servers on ports 3003/5174 are used. If you need to kill a stuck test server:
```bash
lsof -ti:3003,5174 | xargs kill 2>/dev/null
```

---

## SESSION START CHECKLIST

**IMPORTANT: Start Claude Code with `claude --chrome` for this project.** fusionCad is a visual canvas-based tool — browser inspection is essential for debugging rendering, wire routing, and layout issues.

Before doing ANYTHING else:

1. **Read this file** — priorities, bugs, and context are all here. This is the single source of truth.
2. **Connect to Chrome** — use `tabs_context_mcp` to see the running app. Take a screenshot to verify state.
3. **Present P0 items first** when summarizing what's next. Never bury critical bugs below feature work.
4. **Ask user what they want to work on today.**

---

## 🔴 PRIORITIES — Single Source of Truth

**Current phase:** Phase 2 — Minimal Editor (99% complete)
**Branch:** `main`
**Last session:** 36 (2026-04-06/07) — AI-assisted symbol import, ANSI e-stop NC symbol, compressor sequencer review
**Tests:** 135 E2E + 85 unit, 86 symbols + 10 PLC generators
**Coordinate system:** All internal coordinates are **millimeters (mm)**. M=2.5mm (IEC 60617), grid=5mm, MM_TO_PX=4. See `packages/core-model/src/units.ts`. Symbols converted to mm in Session 30 (v3.0-mm).

### P0 — MVP Features

1. ~~**Continuous placement mode**~~ ✅ Done (Session 33)
2. ~~**Find/Replace**~~ ✅ Done (Session 34) — Cmd+F
3. ~~**SVG/DXF symbol importer**~~ ✅ Done (Session 34+35) — Tools > Import, preview, pin detection. Default: Layout. Overwrite warning for built-in symbols.
4. **Page thumbnails** — Sheet navigation with thumbnail previews.
5. **Smart AI defaults** — "16 relays" → full project with power, PLC, sheets, contacts, terminals.
6. **Template caching** — Cache common patterns to skip AI entirely.
7. **CDN for static assets** — CloudFront for the web app.
8. **Analytics** — Usage patterns, feature tracking, generation success rate.
9. ~~**Grid toggle on/off**~~ ✅ Done (Session 33)
10. ~~**Grid size setting**~~ ✅ Done (Session 33) — Rung gap slider
11. ~~**Pin label visibility toggle**~~ ✅ Done (Session 33)
12. ~~**Settings panel**~~ ✅ Done (Session 33) — DISPLAY section
13. ~~**Sheet reorder**~~ ✅ Done (Session 34) — Drag-and-drop in sidebar
14. **Movable text labels** — Drag tag, description, pin labels to reposition per device. Fixes text/wire overlap.
15. **DXF rendering quality** — Text garbled (font/size/alignment), fills missing (screws, terminal blocks), line weights need improvement. Research proper DXF text rendering + HATCH/SOLID fill support.
16. **Device linking UI** — Select multiple devices → "Link as same part" for multi-symbol parts (PLC DI+DO+layout = one BOM item).
17. ~~**Shape annotations**~~ ✅ Done (Session 35) — Rectangle, circle, line, arrow. S key (cycles tools), click-drag, resize handles, multi-select (Shift+click, marquee), grouping (Cmd+G/Cmd+Shift+G), lock size, copy/paste with ghost preview. Right panel: stroke, color, dashed, fill. 7 E2E tests.
18. **Layout built-in symbols** — Promote imported layout footprints (PLC, relays, power supplies) to built-in library. Separate layout symbol category from schematic symbols.

### P1 — Core Product Quality

13. **Multi-symbol part linking** — Parts like PLCs need multiple symbols (DI+DO+CPU) linked by `deviceGroupId`. Completeness checking (warn if DO missing), AI always places full set, BOM groups as one item.
14. **Post-generation ERC + auto-fix** — Run ERC after AI finishes, feed violations back (max 3 retries).
15. **Rung-based device alignment** — Smart horizontal distribution + vertical snap to rung Y for professional-looking schematics. Includes PLC pin/rung alignment: COM pins need double-spacing, output pins should land exactly on rung lines. Options: symbol-aware rung placement (generate pin spacing from rung gap), auto-layout stretch, or per-pin Y-offset in symbol format.
16. **Print/PDF paper size verification** — Test all paper sizes (A4, A3, Letter, Tabloid, ANSI-D) with mm coordinates.
17. **Rich AI circuit context** — Show AI which pins are connected vs unconnected. Move context building server-side.
18. **AI-assisted symbol creation** — ✅ AI-assisted import built (Session 36): POST `/api/symbols/ai-import-assist` takes raw SVG/DXF primitives + filename, Claude identifies the symbol and returns clean geometry with proper pins. Works for schematic and layout. Frontend wired in SymbolImportDialog (purple "AI Assist" button). **TODO:** Tune layout prompt (currently over-simplifies DXF geometry), add MCP `create_custom_symbol` tool, load symbol-creation-rules.md into AI chat context.
19. **Error monitoring** — Sentry or similar for production error tracking.

### P2 — Infrastructure & Security

19. **Auth enforced on all AI endpoints** — AI chat uses `optionalAuth`, needs `requireAuth` for paid features.
20. **AI chat rate limiting** — `/api/ai-chat` has NO rate limiting or usage tracking.
21. **AWS deployment** — Amplify (frontend), API Gateway + Lambda (backend), CDK with Lambda layers, RDS Postgres. CI/CD with GitHub Actions. **Rollback feature**: auto-rollback if E2E tests fail post-deploy.
22. **CORS locked down** — Currently allows all origins in dev.
23. **Database backups automated** — Currently manual `npm run db:backup`. Need scheduled backups.
24. **Project backup/restore verified** — Export/import .fcad.json tested end-to-end.
25. **Symbol/part persistence review** — Imported symbols use API when online, localStorage fallback offline. Review for production: user symbol storage, DB migration, multi-tenant isolation.
26. **Symbol source-of-truth unification** — Three symbol sources (generated in-memory, DB, localStorage) can conflict. Generated PLC symbols now auto-seed on startup ✅ (Session 35). localStorage should be an offline queue that syncs to DB when connectivity returns, not a permanent store. Prevents: blank device boxes after DB restart, stale duplicates, lost imports.

### P3 — Business & Revenue

25. **Stripe/payment integration** — Connect billing to plan tiers.
26. **Usage dashboard** — Show users their AI generation count, remaining quota.
27. **AI model tiering** — Cheaper models for simple edits, Sonnet for generation.
28. **AI cost tracking** — Log token usage per request.

### Future Phases (Post-Launch)

- **Symbol creation/verification tool** — Reliable symbol building + validation
- **Automatic terminal block calculation** — Phase 3-4
- **Panel layout editor** — Physical layout editor, Phase 6-7
- **Multi-tenancy** — org_id, team features
- **Blueprint editor UI** — Visual blueprint creation/editing
- **gstack integration** — Parallel sprint workflow with Conductor for multi-agent development

---

## 🎯 PROJECT CONTEXT

**What's done (Phase 0, 1, 2):**
- Monorepo (npm workspaces, TypeScript, ESM), CLI ("fcad"), golden circuit (3-wire motor starter)
- Canvas: symbol rendering, wire routing (visibility graph + A* + nudging + direction constraints), pan/zoom, snap-to-grid, multi-select/marquee, copy/paste, undo/redo, wire bend points, segment dragging, wire reconnection
- 86 symbols (IEC + ANSI/NEMA), insert dialog, symbol editor (draw tools, resize handles, vertex editing, bbox resize, duplicate)
- Persistence: Postgres + TypeORM, auto-save, project management
- MCP server: 30 tools for AI-driven circuit manipulation
- AI panel: natural language → motor starter design (Claude API backend)
- Motor starter auto-generation: 216 Schneider configs, BOM-ready
- Linked device representations (deviceGroupId), diagram block architecture
- Multi-theme system (5 presets + custom), design system tokens
- Auth: Cognito + Amplify, Google/GitHub OAuth
- Cloud deployment ready: Dockerfile, migrations, Railway config, CORS, /health
- ERC: hot-to-neutral short circuit detection (device classifier + BFS)
- Shape annotations: rectangle, circle, line, arrow on canvas (S key, drag-to-draw, resize handles, multi-select, grouping, lock size, copy/paste with ghost)
- Symbol protection: generated PLC symbols auto-seed on startup, import warns before overwrite
- Layout symbols: 11 panel footprints (DXF imports + rectangular fallbacks) for Rockwell, Eaton, Phoenix Contact parts
- 135 E2E tests + 85 unit tests

**Architecture decisions:**
- **Storage:** Cloud Postgres for everyone. Free tier: 3 projects, full editor, no AI. Paid: unlimited + AI.
- **Auth:** Cognito + Amplify. Google/GitHub OAuth. Email/password fallback.
- **Deployment target:** AWS Lambda + CDK (not Railway/Fly.io). Keep local until ready.

---

## 🤖 MCP SERVER

The MCP server (`packages/mcp-server/`) exposes circuit operations as tools for AI agents.

**To use:** Start the API (`npm run dev:api`), then restart Claude Code — it discovers `.mcp.json` automatically.

**30 Tools:** `list_projects`, `get_project_summary`, `list_devices`, `list_connections`, `list_symbols`, `search_symbols`, `run_erc`, `generate_bom`, `list_parts_catalog`, `create_project`, `place_device`, `place_linked_device`, `delete_device`, `update_device`, `create_wire`, `delete_wire`, `assign_part`, `add_sheet`, `add_annotation`, `create_ladder_block`, `list_blocks`, `delete_block`, `set_sheet_type` _(deprecated)_, `add_rung`, `auto_layout_ladder`, `generate_motor_starter`, `generate_motor_starter_panel`, `add_control_rung`, `lookup_motor_starter`, `generate_motor_starter_from_spec`

**Key files:**
- `packages/mcp-server/src/server.ts` - Tool registrations
- `packages/mcp-server/src/circuit-helpers.ts` - Pure circuit mutation functions
- `packages/mcp-server/src/circuit-templates.ts` - Motor starter + control rung generators
- `packages/mcp-server/src/api-client.ts` - HTTP client for fusionCad API
- `packages/core-model/src/motor-data/lookup.ts` - Motor starter component lookup
- `packages/core-model/src/motor-data/motor-database.json` - 216 Schneider Electric motor configs
- `packages/core-model/src/parts/schneider-motor-catalog.ts` - 289 parts with datasheet URLs
- `.mcp.json` - Claude Code auto-discovery config

---

## 🛠️ CUSTOM SKILLS

- `/session-start` - Load context at session start
- `/session-end` - Update STATUS.md and CLAUDE.md at session end
- `/cleanup-console` - Remove debug console.log statements
- `/check-architecture` - Validate changes against architecture principles

---

## 🧪 E2E TESTING (Playwright)

135 E2E + 45 unit tests. Separate ports (API 3003, Vite 5174) and test database (`fusion_cad_test`).

```bash
npm run db:up              # ensure Docker Postgres is running
npm run test:e2e           # headless (fast)
npm run test:e2e:headed    # watch in browser
npm run test:e2e:slow      # headed + 500ms delay
npm run test:e2e:ui        # Playwright UI mode
```

**Key files:**
- `playwright.config.ts` - config, webServer, ports
- `e2e/fixtures/fusion-cad.fixture.ts` - auto-fixture (clean project per test)
- `e2e/helpers/canvas-helpers.ts` - worldToScreen, placeSymbol, createWire
- `e2e/helpers/api-helpers.ts` - deleteAllProjects, createEmptyProject
- `apps/web/src/App.tsx` - state bridge (`window.__fusionCadState`, dev-only)

**Gotchas:**
- `page.mouse.click()` doesn't support `modifiers` — use `keyboard.down()/up()`
- Vite needs `--strictPort` to prevent silent port fallback
- Save status starts as `'unsaved'` briefly after load (auto-save cycle)

---

## 🌐 BROWSER TESTING (Optional)

- Start session with `claude --chrome` to enable browser integration
- Or run `/chrome` within an existing session to connect
- Useful for: testing canvas rendering, debugging console errors, recording demo GIFs

---

## 🚨 BEFORE COMMITTING - MANDATORY

```bash
# 1. TypeScript check (no emit)
npx tsc --noEmit

# 2. E2E tests (requires Docker: npm run db:up)
npm run test:e2e

# 3. If API changes were made, also run API tests
```

- Fix failing tests BEFORE committing
- Update test expectations if UI/behavior intentionally changed
- Never commit with failing tests

---

## 📚 KEY DOCUMENTS

- **STATUS.md** - Session log archive (sessions 1-22)
- **ARCHITECTURE_v0.6.md** - System architecture, multi-tenancy, design principles

---

## 💡 REMEMBER

- **Automation-first** - fusionCad is for electrical engineers, focus on real workflow automation
- **Local-first** - No server required for core editing
- **Terminal blocks matter** - Auto-calculating terminal block quantities is HIGH priority (future phase)
- **Panel layout is coming** - Physical layout editor is a confirmed future feature
