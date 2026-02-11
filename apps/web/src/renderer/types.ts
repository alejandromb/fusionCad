/**
 * Renderer types
 */

export interface Point {
  x: number;
  y: number;
}

export interface SymbolGeometry {
  width: number;
  height: number;
  pins: PinGeometry[];
}

export interface PinGeometry {
  id: string;
  position: Point;
  direction: 'left' | 'right' | 'top' | 'bottom';
}

/**
 * Device transform: rotation and mirror state.
 * Rotation is in 90° increments (0, 90, 180, 270).
 */
export interface DeviceTransform {
  rotation: number; // degrees: 0, 90, 180, 270
  mirrorH: boolean; // horizontal mirror
}

export interface RenderableSymbol {
  deviceId: string;
  deviceTag: string;
  position: Point;
  geometry: SymbolGeometry;
  category: string;
}

export interface RenderableWire {
  netId: string;
  netName: string;
  points: Point[];
}

export interface Viewport {
  offsetX: number;
  offsetY: number;
  scale: number;
}

/**
 * Transform a pin position based on rotation and mirror.
 * Pin positions are relative to the symbol origin (top-left).
 * Rotation is around the symbol center.
 */
export function transformPinPosition(
  pin: PinGeometry,
  width: number,
  height: number,
  rotation: number,
  mirrorH: boolean
): PinGeometry {
  let { x, y } = pin.position;
  let dir = pin.direction;

  // Center-based rotation
  const cx = width / 2;
  const cy = height / 2;

  // Mirror first (before rotation)
  if (mirrorH) {
    x = width - x;
    dir = flipDirection(dir);
  }

  // Apply rotation
  const steps = ((rotation % 360) + 360) % 360 / 90;
  for (let i = 0; i < steps; i++) {
    const rx = -(y - cy) + cx;
    const ry = (x - cx) + cy;
    x = rx;
    y = ry;
    dir = rotateDirection(dir);
  }

  return { id: pin.id, position: { x, y }, direction: dir };
}

function rotateDirection(dir: 'left' | 'right' | 'top' | 'bottom'): 'left' | 'right' | 'top' | 'bottom' {
  switch (dir) {
    case 'top': return 'right';
    case 'right': return 'bottom';
    case 'bottom': return 'left';
    case 'left': return 'top';
  }
}

function flipDirection(dir: 'left' | 'right' | 'top' | 'bottom'): 'left' | 'right' | 'top' | 'bottom' {
  switch (dir) {
    case 'left': return 'right';
    case 'right': return 'left';
    default: return dir;
  }
}
