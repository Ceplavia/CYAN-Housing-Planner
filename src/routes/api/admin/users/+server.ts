import { json } from '@sveltejs/kit';
import { AuthError } from '$lib/server/auth';
import { listUsers, requireAdmin } from '$lib/server/admin';

export function GET({ locals, url }) {
  try {
    requireAdmin(locals.user);
    return json(listUsers({
      q: url.searchParams.get('q') ?? undefined,
      page: Number(url.searchParams.get('page')) || undefined,
      pageSize: Number(url.searchParams.get('pageSize')) || undefined,
    }));
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
}
