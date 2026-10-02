<script lang="ts">
  import { rank } from './engine';

  let { card, seat, size = 'md' }: { card: number; seat: number; size?: 'md' | 'sm' | 'xs' } = $props();
  const pip = $derived(seat === 0 ? '♠' : '♥');
</script>

<span class={['card', size !== 'md' && size, seat === 1 && 'heart']} aria-hidden="true">
  <span class="r">{rank(card)}</span><span class="s">{pip}</span><span class="big">{pip}</span>
</span>
