<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { authMessage } from '$lib/i18n/authMessages';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { sessionQuota, refreshSessionQuota, signOut } from '$lib/services/session';

  let { data } = $props();
  const user = $derived(data.user ?? null);

  let current = $state('');
  let next = $state('');
  let confirm = $state('');
  let passwordError = $state<string | null>(null);
  let passwordChanged = $state(false);
  let busy = $state(false);

  onMount(() => { void refreshSessionQuota(); });

  $effect(() => { if (data && !user) goto(`${base}/`); });

  async function changePassword() {
    if (busy) return;
    if (next !== confirm) { passwordError = $t('auth.error.mismatch'); passwordChanged = false; return; }
    busy = true; passwordError = null; passwordChanged = false;
    try {
      const res = await fetch(`${base}/api/auth/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { passwordError = body?.error ?? $t('auth.error.passwordFailed'); return; }
      passwordChanged = true;
      current = next = confirm = '';
    } catch {
      passwordError = 'Could not reach the server. Check your connection and try again.';
    } finally { busy = false; }
  }
</script>

<div class="min-h-screen bg-gray-50">
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
      <a href={`${base}/`} class="text-2xl font-bold text-white">{$t('library.title')}</a>
      <a href={`${base}/`} class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm transition-all border border-white/20">
        {$t('account.back')}
      </a>
    </div>
  </div>

  <div class="max-w-xl mx-auto px-6 py-10 space-y-6">
    <!-- Profile -->
    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-800">{$t('account.title')}</h2>
      <dl class="mt-4 space-y-3 text-sm">
        <div class="flex justify-between gap-4">
          <dt class="text-gray-500">{$t('account.username')}</dt>
          <dd class="font-medium text-gray-800">{user?.username}</dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-gray-500">{$t('account.plan')}</dt>
          <dd class="font-medium text-gray-800">{user?.plan ?? 'free'}</dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-gray-500">{$t('account.storageLimit')}</dt>
          <dd class="font-medium text-gray-800">
            {$sessionQuota ? $t('account.quota', { used: $sessionQuota.projectCount, limit: $sessionQuota.projectLimit }) : '—'}
          </dd>
        </div>
      </dl>
      {#if $sessionQuota}
        <div class="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div class="h-full bg-blue-500 transition-all" style="width: {Math.min(100, ($sessionQuota.projectCount / $sessionQuota.projectLimit) * 100)}%"></div>
        </div>
      {/if}
    </section>

    <!-- Change password -->
    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-800">{$t('account.changePassword')}</h2>
      <form onsubmit={(event) => { event.preventDefault(); void changePassword(); }} class="mt-4 space-y-4">
        <div>
          <label for="account-current" class="block text-sm font-medium text-gray-700">{$t('auth.currentPassword')}</label>
          <input id="account-current" type="password" bind:value={current} autocomplete="current-password" required disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
        </div>
        <div>
          <label for="account-next" class="block text-sm font-medium text-gray-700">{$t('auth.newPassword')}</label>
          <input id="account-next" type="password" bind:value={next} autocomplete="new-password" required minlength="8" disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
        </div>
        <div>
          <label for="account-confirm" class="block text-sm font-medium text-gray-700">{$t('auth.confirmPassword')}</label>
          <input id="account-confirm" type="password" bind:value={confirm} autocomplete="new-password" required disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
        </div>
        {#if passwordError}<p role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-900">{authMessage(passwordError, $locale)}</p>{/if}
        {#if passwordChanged}<p role="status" class="rounded-lg bg-green-50 p-3 text-sm text-green-800">{$t('account.passwordChanged')}</p>{/if}
        <button type="submit" disabled={busy || !current || !next || !confirm}
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
          {busy ? $t('account.saving') : $t('account.changePassword')}
        </button>
      </form>
    </section>

    {#if user?.isAdmin}
      <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex items-center justify-between">
        <p class="text-sm text-gray-500">{$t('admin.help')}</p>
        <a href={`${base}/admin`}
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          {$t('admin.open')}
        </a>
      </section>
    {/if}

    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex items-center justify-between">
      <p class="text-sm text-gray-500">{$t('account.signOutHelp')}</p>
      <button onclick={() => void signOut()}
        class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
        {$t('auth.signOut')}
      </button>
    </section>
  </div>
</div>
