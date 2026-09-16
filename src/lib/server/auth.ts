import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { database } from './db';

export const SESSION_COOKIE = 'cyan_session';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

// scrypt parameters per RFC 7914; embedded in the stored string so parameters
// can be raised later without breaking existing hashes.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export interface AuthUser {
  id: string;
  username: string;
  plan: string;
  projectLimit: number | null;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) return false;
  const candidate = scryptSync(password, salt, SCRYPT.keylen, params);
  const expected = Buffer.from(key, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function createUser(username: string, password: string): AuthUser {
  const name = username.trim();
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(name)) {
    throw new AuthError(400, 'Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.');
  }
  if (password.length < 8 || password.length > 256) {
    throw new AuthError(400, 'Passwords need at least 8 characters.');
  }
  const id = crypto.randomUUID();
  try {
    database().prepare('INSERT INTO users (id, username, pass_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, hashPassword(password), Date.now());
  } catch (error) {
    if (error instanceof Error && /UNIQUE/.test(error.message)) {
      throw new AuthError(409, 'This username is already taken.');
    }
    throw error;
  }
  return { id, username: name, plan: 'free', projectLimit: null };
}

const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export function verifyUser(username: string, password: string): AuthUser {
  const row = database().prepare('SELECT id, username, pass_hash, plan, project_limit FROM users WHERE username = ?')
    .get(username.trim()) as { id: string; username: string; pass_hash: string; plan: string; project_limit: number | null } | undefined;
  // Unknown usernames still pay the scrypt cost so the response time does not reveal them.
  if (!verifyPassword(password, row?.pass_hash ?? DUMMY_HASH) || !row) {
    throw new AuthError(401, 'Wrong username or password.');
  }
  return { id: row.id, username: row.username, plan: row.plan, projectLimit: row.project_limit };
}

export function changePassword(userId: string, current: string, next: string, keepToken?: string): void {
  const row = database().prepare('SELECT username, pass_hash FROM users WHERE id = ?')
    .get(userId) as { username: string; pass_hash: string } | undefined;
  if (!row || !verifyPassword(current, row.pass_hash)) {
    throw new AuthError(403, 'Current password is incorrect.');
  }
  if (next.length < 8 || next.length > 256) {
    throw new AuthError(400, 'Passwords need at least 8 characters.');
  }
  database().prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(next), userId);
  // A password change signs out other sessions; this one just proved the old password.
  if (keepToken) database().prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken);
  else database().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_MS;
  database().prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, Date.now(), expiresAt);
  return { token, expiresAt };
}

export function sessionUser(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const row = database().prepare(`
    SELECT u.id, u.username, u.plan, u.project_limit, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
  `).get(token) as { id: string; username: string; plan: string; project_limit: number | null; expires_at: number } | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    database().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, username: row.username, plan: row.plan, projectLimit: row.project_limit };
}

export function deleteSession(token: string | undefined): void {
  if (token) database().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function setSessionCookie(cookies: Cookies, token: string, secure: boolean) {
  cookies.set(SESSION_COOKIE, token, {
    path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(cookies: Cookies) {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function registrationOpen(): boolean {
  return process.env.REGISTRATION_OPEN !== 'false';
}
