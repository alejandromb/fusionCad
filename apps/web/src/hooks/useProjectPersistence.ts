/**
 * Project persistence hook - load/save/auto-save
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Device, Net, Part } from '@fusion-cad/core-model';
import { migrateToBlocks } from '@fusion-cad/core-model';
import { createGoldenCircuitMotorStarter } from '@fusion-cad/project-io';
import type { CircuitData, Connection } from '../renderer/circuit-renderer';
import type { ProjectSummary } from '../api/projects';
import type { StorageProvider } from '../storage/storage-provider';
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
}

export function useProjectPersistence(storage: StorageProvider): UseProjectPersistenceReturn {
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
      const project = await storage.createProject(name, '', {
        devices: [],
        nets: [],
        parts: [],
        connections: [],
        positions: {},
      });

      setProjectId(project.id);
      setProjectName(project.name);
      setDevicePositions(new Map());
      setCircuit({
        devices: [],
        nets: [],
        parts: [],
        connections: [],
      });

      window.history.replaceState({}, '', `?project=${project.id}`);
      setSaveStatus('saved');
      await refreshProjectsList();
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storage, refreshProjectsList]);

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
  };
}
