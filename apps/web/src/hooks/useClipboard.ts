/**
 * Clipboard hook - copy/paste/duplicate
 * Supports multi-device copy with wire preservation
 */

import { useState, useCallback } from 'react';
import { generateId, type Device, type Part } from '@fusion-cad/core-model';
import type { CircuitData, Connection } from '../renderer/circuit-renderer';
import type { Point } from '../renderer/types';
import { SYMBOL_CATEGORIES, snapToGrid } from '../types';

interface DeviceTransform {
  rotation: number;
  mirrorH?: boolean;
}

interface ClipboardData {
  devices: Device[];
  parts: Part[];
  connections: Connection[];
  positions: Map<string, Point>;
  transforms: Record<string, DeviceTransform>;
  annotations?: import('@fusion-cad/core-model').Annotation[];
}

export interface UseClipboardReturn {
  clipboard: ClipboardData | null;
  copyDevice: () => void;
  pasteDevice: (worldX: number, worldY: number) => void;
  duplicateDevice: () => void;
}

/**
 * Given a tag prefix and the current devices in the circuit,
 * returns the next available tag number.
 */
function getNextTagNumber(prefix: string, devices: Device[]): number {
  const existingNumbers = devices
    .filter(d => d.tag.startsWith(prefix))
    .map(d => parseInt(d.tag.slice(prefix.length)) || 0);
  return Math.max(0, ...existingNumbers) + 1;
}

/**
 * Determines the tag prefix for a device based on its part category or existing tag.
 */
function getTagPrefix(device: Device, part: Part | null | undefined): string {
  const category = part?.category || 'unknown';
  const categoryInfo = SYMBOL_CATEGORIES.find(c => c.id === category);
  return categoryInfo?.prefix || device.tag.replace(/\d+$/, '') || 'D';
}

export function useClipboard(
  circuit: CircuitData | null,
  setCircuit: React.Dispatch<React.SetStateAction<CircuitData | null>>,
  setDevicePositions: React.Dispatch<React.SetStateAction<Map<string, Point>>>,
  selectedDevices: string[],
  setSelectedDevices: React.Dispatch<React.SetStateAction<string[]>>,
  getAllPositions: () => Map<string, Point>,
  pushToHistory: () => void,
  activeSheetId?: string,
  selectedAnnotationIds?: string[]
): UseClipboardReturn {
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  const copyDevice = useCallback(() => {
    if (!circuit) return;

    // Copy annotations if selected (and no devices)
    if (selectedDevices.length === 0 && selectedAnnotationIds && selectedAnnotationIds.length > 0) {
      const anns = (circuit.annotations || []).filter(a => selectedAnnotationIds.includes(a.id));
      if (anns.length > 0) {
        setClipboard({ devices: [], parts: [], connections: [], positions: new Map(), transforms: {}, annotations: anns });
      }
      return;
    }

    if (selectedDevices.length === 0) return;

    const selectedSet = new Set(selectedDevices);
    const allPositions = getAllPositions();

    // Collect all selected devices and their parts
    const devices: Device[] = [];
    const partIds = new Set<string>();
    const positions = new Map<string, Point>();

    for (const deviceId of selectedDevices) {
      const device = circuit.devices.find(d => d.id === deviceId);
      if (!device) continue;
      devices.push(device);
      if (device.partId) partIds.add(device.partId);
      positions.set(deviceId, allPositions.get(deviceId) || { x: 100, y: 100 });
    }

    if (devices.length === 0) return;

    const parts = circuit.parts.filter(p => partIds.has(p.id));

    // Collect transforms for selected devices
    const transforms: Record<string, DeviceTransform> = {};
    for (const deviceId of selectedDevices) {
      const t = circuit.transforms?.[deviceId];
      if (t) transforms[deviceId] = { ...t };
    }

    // Collect connections where BOTH endpoints are in the selection
    const connections = circuit.connections.filter(conn => {
      const fromDevice = conn.fromDeviceId
        ? circuit.devices.find(d => d.id === conn.fromDeviceId)
        : circuit.devices.find(d => d.tag === conn.fromDevice);
      const toDevice = conn.toDeviceId
        ? circuit.devices.find(d => d.id === conn.toDeviceId)
        : circuit.devices.find(d => d.tag === conn.toDevice);

      return fromDevice && toDevice &&
        selectedSet.has(fromDevice.id) && selectedSet.has(toDevice.id);
    });

    setClipboard({ devices, parts, connections, positions, transforms });
  }, [selectedDevices, selectedAnnotationIds, circuit, getAllPositions]);

  const pasteDevice = useCallback((worldX: number, worldY: number) => {
    if (!clipboard || !circuit) return;

    // Paste annotation if clipboard has one
    if (clipboard.annotations && clipboard.annotations.length > 0 && clipboard.devices.length === 0) {
      pushToHistory();
      const ann = clipboard.annotations[0];
      const newAnn = {
        ...ann,
        id: generateId(),
        sheetId: activeSheetId || ann.sheetId,
        position: { x: snapToGrid(worldX), y: snapToGrid(worldY) },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
      };
      setCircuit(prev => {
        if (!prev) return prev;
        return { ...prev, annotations: [...(prev.annotations || []), newAnn] };
      });
      return;
    }

    pushToHistory();

    const snappedX = snapToGrid(worldX);
    const snappedY = snapToGrid(worldY);
    const now = Date.now();

    // Calculate centroid of copied positions to use as offset anchor
    let centroidX = 0, centroidY = 0;
    for (const pos of clipboard.positions.values()) {
      centroidX += pos.x;
      centroidY += pos.y;
    }
    centroidX /= clipboard.positions.size;
    centroidY /= clipboard.positions.size;

    // Build ID remapping: old ID -> new ID
    const deviceIdMap = new Map<string, string>();
    const partIdMap = new Map<string, string>();
    // Also remap tags: old tag -> new tag
    const tagMap = new Map<string, string>();

    // Track all devices that will exist after paste (for tag numbering)
    const allDevicesAfterPaste = [...circuit.devices];

    // Create new parts
    const newParts: Part[] = [];
    for (const part of clipboard.parts) {
      const newPartId = generateId();
      partIdMap.set(part.id, newPartId);
      newParts.push({
        ...part,
        id: newPartId,
        createdAt: now,
        modifiedAt: now,
      });
    }

    // Create new devices with remapped IDs and unique tags
    const newDevices: Device[] = [];
    const newPositions = new Map<string, Point>();
    const newDeviceIds: string[] = [];

    for (const device of clipboard.devices) {
      const newDeviceId = generateId();
      deviceIdMap.set(device.id, newDeviceId);

      const part = device.partId ? clipboard.parts.find(p => p.id === device.partId) : null;
      const prefix = getTagPrefix(device, part);
      const nextNum = getNextTagNumber(prefix, allDevicesAfterPaste);
      const newTag = `${prefix}${nextNum}`;
      tagMap.set(device.tag, newTag);

      const newDevice: Device = {
        ...device,
        id: newDeviceId,
        tag: newTag,
        sheetId: activeSheetId || device.sheetId, // paste to active sheet
        partId: device.partId ? partIdMap.get(device.partId) : undefined,
        createdAt: now,
        modifiedAt: now,
      };

      newDevices.push(newDevice);
      // Also add to tracking array so subsequent tags increment correctly
      allDevicesAfterPaste.push(newDevice);
      newDeviceIds.push(newDeviceId);

      // Position relative to centroid, offset to paste location
      const origPos = clipboard.positions.get(device.id) || { x: centroidX, y: centroidY };
      newPositions.set(newDeviceId, {
        x: snapToGrid(snappedX + (origPos.x - centroidX)),
        y: snapToGrid(snappedY + (origPos.y - centroidY)),
      });
    }

    // Remap connections
    const newConnections: Connection[] = [];
    for (const conn of clipboard.connections) {
      const fromDevice = conn.fromDeviceId
        ? clipboard.devices.find(d => d.id === conn.fromDeviceId)
        : clipboard.devices.find(d => d.tag === conn.fromDevice);
      const toDevice = conn.toDeviceId
        ? clipboard.devices.find(d => d.id === conn.toDeviceId)
        : clipboard.devices.find(d => d.tag === conn.toDevice);

      if (!fromDevice || !toDevice) continue;

      const newFromId = deviceIdMap.get(fromDevice.id)!;
      const newToId = deviceIdMap.get(toDevice.id)!;
      const newFromTag = tagMap.get(fromDevice.tag) || conn.fromDevice;
      const newToTag = tagMap.get(toDevice.tag) || conn.toDevice;

      // Remap waypoints relative to paste offset
      let waypoints: Point[] | undefined;
      if (conn.waypoints && conn.waypoints.length > 0) {
        waypoints = conn.waypoints.map(wp => ({
          x: snapToGrid(wp.x - centroidX + snappedX),
          y: snapToGrid(wp.y - centroidY + snappedY),
        }));
      }

      newConnections.push({
        ...conn,
        fromDevice: newFromTag,
        fromDeviceId: newFromId,
        toDevice: newToTag,
        toDeviceId: newToId,
        netId: generateId(),
        sheetId: activeSheetId, // paste connections to active sheet
        waypoints,
      });
    }

    // Build remapped transforms
    const newTransforms: Record<string, DeviceTransform> = {};
    for (const device of clipboard.devices) {
      const t = clipboard.transforms[device.id];
      if (t) {
        const newId = deviceIdMap.get(device.id)!;
        newTransforms[newId] = { ...t };
      }
    }


    // Create nets for pasted connections
    const newNets = newConnections.map(c => ({
      id: c.netId,
      name: `NET_${c.netId.slice(-4)}`,
      type: "net" as const,
      netType: "signal" as const,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
    }));
    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: [...prev.parts, ...newParts],
        devices: [...prev.devices, ...newDevices],
        connections: [...prev.connections, ...newConnections],
        nets: [...prev.nets, ...newNets],
        transforms: { ...(prev.transforms || {}), ...newTransforms },
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const [id, pos] of newPositions) {
        next.set(id, pos);
      }
      return next;
    });

    setSelectedDevices(newDeviceIds);
  }, [clipboard, circuit, pushToHistory, setCircuit, setDevicePositions, setSelectedDevices, activeSheetId]);

  const duplicateDevice = useCallback(() => {
    if (selectedDevices.length === 0 || !circuit) return;

    pushToHistory();

    const selectedSet = new Set(selectedDevices);
    const allPositions = getAllPositions();
    const now = Date.now();

    // Collect selected devices, parts, connections (same as copy)
    const devices: Device[] = [];
    const partIds = new Set<string>();
    const positions = new Map<string, Point>();

    for (const deviceId of selectedDevices) {
      const device = circuit.devices.find(d => d.id === deviceId);
      if (!device) continue;
      devices.push(device);
      if (device.partId) partIds.add(device.partId);
      positions.set(deviceId, allPositions.get(deviceId) || { x: 100, y: 100 });
    }

    if (devices.length === 0) return;

    const parts = circuit.parts.filter(p => partIds.has(p.id));

    const connections = circuit.connections.filter(conn => {
      const fromDevice = conn.fromDeviceId
        ? circuit.devices.find(d => d.id === conn.fromDeviceId)
        : circuit.devices.find(d => d.tag === conn.fromDevice);
      const toDevice = conn.toDeviceId
        ? circuit.devices.find(d => d.id === conn.toDeviceId)
        : circuit.devices.find(d => d.tag === conn.toDevice);

      return fromDevice && toDevice &&
        selectedSet.has(fromDevice.id) && selectedSet.has(toDevice.id);
    });

    // Build ID remapping
    const deviceIdMap = new Map<string, string>();
    const partIdMap = new Map<string, string>();
    const tagMap = new Map<string, string>();
    const allDevicesAfterDup = [...circuit.devices];

    const newParts: Part[] = [];
    for (const part of parts) {
      const newPartId = generateId();
      partIdMap.set(part.id, newPartId);
      newParts.push({ ...part, id: newPartId, createdAt: now, modifiedAt: now });
    }

    const newDevices: Device[] = [];
    const newPositions = new Map<string, Point>();
    const newDeviceIds: string[] = [];

    for (const device of devices) {
      const newDeviceId = generateId();
      deviceIdMap.set(device.id, newDeviceId);

      const part = device.partId ? parts.find(p => p.id === device.partId) : null;
      const prefix = getTagPrefix(device, part);
      const nextNum = getNextTagNumber(prefix, allDevicesAfterDup);
      const newTag = `${prefix}${nextNum}`;
      tagMap.set(device.tag, newTag);

      const newDevice: Device = {
        ...device,
        id: newDeviceId,
        tag: newTag,
        sheetId: activeSheetId || device.sheetId, // paste to active sheet
        partId: device.partId ? partIdMap.get(device.partId) : undefined,
        createdAt: now,
        modifiedAt: now,
      };

      newDevices.push(newDevice);
      allDevicesAfterDup.push(newDevice);
      newDeviceIds.push(newDeviceId);

      // Offset by 40px from original position
      const origPos = positions.get(device.id) || { x: 100, y: 100 };
      newPositions.set(newDeviceId, {
        x: snapToGrid(origPos.x + 40),
        y: snapToGrid(origPos.y + 40),
      });
    }

    // Remap connections with offset waypoints
    const newConnections: Connection[] = [];
    for (const conn of connections) {
      const fromDevice = conn.fromDeviceId
        ? devices.find(d => d.id === conn.fromDeviceId)
        : devices.find(d => d.tag === conn.fromDevice);
      const toDevice = conn.toDeviceId
        ? devices.find(d => d.id === conn.toDeviceId)
        : devices.find(d => d.tag === conn.toDevice);

      if (!fromDevice || !toDevice) continue;

      let waypoints: Point[] | undefined;
      if (conn.waypoints && conn.waypoints.length > 0) {
        waypoints = conn.waypoints.map(wp => ({
          x: snapToGrid(wp.x + 40),
          y: snapToGrid(wp.y + 40),
        }));
      }

      newConnections.push({
        ...conn,
        fromDevice: tagMap.get(fromDevice.tag) || conn.fromDevice,
        fromDeviceId: deviceIdMap.get(fromDevice.id)!,
        toDevice: tagMap.get(toDevice.tag) || conn.toDevice,
        toDeviceId: deviceIdMap.get(toDevice.id)!,
        netId: generateId(),
        waypoints,
      });
    }

    // Build remapped transforms
    const newTransforms: Record<string, DeviceTransform> = {};
    for (const device of devices) {
      const t = circuit.transforms?.[device.id];
      if (t) {
        const newId = deviceIdMap.get(device.id)!;
        newTransforms[newId] = { ...t };
      }
    }

    setCircuit(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        parts: [...prev.parts, ...newParts],
        devices: [...prev.devices, ...newDevices],
        connections: [...prev.connections, ...newConnections],
        transforms: { ...(prev.transforms || {}), ...newTransforms },
      };
    });

    setDevicePositions(prev => {
      const next = new Map(prev);
      for (const [id, pos] of newPositions) {
        next.set(id, pos);
      }
      return next;
    });

    setSelectedDevices(newDeviceIds);
  }, [selectedDevices, circuit, getAllPositions, pushToHistory, setCircuit, setDevicePositions, setSelectedDevices]);

  return {
    clipboard,
    copyDevice,
    pasteDevice,
    duplicateDevice,
  };
}
