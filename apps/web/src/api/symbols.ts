/**
 * API client for symbol persistence (DynamoDB via API)
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function fetchAllSymbols(): Promise<any[]> {
  const response = await fetch(`${API_BASE}/api/symbols`);
  if (!response.ok) {
    throw new Error('Failed to fetch symbols');
  }
  return response.json();
}

export async function fetchSymbol(id: string): Promise<any> {
  const response = await fetch(`${API_BASE}/api/symbols/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch symbol');
  }
  return response.json();
}

export async function saveSymbol(symbol: any): Promise<any> {
  const response = await fetch(`${API_BASE}/api/symbols/${symbol.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(symbol),
  });
  if (!response.ok) {
    throw new Error('Failed to save symbol');
  }
  return response.json();
}

export async function deleteSymbol(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/symbols/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete symbol');
  }
}

export async function seedSymbols(): Promise<{ seeded: number; skipped: number }> {
  const response = await fetch(`${API_BASE}/api/symbols/seed`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to seed symbols');
  }
  return response.json();
}
