import { test, expect, registerAccount, signIn, TEST_PASSWORD, BASE } from './fixtures';
import type { APIRequestContext, APIRequest } from '@playwright/test';
import { passwordDigest } from '../../src/lib/passwordDigest';

const ADMIN = { username: 'e2e_admin', password: 'e2e-admin-password' };

async function adminApi(request: APIRequest): Promise<APIRequestContext> {
  const api = await request.newContext();
  const res = await api.post(`${BASE}/api/auth/login`, { data: { username: ADMIN.username, passwordHash: await passwordDigest(ADMIN.password) } });
  if (!res.ok()) throw new Error(`admin sign-in failed: ${res.status()}`);
  return api;
}

async function username(api: APIRequestContext): Promise<string> {
  return (await (await api.get(`${BASE}/api/auth/me`)).json()).user.username;
}

test('non-admin visitors are bounced off /admin', async ({ page }) => {
  // The fixture signs in an ordinary account; the page guard redirects home.
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('admin API manages activation, bonus quota and admin flags', async ({ playwright }) => {
  const request = playwright.request;
  const admin = await adminApi(request);
  const userApi = await registerAccount(request);
  const { users } = await (await admin.get(`${BASE}/api/admin/users`)).json();
  const name = await username(userApi);
  const target = users.find((u: { username: string }) => u.username === name);
  expect(target).toBeTruthy();
  expect(target.isActive).toBe(true);

  // Bonus slots raise the effective limit on top of the plan allowance.
  await admin.patch(`${BASE}/api/admin/users/${target.id}`, { data: { bonusProjects: 5 } });
  const after = await (await userApi.get(`${BASE}/api/auth/me`)).json();
  expect(after.user.projectLimit).toBe(target.projectLimit + 5);

  // Deactivation kills the live session and reports the reason at sign-in.
  await admin.patch(`${BASE}/api/admin/users/${target.id}`, { data: { isActive: false, inactiveReason: 'Policy violation' } });
  const meAfter = await (await userApi.get(`${BASE}/api/auth/me`)).json();
  expect(meAfter.user).toBeNull();
  const blocked = await request.newContext();
  const login = await blocked.post(`${BASE}/api/auth/login`, { data: { username: name, passwordHash: await passwordDigest(TEST_PASSWORD) } });
  expect(login.status()).toBe(403);
  const body = await login.json();
  expect(body.error).toBe('account.deactivated');
  expect(body.reason).toBe('Policy violation');

  // Reactivation restores sign-in.
  await admin.patch(`${BASE}/api/admin/users/${target.id}`, { data: { isActive: true } });
  const relogin = await blocked.post(`${BASE}/api/auth/login`, { data: { username: name, passwordHash: await passwordDigest(TEST_PASSWORD) } });
  expect(relogin.ok()).toBeTruthy();
  await userApi.dispose();
  await blocked.dispose();
  await admin.dispose();
});

test('admin console deactivates a user through the UI', async ({ page, playwright }) => {
  const request = playwright.request;
  const userApi = await registerAccount(request);
  const name = await username(userApi);
  const admin = await adminApi(request);
  await signIn(page.context(), admin); // replaces the fixture user's cookie

  await page.goto('/admin');
  const row = page.locator('tbody tr', { hasText: name });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Deactivate' }).click();
  const form = page.locator('tbody form');
  await form.getByPlaceholder('Reason shown to the user (optional)').fill('Test ban');
  await form.getByRole('button', { name: 'Deactivate' }).click();
  await expect(row.locator('td').nth(5)).toHaveText('Deactivated');
  await admin.dispose();
  await userApi.dispose();
});
