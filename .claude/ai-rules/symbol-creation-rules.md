# Symbol Creation Rules

Design rules for AI-assisted PLC/module symbol generation.
These rules are loaded into the AI context when creating custom symbols.

## Pin Classification

1. **Signal pins** (main side): Digital inputs (DI/I-xx), digital outputs (DO/O-xx), analog inputs (AI), analog outputs (AO)
2. **Power pins** (opposite side): +DC24, +V, VCC, +5V, any positive supply
3. **Ground/return pins** (opposite side, bottom): -DC24, GND, 0V, PE, any negative/ground
4. **Common pins** (opposite side, middle): COM, CM, +CM, -CM — group positive commons above negative commons

## Pin Placement Rules

- **Input modules**: Signal pins on LEFT side, power/common on RIGHT
- **Output modules**: Signal pins on RIGHT side, power/common on LEFT
- **Power side ordering** (top to bottom):
  1. Positive supply (+DC24, +V) — top
  2. Positive commons (+CM0, +CM1) — upper middle
  3. Negative commons (-CM0, -CM1) — lower middle
  4. Negative supply / ground (-DC24, GND, 0V) — bottom

## Layout Rules

- Pin spacing: 15mm (matches default rung spacing for perfect alignment)
- Symbol width: 40mm (grid-aligned, multiple of 5mm)
- Body inset: 5mm from pin edge (grid-aligned)
- **All pin positions must be multiples of 5mm** (snap grid = 5mm)
- Symbol height must not exceed 200mm (fits on Tabloid with title block)
- Signal pins are numbered sequentially (terminal numbers)
- Power pins show labels only (no terminal numbers)
- Header shows manufacturer model + module type (e.g., "2080-LC50 / Output 10 DO")

## Pin Naming Conventions

- Allen-Bradley Micro800: `I-00`, `I-01`, `O-00`, `O-01`, `COM0`, `COM1`
- Generic IEC: `DI0`, `DI1`, `DO0`, `DO1`, `COM`
- Siemens S7: `DI0.0`, `DI0.1`, `DQ0.0`
- Always preserve manufacturer's original pin names from the datasheet

## When Creating from Datasheet

1. Identify all pins and their terminal numbers
2. Classify each pin (signal vs power/common/ground)
3. Group signal pins on the primary side
4. Arrange power pins on the opposite side (+ top, - bottom)
5. Use `generateDualSideModuleSymbol()` for the layout
6. Verify total height fits on the target sheet size
