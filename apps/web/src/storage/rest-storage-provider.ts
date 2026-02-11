/**
 * REST API storage provider — wraps existing projectsApi functions.
 */
import type { StorageProvider } from './storage-provider';
import type { ProjectSummary, Project, CircuitData } from '../api/projects';
import * as projectsApi from '../api/projects';
import * as symbolsApi from '../api/symbols';

export class RestStorageProvider implements StorageProvider {
  async listProjects(): Promise<ProjectSummary[]> {
    return projectsApi.listProjects();
  }

  async getProject(id: string): Promise<Project> {
    return projectsApi.getProject(id);
  }

  async createProject(name: string, description?: string, circuitData?: CircuitData): Promise<Project> {
    return projectsApi.createProject(name, description, circuitData);
  }

  async updateProject(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'circuitData'>>): Promise<Project> {
    return projectsApi.updateProject(id, data);
  }

  async deleteProject(id: string): Promise<void> {
    return projectsApi.deleteProject(id);
  }

  async listCustomSymbols(): Promise<any[]> {
    return symbolsApi.fetchAllSymbols();
  }

  async saveCustomSymbol(symbol: any): Promise<void> {
    await symbolsApi.saveSymbol(symbol);
  }

  async deleteCustomSymbol(id: string): Promise<void> {
    await symbolsApi.deleteSymbol(id);
  }
}
