<script lang="ts">
  import { t, locale, type TranslationKey } from '$lib/i18n';
  import { authMessage } from '$lib/i18n/authMessages';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { sessionQuota, refreshSessionQuota } from '$lib/services/session';
  import { downloadActiveLibraryBackup } from '$lib/services/datastore';
  import SiteHeader from '$lib/components/SiteHeader.svelte';
  import LibraryRestoreDialog from '$lib/components/LibraryRestoreDialog.svelte';
  import ProjectPackageDialog from '$lib/components/ProjectPackageDialog.svelte';

  let { data } = $props();
  const user = $derived(data.user ?? null);

  type Tab = 'profile' | 'security' | 'data';
  let tab = $state<Tab>('profile');

  let current = $state('');
  let next = $state('');
  let confirm = $state('');
  let passwordError = $state<string | null>(null);
  let passwordChanged = $state(false);
  let busy = $state(false);

  let restoreOpen = $state(false);
  let packageOpen = $state(false);
  let backupFailed = $state(false);

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

  async function backupLibrary() {
    backupFailed = false;
    try { await downloadActiveLibraryBackup(); }
    catch { backupFailed = true; }
  }

  const noopRestored = async () => {};
  const tabs: [Tab, TranslationKey][] = [
    ['profile', 'account.tab.profile'],
    ['security', 'account.tab.security'],
    ['data', 'account.tab.data'],
  ];
</script>

<div class="min-h-screen bg-gray-50">
  <SiteHeader>
    <a href={`${base}/dashboard`} class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm transition-all border border-white/20">
      {$t('account.back')}
    </a>
  </SiteHeader>

  <div class="max-w-4xl mx-auto px-6 py-10 md:flex md:gap-8">
    <!-- Left tab navigation -->
    <nav class="mb-6 flex gap-2 overflow-x-auto md:mb-0 md:w-48 md:flex-col md:gap-1" aria-label={$t('account.title')}>
      {#each tabs as [key, label]}
        <button onclick={() => tab = key as Tab}
          aria-current={tab === key ? 'page' : undefined}
          class="whitespace-nowrap rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors
            {tab === key ? 'bg-white text-slate-800 shadow-sm border border-gray-200' : 'text-gray-500 hover:bg-white/60'}">
          {$t(label)}
        </button>
      {/each}
    </nav>

    <div class="flex-1 min-w-0 space-y-6">
      {#if tab === 'profile'}
        <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-800">{$t('account.tab.profile')}</h2>
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

      {:else if tab === 'security'}
        <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-800">{$t('account.changePassword')}</h2>
          <p class="mt-1 text-sm text-gray-500">{$t('account.passwordHelp')}</p>
          <form onsubmit={(event) => { event.preventDefault(); void changePassword(); }} class="mt-4 space-y-4 max-w-sm">
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

      {:else}
        <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-lg font-semibold text-gray-800">{$t('account.tab.data')}</h2>
          {#if backupFailed}<p role="alert" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{$t('account.backupFailed')}</p>{/if}
          <ul class="mt-4 divide-y divide-gray-100">
            <li class="flex items-center justify-between gap-4 py-4">
              <div>
                <p class="text-sm font-medium text-gray-800">{$t('library.backup')}</p>
                <p class="mt-0.5 text-xs text-gray-500">{$t('account.backupDesc')}</p>
              </div>
              <button onclick={() => void backupLibrary()}
                class="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {$t('account.download')}
              </button>
            </li>
            <li class="flex items-center justify-between gap-4 py-4">
              <div>
                <p class="text-sm font-medium text-gray-800">{$t('library.restore')}</p>
                <p class="mt-0.5 text-xs text-gray-500">{$t('account.restoreDesc')}</p>
              </div>
              <button onclick={() => restoreOpen = true}
                class="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {$t('account.restore')}
              </button>
            </li>
            <li class="flex items-center justify-between gap-4 py-4">
              <div>
                <p class="text-sm font-medium text-gray-800">{$t('library.package')}</p>
                <p class="mt-0.5 text-xs text-gray-500">{$t('account.packageDesc')}</p>
              </div>
              <button onclick={() => packageOpen = true}
                class="shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {$t('account.import')}
              </button>
            </li>
          </ul>
        </section>
      {/if}
    </div>
  </div>
</div>

{#if restoreOpen}<LibraryRestoreDialog onclose={() => restoreOpen = false} onrestored={noopRestored} />{/if}
{#if packageOpen}<ProjectPackageDialog onclose={() => packageOpen = false} onimported={noopRestored} />{/if}
