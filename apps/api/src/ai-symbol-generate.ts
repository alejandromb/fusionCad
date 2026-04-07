/**
 * AI-powered symbol generation endpoint.
 *
 * Uses Claude to generate symbol geometry (primitives + pins) from
 * a natural language description of an electrical/control symbol.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL } from './ai-config.js';
import type { SymbolPrimitive, SymbolPin } from '@fusion-cad/core-model';

const client = new Anthropic();

interface GeneratedSymbol {
  name: string;
  category: string;
  tagPrefix: string;
  standard: string;
  width: number;
  height: number;
  primitives: SymbolPrimitive[];
  pins: SymbolPin[];
}

interface AISymbolResult {
  success: boolean;
  symbol?: GeneratedSymbol;
  error?: string;
}

const PRIMITIVES_REFERENCE = `AVAILABLE PRIMITIVE TYPES:
- { type: "rect", x, y, width, height, stroke?, fill?, strokeWidth?, rx?, strokeDash? }
- { type: "circle", cx, cy, r, stroke?, fill?, strokeWidth?, strokeDash? }
- { type: "line", x1, y1, x2, y2, stroke?, strokeWidth?, strokeDash? }
- { type: "polyline", points: [{x,y}...], closed?, stroke?, fill?, strokeWidth?, strokeDash? }
- { type: "arc", cx, cy, r, startAngle, endAngle, stroke?, strokeWidth? }
- { type: "text", x, y, content, fontSize?, fontWeight?, textAnchor? }

PIN FORMAT:
- { id: "unique_id", name: "display_name", position: {x, y}, direction: "left"|"right"|"top"|"bottom", pinType: "input"|"output"|"passive"|"power"|"ground"|"pe" }`;

const OUTPUT_FORMAT = `Respond with ONLY a JSON object (no markdown, no explanation):
{
  "name": "Human-readable name",
  "category": "symbol-category-id",
  "tagPrefix": "TAG_PREFIX",
  "standard": "IEC 60617" or "ANSI/NEMA" or "common",
  "width": <number>,
  "height": <number>,
  "primitives": [...],
  "pins": [...]
}`;

const SYSTEM_PROMPT = `You are an expert electrical symbol designer for industrial control schematics (IEC 60617 / ANSI/NEMA standards).

Given a description of an electrical component, generate a symbol definition as JSON.

RULES:
1. Symbols use a coordinate system where (0,0) is the top-left corner.
2. Pin positions MUST be on the symbol boundary (x=0 for left pins, x=width for right pins, y=0 for top, y=height for bottom).
3. Pin stubs (short lines from body edge to pin position) are required for every pin.
4. All dimensions in MILLIMETERS. Typical symbol width: 20-40mm. Pin spacing: 10-15mm. Grid: 5mm.
5. Use standard IEC/ANSI conventions for the component type.
6. The body rectangle should be inset from pin positions (typically 5mm).
7. Text labels should use fontSize 3-5 (mm units).
8. All pin positions must be multiples of 5mm (snap grid = 5mm).

${PRIMITIVES_REFERENCE}

${OUTPUT_FORMAT}`;

const IMPORT_ASSIST_PROMPT = `You are an expert electrical symbol designer. You receive raw geometry extracted from an SVG or DXF file by a parser, along with the filename. Your job is to UNDERSTAND what the symbol is and produce a clean, professional fusionCad symbol definition.

WHAT YOU DO:
1. Analyze the raw geometry and filename to identify the component type
2. Recognize the standard symbol pattern (IEC 60617 or ANSI/NEMA)
3. Produce clean primitives — keep the essential geometry, remove parser artifacts and noise
4. Identify the correct pin positions and names based on electrical conventions
5. Set proper dimensions aligned to the 5mm grid

COORDINATE SYSTEM:
- All dimensions in MILLIMETERS
- (0,0) is top-left
- All pin positions must be multiples of 5mm (snap grid = 5mm)
- Target width: 20-30mm for simple contacts/relays, 40mm for modules
- Pin spacing: 10-15mm between adjacent pins

PIN RULES:
- Pins MUST be on the symbol boundary (x=0 for left, x=width for right, y=0 for top, y=height for bottom)
- Use IEC pin numbering where applicable (11/12 for NC, 13/14 for NO, A1/A2 for coils, etc.)
- Classify pins correctly: passive for contacts, power for supply, input/output for PLC I/O
- Pin direction must match position: left pins = "left", right pins = "right", etc.

GEOMETRY RULES:
- Scale the source geometry to fit standard fusionCad dimensions (20-40mm wide)
- Align features to the 5mm grid where possible
- Keep the essential visual character of the original — don't redesign, just clean up
- Remove font/text artifacts from the source file
- Use arc primitives for curves (startAngle/endAngle in radians, canvas convention: 0=right, π/2=down, π=left, 3π/2=up, CW)

USAGE MODES:
- "schematic": Produce a clean electrical schematic symbol with proper pins and IEC/ANSI conventions.
- "layout": Produce a simplified panel layout footprint. For layout:
  - Simplify to outer boundary rectangle/outline only
  - Remove internal details (screw slots, hatching, text outlines, dimension lines)
  - Keep only key visual features (wire entry holes, mounting features)
  - No electrical pins needed (layout footprints are visual only)
  - Use the manufacturer's actual dimensions from the geometry
  - Return empty pins array: []
  - Category should be "Panel"
  - A clean rectangle with rounded corners is often the best layout representation

COMMON SYMBOLS TO RECOGNIZE:
- Contacts: NO (two parallel lines), NC (two parallel lines + diagonal bridge)
- E-stop: NC contact + mushroom head dome + actuator stem
- Coils/relays: circle or rectangle with A1/A2 pins
- Circuit breakers: contact mechanism with trip indicator
- Switches: contact with actuator line
- Fuses: rectangle or elongated oval
- Overload relays: zigzag + contacts
- Transformers: coupled coils
- Motors: circle with M
- PLC modules: rectangle with many pins
- Terminal blocks: narrow rectangles, often with screw details and wire entries
- Power supplies: rectangular boxes with input/output markings
- DIN rail components: narrow, tall rectangles

${PRIMITIVES_REFERENCE}

${OUTPUT_FORMAT}`;

export async function aiSymbolGenerate(description: string): Promise<AISymbolResult> {
  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate a symbol for: ${description}

Remember: pins must be on the boundary, include pin stubs, and use proper IEC/ANSI conventions. Return ONLY valid JSON.`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse JSON — strip markdown fences if present
    const jsonStr = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Validate required fields
    if (!parsed.name || !parsed.primitives || !parsed.pins) {
      return { success: false, error: 'AI response missing required fields (name, primitives, pins)' };
    }

    if (!Array.isArray(parsed.primitives) || !Array.isArray(parsed.pins)) {
      return { success: false, error: 'primitives and pins must be arrays' };
    }

    if (parsed.pins.length === 0) {
      return { success: false, error: 'Symbol must have at least one pin' };
    }

    return {
      success: true,
      symbol: {
        name: parsed.name,
        category: parsed.category || 'Custom',
        tagPrefix: parsed.tagPrefix || 'D',
        standard: parsed.standard || 'common',
        width: parsed.width || 60,
        height: parsed.height || 60,
        primitives: parsed.primitives,
        pins: parsed.pins,
      },
    };
  } catch (error: any) {
    if (error.message?.includes('JSON')) {
      return { success: false, error: 'AI generated invalid JSON. Try rephrasing your description.' };
    }
    return { success: false, error: `AI symbol generation failed: ${error.message}` };
  }
}

/**
 * AI-assisted symbol import: takes raw geometry from SVG/DXF parser and produces
 * a clean, professional symbol with proper pins and dimensions.
 */
export async function aiSymbolImportAssist(
  rawPrimitives: SymbolPrimitive[],
  fileName: string,
  svgSource?: string,
  usage?: 'schematic' | 'layout',
): Promise<AISymbolResult> {
  try {
    // Build a compact description of the raw geometry for the AI
    const geometryDesc = rawPrimitives.map(p => {
      switch (p.type) {
        case 'line': return `line(${r(p.x1)},${r(p.y1)} → ${r(p.x2)},${r(p.y2)})`;
        case 'circle': return `circle(cx=${r(p.cx)},cy=${r(p.cy)},r=${r(p.r)})`;
        case 'arc': return `arc(cx=${r(p.cx)},cy=${r(p.cy)},r=${r(p.r)},${r(p.startAngle)}→${r(p.endAngle)})`;
        case 'rect': return `rect(${r(p.x)},${r(p.y)},${r(p.width)}x${r(p.height)})`;
        case 'polyline': return `polyline(${p.points.length}pts${p.closed ? ',closed' : ''})`;
        case 'text': return `text("${p.content}",${r(p.x)},${r(p.y)})`;
        case 'ellipse': return `ellipse(cx=${r(p.cx)},cy=${r(p.cy)},${r(p.rx)}x${r(p.ry)})`;
        case 'path': return `path(d="${p.d.substring(0, 60)}${p.d.length > 60 ? '...' : ''}")`;
        default: return JSON.stringify(p);
      }
    }).join('\n');

    let userMessage = `File: "${fileName}"
Usage: ${usage || 'schematic'}

Raw geometry from parser (${rawPrimitives.length} elements):
${geometryDesc}`;

    // If SVG source is small enough, include it for better understanding
    if (svgSource && svgSource.length < 4000) {
      userMessage += `\n\nOriginal SVG source:\n${svgSource}`;
    }

    userMessage += `\n\nAnalyze this geometry. Identify what electrical symbol this is. Produce a clean symbol definition with proper pins, dimensions (mm, 5mm grid), and category. Return ONLY valid JSON.`;

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      system: IMPORT_ASSIST_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const jsonStr = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.name || !parsed.primitives || !parsed.pins) {
      return { success: false, error: 'AI response missing required fields (name, primitives, pins)' };
    }

    if (!Array.isArray(parsed.primitives) || !Array.isArray(parsed.pins)) {
      return { success: false, error: 'primitives and pins must be arrays' };
    }

    return {
      success: true,
      symbol: {
        name: parsed.name,
        category: parsed.category || 'Custom',
        tagPrefix: parsed.tagPrefix || 'D',
        standard: parsed.standard || 'common',
        width: parsed.width || 25,
        height: parsed.height || 15,
        primitives: parsed.primitives,
        pins: parsed.pins || [],
      },
    };
  } catch (error: any) {
    if (error.message?.includes('JSON')) {
      return { success: false, error: 'AI generated invalid JSON. Try again or adjust the file.' };
    }
    return { success: false, error: `AI import assist failed: ${error.message}` };
  }
}

function r(n: number): string {
  return Number(n.toFixed(2)).toString();
}
