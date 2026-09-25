<script lang="ts">
  import { availableLocales, locale, localeName, t } from '$lib/i18n';
  import { tick } from 'svelte';

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
    menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
  }
  function outside(event: Event) {
    const target = event.target as Node;
    if (open && !menu?.contains(target) && !trigger?.contains(target)) close();
  }
  function pick(code: string) {
    locale.set(code as Parameters<typeof locale.set>[0]);
    close(true);
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
    aria-label={$t('settings.language')} aria-haspopup="menu" aria-expanded={open}
    class="p-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 4 5.6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.6-4-9s1.5-6.4 4-9z"/>
    </svg>
  </button>
  {#if open}
    <div bind:this={menu} role="menu" tabindex="-1" aria-label={$t('settings.language')}
      onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } }}
      class="absolute right-0 top-12 bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-40 z-50">
      {#each availableLocales as code}
        <button type="button" role="menuitemradio" aria-checked={$locale === code}
          onclick={() => pick(code)}
          class="w-full px-3 py-2 text-sm text-left flex items-center justify-between {$locale === code ? 'text-blue-700 font-semibold bg-blue-50' : 'text-gray-700 hover:bg-gray-50'}">
          <span lang={code}>{localeName(code)}</span>
          {#if $locale === code}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
