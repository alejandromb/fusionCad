# AI Design Rules — Control Panel Schematics

**Status:** v0 draft — for user curation · **Scope:** schematic generation (panel-physical layout out of scope for MVP) · **Market:** US / UL primary, IEC variants noted where relevant

This document captures the design rules that should govern AI-driven schematic generation. Each rule is short and specific. The AI generation pipeline (prompt, tools, post-gen ERC) enforces these so a user prompt like *"12 PLC inputs controlling 6 relays with E-stop"* yields a complete, code-compliant project — not just the literal device list.

---

## How to read this doc

Rules are tagged with a tier:

- 🔴 **MUST** — safety/code compliance. Generator refuses to emit a project that violates these. Post-gen ERC flags any violations.
- 🟡 **SHOULD** — convention / good practice. Applied by default. User can override after generation, but the generator never omits them.
- 🟢 **STYLE** — preference. Project or company-level — configurable, not enforced.

References use short form (e.g., *per UL 508A*). Specific section numbers only where the rule ties to a single citable clause.

---

## 1. Sheet organization

**1.1 🟡 Sheet order follows the power flow.** Place sheets in the sequence: (1) Cover / title, (2) Power distribution, (3) PLC / IO, (4) Control logic, (5) Layout (panel physical, if included), (6) BOM.
*Rationale:* readers trace power from source outward; matches industry convention.

**1.2 🟡 Separate sheets for distinct functional scopes.** Power distribution, PLC IO, and control ladder logic each get their own sheet once the project grows past ~40 devices. Small projects (<15 devices) may combine power + IO onto one sheet.
*Rationale:* sheet complexity is the #1 readability killer.

**1.3 🟢 BOM lives on its own sheet, last.** Never mix BOM with schematic.

**1.4 🟡 Top-to-bottom spatial organization within a sheet.** Breakers and power supplies at the top, PLC / control devices in the middle, terminal blocks at the bottom. Within each zone, left-to-right in functional order.
*Rationale:* electricians read top-down for power, bottom-up for field wiring.

**1.5 🟡 Logical flow on ladder sheets is left-to-right.** Input conditions (contacts, buttons) on the left, action (coil, output) on the right. L1 rail always leftmost, L2/N rail always rightmost.
*Rationale:* IEC 61082 / NEMA ICS 19 convention.

**1.6 🟢 One functional block per rung.** Split compound logic across multiple rungs rather than stacking gates on one.

**1.7 🟡 Sheet size defaults to Tabloid (11×17) for schematic, ANSI D (22×34) for large panels.** Standard US engineering sizes — print-ready.

**1.8 🟢 Title block on every sheet** — project name, drawing number, revision, date, drawn-by. Shared across sheets via the project's title-block fields.

---

## 2. Power distribution

**2.1 🔴 Every project starts with a main disconnect.** Fused disconnect switch or circuit breaker, rated per the connected load. *Per UL 508A §28; NEC 430.101 for motor circuits.*

**2.2 🔴 Short-circuit current rating (SCCR) declared.** The panel's SCCR must be calculated and posted. For AI generation, default to a conservative 5 kA unless the user specifies. *Per UL 508A §SB4.*

**2.3 🔴 Supply conductor sizing per NEC ampacity tables.** Wire gauge matches branch-circuit breaker rating. AI picks from a standard table: 15A→14 AWG, 20A→12 AWG, 30A→10 AWG, 50A→8 AWG, etc.

**2.4 🟡 Control power derives from the line through a control transformer when line voltage > 120VAC.** 480V line → 480/120V transformer → 120VAC control bus. For 240V line with tolerant loads, control can tap L1-N directly.

**2.5 🟡 Separate control transformer primary fuses and secondary fuses.** Primary sized per transformer inrush, secondary sized to protect wiring. *Per UL 508A §31.*

**2.6 🟡 24VDC PLC/sensor bus needs its own regulated power supply + SPD.** Don't share the 120V control bus with instrumentation.

**2.7 🟡 Devices with multiple power pins get ALL pins wired.** Examples: contactor coil A1/A2, VFD with separate control power, dual-supply PLCs. Never collapse to a single connection.
*Rationale:* symbol accuracy — real wiring has both pins.

**2.8 🟡 Power rail conventions on ladder sheets:** L1 (hot) left, L2 or N (neutral/return) right. Ground bus runs below all rails. DC rails (+24V, 0V) drawn separately, usually at the bottom or on a dedicated sheet.

**2.9 🟡 Spare capacity:** leave ~20% of breaker slots and ~20% of 24VDC supply current unused. AI rounds PSU sizing up, not down.

---

## 3. PLC and IO design

**3.1 🟡 Split a compact PLC into separate symbols per functional group.** Even when the PLC is physically one module, draw CPU / DI / DO / AI / AO as distinct symbols on the schematic. Link them via `deviceGroupId` so the BOM treats them as one part.
*Rationale:* readability. Staring at a 32-pin monolith tells you nothing; seeing "DI0-15" and "DO0-7" as separate symbols tells you what the machine does.

**3.2 🟡 Put DI on one sheet region, DO on another.** Even on the same PLC sheet, don't mix input and output wiring.

**3.3 🟡 COM pins are drawn as a bus, not N individual terminals.** PLC input cards typically share one or two common return pins. Draw as a short horizontal rail with all DI channels tapping into it — don't run N separate wires to N identical COM pins.

**3.4 🟡 Reference pins on analog cards are their own mini-bus.** Shield (SH), signal return (COM/REF), and +V excitation — group them visually near the card.

**3.5 🟡 Channel naming reflects the logical address, not the physical pin.** e.g., "DI0", "DO3", "AI2" — not "pin 12". Use `pinAliases` on the Device when the physical pin number matters for field wiring.

**3.6 🟢 PLC sheets include a wire destination summary or I/O list annotation** at the top — helps commissioning.

**3.7 🟡 Every PLC input connects through a field terminal, never directly.** Even if the sensor is in-panel, route through the terminal strip.

**3.8 🟡 Every PLC output drives a pilot device (relay, contactor, indicator) through a terminal.** Protects the PLC output from field faults and makes troubleshooting trivial.

**3.9 🟡 Analog signals use shielded cable, shields grounded at ONE end (usually panel side).** Schematic shows shield grounding explicitly.

---

## 4. Terminal blocks

**4.1 🔴 One field wire per terminal.** Never land two field wires on a single terminal. Internal jumpers are fine. *Per UL 508A §30.3.*

**4.2 🟡 Group terminals by function** — power in, DI, DO, analog in, analog out, comms, shield. Physically and in the drawing.

**4.3 🟡 Terminal block sizing** — pick terminal current rating ≥ the protective device rating upstream. 10A circuit → 20A-rated terminals are typical.

**4.4 🟡 Every field-wired I/O point gets a terminal.** Inputs from field sensors, outputs to field devices. In-panel wiring (between PLC and internal relay, for instance) doesn't need a terminal.

**4.5 🟡 Ground terminals are green, integrated with the grounding bus.** Separate from signal commons.

**4.6 🟡 Spare terminals** — 10-20% spares at the end of each functional group. User override for tight budgets.

---

## 5. Wire numbering

**5.1 🟡 Wire numbers derive from rung + L-to-R node index.** Rung 103 with 3 nodes: 1031, 1032, 1033. Rung numbers match the sheet's page: sheet 1 = 100s, sheet 2 = 200s. *Per IEC 61082 labeling pattern.*

**5.2 🟡 Same wire number at every endpoint in the same net.** If a wire enters a terminal and re-emerges on the field side, the field wire carries the same number.

**5.3 🟢 Power and ground wires get function-specific labels** — L1, L2, N, PE, +24V, 0V, SH — not numerical rung labels.

**5.4 🟡 Cross-sheet wires share numbers across sheets.** The source arrow and destination arrow carry the same wire number plus sheet/rung pointer.

---

## 6. E-stop chain

**6.1 🔴 E-stop circuit is hardwired, not routed through the PLC.** Pressing E-stop must drop power physically, independent of software. *Per NFPA 79 §9.2.2; NFPA 70 §430.75.*

**6.2 🔴 E-stop breaks ALL control power, not just the motor it's near.** A master control relay (MCR) drops all downstream power; its coil is in series with the E-stop chain.

**6.3 🔴 E-stop contacts are NC, mechanically held in the actuated position.** Red mushroom head with yellow background, per IEC 60204-1.

**6.4 🟡 One E-stop is the minimum; for machines > 2m reach, add E-stops at every operator station.**

**6.5 🟡 Safety relay or safety PLC between the E-stop chain and the MCR** for any machine with SIL-rated safety requirements. Simple machines can use a direct-wired chain.

**6.6 🟡 Reset is manual and intentional** — spring-return button, not automatic-on-power-restore.

---

## 7. Cross-references

**7.1 🟡 Every wire crossing a sheet boundary gets source + destination arrows.** Source arrow on the exiting sheet, destination arrow on the entering sheet, same wire number.

**7.2 🟡 Cross-ref annotation includes target sheet, rung, and column.** Format: *"Sheet 3 / Rung 3104"* or *"P3.R4"* — whatever's consistent across the project.

**7.3 🟡 Coil-to-contact cross-refs.** Every coil lists its contacts' locations below the symbol (e.g., `K1: 3.2, 3.4, 4.1` = contacts on sheet 3 rungs 2 and 4, sheet 4 rung 1). Every NO/NC contact lists the coil's location above.
*Rationale:* tracing logic through a multi-sheet ladder is impossible without these.

**7.4 🟢 Net labels on single-sheet, multi-branch wires** — e.g., a 24VDC rail used at 20 spots on one sheet gets labeled `+24V` at each branch rather than wired point-to-point.

---

## 8. BOM integrity

**8.1 🔴 Every device has a part assignment before the project is considered complete.** ERC flags devices without a partId. *Generator never emits a device without a part once the Hoffman catalog + Schneider catalogs cover the symbol category.*

**8.2 🟡 Panel enclosure and subpanel are always paired and sized for the content.** Motor starter generator already does this via Hoffman catalog (Session 44).

**8.3 🟡 Spare breakers, terminals, and contactor aux contacts appear in the BOM with a note.** Not auto-wired; installer uses them.

**8.4 🟢 BOM is grouped by functional category**: Enclosures, Disconnects/Breakers, Contactors, PLC, IO, Terminals, Wire/Cable, Labels, Misc. Subtotal per group.

---

## 9. Symbol usage

**9.1 🟡 Default symbol standard = ANSI / NEMA for US market.** IEC symbols allowed but not mixed on the same sheet. User can override per-project.

**9.2 🔴 Reference designation per IEC 81346 / NEMA ICS 19.** Required prefixes: `K` (contactor, relay), `M` (motor), `F` (fuse, overload, breaker — context-dependent), `Q` (disconnect), `T` (transformer), `CB` (circuit breaker), `X` (terminal), `H` (indicator light), `S` (switch, pushbutton), `Y` (solenoid valve). Motor starter generator already follows this.

**9.3 🟡 Tag numbering is continuous per prefix.** K1, K2, K3… across the entire project, not restarted per sheet.

**9.4 🟡 Manufacturer part catalog fills symbol primitives when available.** Prefer catalog symbols over generic placeholders.

**9.5 🟢 Symbol orientation follows the wire flow.** Coils vertical with A1 up, A2 down. Contacts horizontal with input left, output right. Rotate as needed for layout, but the spatial convention inside the symbol doesn't change.

---

## 10. Protection

**10.1 🔴 Every motor has overload protection.** Either a thermal overload relay OR a breaker with motor-rated magnetic trip (MCP). *Per NEC 430.32.*

**10.2 🔴 Every motor has short-circuit protection.** Separate from overload protection. Typical combo: MCP (short-circuit) + thermal overload.

**10.3 🔴 Every branch circuit has overcurrent protection.** Breaker or fuse, sized per NEC.

**10.4 🟡 Control transformer has primary AND secondary protection.** Primary fuses sized for inrush, secondary fuses protect the 120VAC wiring.

**10.5 🟡 Analog cards and sensitive electronics get surge protection (SPD)** on their power feed.

**10.6 🟡 Grounding: every exposed metal enclosure + every motor frame bonded to ground.** Schematic shows the ground wire explicitly.

---

## 11. Color coding and labeling

**11.1 🔴 Conductor colors per NFPA 79 §13.2:**
- **Black** — ungrounded AC/DC power (line)
- **Red** — ungrounded AC control (switched line)
- **Blue** — ungrounded DC control (switched +24V)
- **White** — grounded AC neutral
- **Light Blue** — grounded DC return (0V)
- **Green or Green/Yellow** — equipment ground (PE)
- **Yellow** — foreign voltage (control from external source that stays hot with main disconnect off)
- **Orange** — foreign voltage, unusual cases

**11.2 🔴 Orange wire = stays hot with main disconnect open.** Critical warning for anyone servicing the panel. *Per NFPA 79 §13.2.4.*

**11.3 🟡 Every wire labeled at BOTH ends** with the wire number, using printed sleeves or heat-shrink.

**11.4 🟡 Every device labeled** with its tag (K1, M2, etc.) on the enclosure-visible side.

**11.5 🟡 Hazard labels** — arc-flash PPE category, SCCR, shock hazard — posted on the panel per UL 508A §31 + NFPA 70E.

---

## 12. Naming conventions

**12.1 🟡 Device tags match their reference designation prefix** (rule 9.2). K1, M1, F1, etc.

**12.2 🟡 Device descriptions are human-readable.** "Compressor motor starter contactor" beats "K1". Part descriptions ride on the Part object; device descriptions ride on the Device.

**12.3 🟢 Function field captures the signal/role, not the device type.** e.g., "Motor Run Command" on coil K2, "Compressor Start" on pushbutton S1.

**12.4 🟢 Sheet names match their scope.** "Power Distribution", "PLC Inputs", "PLC Outputs", "Motor Control", "BOM" — descriptive, not "Sheet 1".

---

## 13. Wire types and gauge

**13.1 🔴 Wire gauge sized per ampacity + voltage drop.** AI uses the standard table: NEC 310.16 for 90°C copper. 90°C THHN in conduit at 30°C ambient.

**13.2 🟡 MTW (Machine Tool Wire) or THHN inside the panel, as per UL 508A.** Flexible stranded preferred for vibration resistance.

**13.3 🟡 Control wire default 16 AWG for 120VAC, 18 AWG for 24VDC.** Goes up for long runs or voltage drop.

**13.4 🟡 Power wire minimum 14 AWG, stepped up per NEC 310.16.**

**13.5 🟡 Shielded twisted pair for analog 4-20mA, RS-485, and thermocouples.**

---

## Open items / user additions

_(Reserved for rules you add from your own experience that don't fit the categories above, or that refine existing rules. Tag with your initials + date so the doc remembers where each rule came from.)_

---

## How this doc is used

1. **Prompt engineering** — system prompt fed to Claude during AI generation includes the 🔴 MUST and 🟡 SHOULD rules as design constraints.
2. **Tool layer** — MCP tools (`place_device`, `create_wire`, `assign_part`) enforce the hardest 🔴 rules at the generation step. Violations return an error to the AI so it corrects.
3. **Post-gen ERC** — final project goes through ERC that checks every 🔴 rule plus any 🟡 the user marked as strict for this project.
4. **Tuning reference** — when a demo project comes out wrong, we trace the failure back to a missing or incomplete rule.

---

## Version history

- **v0 (2026-04-17)** — Initial draft by Claude for user curation. ~80 rules across 13 categories. US / UL primary, schematic-only scope.
