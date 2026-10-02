<script lang="ts">
  type Props = { won: boolean; last: boolean; onNext: () => void; onRetry: () => void };
  let { won, last, onNext, onRetry }: Props = $props();
</script>

<div class="next" role="status">
  {#if won}
    <button class="btn primary" onclick={onNext}>{last ? 'Finish' : 'Next lesson'}</button>
  {:else}
    <button class="btn primary" onclick={onRetry}>Try again</button>
    <button class="btn quiet" onclick={onNext}>Move on</button>
  {/if}
</div>

<style>
  .next { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
</style>
