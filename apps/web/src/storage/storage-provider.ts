/**
 * Storage provider interface — abstracts REST API vs IndexedDB.
 */
import type { ProjectSummary, Project, CircuitData } from '../api/projects';

export interface StorageProvider {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project>;
  createProject(name: string, description?: string, circuitData?: CircuitData): Promise<Project>;
  updateProject(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'circuitData'>>): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  // Custom symbol persistence (optional — not all providers implement this)
  listCustomSymbols?(): Promise<any[]>;
  saveCustomSymbol?(symbol: any): Promise<void>;
  deleteCustomSymbol?(id: string): Promise<void>;
}
