import { json } from '@sveltejs/kit';
import { AuthError } from '$lib/server/auth';
import { requireAdmin, updateUser, type AdminUserPatch } from '$lib/server/admin';

export async function PATCH({ locals, params, request }) {
  try {
    const admin = requireAdmin(locals.user);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request.' }, { status: 400 });
    const patch: AdminUserPatch = {};
    if ('isActive' in body) patch.isActive = Boolean(body.isActive);
    if ('inactiveReason' in body) patch.inactiveReason = body.inactiveReason == null ? null : String(body.inactiveReason);
    if ('plan' in body) patch.plan = String(body.plan);
    if ('bonusProjects' in body) patch.bonusProjects = Number(body.bonusProjects);
    if ('isAdmin' in body) patch.isAdmin = Boolean(body.isAdmin);
    updateUser(admin, params.id, patch);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
}
