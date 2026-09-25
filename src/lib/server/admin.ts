import { database } from './db';
import { AuthError, type AuthUser } from './auth';
import { planLimit, effectivePlan, knownPlans } from './plans';

export interface AdminUserRow {
  id: string;
  username: string;
  /** The plan the admin granted — may be past its expiry. */
  plan: string;
  /** Paid-plan expiry (ms); null on free plans. */
  planExpiresAt: number | null;
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

export interface UserQuery {
  /** Case-insensitive substring match on the username. */
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface UserPage {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function listUsers(query: UserQuery = {}): UserPage {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));
  const q = query.q?.trim() ?? '';
  const where = q ? "WHERE u.username LIKE ? ESCAPE '\\'" : '';
  const params: string[] = q ? [`%${q.replace(/[%_]/g, c => '\\' + c)}%`] : [];
  const db = database();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).get(...params) as { n: number }).n;
  const rows = db.prepare(`
    SELECT u.id, u.username, u.plan, u.plan_expires_at, u.bonus_projects, u.is_admin, u.is_active,
           u.inactive_reason, u.created_at,
           (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS project_count
    FROM users u ${where} ORDER BY u.created_at LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as unknown as {
    id: string; username: string; plan: string; plan_expires_at: number | null; bonus_projects: number;
    is_admin: number; is_active: number; inactive_reason: string | null;
    project_count: number; created_at: number;
  }[];
  return {
    users: rows.map(row => ({
      id: row.id,
      username: row.username,
      plan: row.plan,
      planExpiresAt: row.plan_expires_at,
      bonusProjects: row.bonus_projects,
      isAdmin: row.is_admin === 1,
      isActive: row.is_active === 1,
      inactiveReason: row.inactive_reason,
      projectCount: row.project_count,
      // The quota follows the effective plan — an expired grant reads as free.
      projectLimit: planLimit(effectivePlan(row.plan, row.plan_expires_at)) + row.bonus_projects,
      createdAt: row.created_at,
    })),
    total, page, pageSize,
  };
}

export interface AdminUserPatch {
  isActive?: boolean;
  inactiveReason?: string | null;
  plan?: string;
  /** Paid-plan expiry in ms since epoch; null only valid alongside plan 'free'. */
  planExpiresAt?: number | null;
  bonusProjects?: number;
}

/**
 * Applies admin edits. Admin flags only ever come from the bootstrap env, so
 * there is no grant/demote here. An admin cannot deactivate themselves, which
 * keeps at least one reachable admin on every deployment.
 */
export function updateUser(admin: AuthUser, userId: string, patch: AdminUserPatch): void {
  const db = database();
  const target = db.prepare('SELECT id, username, plan, plan_expires_at FROM users WHERE id = ?')
    .get(userId) as { id: string; username: string; plan: string; plan_expires_at: number | null } | undefined;
  if (!target) throw new AuthError(404, 'User not found.');
  if (patch.isActive === false && target.id === admin.id) {
    throw new AuthError(400, 'You cannot deactivate your own account.');
  }

  if (patch.isActive !== undefined) {
    db.prepare('UPDATE users SET is_active = ?, inactive_reason = ? WHERE id = ?')
      .run(patch.isActive ? 1 : 0, patch.isActive ? null : (patch.inactiveReason ?? null), userId);
    // Deactivation signs the user out everywhere at once.
    if (!patch.isActive) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  } else if (patch.inactiveReason !== undefined) {
    db.prepare('UPDATE users SET inactive_reason = ? WHERE id = ?').run(patch.inactiveReason, userId);
  }
  // Plan changes are a single write: a paid plan must carry an expiry date
  // (either in this patch or already on the row); free always clears it.
  if (patch.plan !== undefined || patch.planExpiresAt !== undefined) {
    const plan = patch.plan ?? target.plan;
    const expiry = patch.planExpiresAt !== undefined ? patch.planExpiresAt : target.plan_expires_at;
    if (!knownPlans().includes(plan)) {
      throw new AuthError(400, `Unknown plan — pick one of: ${knownPlans().join(', ')}.`);
    }
    if (plan === 'free') {
      db.prepare('UPDATE users SET plan = ?, plan_expires_at = NULL WHERE id = ?').run('free', userId);
    } else {
      if (expiry === null || !Number.isFinite(expiry)) {
        throw new AuthError(400, 'A paid plan needs an expiry date.');
      }
      db.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?').run(plan, expiry, userId);
    }
  }
  if (patch.bonusProjects !== undefined) {
    if (!Number.isInteger(patch.bonusProjects) || patch.bonusProjects < 0 || patch.bonusProjects > 100_000) {
      throw new AuthError(400, 'Bonus projects must be a whole number between 0 and 100000.');
    }
    db.prepare('UPDATE users SET bonus_projects = ? WHERE id = ?').run(patch.bonusProjects, userId);
  }
}

