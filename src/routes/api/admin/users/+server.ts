import { json } from '@sveltejs/kit';
import { AuthError } from '$lib/server/auth';
import { listUsers, requireAdmin } from '$lib/server/admin';

export function GET({ locals }) {
  try {
    requireAdmin(locals.user);
    return json({ users: listUsers() });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
}
