<script>
  import '../app.css';
  import { initializeLocale } from '$lib/i18n';
  onMount(initializeLocale);
  import { browser } from '$app/environment';
  import { onMount, untrack } from 'svelte';
  import { themePreference } from '$lib/stores/theme';
  import DeploymentNotice from '$lib/components/DeploymentNotice.svelte';
  import { applySessionUser } from '$lib/services/session';
  let { children, data } = $props();
  // Set before children mount so the project store picks the right backend.
  untrack(() => applySessionUser(data.user ?? null));
  $effect(() => applySessionUser(data.user ?? null));
</script>

{@render children()}
<DeploymentNotice />
