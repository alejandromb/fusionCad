# Symbol Format Specification

Reference for the fusionCad symbol library format (`builtin-symbols.json`).

## Standard Conventions

- **Canvas size**: 40 wide x 60 tall (default for 2-pin vertical symbols)
- **Coordinate origin**: top-left (0,0)
- **Pin positions**: Top pin at `(20, 0)`, bottom pin at `(20, 60)` for standard 2-pin
- **Lead length**: 10px from pin to symbol body (pin at y=0, body starts at y=10)
- **Line width**: 2px default
- **Color**: `#00ff00` (green) — applied by renderer, not stored in JSON

## Primitive Types

| Type | Properties | Description |
|------|-----------|-------------|
| `line` | x1, y1, x2, y2 | Straight line segment |
| `rect` | x, y, width, height, rx? | Rectangle (rx for rounded corners) |
| `circle` | cx, cy, r | Circle |
| `arc` | cx, cy, r, startAngle, endAngle | Circular arc (radians) |
| `polyline` | points[{x,y}], closed? | Connected line segments |
| `path` | d | SVG path string (M, L, H, V, A, C, Q, Z) |
| `text` | x, y, content, fontSize?, fontWeight?, textAnchor? | Text label |

## Symbol Definition Schema

```json
{
  "id": "iec-xxx",
  "name": "Human Name",
  "category": "Control",
  "width": 40,
  "height": 60,
  "pins": [...],
  "primitives": [...],
  "tagPrefix": "K"
}
```

## Pin Definition

```json
{
  "id": "1",
  "name": "1",
  "x": 20, "y": 0,
  "direction": "top",
  "pinType": "passive"
}
```

**Pin types**: `power`, `passive`, `input`, `output`
**Directions**: `top`, `bottom`, `left`, `right` (wire approach direction)

## IEC 60617 Shape Rules

### Contacts
Two offset horizontal bars with a gap between them.
- **NO Contact**: Upper bar extends left from center, lower bar extends right from center. Gap = open.
- **NC Contact**: Same as NO + diagonal slash line across the gap.
- **Changeover**: Common pin splits to NO arm (right) and NC arm (left).

### Coils & Relays
Rectangle body centered on the symbol. Leads connect to top and bottom pins.

### Meters
Circle with a letter inside: V (voltmeter), A (ammeter), W (wattmeter).

### Resistor (IEC)
Narrow rectangle — visually distinct from the wider coil rectangle.

### Capacitor (IEC)
Two parallel horizontal plates with a narrow gap. Plates are wider than a resistor.

### Inductor
Series of semicircular arcs (humps).

### Motors
Circle with "M" inside and phase notation (1~, 3~).

### Ground Symbols
- **Earth**: 3 decreasing horizontal bars
- **Protective Earth**: Earth bars + circle around top bar
- **Chassis**: Filled triangle pointing down

### Terminal Symbols (fusionCad convention)
Octagon shape with through-line. Not IEC standard — project-specific design choice.

### PLC Modules
Labeled rectangles with pin grids. CPU, DI, DO, AI, AO modules.

## Categories

| Category | Tag Prefix | Description |
|----------|-----------|-------------|
| Power | K, CB, QS, FU, T, PS | Contactors, breakers, fuses, transformers |
| Control | K, CR, TR, S, D, L, F | Coils, contacts, timers, switches, indicators |
| Field | S | Level, flow, pressure, temperature switches |
| Motor | M | 1-phase, 3-phase motors |
| Meter | D | Voltmeter, ammeter |
| Passive | D | Resistor, capacitor, inductor, diode, LED |
| Ground | PE | Earth, protective earth, chassis ground |
| Terminal | X | Single, dual, ground, fuse terminals |
| PLC | PLC | CPU, DI, DO, AI, AO modules |
