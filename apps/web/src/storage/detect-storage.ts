/**
 * Detect which storage provider to use based on API availability.
 */
import type { StorageProvider } from './storage-provider';
import { RestStorageProvider } from './rest-storage-provider';
import { IndexedDBStorageProvider } from './indexeddb-storage-provider';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const HEALTH_TIMEOUT_MS = 2000;

export type StorageType = 'rest' | 'indexeddb';

export interface DetectionResult {
  provider: StorageProvider;
  type: StorageType;
}

export async function detectStorageProvider(): Promise<DetectionResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      return { provider: new RestStorageProvider(), type: 'rest' };
    }
  } catch {
    // API not reachable — fall back to IndexedDB
  }

  return { provider: new IndexedDBStorageProvider(), type: 'indexeddb' };
}
