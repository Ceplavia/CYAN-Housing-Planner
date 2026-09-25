import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordDigest } from '$lib/passwordDigest';

const expected = (pw: string) => createHash('sha256').update(`cyan-housing-planner:v1:${pw}`).digest('hex');

describe('passwordDigest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('matches sha256 of the domain-separated password', async () => {
    expect(await passwordDigest('CyanIssues66')).toBe(expected('CyanIssues66'));
    expect(await passwordDigest('')).toBe(expected(''));
    expect(await passwordDigest('密碼中文')).toBe(expected('密碼中文'));
  });

  it('produces the same digest without WebCrypto (insecure origins)', async () => {
    // http://lan-host has no crypto.subtle — the JS fallback must agree.
    const realCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { subtle: undefined, randomUUID: realCrypto.randomUUID.bind(realCrypto) });
    expect(await passwordDigest('CyanIssues66')).toBe(expected('CyanIssues66'));
  });
});
