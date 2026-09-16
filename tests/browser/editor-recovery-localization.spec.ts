import { expect, test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { savedProjects, seedProject } from './storage';

test('Portuguese editor load failure keeps the stored plan and retries', async ({ page }) => {
  const source = JSON.parse(await readFile('tests/fixtures/save-conflicts.openplan.json', 'utf8'));
  await seedProject(page, source);
  await page.addInitScript(() => {
    localStorage.setItem('o3d_locale', 'pt');
    localStorage.setItem('hasSeenWelcome', 'true');
    (window as any).failProjectLoad = true;
  });
  // A project load failure must not erase or replace the stored plan.
  await page.route(/\/api\/projects\/[^/?]+$/, async route => {
    const failing = await page.evaluate(() => (window as any).failProjectLoad === true).catch(() => false);
    if (failing && route.request().method() === 'GET') {
      await route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not save to server storage. Download your project as JSON to keep a copy.' }),
      });
    } else await route.continue();
  });
  await page.goto(`/editor?id=${source.id}`);
  await expect(page.getByRole('alert')).toContainText('Não foi possível salvar no servidor.');
  await expect(page.getByRole('link', { name: 'Voltar aos projetos', exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup da biblioteca', exact: true }).click();
  const backup = JSON.parse(await readFile((await (await pending).path())!, 'utf8'));
  expect(backup.projects[source.id]).toBe(JSON.stringify(source));
  await page.evaluate(() => { (window as any).failProjectLoad = false; });
  await page.getByRole('button', { name: 'Tentar carregar novamente', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(Object.keys(await savedProjects(page))).toEqual([source.id]);
  expect((await savedProjects(page))[source.id]).toEqual(source);
});
