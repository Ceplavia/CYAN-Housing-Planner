import { database } from './db';
import { planLimit } from './plans';
export { planLimit };
import type { AuthUser } from './auth';
import { prepareLibraryRestore, type LibrarySink, type RestoreResult } from '$lib/services/libraryRestore';

/** Errors whose message is already safe to show in the client UI. */
export class StoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

export class ConflictError extends StoreError {
  constructor() {
    super(409, 'This project changed or was deleted in another tab. Save your version as a copy or download a JSON backup to keep both versions.');
    this.name = 'ConflictError';
  }
}

export interface ProjectRow {
  user_id: string;
  id: string;
  data: string;
  revision: number;
  created_at: number;
  updated_at: number;
}

/** Effective limit = the plan's base allowance plus admin-granted bonus slots. */
export function projectLimit(user: AuthUser): number {
  return planLimit(user.plan) + user.bonusProjects;
}

export function projectCount(userId: string): number {
  return (database().prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(userId) as { n: number }).n;
}

export function listProjects(userId: string) {
  const rows = database().prepare(
    'SELECT id, data, revision, updated_at FROM projects WHERE user_id = ?'
  ).all(userId) as unknown as Pick<ProjectRow, 'id' | 'data' | 'revision' | 'updated_at'>[];
  return rows.map(row => {
    try {
      const parsed = JSON.parse(row.data);
      if (!parsed || typeof parsed.name !== 'string' || typeof parsed.updatedAt !== 'string'
          || !Number.isFinite(Date.parse(parsed.updatedAt))) throw new Error();
      return { id: row.id, name: parsed.name, updatedAt: parsed.updatedAt, revision: row.revision };
    } catch {
      // Damaged rows stay listed so their owner can still open or delete them.
      return { id: row.id, name: `Unreadable project — ${row.id}`, updatedAt: new Date(0).toISOString(), revision: row.revision };
    }
  });
}

export function listThumbnails(userId: string): Record<string, string> {
  const rows = database().prepare('SELECT project_id, data FROM thumbnails WHERE user_id = ?').all(userId) as unknown as { project_id: string; data: string }[];
  return Object.fromEntries(rows.map(row => [row.project_id, row.data]));
}

export function hasProject(userId: string, id: string): boolean {
  return database().prepare('SELECT 1 FROM projects WHERE user_id = ? AND id = ?').get(userId, id) !== undefined;
}

export function getProjectRevision(userId: string, id: string): number | null {
  const row = database().prepare('SELECT revision FROM projects WHERE user_id = ? AND id = ?').get(userId, id) as { revision: number } | undefined;
  return row?.revision ?? null;
}

/** Load returns the stored raw text so callers keep damaged bytes recoverable. */
export function getProject(userId: string, id: string): { data: string; revision: number } | null {
  const row = database().prepare('SELECT data, revision FROM projects WHERE user_id = ? AND id = ?')
    .get(userId, id) as { data: string; revision: number } | undefined;
  return row ?? null;
}

/**
 * Compare-and-write: baseRevision is the revision the client last saw
 * (null = must not exist). New projects count against the user's limit.
 */
export function saveProject(user: AuthUser, id: string, data: string, baseRevision: number | null): number {
  const db = database();
  const existing = getProjectRevision(user.id, id);
  if (existing !== baseRevision) throw new ConflictError();
  if (existing === null) {
    const limit = projectLimit(user);
    const used = projectCount(user.id);
    if (used >= limit) {
      throw new StoreError(403, `Project limit reached (${used}/${limit}). Delete a saved plan first, or export it as JSON.`);
    }
    db.prepare('INSERT INTO projects (user_id, id, data, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
      .run(user.id, id, data, Date.now(), Date.now());
    return 1;
  }
  db.prepare('UPDATE projects SET data = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND id = ?')
    .run(data, Date.now(), user.id, id);
  return existing + 1;
}

export function deleteProject(userId: string, id: string): boolean {
  const db = database();
  const result = db.prepare('DELETE FROM projects WHERE user_id = ? AND id = ?').run(userId, id);
  db.prepare('DELETE FROM thumbnails WHERE user_id = ? AND project_id = ?').run(userId, id);
  db.prepare('DELETE FROM history WHERE user_id = ? AND project_id = ?').run(userId, id);
  return result.changes > 0;
}

export function saveThumbnail(userId: string, projectId: string, dataUrl: string): void {
  if (!/^data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)) return;
  if (getProjectRevision(userId, projectId) === null) return;
  database().prepare('INSERT INTO thumbnails (user_id, project_id, data) VALUES (?, ?, ?) ON CONFLICT (user_id, project_id) DO UPDATE SET data = excluded.data')
    .run(userId, projectId, dataUrl);
}

export function getThumbnail(userId: string, projectId: string): string | null {
  const row = database().prepare('SELECT data FROM thumbnails WHERE user_id = ? AND project_id = ?')
    .get(userId, projectId) as { data: string } | undefined;
  return row?.data ?? null;
}

export function getHistory(userId: string, projectId: string): string | null {
  const row = database().prepare('SELECT data FROM history WHERE user_id = ? AND project_id = ?')
    .get(userId, projectId) as { data: string } | undefined;
  return row?.data ?? null;
}

export function setHistory(userId: string, projectId: string, data: string | null): void {
  const db = database();
  if (data === null) db.prepare('DELETE FROM history WHERE user_id = ? AND project_id = ?').run(userId, projectId);
  else db.prepare('INSERT INTO history (user_id, project_id, data) VALUES (?, ?, ?) ON CONFLICT (user_id, project_id) DO UPDATE SET data = excluded.data')
    .run(userId, projectId, data);
}

/**
 * Whole-library backup in the same openplan3d-library format the browser used,
 * including retained recovery archives so nothing is lost between restores.
 */
export function libraryBackup(userId: string): string {
  const db = database();
  const projects = Object.fromEntries(
    (db.prepare('SELECT id, data FROM projects WHERE user_id = ?').all(userId) as unknown as { id: string; data: string }[]).map(r => [r.id, r.data]));
  const thumbnails = Object.fromEntries(
    (db.prepare('SELECT project_id, data FROM thumbnails WHERE user_id = ?').all(userId) as unknown as { project_id: string; data: string }[]).map(r => [r.project_id, r.data]));
  const history = Object.fromEntries(
    (db.prepare('SELECT project_id, data FROM history WHERE user_id = ?').all(userId) as unknown as { project_id: string; data: string }[]).map(r => [r.project_id, r.data]));
  const recovery = Object.fromEntries(
    (db.prepare('SELECT id, data FROM recovery WHERE user_id = ?').all(userId) as unknown as { id: string; data: string }[]).map(r => [r.id, r.data]));
  return JSON.stringify({ format: 'openplan3d-library', version: 1, projects, thumbnails, history, recovery });
}

/**
 * Restore runs the same validator the client previewed, against a database
 * sink inside one SQLite transaction — a partial restore is never committed.
 */
export async function restoreLibrary(user: AuthUser, raw: string, suffix?: string): Promise<RestoreResult> {
  const preview = prepareLibraryRestore(raw, 'Library backup', suffix || 'Restored copy');
  const userId = user.id;
  const db = database();
  const sink: LibrarySink = {
    async projectExists(id) { return hasProject(userId, id); },
    async addProject(id, projectRaw) {
      const limit = projectLimit(user);
      const used = projectCount(userId);
      if (used >= limit) {
        throw new StoreError(403, `Project limit reached (${used}/${limit}). Delete a saved plan first, or export it as JSON.`);
      }
      db.prepare('INSERT INTO projects (user_id, id, data, revision, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
        .run(userId, id, projectRaw, Date.now(), Date.now());
    },
    async addThumbnail(id, dataUrl) {
      db.prepare('INSERT INTO thumbnails (user_id, project_id, data) VALUES (?, ?, ?)').run(userId, id, dataUrl);
    },
    async addHistory(id, data) {
      db.prepare('INSERT INTO history (user_id, project_id, data) VALUES (?, ?, ?)').run(userId, id, data);
    },
    async recoveryAt(id) {
      const row = db.prepare('SELECT data FROM recovery WHERE user_id = ? AND id = ?').get(userId, id) as { data: string } | undefined;
      return row?.data ?? null;
    },
    async addRecovery(id, data) {
      db.prepare('INSERT INTO recovery (user_id, id, data) VALUES (?, ?, ?)').run(userId, id, data);
    },
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = await preview.restoreWith(sink);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
