import type { Device, Part } from '@fusion-cad/core-model';
import type { Point } from '../renderer/types';
import { getDefaultTagAnchor, lookupSymbol } from '../renderer/symbols';
import { getTheme } from '../renderer/theme';

/**
 * Tag hit-testing for the movable-label feature.
 *
 * Uses `ctx.measureText` on a lazily-created scratch canvas to compute a tight
 * world-space bbox for each device's tag label, plus a small padding so the
 * target stays easy to click. Returns the first device whose tag bbox contains
 * the world point, or null if none.
 *
 * Design note: we deliberately size the bbox from the rendered text width
 * rather than estimating `charCount * avgCharWidth`. The stale-branch attempt
 * used a 2.0 mm × char approximation that was too tight — short tags like
 * "S1" or "K4" measured ~4mm wide, leaving a 1.5mm pad target that users
 * struggled to hit.
 */

let scratchCtx: CanvasRenderingContext2D | null = null;
function getScratchCtx(): CanvasRenderingContext2D {
  if (!scratchCtx) {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!c) throw new Error('tag-hit requires a DOM canvas context');
    scratchCtx = c.getContext('2d')!;
  }
  return scratchCtx;
}

/** Font height in mm — matches `bold 3px` in the scaled mm canvas. */
const TAG_FONT_HEIGHT_MM = 3;
/** Padding added to the measured text bbox so clicks near the tag still land. */
const TAG_HIT_PAD_MM = 2;

/**
 * Find the device whose tag label contains the given world point.
 * @param devices pre-filtered by active sheet (callers typically do this).
 */
export function getDeviceTagAtPoint(
  worldX: number,
  worldY: number,
  devices: Device[],
  parts: Part[],
  positions: Map<string, Point>,
): Device | null {
  const ctx = getScratchCtx();
  const theme = getTheme();
  ctx.font = theme.tagFont;

  for (const device of devices) {
    if (!device.tag) continue;
    const pos = positions.get(device.id);
    if (!pos) continue;

    const part = device.partId ? parts.find(p => p.id === device.partId) : null;
    const symbolKey = (part as any)?.symbolCategory || (part as any)?.category || 'unknown';
    const def = lookupSymbol(symbolKey);
    const anchor = getDefaultTagAnchor(pos.x, pos.y, def, symbolKey, device.sizeOverride);
    const offset = device.labelOffsets?.tag;
    const cx = anchor.x + (offset?.x ?? 0);
    const cy = anchor.y + (offset?.y ?? 0);

    const width = ctx.measureText(device.tag).width;
    const height = TAG_FONT_HEIGHT_MM;

    // Derive bbox edges from the text alignment + baseline.
    let x0: number, x1: number;
    if (anchor.align === 'right') { x0 = cx - width; x1 = cx; }
    else if (anchor.align === 'left' || anchor.align === 'start') { x0 = cx; x1 = cx + width; }
    else { x0 = cx - width / 2; x1 = cx + width / 2; }

    let y0: number, y1: number;
    if (anchor.baseline === 'top' || anchor.baseline === 'hanging') { y0 = cy; y1 = cy + height; }
    else if (anchor.baseline === 'middle') { y0 = cy - height / 2; y1 = cy + height / 2; }
    else { y0 = cy - height; y1 = cy; }  // bottom / alphabetic

    // Padding keeps the target forgiving.
    if (
      worldX >= x0 - TAG_HIT_PAD_MM && worldX <= x1 + TAG_HIT_PAD_MM &&
      worldY >= y0 - TAG_HIT_PAD_MM && worldY <= y1 + TAG_HIT_PAD_MM
    ) {
      return device;
    }
  }

  return null;
}
