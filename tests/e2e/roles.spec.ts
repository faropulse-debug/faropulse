import { test, expect } from '@playwright/test';

test.describe('Roles & Auth Middleware', () => {
  test('/dashboard/owner/v2 redirige a /login cuando no hay sesión', async ({ page }) => {
    await page.goto('/dashboard/owner/v2');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('/role-select redirige a /login cuando no hay sesión', async ({ page }) => {
    await page.goto('/role-select');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });
});
