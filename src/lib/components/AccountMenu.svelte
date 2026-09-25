<script lang="ts">
  import { t } from '$lib/i18n';
  import { base } from '$app/paths';
  import { signOut } from '$lib/services/session';
  import { tick } from 'svelte';

  let { username, isAdmin = false }: { username: string; isAdmin?: boolean } = $props();

  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();

  function close(restore = false) {
    open = false;
    if (restore) trigger?.focus({ preventScroll: true });
  }
  async function show(focusFirst = false) {
    open = true;
    if (!focusFirst) return;
    await tick();
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }
  function outside(event: Event) {
    const target = event.target as Node;
    if (open && !menu?.contains(target) && !trigger?.contains(target)) close();
  }
</script>

<svelte:window onpointerdown={outside} onfocusin={outside} />

<div class="relative">
  <button bind:this={trigger} type="button"
    onclick={() => open ? close(true) : show()}
    onkeydown={(e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); void show(true); }
      else if (e.key === 'Escape' && open) { e.preventDefault(); close(true); }
    }}
    aria-label={$t('menu.account', { name: username })} aria-haspopup="menu" aria-expanded={open}
    class="px-4 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm transition-all flex items-center gap-2 border border-white/20">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    {username}
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
  </button>
  {#if open}
    <div bind:this={menu} role="menu" tabindex="-1" aria-label={$t('menu.account', { name: username })}
      onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } }}
      class="absolute right-0 top-12 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-52 z-50">
      <a role="menuitem" href={`${base}/account`}
        class="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50">
        {$t('menu.accountCenter')}
      </a>
      {#if isAdmin}
        <a role="menuitem" href={`${base}/admin`}
          class="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50">
          {$t('menu.adminConsole')}
        </a>
      {/if}
      <div class="my-1 border-t border-gray-100" aria-hidden="true"></div>
      <button type="button" role="menuitem"
        onclick={() => { close(); void signOut(); }}
        class="w-full px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 focus:bg-red-50">
        {$t('auth.signOut')}
      </button>
    </div>
  {/if}
</div>
