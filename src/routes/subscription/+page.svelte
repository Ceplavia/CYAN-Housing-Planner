<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { PLAN_NAME_KEYS } from '$lib/planNames';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  let { data } = $props();

  // The layout snapshot is loaded once per session — revalidate so a plan
  // changed since sign-in shows immediately.
  onMount(() => { void invalidateAll(); });

  // Feature bullets per plan id; the limit bullet interpolates the live
  // number from plans.json so the card always matches server enforcement.
  const bullets: Record<string, TranslationKey[]> = {
    free: ['sub.fLimit', 'sub.fServer', 'sub.fShare'],
    pro: ['sub.pLimit', 'sub.pAll'],
  };
</script>

<div class="min-h-screen bg-gray-50">
  <SiteHeader>
    {#if data.user}
      <a href={`${base}/dashboard`} class="px-4 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm border border-white/20 transition-all">
        {$t('account.back')}
      </a>
    {:else}
      <a href={`${base}/login`} class="px-4 py-2.5 text-white/80 hover:text-white font-medium text-sm transition-colors">{$t('auth.signIn')}</a>
      <a href={`${base}/register`} class="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm transition-all">{$t('auth.signUp')}</a>
    {/if}
  </SiteHeader>

  <div class="max-w-4xl mx-auto px-6 py-14">
    <div class="text-center mb-10">
      <h1 class="text-3xl font-bold text-gray-800">{$t('sub.title')}</h1>
      <p class="mt-2 text-gray-500">{$t('sub.subtitle')}</p>
    </div>

    <div class="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
      {#each data.plans as plan (plan.id)}
        {@const features = bullets[plan.id] ?? ['sub.fLimit']}
        {@const current = data.user && data.user.plan === plan.id}
        <div class="bg-white rounded-xl border {current ? 'border-blue-400 shadow-md ring-1 ring-blue-400/30' : 'border-gray-200'} p-8 flex flex-col">
          <div class="flex items-center gap-2">
            <h2 class="text-xl font-bold text-gray-800">{PLAN_NAME_KEYS[plan.id] ? $t(PLAN_NAME_KEYS[plan.id]) : plan.id}</h2>
            {#if current}<span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">{$t('sub.currentPlan')}</span>{/if}
          </div>
          <ul class="mt-6 space-y-3 text-sm text-gray-600 flex-1">
            {#each features as key}
              <li class="flex items-start gap-2">
                <span class="text-gray-400 mt-0.5">-</span>
                <span>{$t(key, { count: plan.projectLimit })}</span>
              </li>
            {/each}
          </ul>
          <div class="mt-8">
            {#if data.user}
              {#if data.user.plan === plan.id}
                <button disabled class="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-500 cursor-not-allowed">
                  {plan.id === 'free' ? $t('sub.currentPlan') : $t('sub.subscribed')}
                </button>
              {:else}
                <button disabled class="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-400 cursor-not-allowed">
                  {$t('sub.soon')}
                </button>
              {/if}
            {:else if plan.id === 'free'}
              <a href={`${base}/register`} class="block w-full px-4 py-2.5 rounded-lg bg-blue-500 text-center text-sm font-semibold text-white hover:bg-blue-600 transition-all">
                {$t('sub.start')}
              </a>
            {:else}
              <button disabled class="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-400 cursor-not-allowed">
                {$t('sub.soon')}
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
