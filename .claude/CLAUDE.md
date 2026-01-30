# 🛑 STOP! READ THIS FIRST! 🛑

## SESSION START CHECKLIST

Before doing ANYTHING else:

1. **Run `/session-start`** to load current context from STATUS.md
   - (If skill not available, manually read STATUS.md)

2. **Check where we left off** (see below)

3. **Ask user what they want to work on today**

---

## 📍 WHERE WE LEFT OFF (Last Session: 2026-01-29)

**Current task:** JSON+SVG Symbol Format - COMPLETE!

**Status:**
- ✅ Persistence working (Postgres + TypeORM)
- ✅ Copy/paste/duplicate (Cmd+C/V/D)
- ✅ Undo/redo (Cmd+Z/Shift+Z)
- ✅ Multi-select (Shift+click, Cmd+A)
- ✅ Wire bend points fully working
- ✅ **JSON+SVG Symbol Format complete**:
  - `SymbolPath` interface for SVG path data
  - `SymbolText` interface for text labels
  - SVG path parser (M, L, H, V, A, C, Q, Z commands)
  - All 6 IEC symbols converted to JSON+SVG
  - Backward compatible (custom draw functions still work)
- ⚠️ Drag-select (marquee) NOT yet implemented

**Next steps:**
1. Add drag-select (marquee/rubber band selection)
2. Import symbols from external SVG libraries (KiCad, electricalsymbols repo)
3. Consider adding wire properties panel when wire selected

**Files modified this session:**
- `packages/core-model/src/types.ts` - Added SymbolPath, SymbolText interfaces
- `apps/web/src/renderer/symbols.ts` - SVG path parser and renderer
- `packages/core-model/src/symbols/iec-symbols.ts` - Converted all 6 symbols to paths

**Symbol format example:**
```typescript
{
  paths: [
    { d: 'M 30,5 A 25,25 0 1,1 29.99,5 Z', stroke: true }
  ],
  texts: [
    { content: 'M', x: 30, y: 30, fontSize: 20, fontWeight: 'bold' }
  ]
}
```

---

## 🎯 PROJECT CONTEXT

**Phase:** Phase 2 - Minimal Editor (97% complete)

**Recent achievements:**
- ✅ Persistence with Postgres + TypeORM (auto-save, project management)
- ✅ Copy/paste/duplicate and undo/redo
- ✅ Multi-select (Shift+click, Cmd+A, group operations)
- ✅ Wire bend points complete (add/drag/delete waypoints)
- ✅ **JSON+SVG Symbol Format** - symbols defined with SVG paths
- Professional wire routing (visibility graph + A* + nudging)
- Pan/zoom controls working

**High priority features documented:**
- ⭐ Automatic terminal block calculation (Phase 3-4)
- ⭐ Panel layout editor (Phase 6-7)
- SVG symbol import from external libraries (now possible!)

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

## 🌐 BROWSER TESTING (Optional)

Chrome integration is available for testing the web UI:

- Start session with `claude --chrome` to enable browser integration
- Or run `/chrome` within an existing session to connect
- Useful for: testing canvas rendering, debugging console errors, recording demo GIFs
- Run `/chrome` to check connection status and manage settings

---

## 💡 REMEMBER

- **Automation-first** - fusionCad is for electrical engineers, focus on real workflow automation
- **Local-first** - No server required
- **Phase discipline** - Stay focused on Phase 2 (Canvas Rendering) goals
- **Terminal blocks matter** - Auto-calculating terminal block quantities is HIGH priority
- **Panel layout is coming** - Physical layout editor is a confirmed future feature
