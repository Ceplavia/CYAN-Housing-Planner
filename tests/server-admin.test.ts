import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Point storage at a throwaway directory before any server module opens it.
const dataDir = mkdtempSync(join(tmpdir(), 'cyan-admin-test-'));
process.env.DATA_DIR = dataDir;

const { database, resetDatabaseForTests } = await import('$lib/server/db');
const { createUser, createSession, sessionUser, verifyUser, AuthError } = await import('$lib/server/auth');
const { bootstrapAdmin } = await import('$lib/server/bootstrap');
const { listUsers, requireAdmin, updateUser } = await import('$lib/server/admin');
const lib = await import('$lib/server/userLibrary');

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
});

describe('admin bootstrap', () => {
  it('grants admin from env only while no admin exists', () => {
    const db = database();
    bootstrapAdmin(); // no env → no-op
    expect(db.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 0 });

    process.env.ADMIN_USERNAME = 'root';
    process.env.ADMIN_PASSWORD = 's3cret-admin';
    bootstrapAdmin();
    const root = db.prepare('SELECT id, is_admin FROM users WHERE username = ?').get('root') as { id: string; is_admin: number };
    expect(root.is_admin).toBe(1);
    expect(verifyUser('root', 's3cret-admin').isAdmin).toBe(true);

    // A second call with different env does nothing once an admin exists.
    process.env.ADMIN_USERNAME = 'root2';
    bootstrapAdmin();
    expect(db.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 1 });
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });

  it('promotes an existing matching user instead of duplicating', () => {
    const db = database();
    // Remove the bootstrap admin so the env seeding path is exercised again.
    db.prepare('DELETE FROM users WHERE is_admin = 1').run();
    const plain = createUser('Frances', 'a long enough password');
    expect(plain.isAdmin).toBe(false);
    process.env.ADMIN_USERNAME = 'frances'; // case-insensitive match
    process.env.ADMIN_PASSWORD = 'unused';
    bootstrapAdmin();
    expect((db.prepare('SELECT is_admin FROM users WHERE id = ?').get(plain.id) as { is_admin: number }).is_admin).toBe(1);
    expect(db.prepare('SELECT COUNT(*) n FROM users WHERE username = ?').get('frances')).toEqual({ n: 1 });
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
  });
});

describe('admin user management', () => {
  it('deactivates a user with a reason, kills their sessions, and reactivates', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', bonusProjects: 0, isAdmin: true };
    const user = createUser('Harper', 'a long enough password');
    const session = createSession(user.id);
    expect(sessionUser(session.token)?.id).toBe(user.id);

    updateUser(admin, user.id, { isActive: false, inactiveReason: 'Payment overdue' });
    expect(() => verifyUser('Harper', 'a long enough password'))
      .toThrowError(Object.assign(new AuthError(403, 'account.deactivated'), { details: { reason: 'Payment overdue' } }));
    expect(sessionUser(session.token)).toBeNull(); // existing session revoked at once

    updateUser(admin, user.id, { isActive: true });
    expect(verifyUser('Harper', 'a long enough password').id).toBe(user.id);
    expect((listUsers().find(u => u.id === user.id))!.inactiveReason).toBeNull();
  });

  it('refuses to let an admin deactivate or demote themselves', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', bonusProjects: 0, isAdmin: true };
    expect(() => updateUser(admin, admin.id, { isActive: false })).toThrow(AuthError);
    expect(() => updateUser(admin, admin.id, { isAdmin: false })).toThrow(AuthError);
    expect(() => updateUser(admin, 'missing', { isActive: false })).toThrow(AuthError);
  });

  it('plan + bonus drives the effective project limit', () => {
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    const admin = { id: adminRow.id, username: adminRow.username, plan: 'free', bonusProjects: 0, isAdmin: true };
    const user = createUser('Iris', 'a long enough password');
    process.env.MAX_PROJECTS_PER_USER = '5';
    try {
      expect(lib.projectLimit({ ...user })).toBe(5);
      updateUser(admin, user.id, { bonusProjects: 3 });
      const listed = listUsers().find(u => u.id === user.id)!;
      expect(listed.bonusProjects).toBe(3);
      expect(listed.projectLimit).toBe(8);
    } finally { delete process.env.MAX_PROJECTS_PER_USER; }
  });

  it('requireAdmin rejects anonymous and non-admin callers', () => {
    const user = createUser('Jules', 'a long enough password');
    expect(() => requireAdmin(null)).toThrow(AuthError);
    expect(() => requireAdmin(user)).toThrow(AuthError);
    const adminRow = database().prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get() as any;
    expect(requireAdmin({ id: adminRow.id, username: adminRow.username, plan: 'free', bonusProjects: 0, isAdmin: true }).isAdmin).toBe(true);
  });
});
