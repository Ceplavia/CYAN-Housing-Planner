import { json } from '@sveltejs/kit';
import { clearSessionCookie, deleteSession, SESSION_COOKIE } from '$lib/server/auth';

export async function POST({ cookies }) {
  deleteSession(cookies.get(SESSION_COOKIE));
  clearSessionCookie(cookies);
  return json({ ok: true });
}
