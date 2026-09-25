import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { roomProject } from './fixtures/project';

const dataDir = mkdtempSync(join(tmpdir(), 'cyan-share-test-'));
process.env.DATA_DIR = dataDir;

import { createHash } from 'node:crypto';
const { database, resetDatabaseForTests } = await import('$lib/server/db');
// Server auth now takes the client-computed digest, not the raw password.
const dg = (p: string) => createHash('sha256').update(`cyan-housing-planner:v1:${p}`).digest('hex');
const { createUser } = await import('$lib/server/auth');
const lib = await import('$lib/server/userLibrary');
const shares = await import('$lib/server/shares');
const { runJanitorOnce } = await import('$lib/server/janitor');

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

function project(user: { id: string; bonusProjects: number; plan: string }, id = 'plan-1') {
  const p = { ...roomProject(), id, name: 'Harbour Flat' };
  lib.saveProject(user as any, id, JSON.stringify(p), null);
  return p;
}

describe('share links', () => {
  it('creates one 12-char link per project and blocks a second', () => {
    const user = createUser('Sharer', dg('a long enough password'));
    project(user);
    const share = shares.createShare(user.id, 'plan-1', { password: 'pw', expiresAt: Date.now() + 1000 });
    expect(share.token).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(share.password).toBe('pw');
    expect(share.expiresAt).not.toBeNull();
    expect(() => shares.createShare(user.id, 'plan-1')).toThrowError(/already has a share link/);
    expect(() => shares.createShare(user.id, 'nope')).toThrowError(/not found/i);
  });

  it('resolves password-less and password-protected shares publicly', () => {
    const user = createUser('Opener', dg('a long enough password'));
    project(user, 'open');
    const free = shares.createShare(user.id, 'open');
    expect(shares.resolveShare(free.token)).toMatchObject({ status: 'ok', name: 'Harbour Flat', owner: 'Opener' });

    project(user, 'locked');
    const locked = shares.createShare(user.id, 'locked', { password: 's3cret' });
    expect(shares.resolveShare(locked.token)).toEqual({ status: 'password' });
    expect(shares.resolveShare(locked.token, 'wrong')).toEqual({ status: 'password' });
    const ok = shares.resolveShare(locked.token, 's3cret');
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') expect(JSON.parse(ok.project).name).toBe('Harbour Flat');
  });

  it('enforces expiry, and supports edits, regeneration and revoke', () => {
    const user = createUser('Timer', dg('a long enough password'));
    project(user, 'timed');
    const share = shares.createShare(user.id, 'timed');

    // Past expiry → gone for visitors but still listed for the owner.
    database().prepare('UPDATE shares SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, share.token);
    expect(shares.resolveShare(share.token)).toEqual({ status: 'expired' });
    expect(shares.getShare(user.id, 'timed')!.token).toBe(share.token);

    const updated = shares.updateShare(user.id, 'timed', { expiresAt: null, password: 'new-pw' });
    expect(updated.expiresAt).toBeNull();
    expect(shares.resolveShare(share.token)).toEqual({ status: 'password' });
    expect(shares.resolveShare(share.token, 'new-pw').status).toBe('ok');

    // Regenerate keeps settings but kills the old token.
    const fresh = shares.regenerateShare(user.id, 'timed');
    expect(fresh.token).not.toBe(share.token);
    expect(fresh.password).toBe('new-pw');
    expect(shares.resolveShare(share.token)).toEqual({ status: 'missing' });
    expect(shares.resolveShare(fresh.token, 'new-pw').status).toBe('ok');

    expect(shares.deleteShare(user.id, 'timed')).toBe(true);
    expect(shares.resolveShare(fresh.token)).toEqual({ status: 'missing' });
    expect(shares.deleteShare(user.id, 'timed')).toBe(false);
  });

  it('dies with the project via cascade', () => {
    const user = createUser('Cascade', dg('a long enough password'));
    project(user, 'doomed');
    const share = shares.createShare(user.id, 'doomed');
    expect(shares.resolveShare(share.token).status).toBe('ok');
    lib.deleteProject(user.id, 'doomed');
    expect(shares.resolveShare(share.token)).toEqual({ status: 'missing' });
  });

  it('never exposes another user\'s share settings', () => {
    const a = createUser('Alice', dg('a long enough password'));
    const b = createUser('Bob', dg('a long enough password'));
    project(a, 'hers');
    shares.createShare(a.id, 'hers', { password: 'keep' });
    // Bob has no project 'hers' and cannot see or edit Alice's share row.
    expect(shares.getShare(b.id, 'hers')).toBeNull();
    expect(() => shares.updateShare(b.id, 'hers', { password: 'pwn' })).toThrowError(/no share link/);
    expect(shares.deleteShare(b.id, 'hers')).toBe(false);
    expect(shares.getShare(a.id, 'hers')!.password).toBe('keep');
  });
  it('janitor removes shares expired over 7 days and dead sessions', () => {
    const user = createUser('Cleaner', dg('a long enough password'));
    project(user, 'old');
    project(user, 'fresh');
    const now = Date.now();
    const stale = shares.createShare(user.id, 'old', { expiresAt: now - 8 * 86400000 });
    shares.createShare(user.id, 'fresh', { expiresAt: now - 86400000 }); // expired < 7d ago: kept
    const db = database();
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run('dead-session', user.id, now - 1, now - 1);
    runJanitorOnce(now);
    expect(shares.resolveShare(stale.token)).toEqual({ status: 'missing' });
    expect(shares.getShare(user.id, 'fresh')).not.toBeNull();
    expect(db.prepare('SELECT COUNT(*) n FROM sessions WHERE token = ?').get('dead-session')).toEqual({ n: 0 });
  });
});
