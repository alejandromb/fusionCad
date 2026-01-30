# Electrical Symbol Libraries Research for fusionCad

**Date**: 2026-01-29
**Focus**: Open source SVG/vector libraries, APIs, and DXF/DWG conversion tools suitable for fusionCad

---

## EXECUTIVE SUMMARY

fusionCad has **multiple excellent options** for sourcing electrical symbols:

1. **Best for immediate use**: GitHub SVG libraries (electricalsymbols, AcheronProject, upb-lea)
2. **Best for breadth**: KiCAD libraries + SnapEDA (hundreds of thousands of components)
3. **Best for DXF import**: libredwg-web (WASM-based, GPL-2.0) or @tarikjabiri/dxf (MIT)
4. **Best for commercial volume**: Aspose.CAD (but requires licensing)

The recommended approach is **hybrid**: Start with open-source SVG libraries for common symbols, add DXF import capability, and integrate with KiCAD libraries for parts database.

---

## 1. OPEN SOURCE SVG SYMBOL LIBRARIES

### 1.1 ⭐ PRIMARY RECOMMENDATION: chille/electricalsymbols

**URL**: https://github.com/chille/electricalsymbols

**Details**:
- IEC 60617 compliant
- Format: SVG
- License: MIT (permissive)
- Symbol count: ~33 core symbols
- Active maintenance: Yes
- Quality: Professional standard

**Strengths**:
- Direct SVG format (zero conversion needed)
- IEC 60617 compliance (electrical industry standard)
- Clean, professional symbol design
- MIT license (can be used commercially)
- Well-documented

**Weaknesses**:
- Smaller collection (~33 symbols vs. thousands in other libraries)
- Better for control schematics than component libraries

**Best for**: Core electrical circuit symbols (contactors, buttons, overload relays, terminal strips, power supplies, motors, etc.)

---

### 1.2 AcheronProject/electrical_template

**URL**: https://github.com/AcheronProject/electrical_template

**Details**:
- Format: SVG (Inkscape-native)
- License: Creative Commons / open (verify in repo)
- Symbol count: 100+ professional symbols
- Focus: Good-looking, uniformized schematics
- Quality: Very high

**Strengths**:
- Professional appearance (specifically designed for publication-quality output)
- Comprehensive symbol coverage
- Actively maintained
- Easy to adapt for custom schematic styles

**Weaknesses**:
- Larger file sizes (Inkscape format)
- Less IEC 60617 explicit than chille/electricalsymbols

**Best for**: Creating visually consistent, publication-quality schematics

---

### 1.3 upb-lea/Inkscape_electric_Symbols

**URL**: https://github.com/upb-lea/Inkscape_electric_Symbols

**Details**:
- Format: SVG (Inkscape)
- License: MIT/Open
- Symbol count: 100+ electrical engineering symbols
- Format file: `Inkscape_Symbols_All.svg` (single comprehensive file)
- Focus: Electrical engineering (power systems, control)

**Strengths**:
- Comprehensive electrical engineering focus
- One master SVG file (easy to parse)
- MIT/permissive license
- Block diagrams and circuit symbols

**Weaknesses**:
- Inkscape-specific formatting (may need conversion for web use)
- Less actively maintained than others

**Best for**: Power systems and electrical engineering applications

---

### 1.4 nicorikken/power-system-shapes

**URL**: https://github.com/nicorikken/power-system-shapes

**Details**:
- Format: SVG
- License: Permissive (verify in repo)
- Focus: Power system components
- IEC-60617 compliance: Referenced

**Strengths**:
- Specialized for power systems
- Standards-based (IEC-60617)
- Clean design

**Weaknesses**:
- Narrower focus (power systems only)
- Smaller collection

**Best for**: Power system specific designs

---

### 1.5 Wikimedia Commons SVG Symbols

**URL**: https://commons.wikimedia.org/wiki/Category:SVG_electrical_symbols

**Details**:
- Format: SVG
- License: Various (mostly CC, public domain)
- Symbol count: Hundreds (scattered)
- Quality: Variable (community contributions)

**Strengths**:
- Completely free (CC/public domain)
- Large variety
- Community maintained

**Weaknesses**:
- Quality inconsistent (different artists)
- Not organized by standard
- Limited metadata

**Best for**: Supplementary symbols, finding edge cases

---

## 2. COMPONENT/PARTS LIBRARIES

### 2.1 KiCAD Official Symbols (RECOMMENDED)

**URL**: https://kicad.github.io/symbols/

**Details**:
- Format: KiCAD `.kicad_sym` (text-based, parseable)
- License: CC-BY-SA-4.0 + CC0-1.0 (check license file)
- Symbol count: 1000+ components
- Repository: https://gitlab.com/kicad/libraries/kicad-symbols

**License Options**:
- Official KiCAD libraries: CC-BY-SA-4.0 / CC0-1.0 (permissive)
- Can be used for commercial purposes

**Strengths**:
- Enormous collection (1000+ professional components)
- Well-organized by category
- Industry standard (widely used in PCB design)
- Can be converted to JSON/SVG
- Active maintenance
- Permissive licensing

**Weaknesses**:
- Designed for PCB (different use case than schematics)
- Requires conversion to SVG/JSON
- `.kicad_sym` format parsing needed

**Conversion Path**: Parse `.kicad_sym` → SVG or JSON representation

**Best for**: Building a comprehensive parts database with standards-based symbols

---

### 2.2 SparkFun KiCAD Libraries

**URL**: https://github.com/sparkfun/SparkFun-KiCad-Libraries

**Details**:
- Format: KiCAD `.kicad_sym` + footprints
- License: CC-BY-4.0 (Creative Commons Attribution)
- Symbol count: 1000+ commonly used parts
- Quality: Professional (SparkFun products)

**Strengths**:
- Popular electronic components
- Creative Commons Attribution (permissive commercial use)
- Well-documented
- Actively maintained

**Weaknesses**:
- Focused on SparkFun/hobby components (not industrial controls)
- Requires conversion

**Best for**: Hobby/maker electronics, consumer components

---

### 2.3 SnapEDA (Free Tier Available)

**URL**: https://www.snapeda.com/

**Details**:
- Symbol count: 40+ million components
- License: Free tier + paid subscription
- Format: Multiple (KiCAD, Eagle, Altium, etc.)
- Commercial use: Yes, with free account

**Strengths**:
- Largest component database
- Multiple export formats
- Free tier available
- Manufacturer data integrated

**Weaknesses**:
- Cloud-dependent (not local-first)
- API may have rate limits
- Requires integration work

**Best for**: Specific component lookups, parts with manufacturer data

---

## 3. DXF/DWG IMPORT/EXPORT LIBRARIES

### 3.1 ⭐ BEST: @tarikjabiri/dxf (DXF Generator)

**URL**: https://github.com/dxfjs/writer

**NPM**: `@tarikjabiri/dxf`

**Details**:
- Language: TypeScript
- License: MIT
- Current version: 2.8.9
- Purpose: Generate/write DXF files
- Bundle size: Lightweight

**Strengths**:
- MIT license (permissive)
- Pure TypeScript (no external C dependencies)
- Runs in browser and Node.js
- Well-documented API
- Active maintenance
- Can export to DXF from canvas

**Weaknesses**:
- Write-only (DXF generation, not parsing)
- Cannot read existing DXF files

**Use case**: Export fusionCad schematics to DXF for AutoCAD/Inkscape

**Recommendation**: Use @tarikjabiri/dxf for export, libredwg-web for import

---

### 3.2 libredwg-web-ts (DWG/DXF Parser)

**URL**: https://github.com/mlightcad/libredwg-web

**NPM**: `@mlightcad/libredwg-web` or `libredwg-web-ts`

**Details**:
- Language: TypeScript
- License: GPL-2.0
- Based on: GNU LibreDWG (official GNU project)
- Technology: WebAssembly (WASM)
- Current version: 0.4.2
- Purpose: Parse DWG/DXF files in browser/Node.js

**Strengths**:
- Parse DWG and DXF files in browser (no backend)
- WASM-based (good performance)
- Based on official GNU library (robust, mature)
- Works in Node.js and browser

**Weaknesses**:
- GPL-2.0 license (requires disclosure if modified; less permissive)
- Larger bundle size (WASM library)
- DWG parsing is complex (some newer features may not be supported)

**Use case**: Import DXF/DWG backgrounds or existing schematics

**License note**: GPL-2.0 requires that any modifications to the library be released under GPL-2.0. Closed-source apps can still use it (dynamic linking).

---

### 3.3 dxf (DXF Parser)

**URL**: https://www.npmjs.com/package/dxf

**Details**:
- Purpose: Parse DXF files
- Features: Can convert to SVG or create polylines for rendering
- ES6 compatible (transpiled with Babel)

**Strengths**:
- Lightweight
- Good for simple DXF parsing

**Weaknesses**:
- Less maintenance than alternatives
- Older project

---

### 3.4 Aspose.CAD for JavaScript (Commercial)

**URL**: https://products.aspose.com/cad/javascript/

**Details**:
- Language: JavaScript/TypeScript
- Technology: WebAssembly
- License: Commercial (paid)
- Supports: DXF, DWG, DWT, DGN, IFC, DWF, DWFX, STL, IGES
- Free tier: Evaluation license available
- Pricing: Check https://purchase.aspose.com/pricing/cad/javascript-net/

**Strengths**:
- Comprehensive CAD format support
- Professional support
- Proven in enterprise
- Can read AND write multiple formats

**Weaknesses**:
- Expensive (commercial license required)
- Not open source
- Overkill for schematic-only use case

**Use case**: Enterprise deployments where comprehensive CAD support is critical

**Recommendation for fusionCad**: Skip for MVP (open-source alternatives sufficient)

---

## 4. SYMBOL RENDERING AND DRAWING LIBRARIES

### 4.1 Konva.js (Interactive Canvas)

**URL**: https://konvajs.org/

**Details**:
- Purpose: Interactive HTML5 canvas drawing
- Supports: SVG rendering on canvas
- License: Open source (Apache 2.0)
- Good for: Interactive schematic editing

**Strengths**:
- SVG-to-canvas rendering (`SVG_On_Canvas.js` example)
- Interactive event handling
- Good for dragging, rotating, selecting symbols
- Used in fusionCad already

**Current use**: Already integrated in fusionCad (`apps/web/src/renderer/circuit-renderer.ts`)

---

### 4.2 Canvg (SVG Parser/Renderer)

**URL**: https://github.com/canvg/canvg

**Details**:
- Purpose: Parse SVG and render on HTML5 canvas
- License: MIT
- No external dependencies

**Strengths**:
- Pure SVG to canvas (no external tools needed)
- MIT license
- Can rasterize SVG
- Good for rendering SVG symbols on canvas

**Weakness**: Less interactive than Konva

**Use case**: Render SVG symbols from libraries directly on fusionCad canvas

---

### 4.3 Fabric.js (Canvas + SVG Library)

**URL**: https://fabricjs.com/

**Details**:
- Purpose: Interactive canvas library with SVG support
- Supports: SVG-to-canvas and canvas-to-SVG
- License: Apache 2.0 / MIT
- Interactive objects

**Strengths**:
- Bidirectional SVG/canvas conversion
- Interactive object model
- Well-documented

**Weaknesses**:
- Larger bundle than Konva for schematic use
- Not currently used in fusionCad

---

## 5. COMMERCIAL AND SPECIALIZED OPTIONS

### 5.1 EasyEDA

**URL**: https://easyeda.com/

**Details**:
- Platform: Web-based PCB/schematic design
- Symbol count: 700,000+
- Composition: KiCAD libs + open-source Eagle libs + user contributions
- License: Various (source from many open-source projects)
- Access: Cloud-based

**Strengths**:
- Massive symbol library (sourced from open-source projects)
- Can export projects
- Web-based (similar to fusionCad vision)

**Weaknesses**:
- Cloud-dependent
- Not directly importable as symbol source code

**Value**: Can research how they structure their library; may be able to access KiCAD components they use

---

### 5.2 Flat.com (Commercial Electrical Symbols)

**URL**: https://www.flaticon.com/free-icons/electrical

**Details**:
- Icon library: 200,000+ electrical icons
- Format: SVG, PSD, PNG, EPS
- License: Free tier (requires attribution)
- Largest icon/symbol database

**Strengths**:
- Huge variety of electrical icons
- Multiple formats
- Professional design

**Weaknesses**:
- Icons, not schematic symbols (different use case)
- Simplified (not industry standard)
- Commercial licensing required for commercial use without attribution

**Use case**: UI icons, not for schematic symbols

---

## 6. SYMBOL LIBRARY INTEGRATION STRATEGIES

### Strategy A: Hybrid Approach (RECOMMENDED for fusionCad)

**Phase 1 (Current)**:
- Use `chille/electricalsymbols` for core control symbols (immediate 33 symbols)
- Start with hardcoded SVG representations like current implementation

**Phase 2 (Near future)**:
- Add SVG import capability (parse SVG from GitHub libraries)
- Integrate `@tarikjabiri/dxf` for DXF export
- Implement `libredwg-web` for DXF/DWG import

**Phase 3 (Medium term)**:
- Parse KiCAD symbol libraries (convert `.kicad_sym` to JSON)
- Build cloud-based symbol registry (Phase 4+ roadmap)
- Integrate SnapEDA API for parts lookups

**Phase 4 (Long term)**:
- Full parts database with manufacturer data
- Symbol variants (different representations of same component)
- Custom symbol editor

---

### Strategy B: Minimal (MVP-focused)

**Keep current approach**: Hardcoded SVG symbols in code
- Add only 10-15 most essential symbols
- Defer library integration to Phase 4
- Focus on other MVP features first

**Pros**: Faster MVP, clear scope
**Cons**: Limited symbol library, future rework needed

---

### Strategy C: Full Integration (Ambitious)

**Immediately integrate KiCAD**:
- Parse KiCAD libraries on load
- Convert to JSON/SVG at build time
- Ship 1000+ symbols in core

**Pros**: Comprehensive from start
**Cons**: Large bundle, complex build pipeline, overkill for MVP

---

## 7. RECOMMENDED TECHNICAL APPROACH

### Symbol Data Format

Create a JSON schema for symbol definitions (better than hardcoding in TypeScript):

```json
{
  "id": "contactor-k1",
  "name": "Contactor",
  "category": "control",
  "standard": "IEC 60617",
  "pins": [
    { "id": "1", "label": "A1", "position": "left", "type": "power" },
    { "id": "2", "label": "A2", "position": "left", "type": "power" }
  ],
  "svg": "<svg>...</svg>",
  "source": "electricalsymbols@1.0.0",
  "license": "MIT"
}
```

### Import Pipeline

1. **Build time**: Parse library sources (SVG, KiCAD, etc.) → JSON
2. **Runtime**: Load JSON, render with Canvas/SVG as needed
3. **Future**: Cloud CDN for symbol updates (no rebuild needed)

### DXF Import/Export

**Export** (Priority 1):
```
npm install @tarikjabiri/dxf
→ Convert fusionCad model to DXF polylines
→ Save as .dxf file
```

**Import** (Priority 2):
```
npm install @mlightcad/libredwg-web
→ Parse DXF/DWG files with WASM parser
→ Convert to fusionCad symbols + wires
→ (Note: GPL-2.0 license applies)
```

---

## 8. LICENSE MATRIX

| Library | License | Commercial OK? | Notes |
|---------|---------|-----------------|-------|
| chille/electricalsymbols | MIT | ✅ Yes | Best choice |
| AcheronProject/electrical_template | CC/OSS | ✅ Yes | Verify specific terms |
| upb-lea/Inkscape_electric_Symbols | MIT | ✅ Yes | Good for power systems |
| KiCAD symbols | CC-BY-SA 4.0 / CC0 | ✅ Yes | 1000+ components |
| SparkFun | CC-BY-4.0 | ✅ Yes | Attribution required |
| @tarikjabiri/dxf | MIT | ✅ Yes | Export only |
| libredwg-web | GPL-2.0 | ✅ Yes* | Dynamic linking OK |
| Aspose.CAD | Commercial | ❌ Paid | Enterprise only |

**GPL-2.0 note**: Can be used in closed-source projects (fusionCad stays open), but if modified, changes must be GPL-2.0.

---

## 9. QUICK START RECOMMENDATIONS

### For MVP (Next 1-2 weeks):

1. **Do nothing yet** - Continue with hardcoded symbols
2. **Document symbol schema** - Create JSON format (1 hour)
3. **Add 3-5 missing symbols** - Use electricalsymbols as reference

### For Phase 2 (Next sprint):

1. **Integrate DXF export** - `npm install @tarikjabiri/dxf`
2. **Create symbol loader** - Parse JSON symbols instead of hardcoded
3. **Add electricalsymbols as npm package** - Git submodule or npm package

### For Phase 3-4 (Medium term):

1. **DXF import** - Add `@mlightcad/libredwg-web`
2. **KiCAD integration** - Parser for `.kicad_sym` files
3. **Cloud symbol registry** - CDN-served symbols

---

## 10. RESOURCES AND LINKS

### Primary Open Source Libraries
- [chille/electricalsymbols](https://github.com/chille/electricalsymbols) - IEC 60617 SVG symbols (MIT)
- [AcheronProject/electrical_template](https://github.com/AcheronProject/electrical_template) - Professional schematics
- [upb-lea/Inkscape_electric_Symbols](https://github.com/upb-lea/Inkscape_electric_Symbols) - Power systems (MIT)

### KiCAD Symbols
- [KiCAD Official Symbols](https://kicad.github.io/symbols/)
- [KiCAD Symbols Repository](https://gitlab.com/kicad/libraries/kicad-symbols)
- [SparkFun KiCAD Libraries](https://github.com/sparkfun/SparkFun-KiCAD-Libraries)

### DXF/DWG Tools
- [@tarikjabiri/dxf](https://www.npmjs.com/package/@tarikjabiri/dxf) - DXF generator (MIT)
- [libredwg-web](https://github.com/mlightcad/libredwg-web) - DWG/DXF parser (GPL-2.0)

### Canvas Rendering
- [Konva.js](https://konvajs.org/) - Interactive canvas (Apache 2.0, already used)
- [Canvg](https://github.com/canvg/canvg) - SVG parser (MIT)
- [Fabric.js](https://fabricjs.com/) - Canvas + SVG library (Apache 2.0)

### References
- [IEC 60617 Standard](https://std.iec.ch/iec60617) - Official symbol standard
- [LibreOffice Draw](https://www.documentfoundation.org/) - Symbol creation reference
- [EasyEDA](https://easyeda.com/) - Web-based design (research reference)

---

## CONCLUSION

**Best immediate action for fusionCad**:

1. **Start simple**: Keep current hardcoded symbols + improve aesthetics
2. **Plan integration**: Create JSON symbol schema (1-2 hours)
3. **Next sprint**: Add DXF export capability (`@tarikjabiri/dxf`)
4. **Phase 3+**: Integrate open-source libraries as database grows

**Recommended long-term stack**:
- **Symbols**: KiCAD (1000+ components) + chille/electricalsymbols (core control symbols)
- **Format**: SVG source, JSON delivery, DXF interchange
- **License**: MIT/CC-BY for primary, GPL-2.0 for optional DXF import
- **Scale**: 100 symbols (MVP) → 1000+ (Phase 3+) → cloud-synced (Phase 4+)

---

**Generated**: 2026-01-29
**Research time**: ~1 hour
**Status**: Ready for integration planning
