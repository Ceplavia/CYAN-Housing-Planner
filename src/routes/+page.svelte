<script lang="ts">
  import { t } from '$lib/i18n';
  import { base } from '$app/paths';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  const screenshots = ['plan1_2d.jpg', 'plan1_3d.jpg', 'plan4_2d.jpg', 'plan4_3d.jpg'];
  const features = [
    ['landing.featDraw', 'landing.featDrawDesc'],
    ['landing.featView', 'landing.featViewDesc'],
    ['landing.featLib', 'landing.featLibDesc'],
    ['landing.featShare', 'landing.featShareDesc'],
    ['landing.featBackup', 'landing.featBackupDesc'],
    ['landing.featLang', 'landing.featLangDesc'],
  ] as const;
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <SiteHeader>
    <a href={`${base}/login`}
      class="px-4 py-2.5 bg-white/10 text-white rounded-lg hover:bg-white/20 font-medium text-sm transition-all border border-white/20">
      {$t('auth.signIn')}
    </a>
    <a href={`${base}/register`}
      class="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/40">
      {$t('auth.signUp')}
    </a>
  </SiteHeader>

  <!-- Hero -->
  <div class="max-w-5xl mx-auto px-6 pt-16 pb-10 text-center">
    <h2 class="text-4xl font-bold text-slate-800 tracking-tight">{$t('landing.hero')}</h2>
    <p class="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">{$t('landing.heroSub')}</p>
    <div class="mt-8 flex items-center justify-center gap-3">
      <a href={`${base}/register`}
        class="px-7 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-semibold shadow-lg shadow-blue-600/25 transition-all">
        {$t('landing.ctaStart')}
      </a>
      <a href={`${base}/login`}
        class="px-7 py-3 bg-white text-gray-700 rounded-xl hover:bg-gray-100 font-semibold border border-gray-200 transition-all">
        {$t('landing.ctaSignIn')}
      </a>
    </div>
  </div>

  <!-- Screenshots -->
  <div class="max-w-5xl mx-auto px-6 pb-12">
    <div class="grid grid-cols-2 gap-4">
      {#each screenshots as shot, i}
        <img src={`${base}/screenshots/${shot}`} alt={$t(i % 2 === 0 ? 'landing.shot2d' : 'landing.shot3d')}
          class="w-full rounded-2xl border border-gray-200 shadow-sm bg-white" loading="lazy" />
      {/each}
    </div>
  </div>

  <!-- Features -->
  <div class="bg-white border-y border-gray-200">
    <div class="max-w-5xl mx-auto px-6 py-14">
      <h3 class="text-2xl font-bold text-slate-800 text-center">{$t('landing.features')}</h3>
      <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {#each features as [title, desc]}
          <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p class="font-semibold text-slate-800">{$t(title)}</p>
            <p class="mt-1.5 text-sm text-gray-600 leading-relaxed">{$t(desc)}</p>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <footer class="max-w-5xl mx-auto px-6 py-8 text-center text-xs text-gray-400">
    CYAN Housing Planner — {$t('landing.tagline')}
  </footer>
</div>
