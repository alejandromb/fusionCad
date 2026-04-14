import { useEffect, useRef } from 'react';
import { MM_TO_PX } from '@fusion-cad/core-model';
import { renderCircuit, type CircuitData } from '../renderer/circuit-renderer';
import type { DeviceTransform, Point } from '../renderer/types';
import { SHEET_SIZES } from '../renderer/title-block';

interface SheetThumbnailProps {
  circuit: CircuitData;
  sheetId: string;
  devicePositions: Map<string, Point>;
  deviceTransforms?: Map<string, DeviceTransform>;
  width?: number;
}

const DEFAULT_WIDTH = 140;
const DEBOUNCE_MS = 120;

export function SheetThumbnail({
  circuit,
  sheetId,
  devicePositions,
  deviceTransforms,
  width = DEFAULT_WIDTH,
}: SheetThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const sheet = circuit.sheets?.find((s) => s.id === sheetId);
  const sheetSize = SHEET_SIZES[sheet?.size || 'Tabloid'] || SHEET_SIZES['Tabloid'];
  const aspect = sheetSize.height / sheetSize.width;
  const height = Math.round(width * aspect);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const scale = width / (sheetSize.width * MM_TO_PX);

      renderCircuit(
        ctx,
        circuit,
        { offsetX: 0, offsetY: 0, scale },
        false,
        devicePositions,
        {
          activeSheetId: sheetId,
          deviceTransforms,
          showGrid: false,
          showPinLabels: false,
          showDescriptions: false,
          showPartNumbers: false,
          selectedDevices: [],
          selectedWireIndex: null,
          wireStart: null,
        },
      );
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [circuit, sheetId, devicePositions, deviceTransforms, width, height, sheetSize.width]);

  return (
    <canvas
      ref={canvasRef}
      className="sheet-thumbnail"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
