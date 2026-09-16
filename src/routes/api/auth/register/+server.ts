import { json } from '@sveltejs/kit';
import { AuthError, createSession, createUser, registrationOpen, setSessionCookie } from '$lib/server/auth';
import { rateLimited } from '$lib/server/rateLimit';

export async function POST({ request, cookies, url, getClientAddress }) {
  if (!registrationOpen()) return json({ error: 'Registration is closed on this server.' }, { status: 403 });
  if (rateLimited(`auth:${getClientAddress()}`, 20)) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }
  try {
    const body = await request.json();
    const user = createUser(String(body?.username ?? ''), String(body?.password ?? ''));
    const { token } = createSession(user.id);
    setSessionCookie(cookies, token, url.protocol === 'https:');
    return json({ username: user.username }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, { status: error.status });
    return json({ error: 'Could not create the account. Try again.' }, { status: 400 });
  }
}
