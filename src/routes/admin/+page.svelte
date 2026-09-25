<script lang="ts">
  import { t } from '$lib/i18n';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  interface AdminUser {
    id: string;
    username: string;
    plan: string;
    bonusProjects: number;
    isAdmin: boolean;
    isActive: boolean;
    inactiveReason: string | null;
    projectCount: number;
    projectLimit: number;
    createdAt: number;
  }

  const PAGE_SIZES = [10, 20, 50, 100] as const;
  let pageSize = $state(20);

  let { data } = $props();
  let users = $state<AdminUser[]>([]);
  let total = $state(0);
  let page = $state(1);
  let q = $state('');
  let loadError = $state<string | null>(null);
  let busy = $state<string | null>(null);
  let rowError = $state<Record<string, string>>({});
  // Deactivating asks for a reason first; the inline form hangs under the row.
  let deactivating = $state<string | null>(null);
  let reason = $state('');

  const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));

  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  async function load() {
    loadError = null;
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`${base}/api/admin/users?${params}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) { loadError = body?.error ?? `Request failed (${res.status})`; return; }
      users = body.users;
      total = body.total;
      // Deletions may leave the current page empty — fall back one page.
      if (users.length === 0 && page > 1) { page -= 1; await load(); }
    } catch { loadError = 'Could not reach the server.'; }
  }
  onMount(() => {
    const saved = Number(localStorage.getItem('admin_pageSize'));
    if ((PAGE_SIZES as readonly number[]).includes(saved)) pageSize = saved;
    void load();
  });

  function onPageSize() {
    localStorage.setItem('admin_pageSize', String(pageSize));
    page = 1;
    void load();
  }

  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; void load(); }, 250);
  }

  async function patch(user: AdminUser, body: Record<string, unknown>) {
    if (busy) return;
    busy = user.id; delete rowError[user.id];
    try {
      const res = await fetch(`${base}/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok) { rowError[user.id] = result?.error ?? `Request failed (${res.status})`; return; }
      await load();
    } catch { rowError[user.id] = 'Could not reach the server.'; }
    finally { busy = null; }
  }

  function confirmDeactivate(user: AdminUser) {
    void patch(user, { isActive: false, inactiveReason: reason || null });
    deactivating = null; reason = '';
  }
</script>

<div class="min-h-screen bg-gray-50">
  <SiteHeader>
    <a href={`${base}/dashboard`} class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm transition-all border border-white/20">
      {$t('account.back')}
    </a>
  </SiteHeader>

  <div class="max-w-5xl mx-auto px-6 py-10">
    <section class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-lg font-semibold text-gray-800">{$t('admin.title')}</h2>
        <input type="search" bind:value={q} oninput={onSearch} placeholder={$t('admin.searchPlaceholder')} aria-label={$t('admin.search')}
          class="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
      </div>
      {#if loadError}
        <p role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900">{loadError}</p>
      {:else}
        <div class="mt-4 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-200 text-left text-gray-500">
                <th class="py-2 pr-4 font-medium">{$t('admin.user')}</th>
                <th class="py-2 pr-4 font-medium">{$t('admin.plan')}</th>
                <th class="py-2 pr-4 font-medium">{$t('admin.bonus')}</th>
                <th class="py-2 pr-4 font-medium">{$t('admin.usage')}</th>
                <th class="py-2 pr-4 font-medium">{$t('admin.status')}</th>
                <th class="py-2 font-medium">{$t('admin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {#each users as user (user.id)}
                <tr class="border-b border-gray-100 last:border-0">
                  <td class="py-3 pr-4 font-medium text-gray-800">
                    {user.username}
                    {#if user.id === data.user?.id}<span class="ml-1 text-xs text-gray-400">({$t('admin.you')})</span>{/if}
                    {#if user.isAdmin}<span class="ml-1 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-white">admin</span>{/if}
                  </td>
                  <td class="py-3 pr-4">
                    <input
                      value={user.plan} list="admin-plans" disabled={busy === user.id}
                      onchange={(e) => void patch(user, { plan: e.currentTarget.value })}
                      class="w-24 rounded border border-gray-300 px-2 py-1 text-sm" />
                    <datalist id="admin-plans"><option value="free"></option></datalist>
                  </td>
                  <td class="py-3 pr-4">
                    <input
                      type="number" min="0" value={user.bonusProjects} disabled={busy === user.id}
                      onchange={(e) => void patch(user, { bonusProjects: Number(e.currentTarget.value) })}
                      class="w-20 rounded border border-gray-300 px-2 py-1 text-sm" />
                  </td>
                  <td class="py-3 pr-4 text-gray-600">{user.projectCount} / {user.projectLimit}</td>
                  <td class="py-3 pr-4">
                    {#if user.isActive}
                      <span class="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">{$t('admin.active')}</span>
                    {:else}
                      <span class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700" title={user.inactiveReason ?? ''}>{$t('admin.inactive')}</span>
                    {/if}
                  </td>
                  <td class="py-3 whitespace-nowrap">
                    {#if user.isActive}
                      <button onclick={() => { deactivating = user.id; reason = ''; }} disabled={busy === user.id || user.id === data.user?.id}
                        class="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40">
                        {$t('admin.deactivate')}
                      </button>
                    {:else}
                      <button onclick={() => void patch(user, { isActive: true })} disabled={busy === user.id}
                        class="rounded border border-green-200 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50 disabled:opacity-40">
                        {$t('admin.activate')}
                      </button>
                    {/if}
                  </td>
                </tr>
                {#if deactivating === user.id}
                  <tr class="border-b border-gray-100 bg-red-50/40">
                    <td colspan="6" class="py-3">
                      <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); confirmDeactivate(user); }}>
                        <input bind:value={reason} placeholder={$t('admin.reasonPlaceholder')} aria-label={$t('admin.reason')}
                          class="w-72 rounded border border-gray-300 px-2 py-1 text-sm" />
                        <button type="submit" class="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">{$t('admin.confirmDeactivate')}</button>
                        <button type="button" onclick={() => { deactivating = null; }} class="rounded border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">{$t('transfer.cancel')}</button>
                      </form>
                    </td>
                  </tr>
                {/if}
                {#if rowError[user.id]}
                  <tr><td colspan="6" class="pb-2"><p role="alert" class="rounded bg-red-50 px-2 py-1 text-xs text-red-900">{rowError[user.id]}</p></td></tr>
                {/if}
              {:else}
                <tr><td colspan="6" class="py-8 text-center text-sm text-gray-400">{$t('admin.noUsers')}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if pageCount > 1 || total > 0}
          <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
            <div class="flex items-center gap-2">
              <span>{$t('admin.total', { count: total })}</span>
              <select aria-label={$t('admin.perPage')} bind:value={pageSize} onchange={onPageSize}
                class="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
                {#each PAGE_SIZES as size}<option value={size}>{size} {$t('library.perPageShort')}</option>{/each}
              </select>
            </div>
            {#if pageCount > 1}
              <div class="flex items-center gap-1">
                <button onclick={() => { page -= 1; void load(); }} disabled={page <= 1} aria-label={$t('admin.prev')}
                  class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">‹</button>
                <span class="px-2">{$t('library.pageOf', { page, pages: pageCount })}</span>
                <button onclick={() => { page += 1; void load(); }} disabled={page >= pageCount} aria-label={$t('admin.next')}
                  class="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40">›</button>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </section>
  </div>
</div>
