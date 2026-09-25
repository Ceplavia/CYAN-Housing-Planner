import { database } from './db';
import { AuthError, type AuthUser } from './auth';
import { planLimit } from './userLibrary';

export interface AdminUserRow {
  id: string;
  username: string;
  plan: string;
  bonusProjects: number;
  isAdmin: boolean;
  isActive: boolean;
  inactiveReason: string | null;
  projectCount: number;
  projectLimit: number;
  createdAt: number;
}

/** Every admin API and page funnels through this check. */
export function requireAdmin(user: AuthUser | null): AuthUser {
  if (!user) throw new AuthError(401, 'Sign in required.');
  if (!user.isAdmin) throw new AuthError(403, 'Admin access required.');
  return user;
}

export function listUsers(): AdminUserRow[] {
  const rows = database().prepare(`
    SELECT u.id, u.username, u.plan, u.bonus_projects, u.is_admin, u.is_active,
           u.inactive_reason, u.created_at,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS project_count
    FROM users u ORDER BY u.created_at
  `).all() as unknown as {
    id: string; username: string; plan: string; bonus_projects: number;
    is_admin: number; is_active: number; inactive_reason: string | null;
    project_count: number; created_at: number;
  }[];
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    plan: row.plan,
    bonusProjects: row.bonus_projects,
    isAdmin: row.is_admin === 1,
    isActive: row.is_active === 1,
    inactiveReason: row.inactive_reason,
    projectCount: row.project_count,
    projectLimit: planLimit(row.plan) + row.bonus_projects,
    createdAt: row.created_at,
  }));
}

export interface AdminUserPatch {
  isActive?: boolean;
  inactiveReason?: string | null;
  plan?: string;
  bonusProjects?: number;
  isAdmin?: boolean;
}

/**
 * Applies admin edits. An admin cannot deactivate or demote themselves, so a
 * deployment always keeps at least one reachable admin.
 */
export function updateUser(admin: AuthUser, userId: string, patch: AdminUserPatch): void {
  const db = database();
  const target = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(userId) as { id: string; username: string; is_admin: number } | undefined;
  if (!target) throw new AuthError(404, 'User not found.');
  const self = target.id === admin.id;
  if (patch.isActive === false && self) throw new AuthError(400, 'You cannot deactivate your own account.');
  if (patch.isAdmin === false && self) throw new AuthError(400, 'You cannot remove your own admin access.');

  if (patch.isActive !== undefined) {
    db.prepare('UPDATE users SET is_active = ?, inactive_reason = ? WHERE id = ?')
      .run(patch.isActive ? 1 : 0, patch.isActive ? null : (patch.inactiveReason ?? null), userId);
    // Deactivation signs the user out everywhere at once.
    if (!patch.isActive) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  } else if (patch.inactiveReason !== undefined) {
    db.prepare('UPDATE users SET inactive_reason = ? WHERE id = ?').run(patch.inactiveReason, userId);
  }
  if (patch.plan !== undefined) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(patch.plan)) throw new AuthError(400, 'Invalid plan name.');
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(patch.plan, userId);
  }
  if (patch.bonusProjects !== undefined) {
    if (!Number.isInteger(patch.bonusProjects) || patch.bonusProjects < 0 || patch.bonusProjects > 100_000) {
      throw new AuthError(400, 'Bonus projects must be a whole number between 0 and 100000.');
    }
    db.prepare('UPDATE users SET bonus_projects = ? WHERE id = ?').run(patch.bonusProjects, userId);
  }
  if (patch.isAdmin !== undefined) {
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(patch.isAdmin ? 1 : 0, userId);
  }
}

