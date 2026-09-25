import { json } from '@sveltejs/kit';
import { AuthError, createSession, setSessionCookie, verifyUser } from '$lib/server/auth';
import { rateLimited } from '$lib/server/rateLimit';

export async function POST({ request, cookies, getClientAddress }) {
  if (rateLimited(`auth:${getClientAddress()}`, 20)) {
    return json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
  }
  try {
    const body = await request.json();
    // Clients send passwordHash — a sha256 digest of the password, never the
    // password itself. Plain `password` fields are rejected by the digest
    // format check inside verifyUser.
    const user = verifyUser(String(body?.username ?? ''), String(body?.passwordHash ?? ''));
    const { token } = createSession(user.id);
    // adapter-node reports url.protocol as https unless PROTOCOL_HEADER/ORIGIN
    // is configured, so trust the real forwarded scheme instead — a Secure
    // cookie set on a plain-HTTP origin gets dropped by browsers.
    setSessionCookie(cookies, token, request.headers.get('x-forwarded-proto') === 'https');
    return json({ username: user.username });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message, ...error.details }, { status: error.status });
    return json({ error: 'Could not sign in. Try again.' }, { status: 400 });
  }
}
