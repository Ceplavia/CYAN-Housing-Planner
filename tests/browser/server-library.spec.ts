import { expect, test } from './fixtures';
import { registerAccount } from './fixtures';
import { readFile } from 'node:fs/promises';
import { savedProjects, seedHistory, seedProject, seedThumbnail, storedRecords } from './storage';

// Server-backed library coverage: persistence, backup round-trip and per-user
// isolation — the behaviors IndexedDB used to guarantee inside one browser.

test('large projects persist across reloads and keep their raw bytes in backups', async ({ page }) => {
  const source = JSON.parse(await readFile('tests/fixtures/save-conflicts.openplan.json', 'utf8'));
  source.extensions = { image: 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024) };
  source.name = 'QA Server Large Project';
  await seedProject(page, source);
  await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
  await page.goto(`/editor?id=${source.id}`);
  await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText(source.name);
  await page.getByTitle('Click to rename', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Renamed on the server');
  await page.getByRole('textbox', { name: 'Project name' }).press('Enter');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTitle('Click to rename', { exact: true })).toHaveText('Renamed on the server');
  const saved = (await savedProjects(page))[source.id];
  expect(saved.name).toBe('Renamed on the server');
  expect(saved.extensions).toEqual(source.extensions);
  const pending = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Download library backup', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(JSON.parse(backup.projects[source.id]).name).toBe('Renamed on the server');
});

test('library backup round-trips history and thumbnails into a fresh account', async ({ page, playwright }) => {
  const source = JSON.parse(await readFile('tests/fixtures/save-conflicts.openplan.json', 'utf8'));
  const history = JSON.stringify([{ timestamp: 1, description: 'Seeded version', data: JSON.stringify(source) }]);
  // The server only accepts raster thumbnail payloads.
  const thumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await seedProject(page, source);
  await seedHistory(page, source.id, history);
  await seedThumbnail(page, source.id, thumbnail);
  const backup = await (await page.request.get('/api/library/backup')).json();
  expect(backup.projects[source.id]).toBe(JSON.stringify(source));
  expect(backup.history[source.id]).toBe(history);
  expect(backup.thumbnails[source.id]).toBe(thumbnail);

  const other = await registerAccount(playwright.request);
  const restore = await other.post('/api/library/restore', {
    data: JSON.stringify(backup),
    headers: { 'content-type': 'application/json' },
  });
  expect(restore.ok()).toBe(true);
  const result = await restore.json();
  expect(result.projects).toHaveLength(1);
  const copyId = result.projects[0].id;
  expect(copyId).not.toBe(source.id);
  const otherList = await (await other.get('/api/projects')).json();
  const copySummary = otherList.projects.find((p: { id: string }) => p.id === copyId);
  expect(copySummary?.name).toBe(`${source.name} (Restored copy)`);
  const copyRaw = await (await other.get(`/api/projects/${copyId}`)).json();
  const copy = JSON.parse(copyRaw.data);
  // Restore normalizes legacy fields, so compare the meaningful payload.
  expect(copy.name).toBe(`${source.name} (Restored copy)`);
  expect(copy.floors[0].walls).toEqual(source.floors[0].walls);
  expect(copy.floors[0].rooms).toEqual(source.floors[0].rooms);
  expect(copy.extensions).toEqual(source.extensions);
  // The source account's project id is never visible to the fresh account.
  expect((await other.get(`/api/projects/${source.id}`)).status()).toBe(404);
  const otherBackup = await (await other.get('/api/library/backup')).json();
  // Snapshots are re-pointed at the restored copy during restore.
  const copyHistory = JSON.parse(otherBackup.history[copyId]);
  expect(copyHistory[0].description).toBe('Seeded version');
  expect(JSON.parse(copyHistory[0].data).id).toBe(copyId);
  expect(otherBackup.thumbnails[copyId]).toBe(thumbnail);
  await other.dispose();
});

test('unauthenticated requests cannot reach any library data', async ({ playwright }) => {
  const anonymous = await playwright.request.newContext();
  expect((await anonymous.get('/api/projects')).status()).toBe(401);
  expect((await anonymous.post('/api/projects', { data: { id: 'nope' } })).status()).toBe(401);
  expect((await anonymous.get('/api/projects/anything')).status()).toBe(401);
  expect((await anonymous.delete('/api/projects/anything')).status()).toBe(401);
  expect((await anonymous.get('/api/library/backup')).status()).toBe(401);
  expect((await anonymous.post('/api/library/restore', { data: { archive: { format: 'openplan3d-library', version: 1, projects: {} } } })).status()).toBe(401);
  expect((await anonymous.get('/api/auth/me')).status()).toBe(200);
  expect((await (await anonymous.get('/api/auth/me')).json()).user).toBeNull();
  await anonymous.dispose();
});
