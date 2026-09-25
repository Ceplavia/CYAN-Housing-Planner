import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roomProject } from './fixtures/project';

// Server auth now takes the client-computed digest, not the raw password.
const dg = (p: string) => createHash('sha256').update(`cyan-housing-planner:v1:${p}`).digest('hex');

// Point storage at a throwaway directory before any server module opens it.
const dataDir = mkdtempSync(join(tmpdir(), 'cyan-server-test-'));
process.env.DATA_DIR = dataDir;

const { database, resetDatabaseForTests } = await import('$lib/server/db');
const { createUser, verifyUser, createSession, sessionUser, changePassword, AuthError } = await import('$lib/server/auth');
const lib = await import('$lib/server/userLibrary');

afterAll(() => {
  resetDatabaseForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('server auth', () => {
  it('registers, signs in, and rejects bad credentials and duplicates', () => {
    const user = createUser('Ada', dg('correct horse battery'));
    expect(user.username).toBe('Ada');
    expect(() => createUser('ada', dg('another password'))).toThrow(AuthError); // case-insensitive uniqueness
    expect(() => verifyUser('Ada', dg('wrong password'))).toThrow(AuthError);
    expect(verifyUser('ada', dg('correct horse battery')).id).toBe(user.id); // case-insensitive sign-in
    expect(() => createUser('x', dg('short'))).toThrow(AuthError);
    expect(() => createUser('bad name!', dg('a long enough password'))).toThrow(AuthError);
  });

  it('creates sessions, resolves them to users, and clears others on password change', () => {
    const user = createUser('Grace', dg('first password ok'));
    const a = createSession(user.id), b = createSession(user.id);
    expect(sessionUser(a.token)?.id).toBe(user.id);
    expect(sessionUser('missing-token')).toBeNull();
    changePassword(user.id, dg('first password ok'), dg('second password ok'), a.token);
    expect(sessionUser(a.token)?.id).toBe(user.id); // the session that proved the old password stays
    expect(sessionUser(b.token)).toBeNull();        // other sessions sign out
    expect(verifyUser('Grace', dg('second password ok')).id).toBe(user.id);
  });
});

describe('server project storage', () => {
  it('stores per-user projects with revision checks and enforces the plan limit', async () => {
    const owner = createUser('Linus', dg('storage password'));
    const other = createUser('Margaret', dg('storage password'));
    const project = { ...roomProject(), id: 'shared-looking-id', name: 'House' };
    const raw = JSON.stringify(project);

    // Create → revision 1; wrong base revision → conflict; matching → bump.
    expect(lib.saveProject(owner, project.id, raw, null)).toBe(1);
    expect(() => lib.saveProject(owner, project.id, raw, null)).toThrow(lib.ConflictError);
    expect(lib.saveProject(owner, project.id, raw, 1)).toBe(2);
    expect(lib.getProject(owner.id, project.id)).toEqual({ data: raw, revision: 2 });

    // Other users cannot see, overwrite or delete it — IDs are scoped per user.
    expect(lib.getProject(other.id, project.id)).toBeNull();
    expect(lib.getProjectRevision(other.id, project.id)).toBeNull();
    expect(() => lib.saveProject(other, project.id, raw, 1)).toThrow(lib.ConflictError);
    expect(lib.deleteProject(other.id, project.id)).toBe(false);
    expect(lib.listProjects(other.id)).toEqual([]);
    expect(lib.listProjects(owner.id)[0]).toMatchObject({ id: project.id, name: 'House', revision: 2 });

    // The per-user limit blocks creation but never updates.
    const limited = createUser('Case', dg('storage password'));
    process.env.MAX_PROJECTS_PER_USER = '1';
    try {
      expect(() => lib.saveProject(limited, 'p1', JSON.stringify({ ...project, id: 'p1' }), null)).not.toThrow();
      expect(() => lib.saveProject(limited, 'p2', JSON.stringify({ ...project, id: 'p2' }), null))
        .toThrow(/Project limit reached \(1\/1\)/);
      expect(lib.saveProject(limited, 'p1', JSON.stringify({ ...project, id: 'p1' }), 1)).toBe(2); // updates still work
    } finally { delete process.env.MAX_PROJECTS_PER_USER; }

    // An admin-granted bonus stands in for a future subscription tier:
    // base plan 1 + bonus 2 = effective limit 3.
    process.env.MAX_PROJECTS_PER_USER = '1';
    try {
      database().prepare('UPDATE users SET bonus_projects = 2 WHERE id = ?').run(limited.id);
      limited.bonusProjects = 2;
      expect(lib.saveProject(limited, 'p2', JSON.stringify({ ...project, id: 'p2' }), null)).toBe(1);
      expect(lib.projectCount(limited.id)).toBe(2);
    } finally { delete process.env.MAX_PROJECTS_PER_USER; }
  });

  it('stores thumbnails, history and deletes them with the project', () => {
    const user = createUser('Nadia', dg('storage password'));
    lib.saveProject(user, 'p', JSON.stringify({ ...roomProject(), id: 'p' }), null);
    lib.saveThumbnail(user.id, 'p', 'data:image/png;base64,AAAA');
    lib.saveThumbnail(user.id, 'p', 'not a data url'); // rejected
    lib.saveThumbnail(user.id, 'missing', 'data:image/png;base64,AAAA'); // skipped
    expect(lib.getThumbnail(user.id, 'p')).toBe('data:image/png;base64,AAAA');
    expect(lib.listThumbnails(user.id)).toEqual({ p: 'data:image/png;base64,AAAA' });

    lib.setHistory(user.id, 'p', '[{"timestamp":1}]');
    expect(lib.getHistory(user.id, 'p')).toBe('[{"timestamp":1}]');
    lib.setHistory(user.id, 'p', null);
    expect(lib.getHistory(user.id, 'p')).toBeNull();
    lib.setHistory(user.id, 'p', '["v1"]');

    expect(lib.deleteProject(user.id, 'p')).toBe(true);
    expect(lib.getThumbnail(user.id, 'p')).toBeNull();
    expect(lib.getHistory(user.id, 'p')).toBeNull();
  });
});

describe('server library backup and restore', () => {
  it('round-trips the openplan3d-library format and enforces the limit atomically', async () => {
    const user = createUser('Restorer', dg('storage password'));
    const project = { ...roomProject(), id: 'src', name: 'My House' };
    lib.saveProject(user, 'src', JSON.stringify(project), null);
    lib.saveThumbnail(user.id, 'src', 'data:image/png;base64,AAAA');
    lib.setHistory(user.id, 'src', JSON.stringify([{ timestamp: 1, description: 'v', data: JSON.stringify(project) }]));

    const backup = lib.libraryBackup(user.id);
    const bundle = JSON.parse(backup);
    expect(bundle.format).toBe('openplan3d-library');
    expect(bundle.projects.src).toBe(JSON.stringify(project));
    expect(bundle.history.src).toContain('"timestamp"');

    // Restoring the same backup into the same account makes a fresh-ID copy.
    const result = await lib.restoreLibrary(user, backup);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toContain('Restored copy');
    expect(result.projects[0].id).not.toBe('src');
    const copyId = result.projects[0].id;
    expect(lib.getThumbnail(user.id, copyId)).toBe('data:image/png;base64,AAAA');
    expect(JSON.parse(lib.getHistory(user.id, copyId)!)[0].description).toBe('v');

    // A quota breach mid-restore rolls the whole restore back.
    const limited = createUser('Quota', dg('storage password'));
    process.env.MAX_PROJECTS_PER_USER = '1';
    try {
      const two = JSON.stringify({
        a: JSON.stringify({ ...project, id: 'a' }),
        b: JSON.stringify({ ...project, id: 'b' }),
      });
      await expect(lib.restoreLibrary(limited, two)).rejects.toThrow(/Project limit reached/);
      expect(lib.projectCount(limited.id)).toBe(0); // nothing half-restored
    } finally { delete process.env.MAX_PROJECTS_PER_USER; }
  });
});
