/**
 * API helpers for E2E test setup/teardown.
 * Talks directly to the API server to manage test data.
 */

const API_BASE = 'http://localhost:3003';

export async function deleteAllProjects(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error('Failed to list projects');
  const projects = await res.json();

  for (const project of projects) {
    await fetch(`${API_BASE}/api/projects/${project.id}`, { method: 'DELETE' });
  }
}

export async function createEmptyProject(name = 'E2E Test Project'): Promise<string> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: 'Created by E2E test',
      circuitData: {
        devices: [],
        nets: [],
        parts: [],
        connections: [],
        positions: {},
      },
    }),
  });
  if (!res.ok) throw new Error('Failed to create test project');
  const project = await res.json();
  return project.id;
}

export async function getProject(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`);
  if (!res.ok) throw new Error('Failed to get project');
  return res.json();
}

export async function seedSymbols(): Promise<{ seeded: number; skipped: number }> {
  const res = await fetch(`${API_BASE}/api/symbols/seed`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to seed symbols');
  return res.json();
}
