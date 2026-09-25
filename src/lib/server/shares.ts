import { randomBytes } from 'node:crypto';
import { database } from './db';
import { hasProject, getProject, StoreError } from './userLibrary';

/**
 * Share links: one revocable token per project. The token is the only secret
 * (12 chars from a 62-symbol alphabet ≈ 71 bits) — an optional password adds a
 * second layer for sensitive plans. Passwords are stored in plain text on
 * purpose: they are a shareable convenience secret the owner is allowed to
 * read back in the dialog, not an account credential.
 */
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LENGTH = 12;

interface ShareRow {
  token: string;
  user_id: string;
  project_id: string;
  password: string | null;
  expires_at: number | null;
  created_at: number;
}

export interface Share {
  token: string;
  projectId: string;
  password: string | null;
  expiresAt: number | null;
  createdAt: number;
}

function toShare(row: ShareRow): Share {
  return {
    token: row.token,
    projectId: row.project_id,
    password: row.password,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mintToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH);
  let token = '';
  for (const b of bytes) token += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return token;
}

/** The owner's view of a project's share row, or null when none exists. */
export function getShare(userId: string, projectId: string): Share | null {
  const row = database().prepare('SELECT * FROM shares WHERE user_id = ? AND project_id = ?')
    .get(userId, projectId) as ShareRow | undefined;
  return row ? toShare(row) : null;
}

/**
 * Creates a share for a project the caller owns. One share per project —
 * callers wanting a fresh token go through regenerateShare.
 */
export function createShare(
  userId: string,
  projectId: string,
  options: { expiresAt?: number | null; password?: string | null } = {},
): Share {
  if (!hasProject(userId, projectId)) throw new StoreError(404, 'Project not found.');
  if (getShare(userId, projectId)) throw new StoreError(409, 'This project already has a share link.');
  const password = options.password?.trim() || null;
  const expiresAt = options.expiresAt ?? null;
  const db = database();
  // Collision odds are negligible; the primary key rejects them anyway, so retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = mintToken();
    try {
      db.prepare('INSERT INTO shares (token, user_id, project_id, password, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(token, userId, projectId, password, expiresAt, Date.now());
      return getShare(userId, projectId)!;
    } catch (error) {
      if (!(error instanceof Error && /UNIQUE.*token/.test(error.message))) throw error;
    }
  }
  throw new StoreError(500, 'Could not allocate a share token.');
}

/** Edits expiry/password on the existing share. */
export function updateShare(
  userId: string,
  projectId: string,
  patch: { expiresAt?: number | null; password?: string | null },
): Share {
  const existing = getShare(userId, projectId);
  if (!existing) throw new StoreError(404, 'This project has no share link.');
  const db = database();
  if (patch.expiresAt !== undefined) {
    db.prepare('UPDATE shares SET expires_at = ? WHERE user_id = ? AND project_id = ?')
      .run(patch.expiresAt, userId, projectId);
  }
  if (patch.password !== undefined) {
    db.prepare('UPDATE shares SET password = ? WHERE user_id = ? AND project_id = ?')
      .run(patch.password?.trim() || null, userId, projectId);
  }
  return getShare(userId, projectId)!;
}

/** New token, same settings — old links die immediately. */
export function regenerateShare(userId: string, projectId: string): Share {
  const existing = getShare(userId, projectId);
  if (!existing) throw new StoreError(404, 'This project has no share link.');
  const db = database();
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = mintToken();
    try {
      db.prepare('UPDATE shares SET token = ? WHERE token = ?').run(token, existing.token);
      return getShare(userId, projectId)!;
    } catch (error) {
      if (!(error instanceof Error && /UNIQUE.*token/.test(error.message))) throw error;
    }
  }
  throw new StoreError(500, 'Could not allocate a share token.');
}

export function deleteShare(userId: string, projectId: string): boolean {
  const result = database().prepare('DELETE FROM shares WHERE user_id = ? AND project_id = ?').run(userId, projectId);
  return result.changes > 0;
}

export type ShareAccess =
  | { status: 'ok'; project: string; name: string; owner: string }
  | { status: 'password' }
  | { status: 'expired' }
  | { status: 'missing' };

/**
 * Public resolution: the token alone is enough for password-less shares; a
 * share with a password only yields its payload after verifySharePassword.
 */
export function resolveShare(token: string, password?: string): ShareAccess {
  const row = database().prepare('SELECT * FROM shares WHERE token = ?').get(token) as ShareRow | undefined;
  if (!row) return { status: 'missing' };
  if (row.expires_at !== null && row.expires_at < Date.now()) return { status: 'expired' };
  if (row.password !== null && row.password !== (password ?? '')) return { status: 'password' };

  const project = getProject(row.user_id, row.project_id);
  if (!project) return { status: 'missing' }; // cascade normally beats us here
  const owner = database().prepare('SELECT username FROM users WHERE id = ?').get(row.user_id) as { username: string } | undefined;
  let name = 'Shared plan';
  try {
    const parsed = JSON.parse(project.data);
    if (typeof parsed?.name === 'string' && parsed.name) name = parsed.name;
  } catch {}
  return { status: 'ok', project: project.data, name, owner: owner?.username ?? 'unknown' };
}
