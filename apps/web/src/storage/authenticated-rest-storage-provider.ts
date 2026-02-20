/**
 * REST API storage provider with JWT auth — injects Authorization header.
 */
import type { StorageProvider } from './storage-provider';
import type { ProjectSummary, Project, CircuitData } from '../api/projects';
import { ProjectLimitError } from './project-limit-error';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export class AuthenticatedRestStorageProvider implements StorageProvider {
  private getAccessToken: () => Promise<string | null>;

  constructor(getAccessToken: () => Promise<string | null>) {
    this.getAccessToken = getAccessToken;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const headers = await this.authHeaders();
    const res = await fetch(`${API_BASE}/api/projects`, { headers });
    if (!res.ok) throw new Error('Failed to list projects');
    return res.json();
  }

  async getProject(id: string): Promise<Project> {
    const headers = await this.authHeaders();
    const res = await fetch(`${API_BASE}/api/projects/${id}`, { headers });
    if (!res.ok) throw new Error('Failed to get project');
    return res.json();
  }

  async createProject(name: string, description?: string, circuitData?: CircuitData): Promise<Project> {
    const headers = await this.authHeaders();
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name, description, circuitData }),
    });

    if (res.status === 403) {
      const body = await res.json();
      if (body.error === 'project_limit_reached') {
        throw new ProjectLimitError(body.currentCount, body.maxAllowed);
      }
    }

    if (!res.ok) throw new Error('Failed to create project');
    return res.json();
  }

  async updateProject(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'circuitData'>>): Promise<Project> {
    const headers = await this.authHeaders();
    const res = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update project');
    return res.json();
  }

  async deleteProject(id: string): Promise<void> {
    const headers = await this.authHeaders();
    const res = await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Failed to delete project');
  }

  async listCustomSymbols(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/api/symbols`);
    if (!res.ok) throw new Error('Failed to list symbols');
    return res.json();
  }

  async saveCustomSymbol(symbol: any): Promise<void> {
    const res = await fetch(`${API_BASE}/api/symbols/${symbol.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(symbol),
    });
    if (!res.ok) throw new Error('Failed to save symbol');
  }

  async deleteCustomSymbol(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/symbols/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete symbol');
  }
}
