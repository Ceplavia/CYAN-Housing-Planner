import { expect, test } from './fixtures';
import { seedProject, storedRecords } from './storage';
import { readFile } from 'node:fs/promises';

test('storage observation reads the server library without writing', async ({ page }) => {
  // Observation is read-only: an empty account stays empty after reads.
  expect(await storedRecords(page)).toEqual({});
  expect(await storedRecords(page, 'history')).toEqual({});
  expect(await storedRecords(page, 'thumbnails')).toEqual({});
  expect(await storedRecords(page, 'meta')).toEqual({});

  const project = JSON.parse(await readFile('tests/fixtures/save-conflicts.openplan.json', 'utf8'));
  await seedProject(page, project);
  expect(await storedRecords(page)).toEqual({ [project.id]: JSON.stringify(project) });
  await expect(storedRecords(page, 'missing-store')).rejects.toThrow();
});
