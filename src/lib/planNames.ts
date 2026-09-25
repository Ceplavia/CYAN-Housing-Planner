import type { TranslationKey } from '$lib/i18n';

/** Plan id → localized display name key; unknown ids fall back to the raw id. */
export const PLAN_NAME_KEYS: Record<string, TranslationKey> = {
  free: 'sub.free',
  pro: 'sub.namePro',
};
