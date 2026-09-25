<script lang="ts">
  import { t } from '$lib/i18n';
  import { PASSWORD_RULES } from '$lib/passwordRules';

  let { password = '' }: { password?: string } = $props();
</script>

<ul class="mt-2 space-y-1 text-xs">
  {#each PASSWORD_RULES as rule}
    {@const ok = rule.test(password)}
    <li class="flex items-center gap-1.5 transition-colors {ok ? 'text-green-600' : 'text-gray-400'}">
      {#if ok}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><polyline points="4 13 10 19 20 6"/></svg>
      {:else}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>
      {/if}
      {$t(rule.key)}
    </li>
  {/each}
</ul>
