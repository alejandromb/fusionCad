# 🛑 STOP! READ THIS FIRST! 🛑

## SESSION START CHECKLIST

Before doing ANYTHING else:

1. **Run `/session-start`** to load current context from STATUS.md
   - (If skill not available, manually read STATUS.md)

2. **Check where we left off** (see below)

3. **Ask user what they want to work on today**

---

## 📍 WHERE WE LEFT OFF (Last Session: 2026-01-28 morning)

**Current task:** Canvas interaction tools - COMPLETE!

**Status:**
- ✅ Wire tool working (pin-to-pin connections)
- ✅ Drag to reposition symbols
- ✅ Delete symbols with Delete/Backspace
- ✅ Selection highlight (dashed cyan border)
- ✅ Ghost preview while placing
- ✅ Snap to 20px grid
- ✅ Toolbar with Select/Wire modes
- ❌ Symbol shapes still need IEC 60617 polish (carried over)

**Next steps:**
1. **PERSISTENCE (CRITICAL)** - circuits disappear on page refresh!
   - Need to decide: IndexedDB (local) vs cloud vs hybrid
   - Cloud will be needed eventually for symbol library
   - Business model: 1 free project for free users?
2. Add wire nodes/bend points (allow intermediate points in wires)
3. Improve symbol shapes to match IEC 60617 standards
4. Multi-select and undo/redo

**Files modified this session:**
- `apps/web/src/App.tsx` - Interaction modes, hit detection, state management
- `apps/web/src/App.css` - Toolbar and status message styles
- `apps/web/src/renderer/circuit-renderer.ts` - Selection highlight, wire preview, ghost symbol

**Resources for symbol improvement (from last session):**
- IEC 60617 official database: https://library.iec.ch/iec60617
- GitHub SVG library: https://github.com/chille/electricalsymbols
- Siemens symbol library: https://symbols.radicasoftware.com/225/iec-symbols

---

## 🎯 PROJECT CONTEXT

**Phase:** Phase 2 - Canvas Rendering (85% complete)

**Recent achievements:**
- Canvas interaction tools fully working (wire, select, drag, delete)
- Professional wire routing algorithm (visibility graph + A* + nudging)
- All 11 wires routing correctly with color coding
- Pan/zoom controls working
- 5 custom skills created (including new `/session-end`)

**High priority features documented:**
- ⭐ Automatic terminal block calculation (Phase 3-4)
- ⭐ Panel layout editor (Phase 6-7)
- Symbol editor (future)

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
