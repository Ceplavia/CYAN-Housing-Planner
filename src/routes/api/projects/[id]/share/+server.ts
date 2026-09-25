import { json } from '@sveltejs/kit';
import { StoreError } from '$lib/server/userLibrary';
import { createShare, deleteShare, getShare, regenerateShare, updateShare } from '$lib/server/shares';

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed offer, matching the dialog: 1 day / 7 days / 30 days / never.
const EXPIRY_CHOICES = new Set([1, 7, 30]);

function expiresFrom(body: { expiresInDays?: unknown }): number | null | undefined {
  if (!('expiresInDays' in body)) return undefined;
  const days = body.expiresInDays;
  if (days === null) return null;
  if (typeof days !== 'number' || !EXPIRY_CHOICES.has(days)) {
    throw new StoreError(400, 'Expiry must be 1, 7 or 30 days — or null for no expiry.');
  }
  return Date.now() + days * DAY_MS;
}

function passwordFrom(body: { password?: unknown }): string | null | undefined {
  if (!('password' in body)) return undefined;
  const password = body.password;
  if (password === null) return null;
  if (typeof password !== 'string' || password.length > 128) {
    throw new StoreError(400, 'Password must be a string of at most 128 characters.');
  }
  return password;
}

/** The owner's view of this project's share link (null when none exists). */
export function GET({ params, locals }) {
  return json({ share: getShare(locals.user!.id, params.id) });
}

export async function POST({ params, locals, request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const expiresAt = expiresFrom(body);
    const password = passwordFrom(body);
    const share = body?.regenerate === true
      ? regenerateShare(locals.user!.id, params.id)
      : createShare(locals.user!.id, params.id, {
          expiresAt: expiresAt === undefined ? null : expiresAt,
          password: password === undefined ? null : password,
        });
    return json({ share });
  } catch (error) {
    if (error instanceof StoreError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function PATCH({ params, locals, request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const expiresAt = expiresFrom(body);
    const password = passwordFrom(body);
    return json({ share: updateShare(locals.user!.id, params.id, { expiresAt, password }) });
  } catch (error) {
    if (error instanceof StoreError) return json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export function DELETE({ params, locals }) {
  return json({ deleted: deleteShare(locals.user!.id, params.id) });
}
