import { test, expect } from '@playwright/test';

test('la página de login carga correctamente con sus campos y botón', async ({ page }) => {
  await page.goto('/login');
  
  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitButton = page.locator('button:has-text("ACCEDER")');

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(submitButton).toBeVisible();
});
