import { expect, test } from './fixtures';
import { readFile } from 'node:fs/promises';
import { seedProject, seedThumbnail } from './storage';

for (const mode of ['missing', 'saved', 'read failure'] as const) {
  test(`reserved project IDs use only saved thumbnails: ${mode}`, async ({ page }) => {
    const source = JSON.parse(await readFile('tests/fixtures/native-import.openplan.json', 'utf8'));
    const ids = ['__proto__', 'constructor', 'toString', 'ordinary-project'];
    // The server only accepts raster thumbnail payloads.
    const preview = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const imageRequests: string[] = [];
    page.on('request', request => {
      // Firefox reports the document favicon as an image request too.
      if (request.resourceType() === 'image' && /^https?:/.test(request.url())
        && request.url() !== 'http://127.0.0.1:4188/favicon.svg') imageRequests.push(request.url());
    });
    for (const id of ids) {
      await seedProject(page, { ...source, id, name: `Preview ${id}` });
      if (mode === 'saved') await seedThumbnail(page, id, preview);
    }
    if (mode === 'read failure') {
      // Thumbnails ride the project list; a read failure serves it without them.
      await page.route(/\/api\/projects$/, route => route.fetch().then(async res => {
        const body = await res.json();
        await route.fulfill({ response: res, json: { ...body, thumbnails: {} } });
      }));
    }
    await page.addInitScript(() => localStorage.setItem('hasSeenWelcome', 'true'));
    await page.goto('/dashboard');
    for (const id of ids) {
      const card = page.getByRole('link', { name: `Open Preview ${id}`, exact: true });
      await expect(card).toBeVisible();
      const img = card.locator('img');
      await expect(img).toHaveCount(mode === 'saved' ? 1 : 0);
      if (mode === 'saved') {
        await expect(img).toHaveAttribute('src', preview);
        await expect.poll(() => img.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      }
    }
    expect(imageRequests).toEqual([]);
  });
}
