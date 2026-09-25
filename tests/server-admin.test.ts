import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

// Server auth now takes the client-computed digest, not the raw password.
const dg = (p: string) => createHash('sha256').update(`cyan-housing-planner:v1:${p}`).digest('hex');

// Point storage at a throwaway directory before any server module opens it.
const dataDir = mkdtempSync(join(tmpdir(), 'cyan-admin-test-'));
process.env.DATA_DIR = dataDir;

const { database, resetDatabaseForTests } = await import('$lib/server/db');
const { createUser, createSession, sessionUser, verifyUser, AuthError } = await import('$lib/server/auth');
const { bootstrapAdmin } = await import('$lib/server/bootstrap');
const { listUsers, requireAdmin, updateUser } = await import('$lib/server/admin');
const { resetPlansForTests } = await import('$lib/server/plans');
const lib = await import('$lib/server/userLibrary');

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
});

describe('admin bootstrap', () => {
  it('syncs the env admin on every boot', async () => {
    const db = database();
    await bootstrapAdmin(); // no env → no-op
    expect(db.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 0 });

    process.env.ADMIN_USERNAME = 'root';
    process.env.ADMIN_PASSWORD = 's3cret-admin';
    await bootstrapAdmin();
    const root = db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get('root') as { id: string; is_admin: number };
    expect(root.is_admin).toBe(1);
    expect(verifyUser('root', dg('s3cret-admin')).isAdmin).toBe(true);

    // The env pair always ensures its admin — a second user gets its own row,
    // which doubles as the password-recovery path.
    process.env.ADMIN_USERNAME = 'root2';
    process.env.ADMIN_PASSWORD = 'other-pass';
    await bootstrapAdmin();
    expect(db.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 2 });
    expect(verifyUser('root2', dg('other-pass')).isAdmin).toBe(true);

    // Re-syncing rotates the stored credential back to the env password.
    process.env.ADMIN_USERNAME = 'root2';
    process.env.ADMIN_PASSWORD = 'rotated-pass';
    await bootstrapAdmin();
    expect(() => verifyUser('root2', dg('other-pass'))).toThrow(AuthError);
    expect(verifyUser('root2', dg('rotated-pass')).isAdmin).toBe(true);
    db.prepare('DELETE FROM users WHERE username = ?').run('root2');
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });

  it('promotes an existing matching user instead of duplicating', async () => {
    const db = database();
    // Remove the bootstrap admin so the env seeding path is exercised again.
    db.prepare('DELETE FROM users WHERE is_admin = 1').run();
    const plain = createUser('Frances', dg('a long enough password'));
    expect(plain.isAdmin).toBe(false);
    process.env.ADMIN_USERNAME = 'frances'; // case-insensitive match
    process.env.ADMIN_PASSWORD = 'unused';
    await bootstrapAdmin();
    expect((db.prepare('SELECT is_admin FROM users WHERE id = ?').get(plain.id) as { is_admin: number }).is_admin).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM users WHERE username = ?').get('frances')).toEqual({ n: 1 });
    expect(verifyUser('Frances', dg('unused')).isAdmin).toBe(true); // env password becomes the credential
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });
});

describe('admin user management', () => {
  it('deactivates a user with a reason, kills their sessions, and reactivates', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', planExpiresAt: null, bonusProjects: 0, isAdmin: true };
    const user = createUser('Harper', dg('a long enough password'));
    const session = createSession(user.id);
    expect(sessionUser(session.token)?.id).toBe(user.id);

    updateUser(admin, user.id, { isActive: false, inactiveReason: 'Payment overdue' });
    expect(() => verifyUser('Harper', dg('a long enough password')))
      .toThrowError(Object.assign(new AuthError(403, 'account.deactivated'), { details: { reason: 'Payment overdue' } }));
    expect(sessionUser(session.token)).toBeNull(); // existing session revoked at once

    updateUser(admin, user.id, { isActive: true });
    expect(verifyUser('Harper', dg('a long enough password')).id).toBe(user.id);
    expect((listUsers().users.find(u => u.id === user.id))!.inactiveReason).toBeNull();
  });

  it('refuses to let an admin deactivate themselves', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', planExpiresAt: null, bonusProjects: 0, isAdmin: true };
    expect(() => updateUser(admin, admin.id, { isActive: false })).toThrow(AuthError);
    expect(() => updateUser(admin, 'missing', { isActive: false })).toThrow(AuthError);
  });

  it('plan + bonus drives the effective project limit', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', planExpiresAt: null, bonusProjects: 0, isAdmin: true };
    const user = createUser('Iris', dg('a long enough password'));
    process.env.MAX_PROJECTS_PER_USER = '5';
    resetPlansForTests();
    try {
      expect(lib.projectLimit({ ...user })).toBe(5);
      updateUser(admin, user.id, { bonusProjects: 3 });
      const listed = listUsers().users.find(u => u.id === user.id)!;
      expect(listed.bonusProjects).toBe(3);
      expect(listed.projectLimit).toBe(8);
    } finally { delete process.env.MAX_PROJECTS_PER_USER; resetPlansForTests(); }
  });

  it('paid plans require an expiry date and fall back to free when past', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', planExpiresAt: null, bonusProjects: 0, isAdmin: true };
    const user = createUser('Kai', dg('a long enough password'));

    // A paid plan with no expiry is rejected outright.
    expect(() => updateUser(admin, user.id, { plan: 'pro' })).toThrow(AuthError);
    expect(() => updateUser(admin, user.id, { plan: 'bogus' })).toThrow(AuthError);

    const future = Date.now() + 86400000;
    updateUser(admin, user.id, { plan: 'pro', planExpiresAt: future });
    let listed = listUsers().users.find(u => u.id === user.id)!;
    expect(listed.plan).toBe('pro');
    expect(listed.planExpiresAt).toBe(future);
    expect(listed.projectLimit).toBe(200);

    // An expired grant reads as free again — including the quota.
    updateUser(admin, user.id, { planExpiresAt: Date.now() - 1000 });
    listed = listUsers().users.find(u => u.id === user.id)!;
    expect(listed.projectLimit).toBe(50);

    // Reverting to free clears the expiry.
    updateUser(admin, user.id, { plan: 'free' });
    expect(listUsers().users.find(u => u.id === user.id)!.planExpiresAt).toBeNull();
  });

  it('requireAdmin rejects anonymous and non-admin callers', () => {
    const user = createUser('Jules', dg('a long enough password'));
    expect(() => requireAdmin(null)).toThrow(AuthError);
    expect(() => requireAdmin(user)).toThrow(AuthError);
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    expect(requireAdmin({ id: adminRow.id, username: adminRow.username, plan: 'free', planExpiresAt: null, bonusProjects: 0, isAdmin: true }).isAdmin).toBe(true);
  });
});
