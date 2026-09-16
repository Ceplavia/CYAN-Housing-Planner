import { translate, type Locale, type TranslationKey } from './index';

type AuthKey = Extract<TranslationKey, `auth.error.${string}`>;
const messages = new Map<string, AuthKey>([
  ['Wrong username or password.', 'auth.error.credentials'],
  ['This username is already taken.', 'auth.error.taken'],
  ['Passwords need at least 8 characters.', 'auth.error.passwordLength'],
  ['Usernames are 3–32 characters: letters, numbers, dot, dash or underscore.', 'auth.error.usernameFormat'],
  ['Current password is incorrect.', 'auth.error.currentWrong'],
  ['Registration is closed on this server.', 'auth.error.closed'],
  ['Too many attempts. Try again in a minute.', 'auth.error.rateLimited'],
  ['Sign in required.', 'auth.error.required'],
  ['Could not create the account. Try again.', 'auth.error.registerFailed'],
  ['Could not sign in. Try again.', 'auth.error.loginFailed'],
  ['Could not change the password. Try again.', 'auth.error.passwordFailed'],
  ['Could not reach the server. Check your connection and try again.', 'auth.error.unreachable'],
]);

/** Translate known auth diagnostics without altering unknown error details. */
export function authMessage(message: string, language: Locale): string {
  const key = messages.get(message);
  return key ? translate(language, key) : message;
}
