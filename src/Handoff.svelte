<script lang="ts">
  type Props = { sealed: boolean; seat: 0 | 1; turn: number; onReveal: () => void; onShow: () => void };
  let { sealed, seat, turn, onReveal, onShow }: Props = $props();
</script>

<main class="center">
  {#if sealed}
    <h1>Both orders are in</h1>
    <p>Put the device where you can both see it, then reveal.</p>
    <button class="btn primary big" onclick={onReveal}>Reveal both orders</button>
  {:else}
    <p class="turn-note">Turn {Math.min(12, turn + 1)} of 12</p>
    <h1>Player {seat + 1} <span class="pip" class:heart={seat === 1}>{seat === 0 ? '♠' : '♥'}</span>, your move</h1>
    <p>Pass the device. The other player looks away until you lock in.</p>
    <button class="btn primary big" onclick={onShow}>I’m Player {seat + 1}, show my move</button>
  {/if}
</main>

<style>
  .turn-note { font-size: 15px !important; }
  .pip { color: var(--spade); }
  .pip.heart { color: var(--heart); }
</style>
