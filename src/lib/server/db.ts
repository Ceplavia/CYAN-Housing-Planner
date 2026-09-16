import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Self-hosted storage: one SQLite file per deployment. DATA_DIR lets Docker
 * users point at a mounted volume; the default keeps data beside the app.
 */
let db: DatabaseSync | undefined;

export function database(): DatabaseSync {
  if (!db) {
    const dir = process.env.DATA_DIR || 'data';
    mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(join(dir, 'cyan-housing-planner.db'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_hash TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        project_limit INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS projects (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      );
      CREATE TABLE IF NOT EXISTS thumbnails (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (user_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS history (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (user_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS recovery (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (user_id, id)
      );
    `);
  }
  return db;
}

/** Per-user default when users.project_limit is NULL; subscriptions can override per user. */
export function defaultProjectLimit(): number {
  const value = Number(process.env.MAX_PROJECTS_PER_USER);
  return Number.isInteger(value) && value > 0 ? value : 50;
}

/** Test helper: point subsequent connections at a different database. */
export function resetDatabaseForTests() {
  db?.close();
  db = undefined;
}
