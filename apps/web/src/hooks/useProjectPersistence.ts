/**
 * Project persistence hook - load/save/auto-save
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Device, Net, Part, Sheet, LadderBlock } from '@fusion-cad/core-model';
import { migrateToBlocks, generateId } from '@fusion-cad/core-model';
import { DEFAULT_LADDER_CONFIG } from '@fusion-cad/core-engine';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import type { CircuitData, Connection } from '../renderer/circuit-renderer';
import type { ProjectSummary } from '../api/projects';
import type { StorageProvider } from '../storage/storage-provider';
import { ProjectLimitError } from '../storage/project-limit-error';
import type { Point } from '../renderer/types';
import { AUTO_SAVE_DELAY } from '../types';

/**
 * Detect whether positions are tag-keyed (legacy) or ID-keyed (new).
 * ULID keys are 26 uppercase alphanumeric characters.
 * Tag keys are short like "K1", "S2", "PS1".
 */
function migratePositions(
  positions: Record<string, Point>,
  devices: Device[],
): Record<string, Point> {
  const migrated: Record<string, Point> = {};
  for (const [key, pos] of Object.entries(positions)) {
    // ULID pattern: 26 chars, uppercase alphanumeric
    if (key.length === 26 && /^[0-9A-Z]+$/.test(key)) {
      // Already ID-keyed
      migrated[key] = pos;
    } else {
      // Tag-keyed — find the device and migrate to its ID
      const device = devices.find(d => d.tag === key);
      if (device) {
        migrated[device.id] = pos;
      }
      // If device not found, drop the position (orphaned)
    }
  }
  return migrated;
}

/**
 * Build a CircuitData from raw project data, applying block migration.
 * This ensures legacy projects with sheet-level diagramType get blocks created.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCircuitData(raw: any): CircuitData {
  const base: CircuitData = {
    devices: raw.devices || [],
    nets: raw.nets || [],
    parts: raw.parts || [],
    connections: raw.connections || [],
    ...(raw.sheets ? { sheets: raw.sheets } : {}),
    ...(raw.annotations ? { annotations: raw.annotations } : {}),
    ...(raw.terminals ? { terminals: raw.terminals } : {}),
    ...(raw.rungs ? { rungs: raw.rungs } : {}),
    ...(raw.transforms ? { transforms: raw.transforms } : {}),
    ...(raw.blocks ? { blocks: raw.blocks } : {}),
    ...(raw.symbols ? { symbols: raw.symbols } : {}),
  };
  // Auto-migrate sheet-level ladder config → blocks
  return migrateToBlocks(base);
}

function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;

  return debouncedFn;
}

export interface UseProjectPersistenceReturn {
  projectId: string | null;
  projectName: string;
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  isLoading: boolean;
  projectsList: ProjectSummary[];
  showProjectMenu: boolean;
  circuit: CircuitData | null;
  devicePositions: Map<string, Point>;
  setShowProjectMenu: (show: boolean) => void;
  setCircuit: React.Dispatch<React.SetStateAction<CircuitData | null>>;
  setDevicePositions: React.Dispatch<React.SetStateAction<Map<string, Point>>>;
  switchProject: (id: string) => Promise<void>;
  createNewProject: () => Promise<void>;
  deleteCurrentProject: () => Promise<void>;
  renameProject: () => Promise<void>;
  refreshProjectsList: () => Promise<void>;
  reloadProject: () => Promise<void>;
  exportProject: () => void;
  importProject: (file: File) => Promise<void>;
  saveNow: () => Promise<void>;
}

export function useProjectPersistence(
  storage: StorageProvider,
  onProjectLimitReached?: () => void,
): UseProjectPersistenceReturn {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [isLoading, setIsLoading] = useState(true);
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [circuit, setCircuit] = useState<CircuitData | null>(null);
  const [devicePositions, setDevicePositions] = useState<Map<string, Point>>(new Map());

  const refreshProjectsList = useCallback(async () => {
    try {
      const projects = await storage.listProjects();
      setProjectsList(projects);
    } catch (error) {
      console.error('Failed to load projects list:', error);
    }
  }, [storage]);

  const switchProject = useCallback(async (id: string) => {
    setIsLoading(true);
    setShowProjectMenu(false);
    try {
      const project = await storage.getProject(id);
      setProjectId(project.id);
      setProjectName(project.name);

      const devices = project.circuitData.devices as Device[];
      const positionsMap = new Map<string, Point>();
      if (project.circuitData.positions) {
        const migrated = migratePositions(project.circuitData.positions as Record<string, Point>, devices);
        Object.entries(migrated).forEach(([id, pos]) => {
          positionsMap.set(id, pos);
        });
      }
      setDevicePositions(positionsMap);

      setCircuit(buildCircuitData(project.circuitData));

      window.history.replaceState({}, '', `?project=${project.id}`);
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to switch project:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storage]);

  const createNewProject = useCallback(async () => {
    setShowProjectMenu(false);
    const name = prompt('Project name:', 'New Project');
    if (!name) return;

    setIsLoading(true);
    try {
      // Create a default sheet with a ladder block so rung numbers are visible immediately
      const now = Date.now();
      const sheetId = generateId();
      const blockId = generateId();
      const defaultSheet: Sheet = {
        id: sheetId,
        type: 'sheet',
        name: 'Sheet 1',
        number: 1,
        size: 'Tabloid',
        diagramType: 'ladder',
        createdAt: now,
        modifiedAt: now,
      };
      const defaultBlock: LadderBlock = {
        id: blockId,
        type: 'block',
        blockType: 'ladder',
        sheetId,
        name: 'Sheet 1 Ladder',
        position: { x: 0, y: 0 },
        ladderConfig: { ...DEFAULT_LADDER_CONFIG },
        createdAt: now,
        modifiedAt: now,
      };
      const initialCircuit = {
        devices: [],
        nets: [],
        parts: [],
        connections: [],
        positions: {},
        sheets: [defaultSheet],
        blocks: [defaultBlock],
      };

      const project = await storage.createProject(name, '', initialCircuit);

      setProjectId(project.id);
      setProjectName(project.name);
      setDevicePositions(new Map());
      setCircuit({
        devices: [],
        nets: [],
        parts: [],
        connections: [],
        sheets: [defaultSheet],
        blocks: [defaultBlock],
      });

      window.history.replaceState({}, '', `?project=${project.id}`);
      setSaveStatus('saved');
      await refreshProjectsList();
    } catch (error) {
      if (error instanceof ProjectLimitError) {
        onProjectLimitReached?.();
      } else {
        console.error('Failed to create project:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [storage, refreshProjectsList, onProjectLimitReached]);

  const deleteCurrentProject = useCallback(async () => {
    if (!projectId) return;
    if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) return;

    setShowProjectMenu(false);
    try {
      await storage.deleteProject(projectId);
      await refreshProjectsList();

      const projects = await storage.listProjects();
      if (projects.length > 0) {
        await switchProject(projects[0].id);
      } else {
        await createNewProject();
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  }, [storage, projectId, projectName, refreshProjectsList, switchProject, createNewProject]);

  const renameProject = useCallback(async () => {
    if (!projectId) return;
    const newName = prompt('New project name:', projectName);
    if (!newName || newName === projectName) return;

    setShowProjectMenu(false);
    try {
      await storage.updateProject(projectId, { name: newName });
      setProjectName(newName);
      await refreshProjectsList();
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  }, [storage, projectId, projectName, refreshProjectsList]);

  // Save project to API
  // Positions are stored keyed by device ID (ULID)
  const saveProject = useCallback(async () => {
    if (!projectId || !circuit) return;

    setSaveStatus('saving');
    try {
      const positions: Record<string, Point> = {};
      devicePositions.forEach((pos, deviceId) => {
        positions[deviceId] = pos;
      });

      await storage.updateProject(projectId, {
        circuitData: {
          devices: circuit.devices,
          nets: circuit.nets,
          parts: circuit.parts,
          connections: circuit.connections,
          positions,
          ...(circuit.sheets ? { sheets: circuit.sheets } : {}),
          ...(circuit.annotations ? { annotations: circuit.annotations } : {}),
          ...(circuit.terminals ? { terminals: circuit.terminals } : {}),
          ...(circuit.rungs ? { rungs: circuit.rungs } : {}),
          ...(circuit.transforms ? { transforms: circuit.transforms } : {}),
          ...(circuit.blocks ? { blocks: circuit.blocks } : {}),
          ...(circuit.symbols ? { symbols: circuit.symbols } : {}),
        },
      });
      setSaveStatus('saved');
    } catch (error) {
      console.error('Failed to save project:', error);
      setSaveStatus('error');
    }
  }, [storage, projectId, circuit, devicePositions]);

  // Debounced auto-save
  const debouncedSave = useDebouncedCallback(saveProject, AUTO_SAVE_DELAY);

  // Keep a ref to saveProject so beforeunload can call it synchronously
  const saveProjectRef = useRef(saveProject);
  saveProjectRef.current = saveProject;

  // Flush pending save on page unload — prevents data loss if user closes tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved') {
        // Attempt synchronous save via sendBeacon (fire-and-forget)
        if (projectId && circuit) {
          const positions: Record<string, Point> = {};
          devicePositions.forEach((pos, deviceId) => {
            positions[deviceId] = pos;
          });
          const payload = JSON.stringify({
            circuitData: {
              devices: circuit.devices,
              nets: circuit.nets,
              parts: circuit.parts,
              connections: circuit.connections,
              positions,
              ...(circuit.sheets ? { sheets: circuit.sheets } : {}),
              ...(circuit.annotations ? { annotations: circuit.annotations } : {}),
              ...(circuit.terminals ? { terminals: circuit.terminals } : {}),
              ...(circuit.rungs ? { rungs: circuit.rungs } : {}),
              ...(circuit.transforms ? { transforms: circuit.transforms } : {}),
              ...(circuit.blocks ? { blocks: circuit.blocks } : {}),
            },
          });
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          navigator.sendBeacon(
            `${apiBase}/api/projects/${projectId}/save`,
            new Blob([payload], { type: 'application/json' }),
          );
        }
        // Show browser's "unsaved changes" warning
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus, projectId, circuit, devicePositions]);

  // Trigger auto-save when circuit or positions change
  useEffect(() => {
    if (projectId && circuit && !isLoading) {
      setSaveStatus('unsaved');
      debouncedSave();
    }
  }, [circuit, devicePositions, projectId, isLoading, debouncedSave]);

  // Load project on mount
  useEffect(() => {
    async function loadOrCreateProject() {
      setIsLoading(true);
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlProjectId = urlParams.get('project');

        if (urlProjectId) {
          const project = await storage.getProject(urlProjectId);
          setProjectId(project.id);
          setProjectName(project.name);

          const devices = project.circuitData.devices as Device[];
          const positionsMap = new Map<string, Point>();
          if (project.circuitData.positions) {
            const migrated = migratePositions(project.circuitData.positions as Record<string, Point>, devices);
            Object.entries(migrated).forEach(([id, pos]) => {
              positionsMap.set(id, pos);
            });
          }
          setDevicePositions(positionsMap);

          setCircuit(buildCircuitData(project.circuitData));
        } else {
          const projects = await storage.listProjects();

          if (projects.length > 0) {
            const project = await storage.getProject(projects[0].id);
            setProjectId(project.id);
            setProjectName(project.name);

            const loadedDevices = project.circuitData.devices as Device[];
            const positionsMap = new Map<string, Point>();
            if (project.circuitData.positions) {
              const migrated = migratePositions(project.circuitData.positions as Record<string, Point>, loadedDevices);
              Object.entries(migrated).forEach(([id, pos]) => {
                positionsMap.set(id, pos);
              });
            }
            setDevicePositions(positionsMap);

            setCircuit(buildCircuitData(project.circuitData));

            window.history.replaceState({}, '', `?project=${project.id}`);
          } else {
            const goldenCircuit = createGoldenCircuitMotorStarter();
            const circuitData = {
              devices: goldenCircuit.devices,
              nets: goldenCircuit.nets,
              parts: goldenCircuit.parts,
              connections: goldenCircuit.connections,
              positions: {} as Record<string, Point>,
            };

            const project = await storage.createProject(
              '3-Wire Motor Starter',
              'Golden circuit - standard motor starter configuration',
              circuitData
            );

            setProjectId(project.id);
            setProjectName(project.name);
            setCircuit({
              devices: goldenCircuit.devices,
              nets: goldenCircuit.nets,
              parts: goldenCircuit.parts,
              connections: goldenCircuit.connections,
            });

            window.history.replaceState({}, '', `?project=${project.id}`);
          }
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        const goldenCircuit = createGoldenCircuitMotorStarter();
        setCircuit({
          devices: goldenCircuit.devices,
          nets: goldenCircuit.nets,
          parts: goldenCircuit.parts,
          connections: goldenCircuit.connections,
        });
        setProjectName('3-Wire Motor Starter (offline)');
      } finally {
        setIsLoading(false);
      }
    }

    loadOrCreateProject();
    refreshProjectsList();
  }, [storage, refreshProjectsList]);

  const reloadProject = useCallback(async () => {
    if (projectId) {
      await switchProject(projectId);
    }
  }, [projectId, switchProject]);

  // Export current project as a JSON file download
  const exportProject = useCallback(() => {
    if (!projectId || !circuit) return;

    const positions: Record<string, Point> = {};
    devicePositions.forEach((pos, deviceId) => {
      positions[deviceId] = pos;
    });

    const backup = {
      _fusionCadBackup: true,
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        name: projectName,
        circuitData: {
          devices: circuit.devices,
          nets: circuit.nets,
          parts: circuit.parts,
          connections: circuit.connections,
          positions,
          ...(circuit.sheets ? { sheets: circuit.sheets } : {}),
          ...(circuit.annotations ? { annotations: circuit.annotations } : {}),
          ...(circuit.terminals ? { terminals: circuit.terminals } : {}),
          ...(circuit.rungs ? { rungs: circuit.rungs } : {}),
          ...(circuit.transforms ? { transforms: circuit.transforms } : {}),
          ...(circuit.blocks ? { blocks: circuit.blocks } : {}),
          ...(circuit.symbols ? { symbols: circuit.symbols } : {}),
        },
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    a.download = `${safeName}_${date}.fcad.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [projectId, projectName, circuit, devicePositions]);

  // Import a project from a JSON backup file
  const importProject = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate backup format
      if (!data._fusionCadBackup || !data.project?.circuitData) {
        throw new Error('Invalid backup file — not a fusionCad project export.');
      }

      const { name, circuitData } = data.project;
      const importName = name ? `${name} (imported)` : 'Imported Project';

      setIsLoading(true);
      const project = await storage.createProject(importName, '', circuitData);
      await switchProject(project.id);
      await refreshProjectsList();
    } catch (error: any) {
      console.error('Failed to import project:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [storage, switchProject, refreshProjectsList]);

  return {
    projectId,
    projectName,
    saveStatus,
    isLoading,
    projectsList,
    showProjectMenu,
    circuit,
    devicePositions,
    setShowProjectMenu,
    setCircuit,
    setDevicePositions,
    switchProject,
    createNewProject,
    deleteCurrentProject,
    renameProject,
    refreshProjectsList,
    reloadProject,
    exportProject,
    importProject,
    saveNow: saveProject,
  };
}
