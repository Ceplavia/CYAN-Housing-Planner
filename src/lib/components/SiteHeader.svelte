<script lang="ts">
  import { t } from '$lib/i18n';
  import { base } from '$app/paths';
  import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
  <div class="max-w-5xl mx-auto px-6 py-5 flex flex-wrap gap-4 items-center justify-between">
    <a href={`${base}/`} class="block">
      <span class="block text-2xl font-bold text-white">CYAN Housing Planner</span>
      <span class="block text-sm text-white/50 mt-0.5">{$t('landing.tagline')}</span>
    </a>
    <div class="flex flex-wrap items-center gap-3">
      {@render children?.()}
      <LanguageSwitcher />
    </div>
  </div>
</div>
