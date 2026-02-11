/**
 * IndexedDB storage provider — local-only persistence using idb library.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { generateId } from '@fusion-cad/core-model';
import type { StorageProvider } from './storage-provider';
import type { ProjectSummary, Project, CircuitData } from '../api/projects';

const DB_NAME = 'fusionCad';
const DB_VERSION = 2;
const STORE_NAME = 'projects';
const SYMBOLS_STORE = 'custom-symbols';

interface StoredProject {
  id: string;
  name: string;
  description: string;
  circuitData: CircuitData;
  createdAt: string;
  updatedAt: string;
}

function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SYMBOLS_STORE)) {
        db.createObjectStore(SYMBOLS_STORE, { keyPath: 'id' });
      }
    },
  });
}

function toSummary(p: StoredProject): ProjectSummary {
  return { id: p.id, name: p.name, description: p.description, createdAt: p.createdAt, updatedAt: p.updatedAt };
}

function toProject(p: StoredProject): Project {
  return { id: p.id, name: p.name, description: p.description, circuitData: p.circuitData, createdAt: p.createdAt, updatedAt: p.updatedAt };
}

export class IndexedDBStorageProvider implements StorageProvider {
  async listProjects(): Promise<ProjectSummary[]> {
    const db = await getDb();
    const all: StoredProject[] = await db.getAll(STORE_NAME);
    return all.map(toSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getProject(id: string): Promise<Project> {
    const db = await getDb();
    const p: StoredProject | undefined = await db.get(STORE_NAME, id);
    if (!p) throw new Error(`Project not found: ${id}`);
    return toProject(p);
  }

  async createProject(name: string, description?: string, circuitData?: CircuitData): Promise<Project> {
    const db = await getDb();
    const now = new Date().toISOString();
    const stored: StoredProject = {
      id: generateId(),
      name,
      description: description || '',
      circuitData: circuitData || { devices: [], nets: [], parts: [], connections: [], positions: {} },
      createdAt: now,
      updatedAt: now,
    };
    await db.put(STORE_NAME, stored);
    return toProject(stored);
  }

  async updateProject(id: string, data: Partial<Pick<Project, 'name' | 'description' | 'circuitData'>>): Promise<Project> {
    const db = await getDb();
    const existing: StoredProject | undefined = await db.get(STORE_NAME, id);
    if (!existing) throw new Error(`Project not found: ${id}`);

    const updated: StoredProject = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await db.put(STORE_NAME, updated);
    return toProject(updated);
  }

  async deleteProject(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(STORE_NAME, id);
  }

  // Custom symbol persistence
  async listCustomSymbols(): Promise<any[]> {
    const db = await getDb();
    return db.getAll(SYMBOLS_STORE);
  }

  async saveCustomSymbol(symbol: any): Promise<void> {
    const db = await getDb();
    await db.put(SYMBOLS_STORE, symbol);
  }

  async deleteCustomSymbol(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(SYMBOLS_STORE, id);
  }
}
