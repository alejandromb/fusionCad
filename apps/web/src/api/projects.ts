/**
 * API client for project persistence
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionData {
  fromDevice: string;
  fromPin: string;
  toDevice: string;
  toPin: string;
  netId: string;
}

export interface DevicePosition {
  x: number;
  y: number;
}

export interface CircuitData {
  devices: unknown[];
  nets: unknown[];
  parts: unknown[];
  connections: ConnectionData[];
  positions: Record<string, DevicePosition>;
  sheets?: unknown[];
  annotations?: unknown[];
  terminals?: unknown[];
  rungs?: unknown[];
  transforms?: Record<string, unknown>;
}

export interface Project extends ProjectSummary {
  circuitData: CircuitData;
}

/**
 * List all projects (without circuit data)
 */
export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${API_BASE}/api/projects`);
  if (!response.ok) {
    throw new Error('Failed to list projects');
  }
  return response.json();
}

/**
 * Get a single project with full circuit data
 */
export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects/${id}`);
  if (!response.ok) {
    throw new Error('Failed to get project');
  }
  return response.json();
}

/**
 * Create a new project
 */
export async function createProject(
  name: string,
  description?: string,
  circuitData?: CircuitData
): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, circuitData }),
  });
  if (!response.ok) {
    throw new Error('Failed to create project');
  }
  return response.json();
}

/**
 * Update an existing project
 */
export async function updateProject(
  id: string,
  data: Partial<Pick<Project, 'name' | 'description' | 'circuitData'>>
): Promise<Project> {
  const response = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to update project');
  }
  return response.json();
}

/**
 * Delete a project
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/projects/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete project');
  }
}
