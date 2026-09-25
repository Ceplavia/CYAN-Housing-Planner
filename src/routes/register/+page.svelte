<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { authMessage } from '$lib/i18n/authMessages';
  import { goto, invalidateAll } from '$app/navigation';
  import { base } from '$app/paths';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

  let { data } = $props();

  let username = $state('');
  let password = $state('');
  let confirm = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  $effect(() => { if (data.user) goto(`${base}/`); });

  async function submit() {
    if (busy) return;
    if (password !== confirm) { error = $t('auth.error.mismatch'); return; }
    busy = true; error = null;
    try {
      const res = await fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { error = body?.error ?? $t('auth.error.registerFailed'); return; }
      await invalidateAll();
      await goto(`${base}/`);
    } catch {
      error = 'Could not reach the server. Check your connection and try again.';
    } finally { busy = false; }
  }
</script>

<div class="min-h-screen bg-gray-50">
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
      <a href={`${base}/`} class="text-2xl font-bold text-white">CYAN Housing Planner</a>
      <LanguageSwitcher />
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-16">
    <div class="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-800">{$t('auth.signUp')}</h2>
      <form onsubmit={(event) => { event.preventDefault(); void submit(); }} class="mt-5 space-y-4">
        <div>
          <label for="register-username" class="block text-sm font-medium text-gray-700">{$t('auth.username')}</label>
          <input id="register-username" type="text" bind:value={username} autocomplete="username" required disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
          <p class="mt-1 text-xs text-gray-400">{$t('auth.usernameHint')}</p>
        </div>
        <div>
          <label for="register-password" class="block text-sm font-medium text-gray-700">{$t('auth.password')}</label>
          <input id="register-password" type="password" bind:value={password} autocomplete="new-password" required minlength="8" disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
          <p class="mt-1 text-xs text-gray-400">{$t('auth.passwordHint')}</p>
        </div>
        <div>
          <label for="register-confirm" class="block text-sm font-medium text-gray-700">{$t('auth.confirmPassword')}</label>
          <input id="register-confirm" type="password" bind:value={confirm} autocomplete="new-password" required disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
        </div>
        {#if error}<p role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-900">{authMessage(error, $locale)}</p>{/if}
        <button type="submit" disabled={busy || !username || !password || !confirm}
          class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
          {busy ? $t('auth.signingUp') : $t('auth.signUp')}
        </button>
      </form>
      <p class="mt-5 text-center text-sm text-gray-500">
        {$t('auth.haveAccount')}
        <a href={`${base}/login`} class="font-semibold text-blue-600 underline">{$t('auth.signIn')}</a>
      </p>
    </div>
  </div>
</div>
