import { expect, type Page } from '@playwright/test';

/**
 * Storage helpers for the server-backed library. page.request shares the
 * browser context's session cookie, so all calls act as the test's account.
 */

/** Seed a project (raw JSON string or object). The stored ID is preserved. */
export async function seedProject(page: Page, project: string | object): Promise<string> {
  const data = typeof project === 'string' ? project : JSON.stringify(project);
  const res = await page.request.post('/api/projects', { data });
  if (!res.ok()) throw new Error(`seed failed: ${res.status()} ${await res.text()}`);
  return JSON.parse(data).id;
}

/** Seed several projects at once: { id: rawJSON } or parsed objects. */
export async function seedProjects(page: Page, projects: Record<string, string | object>) {
  for (const value of Object.values(projects)) await seedProject(page, value);
}

/** Raw stored values per store: 'projects' → raw JSON, 'history' → blob, 'thumbnails' → dataURL, 'meta'/'recovery' → retained archives. */
export async function storedRecords(page: Page, store = 'projects'): Promise<Record<string, string>> {
  if (store === 'meta' || store === 'recovery') {
    const res = await page.request.get('/api/library/backup');
    if (!res.ok()) throw new Error(`backup failed: ${res.status()}`);
    return (await res.json()).recovery ?? {};
  }
  const res = await page.request.get('/api/projects');
  if (!res.ok()) throw new Error(`project list failed: ${res.status()}`);
  const { projects, thumbnails } = await res.json();
  if (store === 'thumbnails') return thumbnails ?? {};
  if (store !== 'projects' && store !== 'history') throw new Error(`unknown store: ${store}`);
  const out: Record<string, string> = {};
  for (const p of projects) {
    const full = await page.request.get(`/api/projects/${encodeURIComponent(p.id)}${store === 'history' ? '/history' : ''}`);
    if (!full.ok()) continue;
    const body = await full.json();
    const value = body.data;
    if (value !== null && value !== undefined) out[p.id] = value;
  }
  return out;
}

export async function savedProjects(page: Page) {
  return Object.fromEntries(Object.entries(await storedRecords(page)).map(([id, raw]) => [id, JSON.parse(raw)]));
}

/** Seed version history directly: blob in the same writeSnapshotStorage format. */
export async function seedHistory(page: Page, id: string, raw: string | object) {
  const res = await page.request.put(`/api/projects/${encodeURIComponent(id)}/history`, {
    data: { data: typeof raw === 'string' ? raw : JSON.stringify(raw) },
  });
  if (!res.ok()) throw new Error(`history seed failed: ${res.status()}`);
}

/** Seed a thumbnail for an already-seeded project. */
export async function seedThumbnail(page: Page, id: string, dataUrl: string) {
  const res = await page.request.put(`/api/projects/${encodeURIComponent(id)}/thumbnail`, { data: { dataUrl } });
  if (!res.ok()) throw new Error(`thumbnail seed failed: ${res.status()}`);
}

/** Inject failure at the actual persistence boundary, without changing app code. */
/** Library backup/restore/package actions live under the account page's data tab. */
export async function openDataTab(page: Page) {
  const heading = page.getByRole('heading', { name: 'Data & backups' });
  const tab = page.getByRole('button', { name: 'Data & backups', exact: true });
  // Drive the whole transition inside the poll: a pending client-side
  // navigation back to '/' can race a fresh goto, so retry whatever is needed.
  await expect.poll(async () => {
    if (await heading.count() > 0) return true;
    if (new URL(page.url()).pathname.endsWith('/account')) await tab.click().catch(() => {});
    else await page.goto('/account');
    return false;
  }, { timeout: 15_000 }).toBe(true);
}

export async function failProjectWrites(page: Page, flag = 'failProjectWrites') {
  await page.evaluate(flag => { (window as any)[flag] = true; }, flag);
  await page.route(/\/api\/(projects|library)(\/|$|\?)/, async route => {
    const failing = await page.evaluate(flag => (window as any)[flag] === true, flag).catch(() => false);
    if (failing && route.request().method() !== 'GET') {
      await route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not save to server storage. Download your project as JSON to keep a copy.' }),
      });
    } else await route.continue();
  });
}
