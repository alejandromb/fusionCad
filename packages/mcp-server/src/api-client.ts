/**
 * HTTP client for the fusionCad REST API.
 *
 * Wraps fetch calls to the project and symbol endpoints.
 * All circuit manipulation happens in memory — this client
 * only loads and saves the full circuitData blob.
 */

import { migrateToBlocks, type Device, type Net, type Part, type Sheet, type Annotation, type Terminal, type Rung, type AnyDiagramBlock } from '@fusion-cad/core-model';

/** Connection stored in circuitData (matches frontend & API entity) */
export interface Connection {
  fromDevice: string;       // device tag (kept for display/export)
  fromDeviceId?: string;    // device ULID (authoritative when present)
  fromPin: string;
  toDevice: string;         // device tag
  toDeviceId?: string;      // device ULID
  toPin: string;
  netId: string;
  sheetId?: string;
  wireNumber?: string;
  waypoints?: Array<{ x: number; y: number }>;
}

/** Circuit data blob stored in the project's JSONB column */
export interface CircuitData {
  devices: Device[];
  nets: Net[];
  parts: Part[];
  connections: Connection[];
  positions: Record<string, { x: number; y: number }>;
  sheets?: Sheet[];
  annotations?: Annotation[];
  terminals?: Terminal[];
  rungs?: Rung[];
  transforms?: Record<string, { rotation: number; mirrorH?: boolean }>;
  blocks?: AnyDiagramBlock[];
}

/** Project shape returned by the API */
export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  circuitData: CircuitData;
  createdAt: string;
  updatedAt: string;
}

/** Summary returned by list endpoint */
export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export class ApiClient {
  constructor(private baseUrl: string) {}

  // ---- Projects ----

  async listProjects(): Promise<ProjectSummary[]> {
    const res = await fetch(`${this.baseUrl}/api/projects`);
    if (!res.ok) throw new Error(`Failed to list projects: ${res.status}`);
    return res.json() as Promise<ProjectSummary[]>;
  }

  async getProject(id: string): Promise<ProjectRecord> {
    const res = await fetch(`${this.baseUrl}/api/projects/${id}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error(`Project not found: ${id}`);
      throw new Error(`Failed to get project: ${res.status}`);
    }
    const project = await res.json() as ProjectRecord;
    // Auto-migrate legacy sheet-level ladder config to blocks
    project.circuitData = migrateToBlocks(project.circuitData);
    return project;
  }

  async createProject(name: string, description?: string): Promise<ProjectRecord> {
    const res = await fetch(`${this.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error(`Failed to create project: ${res.status}`);
    return res.json() as Promise<ProjectRecord>;
  }

  async updateCircuitData(projectId: string, circuitData: CircuitData): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ circuitData }),
    });
    if (!res.ok) throw new Error(`Failed to save project: ${res.status}`);
  }

  // ---- Symbols ----

  async listSymbols(): Promise<unknown[]> {
    const res = await fetch(`${this.baseUrl}/api/symbols`);
    if (!res.ok) throw new Error(`Failed to list symbols: ${res.status}`);
    return res.json() as Promise<unknown[]>;
  }
}
