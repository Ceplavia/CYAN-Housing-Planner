import type { TranslationKey } from '$lib/i18n';

/**
 * The one password policy: 8–32 chars with upper+lowercase and a digit.
 * Enforced client-side — the wire carries a digest, so the server never
 * sees (and cannot inspect) the plaintext.
 */
export const PASSWORD_RULES: { key: TranslationKey; test: (pw: string) => boolean }[] = [
  { key: 'auth.ruleLen', test: (p) => p.length >= 8 && p.length <= 32 },
  { key: 'auth.ruleUpper', test: (p) => /[A-Z]/.test(p) },
  { key: 'auth.ruleLower', test: (p) => /[a-z]/.test(p) },
  { key: 'auth.ruleDigit', test: (p) => /[0-9]/.test(p) },
];

export function passwordValid(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
