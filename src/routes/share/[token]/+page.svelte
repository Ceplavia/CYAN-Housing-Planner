<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { base } from '$app/paths';
  import { page as currentPage } from '$app/state';
  import { loadProject } from '$lib/stores/project';
  import type { Project } from '$lib/models/types';
  import { projectToSVG } from '$lib/utils/export';
  import SiteHeader from '$lib/components/SiteHeader.svelte';

  type State =
    | { phase: 'loading' }
    | { phase: 'password' }
    | { phase: 'view'; project: Project; name: string; owner: string }
    | { phase: 'expired' }
    | { phase: 'missing' }
    | { phase: 'error'; message: string };

  let vm = $state<State>({ phase: 'loading' });
  let password = $state('');
  let passwordError = $state(false);
  let busy = $state(false);
  let mode = $state<'2d' | '3d'>('2d');
  let ThreeViewer: any = $state(null);

  const token = $derived(currentPage.params.token ?? '');
  // Render via <img> rather than {@html}: an SVG in <img> can never run scripts,
  // so shared plans are safe to display even if the owner crafted odd fields.
  const svgUrl = $derived.by(() => {
    if (vm.phase !== 'view') return null;
    const svg = projectToSVG(vm.project, $locale);
    return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  });

  async function fetchShare(withPassword?: string) {
    const url = `${base}/api/share/${encodeURIComponent(token)}`;
    const res = withPassword === undefined
      ? await fetch(url)
      : await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: withPassword }),
        });
    if (res.status === 404) return { phase: 'missing' } as State;
    if (res.status === 410) return { phase: 'expired' } as State;
    if (res.status === 401) return { phase: 'password' } as State;
    if (res.status === 429) return { phase: 'error', message: 'share.rateLimited' } as State;
    if (!res.ok) return { phase: 'error', message: 'share.loadFailed' } as State;
    const body = await res.json().catch(() => null);
    try {
      const project = JSON.parse(body.project) as Project;
      return { phase: 'view', project, name: body.name, owner: body.owner } as State;
    } catch {
      return { phase: 'error', message: 'share.loadFailed' } as State;
    }
  }

  $effect(() => {
    void token; // re-resolve if the param ever changes
    void fetchShare().then(next => vm = next);
  });

  async function submitPassword() {
    if (busy) return;
    busy = true; passwordError = false;
    try {
      const next = await fetchShare(password);
      if (next.phase === 'password') passwordError = true;
      else vm = next;
    } finally { busy = false; }
  }

  function enter3D() {
    if (vm.phase !== 'view') return;
    loadProject(vm.project);
    if (!ThreeViewer) {
      import('$lib/components/viewer3d/ThreeViewer.svelte').then(m => { ThreeViewer = m.default; mode = '3d'; }).catch(() => {});
    } else mode = '3d';
  }
</script>

<div class="min-h-screen bg-gray-50">
  <SiteHeader>
    {#if vm.phase === 'view'}
      <div class="rounded-lg bg-white/10 p-0.5 flex text-sm font-medium text-white">
        <button onclick={() => mode = '2d'} class="px-3 py-1 rounded-md {mode === '2d' ? 'bg-white text-slate-800' : 'hover:bg-white/10'}">2D</button>
        <button onclick={enter3D} class="px-3 py-1 rounded-md {mode === '3d' ? 'bg-white text-slate-800' : 'hover:bg-white/10'}">3D</button>
      </div>
    {/if}
  </SiteHeader>

  {#if vm.phase === 'loading'}
    <div class="flex h-[60vh] items-center justify-center">
      <div class="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" aria-hidden="true"></div>
    </div>
  {:else if vm.phase === 'password'}
    <div class="mx-auto max-w-sm px-6 py-16">
      <form onsubmit={(e) => { e.preventDefault(); void submitPassword(); }}
        class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <h1 class="text-lg font-semibold text-gray-800">{$t('share.passwordTitle')}</h1>
        <p class="text-sm text-gray-500">{$t('share.passwordHelp')}</p>
        <input type="password" bind:value={password} required autocomplete="off" aria-label={$t('share.password')}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-blue-500" />
        {#if passwordError}<p role="alert" class="rounded-lg bg-red-50 p-3 text-sm text-red-900">{$t('share.wrongPassword')}</p>{/if}
        <button type="submit" disabled={busy || !password}
          class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">
          {$t('share.view')}
        </button>
      </form>
    </div>
  {:else if vm.phase === 'view'}
    <div class="mx-auto max-w-5xl px-6 py-6">
      <div class="mb-4">
        <h1 class="text-xl font-semibold text-gray-800">{vm.name}</h1>
        <p class="text-sm text-gray-500">{$t('share.sharedBy', { owner: vm.owner })}</p>
      </div>
      {#if mode === '2d'}
        <div class="overflow-auto rounded-2xl border border-gray-200 bg-white shadow-sm" style="max-height: 78vh">
          {#if svgUrl}
            <img src={svgUrl} alt={vm.name} class="w-full" />
          {:else}
            <p class="p-10 text-center text-sm text-gray-400">{$t('share.empty')}</p>
          {/if}
        </div>
      {:else}
        <div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" style="height: 78vh">
          {#if ThreeViewer}<ThreeViewer readonly />{:else}<p class="p-10 text-center text-sm text-gray-400">{$t('share.loading')}</p>{/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="mx-auto max-w-sm px-6 py-16 text-center">
      <p class="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-600 shadow-sm">
        {vm.phase === 'expired' ? $t('share.expired') : vm.phase === 'missing' ? $t('share.missing') : (vm.phase === 'error' && vm.message === 'share.rateLimited') ? $t('share.rateLimited') : $t('share.loadFailed')}
      </p>
    </div>
  {/if}
</div>
