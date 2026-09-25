<script lang="ts">
  import { t, locale, intlLocale } from '$lib/i18n';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { modalDialog } from '$lib/utils/modalDialog';
  import ShareCard from '$lib/components/ShareCard.svelte';

  interface Share {
    token: string;
    projectId: string;
    password: string | null;
    expiresAt: number | null;
    createdAt: number;
  }

  let { projectId, projectName, owner = '', thumbnail = null, onclose }: {
    projectId: string;
    projectName: string;
    owner?: string;
    thumbnail?: string | null;
    onclose: () => void;
  } = $props();

  const EXPIRY_DAYS = [1, 7, 30] as const;

  let share = $state<Share | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let expiryDays = $state<number | null>(7);
  let password = $state('');
  let copied = $state(false);
  let confirmRegen = $state(false);
  let confirmDelete = $state(false);

  const shareUrl = $derived(share ? `${window.location.origin}${base}/share/${share.token}` : '');
  const expiryLabel = $derived.by(() => {
    if (!share?.expiresAt) return null;
    const date = new Date(share.expiresAt).toLocaleDateString(intlLocale($locale), { dateStyle: 'medium' });
    return share.expiresAt < Date.now() ? $t('share.expiredAt', { date }) : $t('share.expiresAt', { date });
  });

  async function call(method: string, body?: Record<string, unknown>) {
    busy = true; error = null;
    try {
      const res = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/share`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { error = data?.error ?? `Request failed (${res.status})`; return null; }
      return data?.share as Share | null;
    } catch { error = $t('share.unreachable'); return null; }
    finally { busy = false; }
  }

  onMount(async () => {
    const existing = await call('GET');
    if (existing) { share = existing; password = existing.password ?? ''; }
    loading = false;
  });

  async function create() {
    const created = await call('POST', { expiresInDays: expiryDays, password: password || null });
    if (created) share = created;
  }

  async function save() {
    const updated = await call('PATCH', { expiresInDays: expiryDays, password: password || null });
    if (updated) share = updated;
  }

  async function regenerate() {
    const fresh = await call('POST', { regenerate: true });
    if (fresh) { share = fresh; confirmRegen = false; }
  }

  async function revoke() {
    const res = await fetch(`${base}/api/projects/${encodeURIComponent(projectId)}/share`, { method: 'DELETE' });
    if (res.ok) { share = null; confirmDelete = false; password = ''; }
    else error = $t('share.revokeFailed');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard may be unavailable on plain HTTP — select the text instead.
      const el = document.getElementById('share-url') as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
    }
    copied = true;
    setTimeout(() => copied = false, 1500);
  }
</script>

<dialog use:modalDialog aria-labelledby="share-title"
  oncancel={(e) => { e.preventDefault(); onclose(); }}
  class="m-auto w-full max-w-md rounded-2xl bg-white p-6 text-gray-800 shadow-2xl backdrop:bg-black/50">
  <div>
    <h2 id="share-title" class="text-lg font-semibold text-gray-800">{$t('share.title')}</h2>
    <p class="mt-1 text-sm text-gray-500">{$t('share.subtitle', { name: projectName })}</p>

    {#if loading}
      <p class="mt-6 text-sm text-gray-400">{$t('share.loading')}</p>
    {:else if !share}
      <!-- Not shared yet -->
      <div class="mt-5 space-y-4">
        <div>
          <label for="share-expiry" class="block text-sm font-medium text-gray-700">{$t('share.expiry')}</label>
          <select id="share-expiry" bind:value={expiryDays} disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {#each EXPIRY_DAYS as days}
              <option value={days}>{$t(days === 1 ? 'share.day1' : 'share.days', { count: days })}</option>
            {/each}
            <option value={null}>{$t('share.never')}</option>
          </select>
        </div>
        <div>
          <label for="share-password" class="block text-sm font-medium text-gray-700">{$t('share.password')}</label>
          <input id="share-password" type="text" bind:value={password} placeholder={$t('share.passwordOptional')} disabled={busy}
            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" autocomplete="off" />
        </div>
        {#if error}<p role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>{/if}
        <div class="flex justify-end gap-2">
          <button type="button" onclick={onclose} disabled={busy}
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('library.cancel')}</button>
          <button type="button" onclick={() => void create()} disabled={busy}
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
            {busy ? $t('share.generating') : $t('share.generate')}
          </button>
        </div>
      </div>
    {:else}
      <!-- Already shared -->
      <div class="mt-5 space-y-4">
        <div>
          <label for="share-url" class="block text-sm font-medium text-gray-700">{$t('share.link')}</label>
          <div class="mt-1 flex gap-2">
            <input id="share-url" readonly value={shareUrl}
              class="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700" />
            <button type="button" onclick={() => void copy()}
              class="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              {copied ? $t('share.copied') : $t('share.copy')}
            </button>
          </div>
          {#if expiryLabel}<p class="mt-1 text-xs {share.expiresAt && share.expiresAt < Date.now() ? 'text-red-600' : 'text-gray-500'}">{expiryLabel}</p>{/if}
        </div>
        <ShareCard url={shareUrl} {projectName} {owner} {thumbnail} />
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label for="share-expiry-edit" class="block text-sm font-medium text-gray-700">{$t('share.expiry')}</label>
            <select id="share-expiry-edit" bind:value={expiryDays} disabled={busy}
              class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {#each EXPIRY_DAYS as days}
                <option value={days}>{$t(days === 1 ? 'share.day1' : 'share.days', { count: days })}</option>
              {/each}
              <option value={null}>{$t('share.never')}</option>
            </select>
          </div>
          <div>
            <label for="share-password-edit" class="block text-sm font-medium text-gray-700">{$t('share.password')}</label>
            <input id="share-password-edit" type="text" bind:value={password} placeholder={$t('share.passwordOptional')} disabled={busy}
              class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" autocomplete="off" />
          </div>
        </div>
        {#if error}<p role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-900">{error}</p>{/if}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex gap-2">
            {#if confirmRegen}
              <button type="button" onclick={() => void regenerate()} disabled={busy}
                class="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700">{$t('share.confirmRegen')}</button>
              <button type="button" onclick={() => confirmRegen = false}
                class="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">{$t('library.cancel')}</button>
            {:else if confirmDelete}
              <button type="button" onclick={() => void revoke()} disabled={busy}
                class="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700">{$t('share.confirmRevoke')}</button>
              <button type="button" onclick={() => confirmDelete = false}
                class="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600">{$t('library.cancel')}</button>
            {:else}
              <button type="button" onclick={() => confirmRegen = true} disabled={busy}
                class="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50">{$t('share.regenerate')}</button>
              <button type="button" onclick={() => confirmDelete = true} disabled={busy}
                class="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">{$t('share.revoke')}</button>
            {/if}
          </div>
          <div class="flex gap-2">
            <button type="button" onclick={onclose} disabled={busy}
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">{$t('share.done')}</button>
            <button type="button" onclick={() => void save()} disabled={busy}
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
              {busy ? $t('share.saving') : $t('share.save')}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</dialog>
