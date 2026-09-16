import { get, writable } from 'svelte/store';

export interface SessionUser {
  id: string;
  username: string;
  plan: string;
  projectLimit: number | null;
}

export interface SessionQuota {
  projectCount: number;
  projectLimit: number;
}

/** Populated from layout server data; null means the visitor is anonymous. */
export const sessionUser = writable<SessionUser | null>(null);
export const sessionQuota = writable<SessionQuota | null>(null);

export function applySessionUser(user: SessionUser | null) {
  sessionUser.set(user);
  if (!user) sessionQuota.set(null);
}

export async function refreshSessionQuota() {
  if (!get(sessionUser)) { sessionQuota.set(null); return; }
  try {
    const res = await fetch('/api/auth/me');
    const body = await res.json().catch(() => null);
    const user = body?.user;
    if (user) sessionQuota.set({ projectCount: user.projectCount, projectLimit: user.projectLimit });
  } catch {}
}

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  sessionUser.set(null);
  sessionQuota.set(null);
  window.location.assign('/');
}
