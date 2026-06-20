<script lang="ts">
  import '../app.css';
  import { onDestroy } from 'svelte';
  import { closeAblyClient } from '$lib/services/ably';
  import VoicePanel from '$lib/components/VoicePanel.svelte';

  let { children } = $props();

  onDestroy(() => {
    closeAblyClient();
  });
</script>

{@render children()}
<VoicePanel />
