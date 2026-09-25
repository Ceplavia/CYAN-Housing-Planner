import { test, expect } from './fixtures';
import { seedProject } from './storage';

// Header clicks must clear the welcome overlay.
test.beforeEach(({ page }) => {
  page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
});

test('language can be switched from any page header', async ({ browser }) => {
  // Anonymous visitor — a fresh context with no session cookie.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.getByRole('menuitemradio', { name: '繁體中文（香港）' }).click();
    // The whole page re-renders in zh-HK without reload.
    await expect(page.getByRole('link', { name: '登入' }).first()).toBeVisible();
    // Persists across navigation (localStorage).
    await page.goto('/login');
    await expect(page.getByRole('button', { name: '登入', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '語言' }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  } finally { await ctx.close(); }
});

async function openAccountMenu(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: /Account menu for/ });
  const item = page.getByRole('menuitem', { name: 'Account center' });
  await expect.poll(async () => {
    if (await item.count() === 0) await button.click().catch(() => {});
    return item.count();
  }).toBe(1);
}

test('account menu reaches the center and signs out', async ({ page }) => {
  await page.goto('/');
  await openAccountMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Account center' }).click();
  await expect(page).toHaveURL(/\/account$/);
  // Back home and sign out through the menu.
  await page.getByRole('link', { name: 'Back to projects' }).click();
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible(); // session really gone
});

test('account center tabs group profile, security and data actions', async ({ page }) => {
  await seedProject(page, { id: 'p1', name: 'Flat', floors: [], activeFloorId: 'f1', createdAt: '', updatedAt: '' });
  await page.goto('/account');
  // Profile tab by default
  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByText(/of 50 plans/)).toBeVisible();

  await page.getByRole('button', { name: 'Security' }).click();
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await expect(page.getByLabel('Current password')).toBeVisible();

  await page.getByRole('button', { name: 'Data & backups' }).click();
  await expect(page.getByRole('heading', { name: 'Data & backups' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore…', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import…', exact: true })).toBeVisible();
});
