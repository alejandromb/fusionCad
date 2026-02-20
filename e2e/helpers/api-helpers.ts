/**
 * API helpers for E2E test setup/teardown.
 * Talks directly to the API server to manage test data.
 */

const API_BASE = 'http://localhost:3003';

/** Default headers for all E2E API requests (includes auth bypass header) */
const DEFAULT_HEADERS: Record<string, string> = {
  'x-test-user-id': 'test-user',
};

export async function deleteAllProjects(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    headers: DEFAULT_HEADERS,
  });
  if (!res.ok) throw new Error('Failed to list projects');
  const projects = await res.json();

  for (const project of projects) {
    await fetch(`${API_BASE}/api/projects/${project.id}`, {
      method: 'DELETE',
      headers: DEFAULT_HEADERS,
    });
  }
}

export async function createEmptyProject(name = 'E2E Test Project'): Promise<string> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...DEFAULT_HEADERS },
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
  const res = await fetch(`${API_BASE}/api/projects/${id}`, {
    headers: DEFAULT_HEADERS,
  });
  if (!res.ok) throw new Error('Failed to get project');
  return res.json();
}

export async function seedSymbols(): Promise<{ seeded: number; skipped: number }> {
  const res = await fetch(`${API_BASE}/api/symbols/seed`, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
  });
  if (!res.ok) throw new Error('Failed to seed symbols');
  return res.json();
}
