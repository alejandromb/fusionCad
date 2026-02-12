/**
 * Clipboard hook - copy/paste/duplicate
 */

import { useState, useCallback } from 'react';
import { generateId, type Device, type Part } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import type { Point } from '../renderer/types';
import { SYMBOL_CATEGORIES, snapToGrid } from '../types';

export interface UseClipboardReturn {
  clipboard: { device: Device; part: Part | null; position: Point } | null;
  copyDevice: () => void;
  pasteDevice: (worldX: number, worldY: number) => void;
  duplicateDevice: () => void;
}

export function useClipboard(
  circuit: CircuitData | null,
  setCircuit: React.Dispatch<React.SetStateAction<CircuitData | null>>,
  setDevicePositions: React.Dispatch<React.SetStateAction<Map<string, Point>>>,
  selectedDevices: string[],
  setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>>,
  getAllPositions: () => Map<string, Point>,
  pushToHistory: () => void
): UseClipboardReturn {
  const [clipboard, setClipboard] = useState<{
    device: Device;
    part: Part | null;
    position: Point;
  } | null>(null);

  // selectedDevices contains device IDs
  const copyDevice = useCallback(() => {
    if (selectedDevices.length === 0 || !circuit) return;

    const selectedDeviceId = selectedDevices[0];
    const device = circuit.devices.find(d => d.id === selectedDeviceId);
    if (!device) return;

    const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
    const allPositions = getAllPositions();
    const position = allPositions.get(selectedDeviceId) || { x: 100, y: 100 };

    setClipboard({ device, part: part || null, position });
  }, [selectedDevices, circuit, getAllPositions]);

  const pasteDevice = useCallback((worldX: number, worldY: number) => {
    if (!clipboard || !circuit) return;

    pushToHistory();

    const snappedX = snapToGrid(worldX);
    const snappedY = snapToGrid(worldY);
    const now = Date.now();

    const category = clipboard.part?.category || 'unknown';
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const prefix = categoryInfo?.prefix || clipboard.device.tag.replace(/\d+$/, '') || 'D';

    const existingNumbers = circuit.devices
      .filter(d => d.tag.startsWith(prefix))
      .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
    const nextNum = Math.max(0, ...existingNumbers) + 1;
    const newTag = `${prefix}${nextNum}`;

    const newPartId = generateId();
    const newPart = clipboard.part ? {
      ...clipboard.part,
      id: newPartId,
      createdAt: now,
      modifiedAt: now,
    } : null;

    const newDeviceId = generateId();
    const newDevice: Device = {
      ...clipboard.device,
      id: newDeviceId,
      tag: newTag,
      partId: newPart ? newPartId : undefined,
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: newPart ? [...prev.parts, newPart] : prev.parts,
        devices: [...prev.devices, newDevice],
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(newDeviceId, { x: snappedX, y: snappedY });
      return next;
    });

    setSelectedDevices([newDeviceId]);
  }, [clipboard, circuit, pushToHistory, setCircuit, setDevicePositions, setSelectedDevices]);

  // selectedDevices contains device IDs
  const duplicateDevice = useCallback(() => {
    if (selectedDevices.length === 0 || !circuit) return;

    const selectedDeviceId = selectedDevices[0];
    const device = circuit.devices.find(d => d.id === selectedDeviceId);
    if (!device) return;

    pushToHistory();

    const part = device.partId ? circuit.parts.find(p => p.id === device.partId) : null;
    const allPositions = getAllPositions();
    const position = allPositions.get(selectedDeviceId) || { x: 100, y: 100 };

    const offsetX = position.x + 40;
    const offsetY = position.y + 40;

    const now = Date.now();

    const category = part?.category || 'unknown';
    const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
    const prefix = categoryInfo?.prefix || device.tag.replace(/\d+$/, '') || 'D';

    const existingNumbers = circuit.devices
      .filter(d => d.tag.startsWith(prefix))
      .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
    const nextNum = Math.max(0, ...existingNumbers) + 1;
    const newTag = `${prefix}${nextNum}`;

    const newPartId = generateId();
    const newPart = part ? {
      ...part,
      id: newPartId,
      createdAt: now,
      modifiedAt: now,
    } : null;

    const newDeviceId = generateId();
    const newDevice: Device = {
      ...device,
      id: newDeviceId,
      tag: newTag,
      partId: newPart ? newPartId : undefined,
      createdAt: now,
      modifiedAt: now,
    };

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: newPart ? [...prev.parts, newPart] : prev.parts,
        devices: [...prev.devices, newDevice],
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      next.set(newDeviceId, { x: snapToGrid(offsetX), y: snapToGrid(offsetY) });
      return next;
    });

    setSelectedDevices([newDeviceId]);
  }, [selectedDevices, circuit, getAllPositions, pushToHistory, setCircuit, setDevicePositions, setSelectedDevices]);

  return {
    clipboard,
    copyDevice,
    pasteDevice,
    duplicateDevice,
  };
}
