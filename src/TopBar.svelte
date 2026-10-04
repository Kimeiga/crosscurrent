<script lang="ts">
  type Props = { home: boolean; online: boolean; onHome: () => void; onReconnect: () => void; onRules: () => void };
  let { home, online, onHome, onReconnect, onRules }: Props = $props();
</script>

<header class="bar">
  {#if home}
    <span></span>
  {:else}
    <button class="back" onclick={onHome} aria-label="Back to the start screen"><span aria-hidden="true">←</span> Crosscurrent</button>
  {/if}
  <nav>
    {#if online}<button class="link" onclick={onReconnect}>Reconnect</button>{/if}
    <button class="link" onclick={onRules}>Rules</button>
  </nav>
</header>

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 0 var(--gutter); padding-top: env(safe-area-inset-top); }
  .back { min-height: 44px; font-family: var(--serif); font-size: 18px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; }
  .back span { font-family: var(--sans); font-weight: 400; color: var(--ink-2); }
  nav { display: flex; gap: 18px; align-items: center; }
</style>
