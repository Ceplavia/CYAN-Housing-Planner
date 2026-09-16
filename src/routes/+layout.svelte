<script>
  import '../app.css';
  import { initializeLocale } from '$lib/i18n';
  onMount(initializeLocale);
  import { browser } from '$app/environment';
  import { onMount, untrack } from 'svelte';
  import { env } from '$env/dynamic/public';
  import { themePreference } from '$lib/stores/theme';
  import DeploymentNotice from '$lib/components/DeploymentNotice.svelte';
  import { applySessionUser } from '$lib/services/session';
  // Self-hosted instances and browser tests can run without sending analytics.
  onMount(() => { if (window.location.pathname !== '/render-lab' && env.PUBLIC_ENABLE_ANALYTICS !== 'false') void import('$lib/firebase'); });
  let { children, data } = $props();
  // Set before children mount so the project store picks the right backend.
  untrack(() => applySessionUser(data.user ?? null));
  $effect(() => applySessionUser(data.user ?? null));
</script>

{@render children()}
<DeploymentNotice />
