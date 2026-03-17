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

const SYSTEM_PROMPT = `You are an expert electrical symbol designer for industrial control schematics (IEC 60617 / ANSI/NEMA standards).

Given a description of an electrical component, generate a symbol definition as JSON.

RULES:
1. Symbols use a coordinate system where (0,0) is the top-left corner.
2. Pin positions MUST be on the symbol boundary (x=0 for left pins, x=width for right pins, y=0 for top, y=height for bottom).
3. Pin stubs (short lines from body edge to pin position) are required for every pin.
4. All dimensions in pixels. Typical symbol width: 40-150px, height: 40-800px depending on pin count.
5. Use standard IEC/ANSI conventions for the component type.
6. Pin spacing should be 20-30px for clarity.
7. The body rectangle should be inset from pin positions (typically 15-20px).
8. Text labels should use fontSize 7-12.

AVAILABLE PRIMITIVE TYPES:
- { type: "rect", x, y, width, height, stroke?, fill?, strokeWidth?, rx?, strokeDash? }
- { type: "circle", cx, cy, r, stroke?, fill?, strokeWidth?, strokeDash? }
- { type: "line", x1, y1, x2, y2, stroke?, strokeWidth?, strokeDash? }
- { type: "polyline", points: [{x,y}...], closed?, stroke?, fill?, strokeWidth?, strokeDash? }
- { type: "arc", cx, cy, r, startAngle, endAngle, stroke?, strokeWidth? }
- { type: "text", x, y, content, fontSize?, fontWeight?, textAnchor? }

PIN FORMAT:
- { id: "unique_id", name: "display_name", position: {x, y}, direction: "left"|"right"|"top"|"bottom", pinType: "input"|"output"|"passive"|"power"|"ground" }

Respond with ONLY a JSON object (no markdown, no explanation):
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
