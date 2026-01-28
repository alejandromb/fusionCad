# 🛑 STOP! READ THIS FIRST! 🛑

## SESSION START CHECKLIST

Before doing ANYTHING else:

1. **Run `/session-start`** to load current context from STATUS.md
   - (If skill not available, manually read STATUS.md)

2. **Check where we left off** (see below)

3. **Ask user what they want to work on today**

---

## 📍 WHERE WE LEFT OFF (Last Session: 2026-01-27 afternoon)

**Current task:** Improving electrical symbols to match IEC 60617 standards

**Status:**
- ✅ Motor symbol looks good
- ❌ Contactor, button, overload, terminal, power supply symbols are "funky and not right"
- 🔄 Need to redraw them based on proper IEC standards

**Next steps:**
1. Research proper IEC 60617 symbol drawings for:
   - Contactor coil (rectangle with diagonal or circle)
   - Pushbutton (contact with actuator)
   - Overload relay (thermal element)
   - Terminal strip (simple connection points)
   - Power supply (rectangle with +/- indicators)
2. Update `apps/web/src/renderer/symbols.ts` with correct drawings
3. Test in browser

**Files being modified:**
- `apps/web/src/renderer/symbols.ts` - Symbol drawing functions

**Resources found:**
- IEC 60617 official database: https://library.iec.ch/iec60617
- GitHub SVG library: https://github.com/chille/electricalsymbols (33 symbols, CC BY-SA 3.0)
- Siemens symbol library: https://symbols.radicasoftware.com/225/iec-symbols

---

## 🎯 PROJECT CONTEXT

**Phase:** Phase 2 - Canvas Rendering (60% complete)

**Recent achievements:**
- Professional wire routing algorithm working (visibility graph + A* + nudging)
- All 11 wires routing correctly with color coding
- Pan/zoom controls working
- 4 custom skills created for better workflow

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
- `/update-status` - Update STATUS.md at session end
- `/cleanup-console` - Remove debug console.log statements
- `/check-architecture` - Validate changes against architecture principles

---

## 💡 REMEMBER

- **Automation-first** - fusionCad is for electrical engineers, focus on real workflow automation
- **Local-first** - No server required
- **Phase discipline** - Stay focused on Phase 2 (Canvas Rendering) goals
- **Terminal blocks matter** - Auto-calculating terminal block quantities is HIGH priority
- **Panel layout is coming** - Physical layout editor is a confirmed future feature
