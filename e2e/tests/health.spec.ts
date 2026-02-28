import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3003';

test.describe('Health Check', () => {
  test('GET /health returns ok with db connected', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.timestamp).toBeTruthy();
  });
});
