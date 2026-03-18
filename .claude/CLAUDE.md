# 🛑 STOP! READ THIS FIRST! 🛑

## 🚢 PORT ASSIGNMENTS (DO NOT CONFLICT)

fusionCad uses these specific ports. Never kill other vite/api processes:

| Service | Dev Port | Test Port | Description |
|---------|----------|-----------|-------------|
| API     | 3001     | 3003      | Express API server |
| Vite    | 5173     | 5174      | Vite dev server |

When running tests, servers on ports 3003/5174 are used. If you need to kill a stuck test server:
```bash
# Kill only fusionCad test servers (safe)
lsof -ti:3003,5174 | xargs kill 2>/dev/null
```

---

## SESSION START CHECKLIST

Before doing ANYTHING else:

1. **Run `/session-start`** to load current context from STATUS.md
   - (If skill not available, manually read STATUS.md)

2. **Check where we left off** (see below)

3. **Ask user what they want to work on today**

---

## 📍 WHERE WE LEFT OFF (Last Session: 2026-03-17)

**Current task:** AI Electrical Intelligence — improving generated schematic quality

**What was completed this session (Session 20):**
- **P0-P4 AI intelligence** — System prompt, templates, ERC, rich context, ANSI preference
- **Symbol scaling 1.5x for Tabloid** — All 75 symbols + PLC generators scaled, script at scripts/scale-symbols.mjs
- **Tabloid (11×17) paper size** — Added as default, industry standard for control panels
- **Proportional layout system** — layoutForSheet() calculates positions from paper dimensions
- **Grid alignment fix** — Pin Y positions land on 20px grid (plcY=45+75=120), eliminates wire bends
- **AI chat tools** — move_device, delete_device, delete_wire, create_ladder_block, add_rung, auto_layout_ladder
- **ANSI symbols horizontal** — coil, NO/NC contacts all pins left/right
- **Terminal pin right + rotation** — Right-side terminals rotated 180° so pins face inward
- **Ladder blocks + rungs** — generateRelayBank creates ladder entities with page-based numbering
- **Design rules** — 10 categories documented from IEC 61082, NFPA 79, industry standards
- **Schematic design rules in system prompt** — 8 layout rules the AI must follow
- **symbols:refresh builds core-model** — One command for symbol updates (tsx watch auto-reloads API)

**What was completed in Session 19:**
- **AI Chat Panel** — Persistent sidebar chat with tool use (place_device, create_wire, add_annotation, add_sheet, list_symbols). AI can now modify drawings directly.
- **Resizable right panel** — Drag left edge to resize (200-600px), persists to localStorage
- **AI tab first** — AI is the leftmost tab in right panel
- **Centralized AI model ID** — `apps/api/src/ai-config.ts` (single place to update model)
- **AI chat sheet targeting fix** — place_device and add_annotation now accept `sheetName` param
- **ANSI preference saved** — User prefers ANSI/NEMA symbols (circle coils, CR tags)
- **Micro870 16-relay project created** — 3 sheets, ANSI coils, PLC DO modules, all wired
- **Print capabilities** — Added to TODO (user needs to submit printed drawings)

**Key issue identified:** AI generates incomplete circuits — open coil returns, no power connections, missing relay contacts. Need comprehensive electrical intelligence.

**Branch:** `main` (uncommitted changes from sessions 14-19)

**Next steps (priority order):**
1. **P0: Wire router pin exit direction** — Wires from PLC DO pins bend downward instead of going straight horizontal to coils. Router needs to respect pin exit direction (right pin → exit right, left pin → exit left) and not route around the parent device bounding box. This is the #1 visual quality issue.
2. **L1/L2 power rails rendering** — Ladder blocks + rungs exist in data but rails may not render properly yet
3. **Wire numbers visible on canvas** — Renderer feature to show wire labels
4. **Cross-references** — Coil ↔ contact references on schematic (data model + renderer)
5. **Print/PDF output** — Verify Tabloid paper size, margins, scale-to-fit
6. **Rung numbers verification** — Confirm rung numbers render from ladder blocks
7. **AI model investigation** — Test cheaper models for simple edit tasks
8. **Menu bar remaining** — Find/Replace, grid toggle, settings panel

---

## 🎯 PROJECT CONTEXT

**Phase:** Phase 2 - Minimal Editor (99% complete)

**Recent achievements:**
- ✅ **Symbol Editor Enhancements** - Resize handles (rect + circle), vertex editing (polyline + line), numeric inputs, duplicate (Cmd+D), SVG tool icons
- ✅ **Canvas Rendering Polish** - Round lineCap/lineJoin + stroke width 2px across all themes for smoother visual quality
- ✅ **UI Layout Restructure** - Left sidebar → page explorer, right panel → Properties tab with auto-switch
- ✅ **Design System** - Comprehensive design tokens from Refactoring UI + modern 2025-2026 patterns (see `memory/design-system.md`)
- ✅ **SymbolEditor Multi-Select** - Marquee selection, Shift+click toggle, multi-drag/delete/flip, rotate (R key), snap toggle
- ✅ **Power Distribution Ladder Layout** - L1/N rails, branch rungs, transformer/PS output terminals
- ✅ **Visibility Bug Fixed** - RAF coalescing broke rendering; fixed with cancel-and-reschedule pattern
- ✅ **Canvas Panning** - Click+drag pan, Space+drag, middle-click pan; Shift+drag for marquee
- ✅ **AI Panel Generation** - Natural language → full motor starter design with Claude API backend
- ✅ **Multi-theme system** - 5 presets + custom theme, CSS vars + canvas theming
- ✅ **Diagram Block Architecture** - Sheets are now canvases; diagram type is a placeable block (LadderBlock, PanelLayoutBlock)
- ✅ **Motor Starter Auto-Generation** - Real Schneider parts from 216-config database, BOM-ready
- ✅ **Linked Device Representations** - ID-keyed architecture, deviceGroupId, place_linked_device MCP tool
- ✅ **MCP Server** - 29 tools for AI-driven circuit manipulation (prerequisite for AI-assisted drawing)
- ✅ **Object Inspector** - Inline-editable properties, annotation selection/editing
- ✅ **Symbol Editor** - Visual tool to create/edit symbols without code
- ✅ **JSON Symbol Library** - 55 IEC symbols loaded from `builtin-symbols.json`
- ✅ **Insert Symbol Dialog** - Searchable modal with category filtering
- ✅ **Cloud Deployment Ready** - Dockerfile, initial migration, Railway config, production data-source, CORS, /health
- ✅ **ERC Hot-to-Neutral Short Circuit** - Device classifier + circuit graph + BFS path analysis between power rails
- ✅ **Google/GitHub OAuth** - Amplify federated identity, OAuth buttons in AuthModal (activates when VITE_COGNITO_OAUTH_DOMAIN set)
- ✅ **4-tier Symbol Resolution** - Exact ID → Category alias → Parametric generation → Smart fallback
- ✅ Persistence with Postgres + TypeORM (auto-save, project management)
- ✅ Playwright E2E tests - 125 tests + 45 unit tests, state bridge, isolated test DB
- Professional wire routing (visibility graph + A* + nudging)

**High priority features documented:**
- ⭐ Symbol creation/verification tool (reliable symbol building + validation)
- ⭐ Automatic terminal block calculation (Phase 3-4)
- ⭐ Panel layout editor (Phase 6-7)
- ⭐ Cloud deployment (AWS Lambda + CDK, keep local until ready)

---

## 🤖 MCP SERVER

The MCP server (`packages/mcp-server/`) exposes circuit operations as tools for AI agents.

**To use:** Start the API (`npm run dev:api`), then restart Claude Code — it discovers `.mcp.json` automatically.

**30 Tools:** `list_projects`, `get_project_summary`, `list_devices`, `list_connections`, `list_symbols`, `search_symbols`, `run_erc`, `generate_bom`, `list_parts_catalog`, `create_project`, `place_device`, `place_linked_device`, `delete_device`, `update_device`, `create_wire`, `delete_wire`, `assign_part`, `add_sheet`, `add_annotation`, `create_ladder_block`, `list_blocks`, `delete_block`, `set_sheet_type` _(deprecated)_, `add_rung`, `auto_layout_ladder`, `generate_motor_starter`, `generate_motor_starter_panel`, `add_control_rung`, `lookup_motor_starter`, `generate_motor_starter_from_spec`

**Key files:**
- `packages/mcp-server/src/server.ts` - All tool registrations
- `packages/mcp-server/src/circuit-helpers.ts` - Pure circuit mutation functions
- `packages/mcp-server/src/circuit-templates.ts` - Motor starter + control rung generators
- `packages/mcp-server/src/api-client.ts` - HTTP client for fusionCad API
- `packages/core-model/src/motor-data/lookup.ts` - Motor starter component lookup engine
- `packages/core-model/src/motor-data/motor-database.json` - 216 Schneider Electric motor configs
- `packages/core-model/src/parts/schneider-motor-catalog.ts` - 289 parts with datasheet URLs
- `.mcp.json` - Claude Code auto-discovery config

---

## 📚 KEY DOCUMENTS (Always Read STATUS.md First!)

- **STATUS.md** - Current state, progress, session logs (READ THIS!)
- **ROADMAP.md** - Development phases and priorities
- **ARCHITECTURE_v0.6.md** - System architecture, multi-tenancy, design principles

---

## 🛠️ CUSTOM SKILLS AVAILABLE

Use these to improve workflow:

- `/session-start` - Load context from STATUS.md at session start
- `/session-end` - Update STATUS.md and CLAUDE.md at session end
- `/update-status` - Update STATUS.md only (legacy, use session-end instead)
- `/cleanup-console` - Remove debug console.log statements
- `/check-architecture` - Validate changes against architecture principles

---

## 🧪 E2E TESTING (Playwright)

125 E2E tests + 45 unit tests covering all Phase 2 features. Uses separate ports (API 3003, Vite 5174) and test database (`fusion_cad_test`).

```bash
npm run db:up              # ensure Docker Postgres is running
npm run test:e2e           # headless (fast)
npm run test:e2e:headed    # watch in browser
npm run test:e2e:slow      # headed + 500ms delay for supervision
npm run test:e2e:ui        # Playwright UI mode (step-through)
SLOWMO=1000 npx playwright test --headed  # custom speed
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

Chrome integration is available for testing the web UI:

- Start session with `claude --chrome` to enable browser integration
- Or run `/chrome` within an existing session to connect
- Useful for: testing canvas rendering, debugging console errors, recording demo GIFs
- Run `/chrome` to check connection status and manage settings

---

## 🚨 BEFORE COMMITTING - MANDATORY

**ALWAYS run tests before any commit:**

```bash
# 1. TypeScript check (no emit)
npx tsc --noEmit

# 2. E2E tests (requires Docker: npm run db:up)
npm run test:e2e

# 3. If API changes were made, also run API tests
# (add when API tests exist)
```

**If tests fail:**
- Fix the failing tests BEFORE committing
- Update test expectations if UI/behavior intentionally changed
- Never commit with failing tests

---

## 💡 REMEMBER

- **Automation-first** - fusionCad is for electrical engineers, focus on real workflow automation
- **Local-first** - No server required
- **Phase discipline** - Stay focused on Phase 2 (Canvas Rendering) goals
- **Terminal blocks matter** - Auto-calculating terminal block quantities is HIGH priority
- **Panel layout is coming** - Physical layout editor is a confirmed future feature
