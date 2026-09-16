import { json } from '@sveltejs/kit';
import { AuthError, changePassword, SESSION_COOKIE } from '$lib/server/auth';
import { rateLimited } from '$lib/server/rateLimit';

export async function POST({ request, locals, cookies, getClientAddress }) {
  if (!locals.user) return json({ error: 'Sign in required.' }, { status: 401 });
  if (rateLimited(`password:${getClientAddress()}`, 10)) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }
  try {
    const body = await request.json();
    changePassword(locals.user.id, String(body?.current ?? ''), String(body?.next ?? ''), cookies.get(SESSION_COOKIE));
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, { status: error.status });
    return json({ error: 'Could not change the password. Try again.' }, { status: 400 });
  }
}
