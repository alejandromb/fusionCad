# ⚡ Electrical CAD MVP — Goals & Scope

## 🎯 MVP Objective

Build a **modern, AI-assisted electrical CAD tool for control schematics** that delivers **real engineering value** on day one by focusing on **automation, correctness, and affordability** — not on competing head-to-head with legacy CAD tools on raw drawing features.

The MVP’s success criterion is simple:

> A controls engineer can design a real control circuit and reliably generate BOMs, wire lists, terminal plans, and validation checks **faster and cheaper** than with existing tools.

---

## 🚀 Where the Opportunity Really Is (Product North Star)

A simple schematic editor alone likely won’t attract many professional users — because tools already exist that do that.

### 💡 Core unmet value (this MVP targets **all** of these):

- **Automated deliverables**
  - BOMs
  - Wire lists
  - Terminal plans
  - PLC I/O lists
  - Label exports  
  *(better than free tools, usable in production)*

- **Database-driven workflows**
  - Centralized parts database
  - Device tags + locations
  - Cross-references (coil ↔ contacts, PLC I/O ↔ terminals)
  - Consistency across drawings

- **Easy rule-based validation**
  - Catch errors early (unconnected pins, duplicate tags, shorts, missing terminals)
  - Explain *why* something is wrong and how to fix it

- **Affordable access**
  - Free tier that is genuinely useful
  - Low-cost paid tier suitable for individuals and small teams

- **Good file exchange**
  - DXF import/export from day one
  - DWG via conversion later (explicitly not MVP-blocking)

> **The biggest gap in the market is automation + usability + low cost — not better line-drawing.**

---

## 🧠 Final Takeaway (Why This Is Worth Doing)

💪 **Yes — building a modern electrical CAD tool is worth it** from both a market and user-need perspective.

- There is **real frustration** with the cost and complexity of existing tools.
- Engineers are **actively searching for alternatives** and often resort to workarounds or limited free software.
- Existing free/open tools are **not EPLAN-like in automation power**, especially for panel designers and controls engineers.

You’re not dreaming — this is a **legitimate opportunity**, *if* you focus first on:

> **automation + affordability + usable reports**, not full CAD parity on day one.

---

## 🧩 MVP Scope (What You Will Build)

### 1️⃣ Schematic Editor (Foundational, not the differentiator)

**Must-have**
- 2D schematic editor (IEC focus initially)
- Place symbols with defined pins
- Wire tool with snap-to-pin
- Net/potential naming (24VDC, 0V, PE)
- Multi-page project structure
- Device tagging (K1, S1, X1, PLC modules)

**Explicitly out of scope for MVP**
- Fancy routing
- Full DWG round-trip editing
- 3D cabinet layout
- PCB layout

---

### 2️⃣ Database-Driven Core (The Real Product)

This is the **engine** — drawings are just a view.

**Core data model**
- Parts (manufacturer, part number, attributes)
- Devices (tag, function, location, assigned part)
- Symbol instances (linked to devices)
- Pins, nets, terminals, cables
- Cross-references

**Persistence**
- Local-first project storage (SQLite or IndexedDB/OPFS adapter; server optional)
- Portable project file (zip/container format)

---

### 3️⃣ Automated Deliverables (Non-Negotiable)

These must work **on day one**:
- **BOM** (grouped by part number)
- **Wire list** (from pin → to pin)
- **Terminal plan** (X1:1, X1:2, jumpers)
- **Cable list** (optional MVP+)
- **PLC I/O list**
- **Label export** (CSV for printers)

These are the features that justify switching tools.

---

### 4️⃣ Rule-Based Validation (Trust Builder)

**MVP rule checks (examples):**
- Unconnected pins
- Duplicate device tags
- Duplicate terminal numbers
- Short between different potentials
- Coil with no contacts
- Contact referencing missing coil
- PLC channel used without signal name
- Terminal with no from/to connection
- Device without assigned part (warning)

Rules must be:
- Deterministic
- Explainable
- Fast

---

### 5️⃣ AI Assistance (Targeted, Not Gimmicky)

**MVP AI features**
- Generate common circuit macros from intent:
  - “3-wire motor starter with E-stop and overload”
  - “PNP sensor wired to PLC input”
- Auto-suggest device tags and terminal numbering
- Explain validation errors and suggest fixes

AI **assists**, it does not replace deterministic logic.

---

### 6️⃣ File Exchange (Practical, Honest)

- **DXF import** (backgrounds, panel layouts)
- **DXF export** of schematics and layouts
- DWG via conversion pipeline **later**

---

## 🛠️ Tooling Strategy (What You’ll Use)

- **Cursor** → daily development, agents, safe diffs
- **Claude Code (Sonnet/Opus)** → core engine, schemas, rule logic
- **Codex / other agents** → helpers for UI, exports, scripting
- **You** → architecture, scope discipline, correctness

---

## 📍 MVP Success Criteria (Clear & Measurable)

The MVP is successful if:
- A controls engineer can:
  - Draw a real control circuit
  - Run validation
  - Export BOM + wire list + terminal plan
- In **less time** and **lower cost** than AutoCAD Electrical / EPLAN
- Without fighting licenses, dongles, or bloated workflows

---

## 🔜 Recommended Next Step

Pick the first “golden” circuit (e.g., 3‑wire motor starter, E‑stop chain, PLC I/O example) and define:
- the canonical entities (devices/pins/nets/terminals)
- the expected outputs (CSV files)
- the rule results (errors/warnings)

That golden test becomes the truth harness for every agent and every commit.

---

## 🥊 Competitive Positioning (WSCAD / EPLAN / AutoCAD Electrical)

This project is **not** attempting to clone a full enterprise ECAD suite in v1.

### What we are competing on (the wedge)

We win by delivering the highest “time-to-deliverables” value for controls engineers:

- **Automation-first outputs**: BOM, wire list, terminal plan, PLC I/O, labels (reliable, reproducible).
- **Deterministic validation**: clear rule checks + fixes (fewer build/commissioning mistakes).
- **Local-first + web-first**: works offline, easy sharing, low friction for individuals/small teams.
- **Open/community parts ecosystem** (with explicit trust levels): big library without vendor lock-in.

### What we are *not* competing on (at first)

- Full DWG round-trip parity.
- Full cabinet engineering / 3D enclosure workflows.
- Deep enterprise integrations (PLM/ERP/SSO) in the MVP.

### Who this targets first

- Freelance controls engineers.
- Small automation shops.
- Panel builders and electricians who need **accurate outputs fast**.
- Teams priced out of incumbent suites or tired of license complexity.

### Why this can still “compete”

Incumbent suites are strong—especially for large enterprise workflows. The opportunity is a segment that prioritizes:

> **automation + usability + affordability** over “every feature under the sun.”

If the MVP is excellent at deliverables + validation + parts semantics, it can become the default tool for many real-world control projects, and expand from there.

