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
