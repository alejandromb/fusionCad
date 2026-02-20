/**
 * Detect which storage provider to use based on auth state and API availability.
 */
import type { StorageProvider } from './storage-provider';
import { RestStorageProvider } from './rest-storage-provider';
import { AuthenticatedRestStorageProvider } from './authenticated-rest-storage-provider';
import { IndexedDBStorageProvider } from './indexeddb-storage-provider';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const HEALTH_TIMEOUT_MS = 2000;

export type StorageType = 'rest' | 'indexeddb';

export interface DetectionResult {
  provider: StorageProvider;
  type: StorageType;
}

/**
 * Detect storage provider.
 * - If getAccessToken is provided (user is authenticated) → AuthenticatedRestStorageProvider
 * - Otherwise → try API health check, fall back to IndexedDB
 */
export async function detectStorageProvider(
  getAccessToken?: () => Promise<string | null>,
): Promise<DetectionResult> {
  // Authenticated user → always use authenticated REST provider
  if (getAccessToken) {
    return { provider: new AuthenticatedRestStorageProvider(getAccessToken), type: 'rest' };
  }

  // Anonymous user → check if API is reachable for unauthenticated REST
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
