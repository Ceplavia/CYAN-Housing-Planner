import { test as base, expect, type APIRequest, type APIRequestContext, type BrowserContext } from '@playwright/test';

export const TEST_PASSWORD = 'e2e-test-password';
const BASE = 'http://127.0.0.1:4188';

export async function registerAccount(request: APIRequest): Promise<APIRequestContext> {
  const api = await request.newContext();
  const username = `e2e_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const res = await api.post(`${BASE}/api/auth/register`, { data: { username, password: TEST_PASSWORD } });
  if (!res.ok()) throw new Error(`e2e register failed: ${res.status()} ${await res.text()}`);
  return api;
}

/**
 * Every test gets a fresh account so project libraries stay isolated.
 * Specs that create their own browser contexts (e.g. persistent profiles)
 * must call signIn on that context — the fixture only covers the default one.
 */
export async function signIn(context: BrowserContext, api: APIRequestContext) {
  const state = await api.storageState();
  await context.addCookies(state.cookies);
}

export const test = base.extend({
  context: async ({ playwright, context }, use) => {
    // AdGuard's desktop app injects a userscript that runs its own rAF loop and
    // loads local.adguard.org resources, which breaks idle/render audits and
    // external-request assertions on machines where it is installed.
    await context.route(/local\.adguard\.org/, route => route.abort());
    const api = await registerAccount(playwright.request);
    try {
      await signIn(context, api);
      await use(context);
    } finally {
      // Remove the throwaway account and every row it owns (FK cascade).
      await api.delete(`${BASE}/api/auth/me`).catch(() => {});
      await api.dispose();
    }
  },
});

export { expect };
export type * from '@playwright/test';
