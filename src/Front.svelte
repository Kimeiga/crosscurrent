<script lang="ts">
  import Icon from './Icon.svelte';
  import { fronts } from './ui';
  import { sum, rank, rankName, type State, type Action, type ActionKind } from './engine';

  export let front: (typeof fronts)[number];
  export let index: number;
  export let mine: State['sides'][number];
  export let theirs: State['sides'][number];
  export let seat: 0 | 1;
  export let opponentName: string;
  export let yourName: string;
  export let kind: ActionKind;
  export let origin: number;
  export let destination: number | null;
  export let order: Action | null;
  export let animating: boolean;
  export let selected: number | null;
  export let blocked: boolean;
  export let choosingFront: boolean;
  export let projected: number;
  export let enemyScored: boolean;
  export let ownScored: boolean;
  export let send: any;
  export let receive: any;
  export let onFront: (front: number) => void;
  export let onBoardCard: (card: number) => void;
</script>

<section class={`cc-front ${front.theme}`} class:cc-destination={destination === index && !!order && !animating} aria-label={`${front.name} front`}>
  <div class="cc-strength cc-enemy-strength" class:cc-scored={enemyScored} aria-label={`${opponentName} strength at ${front.name}: ${sum(theirs.board[index])}`}>
    {#key sum(theirs.board[index])}<strong>{sum(theirs.board[index])}</strong>{/key}
  </div>
  <div class="cc-pieces cc-enemy-zone" aria-label={`Opponent cards at ${front.name}`}>
    {#each theirs.board[index] as card (card)}
      <span class="cc-piece cc-enemy-piece" in:receive={{ key: `${1 - seat}:${card}` }} out:send={{ key: `${1 - seat}:${card}` }} aria-label={`${rankName(card)}, value ${card}`}><b>{rank(card)}</b><small>{card}</small></span>
    {/each}
  </div>
  <button class="cc-front-target" class:cc-available={choosingFront && !(kind === 'shift' && origin === index)} aria-label={`Choose front ${front.name}`} aria-pressed={destination === index && !!order && !animating} disabled={!choosingFront || (kind === 'shift' && origin === index)} on:click={() => onFront(index)}>
    <Icon name={front.icon} size={24} /><strong>{front.name}</strong><span class="cc-target-status" aria-hidden="true">{destination === index && order && !animating ? '✓' : choosingFront && !(kind === 'shift' && origin === index) ? '+' : front.code}</span>
  </button>
  <div class="cc-pieces cc-own-zone" aria-label={`Your cards at ${front.name}`}>
    {#each mine.board[index] as card (card)}
      <button class="cc-piece cc-own-piece" class:cc-picked={selected === card && kind !== 'deploy' && !animating} in:receive={{ key: `${seat}:${card}` }} out:send={{ key: `${seat}:${card}` }} disabled={blocked || kind === 'deploy'} on:click={() => onBoardCard(card)} aria-label={`Select your ${rankName(card)} at ${front.name}`} aria-pressed={selected === card && kind !== 'deploy' && !animating}><b>{rank(card)}</b><small>{card}</small></button>
    {/each}
  </div>
  <div class="cc-strength cc-own-strength" class:cc-scored={ownScored} aria-label={`${yourName} strength at ${front.name}: ${sum(mine.board[index])}`}>
    {#key sum(mine.board[index])}<strong>{sum(mine.board[index])}</strong>{/key}
    {#if order && !animating && projected !== sum(mine.board[index])}<small class="cc-projection">→ {projected}</small>{/if}
  </div>
</section>
