import { test, expect, BASE } from './fixtures';
import { seedProject } from './storage';
import type { Browser } from '@playwright/test';

/** Minimal valid project: one room of rectangle walls so the SVG has content. */
function sharedProject(id = 'shared-plan') {
  const pts = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  return {
    id, name: 'Harbour Flat',
    floors: [{
      id: 'f1', name: 'Ground Floor', level: 0,
      walls: pts.map((start, i) => ({ id: `w${i}`, start, end: pts[(i + 1) % 4], thickness: 15, height: 250 })),
      rooms: [], doors: [], windows: [], furniture: [], stairs: [], columns: [],
      guides: [], measurements: [], annotations: [], textAnnotations: [], groups: [],
    }],
    activeFloorId: 'f1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function createShare(page: { request: { post: Function } }, id: string, body: Record<string, unknown>) {
  const res = await page.request.post(`/api/projects/${id}/share`, { data: body });
  if (!res.ok()) throw new Error(`share create failed: ${res.status()}`);
  return (await res.json()).share;
}

/** A brand-new browser context with no session cookie — the visitor's view. */
async function anonymousPage(browser: Browser, path: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`);
  return { ctx, page };
}

test('owner creates a link and an anonymous visitor sees the plan', async ({ page, browser }) => {
  const p = sharedProject();
  await seedProject(page, p);
  const share = await createShare(page, p.id, { expiresInDays: 7 });

  const { ctx, page: guest } = await anonymousPage(browser, `/share/${share.token}`);
  try {
    await expect(guest.getByRole('heading', { name: 'Harbour Flat' })).toBeVisible();
    await expect(guest.getByText(/Shared by e2e_/)).toBeVisible();
    await expect(guest.locator('img[alt="Harbour Flat"]')).toBeVisible(); // 2D render
    await expect(guest.getByRole('button', { name: '3D' })).toBeVisible();
    // No editing affordances leak into the shared view.
    await expect(guest.getByRole('button', { name: 'Export' })).toHaveCount(0);
  } finally { await ctx.close(); }
});

test('password gate blocks, then admits, the visitor', async ({ page, browser }) => {
  const p = sharedProject('locked-plan');
  await seedProject(page, p);
  const share = await createShare(page, p.id, { expiresInDays: 30, password: 'let-me-in' });

  const { ctx, page: guest } = await anonymousPage(browser, `/share/${share.token}`);
  try {
    await expect(guest.getByText('This plan is password-protected')).toBeVisible();
    await guest.getByLabel('Share password').fill('nope');
    await guest.getByRole('button', { name: 'View plan' }).click();
    await expect(guest.getByText('Wrong password.')).toBeVisible();
    await guest.getByLabel('Share password').fill('let-me-in');
    await guest.getByRole('button', { name: 'View plan' }).click();
    await expect(guest.getByRole('heading', { name: 'Harbour Flat' })).toBeVisible();
  } finally { await ctx.close(); }
});

test('share dialog generates, edits, regenerates and revokes the link', async ({ page, browser }) => {
  const p = sharedProject('dialog-plan');
  await seedProject(page, p);
  await page.goto('/');
  const card = page.locator('.group', { hasText: 'Harbour Flat' });
  await card.hover();
  await card.getByRole('button', { name: /Project actions for Harbour Flat/ }).click();
  await page.getByRole('menuitem', { name: 'Share' }).click();

  // Create: 30 days + password.
  await page.getByLabel('Expires in').selectOption('30');
  await page.getByLabel('Share password').fill('pw123');
  await page.getByRole('button', { name: 'Create link' }).click();
  const urlInput = page.locator('#share-url');
  await expect(urlInput).toBeVisible();
  const url = await urlInput.inputValue();
  expect(url).toMatch(/\/share\/[A-Za-z0-9]{12}$/);

  // Edit the password and regenerate — the old token dies.
  await page.locator('#share-password-edit').fill('pw456');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Regenerate link' }).click();
  await page.getByRole('button', { name: /Confirm — old link dies/ }).click();
  await expect(urlInput).not.toHaveValue(url);
  const url2 = await urlInput.inputValue();
  expect(url2).not.toBe(url);

  const { ctx, page: guest } = await anonymousPage(browser, new URL(url).pathname);
  try {
    await expect(guest.getByText(/does not exist|removed/)).toBeVisible(); // old token dead
  } finally { await ctx.close(); }
  const { ctx: ctx2, page: guest2 } = await anonymousPage(browser, new URL(url2).pathname);
  try {
    await expect(guest2.getByText('This plan is password-protected')).toBeVisible(); // new token keeps the password
  } finally { await ctx2.close(); }

  // Revoke removes the share entirely.
  await page.getByRole('button', { name: 'Remove link' }).click();
  await page.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page.getByRole('button', { name: 'Create link' })).toBeVisible();
});
