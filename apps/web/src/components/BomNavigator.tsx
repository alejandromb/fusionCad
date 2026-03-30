/**
 * BOM Navigator — inline device list with part assignment
 * Shows all devices grouped by function, with TBD parts clickable to assign.
 */

import { useState, useMemo } from 'react';
import type { Part } from '@fusion-cad/core-model';
import { ALL_MANUFACTURER_PARTS } from '@fusion-cad/core-model';
import type { CircuitData } from '../renderer/circuit-renderer';
import { PartsCatalog } from './PartsCatalog';

type ManufacturerPart = Omit<Part, 'id' | 'createdAt' | 'modifiedAt'>;

interface BomNavigatorProps {
  circuit: CircuitData | null;
  onSelectDevice: (deviceId: string) => void;
  onAssignPart: (deviceId: string, part: ManufacturerPart) => void;
}

interface DeviceGroup {
  function: string;
  devices: Array<{
    id: string;
    tag: string;
    partNumber: string;
    manufacturer: string;
    isAssigned: boolean;
    sheetName: string;
  }>;
}

export function BomNavigator({ circuit, onSelectDevice, onAssignPart }: BomNavigatorProps) {
  const [assigningDeviceId, setAssigningDeviceId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'assigned'>('all');

  const { groups, stats } = useMemo(() => {
    if (!circuit) return { groups: [], stats: { total: 0, assigned: 0, unassigned: 0 } };

    const partMap = new Map<string, Part>();
    for (const part of circuit.parts || []) {
      partMap.set(part.id, part);
    }

    const sheetMap = new Map<string, string>();
    for (const sheet of circuit.sheets || []) {
      sheetMap.set(sheet.id, sheet.name);
    }

    // Group devices by function
    const groupMap = new Map<string, DeviceGroup>();
    let assigned = 0;
    let unassigned = 0;

    for (const device of circuit.devices) {
      // Skip junctions
      if (device.function?.toLowerCase() === 'wire junction') continue;

      const part = device.partId ? partMap.get(device.partId) : null;
      const isAssigned = !!part && part.manufacturer !== 'Unassigned' && part.partNumber !== 'TBD';
      const fn = device.function || 'Unknown';

      if (isAssigned) assigned++; else unassigned++;

      if (!groupMap.has(fn)) {
        groupMap.set(fn, { function: fn, devices: [] });
      }
      groupMap.get(fn)!.devices.push({
        id: device.id,
        tag: device.tag,
        partNumber: part?.partNumber || 'TBD',
        manufacturer: part?.manufacturer || '',
        isAssigned,
        sheetName: sheetMap.get(device.sheetId) || '',
      });
    }

    // Sort groups by function name, devices within group by tag
    const groups = [...groupMap.values()].sort((a, b) => a.function.localeCompare(b.function));
    for (const g of groups) {
      g.devices.sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }));
    }

    return { groups, stats: { total: assigned + unassigned, assigned, unassigned } };
  }, [circuit]);

  if (!circuit) return <div style={{ padding: '1rem', opacity: 0.5 }}>No project loaded</div>;

  // Filter groups
  const filteredGroups = groups.map(g => ({
    ...g,
    devices: g.devices.filter(d => {
      if (filter === 'unassigned') return !d.isAssigned;
      if (filter === 'assigned') return d.isAssigned;
      return true;
    }),
  })).filter(g => g.devices.length > 0);

  return (
    <>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
        <button
          className={`category-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
          style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
        >
          All ({stats.total})
        </button>
        <button
          className={`category-chip ${filter === 'unassigned' ? 'active' : ''}`}
          onClick={() => setFilter('unassigned')}
          style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', color: stats.unassigned > 0 ? '#FFB400' : undefined }}
        >
          TBD ({stats.unassigned})
        </button>
        <button
          className={`category-chip ${filter === 'assigned' ? 'active' : ''}`}
          onClick={() => setFilter('assigned')}
          style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
        >
          Assigned ({stats.assigned})
        </button>
      </div>

      {/* Device list grouped by function */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filteredGroups.map(group => (
          <div key={group.function} style={{ marginBottom: '0.75rem' }}>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: 'bold',
              opacity: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem',
            }}>
              {group.function} ({group.devices.length})
            </div>
            {group.devices.map(dev => (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0.4rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  borderRadius: '3px',
                  marginBottom: '1px',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 'bold', minWidth: '35px' }}>{dev.tag}</span>
                {dev.sheetName && (
                  <span style={{ fontSize: '0.65rem', opacity: 0.4 }}>{dev.sheetName}</span>
                )}
                <span
                  onClick={e => {
                    e.stopPropagation();
                    if (!dev.isAssigned) {
                      setAssigningDeviceId(dev.id);
                    }
                  }}
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.7rem',
                    color: dev.isAssigned ? 'var(--fc-text-secondary)' : '#FFB400',
                    cursor: dev.isAssigned ? 'default' : 'pointer',
                    textDecoration: dev.isAssigned ? 'none' : 'underline',
                  }}
                  title={dev.isAssigned ? `${dev.manufacturer} ${dev.partNumber}` : 'Click to assign part'}
                >
                  {dev.isAssigned ? dev.partNumber : 'TBD'}
                </span>
              </div>
            ))}
          </div>
        ))}

        {filteredGroups.length === 0 && (
          <div style={{ padding: '1rem', opacity: 0.5, textAlign: 'center', fontSize: '0.8rem' }}>
            {filter === 'unassigned' ? 'All parts assigned!' : 'No devices found'}
          </div>
        )}
      </div>

      {/* Parts catalog modal for assignment */}
      {assigningDeviceId && (
        <PartsCatalog
          onClose={() => setAssigningDeviceId(null)}
          onPlacePart={(part, _symbolCategory) => {
            onAssignPart(assigningDeviceId, part);
            setAssigningDeviceId(null);
          }}
        />
      )}
    </>
  );
}
