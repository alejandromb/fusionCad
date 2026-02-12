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

## 📍 WHERE WE LEFT OFF (Last Session: 2026-02-12)

**Current task:** Linked Device Representations - COMPLETE!

**Status:**
- ✅ **ID-Keyed Architecture**: All internal systems use `device.id` (not `device.tag`)
- ✅ **deviceGroupId**: Links multiple representations of same physical device
- ✅ **MCP Server** (`packages/mcp-server/`): 19 tools (9 read, 10 write) incl. `place_linked_device`
- ✅ **ERC + BOM updated**: deviceGroupId-aware duplicate checks and BOM grouping
- ✅ **35 E2E tests passing**
- ✅ All prior features working (persistence, copy/paste, undo/redo, multi-select, marquee, wire bend points)

**Next steps:**
1. Test linked device workflow end-to-end (K1 contactor + K1 coil + K1 aux contacts)
2. Implement IndexedDB storage for free tier
3. Import symbols from external SVG libraries
4. Fine-tune symbol paths using Symbol Editor

---

## 🎯 PROJECT CONTEXT

**Phase:** Phase 2 - Minimal Editor (98% complete)

**Recent achievements:**
- ✅ **Linked Device Representations** - ID-keyed architecture, deviceGroupId, place_linked_device MCP tool
- ✅ **MCP Server** - 19 tools for AI-driven circuit manipulation (prerequisite for AI-assisted drawing)
- ✅ **Object Inspector** - Inline-editable properties, annotation selection/editing
- ✅ **Symbol Editor** - Visual tool to create/edit symbols without code
- ✅ **JSON Symbol Library** - 55 IEC symbols loaded from `builtin-symbols.json`
- ✅ **Insert Symbol Dialog** - Searchable modal with category filtering
- ✅ Persistence with Postgres + TypeORM (auto-save, project management)
- ✅ Playwright E2E tests - 35 tests, state bridge, isolated test DB
- Professional wire routing (visibility graph + A* + nudging)

**High priority features documented:**
- ⭐ Automatic terminal block calculation (Phase 3-4)
- ⭐ Panel layout editor (Phase 6-7)
- ⭐ Dual storage: IndexedDB (free) + Postgres (paid)

---

## 🤖 MCP SERVER

The MCP server (`packages/mcp-server/`) exposes circuit operations as tools for AI agents.

**To use:** Start the API (`npm run dev:api`), then restart Claude Code — it discovers `.mcp.json` automatically.

**19 Tools:** `list_projects`, `get_project_summary`, `list_devices`, `list_connections`, `list_symbols`, `search_symbols`, `run_erc`, `generate_bom`, `list_parts_catalog`, `create_project`, `place_device`, `place_linked_device`, `delete_device`, `update_device`, `create_wire`, `delete_wire`, `assign_part`, `add_sheet`, `add_annotation`

**Key files:**
- `packages/mcp-server/src/server.ts` - All tool registrations
- `packages/mcp-server/src/circuit-helpers.ts` - Pure circuit mutation functions
- `packages/mcp-server/src/api-client.ts` - HTTP client for fusionCad API
- `.mcp.json` - Claude Code auto-discovery config

---

## 📚 KEY DOCUMENTS (Always Read STATUS.md First!)

- **STATUS.md** - Current state, progress, session logs (READ THIS!)
- **ROADMAP.md** - 8-phase plan
- **ARCHITECTURE_v0.5.md** - Design principles
- **MVP_v0.2.md** - MVP scope

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

35 tests covering all Phase 2 features. Uses separate ports (API 3003, Vite 5174) and test database (`fusion_cad_test`).

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
