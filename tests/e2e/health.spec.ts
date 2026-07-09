import { test, expect } from '@playwright/test';

test('endpoint de health devuelve 200 y status ok', async ({ request }) => {
  const response = await request.get('/api/health');
  
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body).toEqual({ status: 'ok' });
});
