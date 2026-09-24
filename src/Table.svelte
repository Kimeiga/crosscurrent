<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { crossfade } from 'svelte/transition';
  import Icon from './Icon.svelte';
  import Front from './Front.svelte';
  import { fronts, orderText, revealFrames } from './ui';
  import { sum, rank, rankName, type State, type TurnRecord, type Action, type ActionKind } from './engine';

  export let game: State;
  export let history: TurnRecord[];
  export let seat: 0 | 1;
  export let mode: 'solo' | 'online' | 'local';
  export let opponentName: string;
  export let busy: boolean;
  export let disabled: boolean;
  export let joined: [boolean, boolean];
  export let locked: [boolean, boolean];
  export let myLockedOrder: Action | null;
  export let connectionStatus: string;
  export let inviteLink: string;
  export let toast: string;
  export let kind: ActionKind;
  export let selected: number | null;
  export let destination: number | null;
  export let order: Action | null;
  export let projected: number[];
  export let localReview = false;
  export let onKind: (kind: ActionKind) => void;
  export let onCard: (card: number) => void;
  export let onBoardCard: (card: number) => void;
  export let onFront: (front: number) => void;
  export let onLock: () => void;
  export let onCopy: () => void;
  export let onReconnect: () => void;
  export let onAgain: () => void;
  export let onNext: () => void;
  export let onAnimation: (busy: boolean) => void;

  let shown: State = game;
  let observedTurn = game.turn;
  let animationId = 0;
  let animating = false;
  let motionPhase = '';
  let reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scoringRecord: TurnRecord | null = null;
  let scoringDialog: HTMLDialogElement;
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const [send, receive] = crossfade({
    duration: () => reduced ? 0 : 440,
    fallback: () => ({
      duration: reduced ? 0 : 280,
      css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * -10}px) scale(${0.92 + t * 0.08});`,
    }),
  });

  // Only completed turns trigger motion. Pending realtime orders never change the public board.
  $: acceptPosition(game, history);
  $: mine = shown.sides[seat];
  $: theirs = shown.sides[1 - seat];
  $: finished = game.turn === 12 && !animating;
  $: turn = Math.min(12, animating ? shown.turn : game.turn + 1);
  $: phase = Math.ceil(turn / 4);
  $: checkpoint = !finished && turn % 4 === 0;
  $: nextCheckpoint = Math.ceil(turn / 4) * 4;
  $: blocked = disabled || animating;
  $: yourName = mode === 'local' ? `Player ${seat + 1}` : 'You';
  $: origin = selected === null ? -1 : mine.board.findIndex(cards => cards.includes(selected!));
  $: choosingFront = !blocked && selected !== null && kind !== 'recall';
  $: lastTurn = history.at(-1);
  $: payment = game.sides[seat].hand[0];
  $: pending = locked[seat] || busy;
  $: instruction = animating ? motionPhase
    : locked[seat] ? 'Order locked. Waiting for your friend.'
    : mode === 'online' && !joined.every(Boolean) ? 'Waiting for your friend to join.'
    : busy ? 'Locking your order…'
    : order ? orderText(order)
    : kind === 'deploy' ? selected === null ? 'Choose a card, then a front.' : `${rank(selected)} selected. Choose Sea, Land or Air.`
    : selected === null ? 'Choose one of your deployed cards.' : 'Choose a different front.';
  $: detail = animating ? '' : pending && myLockedOrder ? orderText(myLockedOrder)
    : order && kind === 'recall' ? `Spend ${rank(payment)}. ${rank(order.card)} returns after ${checkpoint ? 'scoring' : 'this turn'}.`
    : order ? `${kind === 'shift' ? `Spend ${rank(payment)}. ` : ''}Preview excludes their secret move.`
    : kind !== 'deploy' ? `Costs your lowest hand card: ${rank(payment)}.` : 'Both orders reveal together.';

  function acceptPosition(next: State, records: TurnRecord[]) {
    if (next.turn === observedTurn) return;
    const previous = shown;
    const record = records.at(-1);
    const consecutive = next.turn === observedTurn + 1;
    observedTurn = next.turn;
    const id = ++animationId;
    if (reduced || !consecutive || !record) {
      shown = next; animating = false; motionPhase = ''; scoringRecord = null;
      onAnimation(false); return;
    }
    const frames = revealFrames(previous, next, record);
    animating = true; onAnimation(true);
    scoringRecord = null; motionPhase = `Turn ${record.turn}: orders revealed`;
    shown = frames.revealed;
    void (async () => {
      await pause(520);
      if (id !== animationId) return;
      if (record.checkpoint) {
        shown = frames.scored; scoringRecord = record; motionPhase = 'Scoring the fronts';
        await pause(reduced ? 0 : 680);
        if (id !== animationId) return;
      }
      motionPhase = record.checkpoint ? 'Highest cards spent. Recalled cards return.' : 'Recalled cards return.';
      shown = frames.settled;
      await pause(reduced ? 0 : 320);
      if (id !== animationId) return;
      motionPhase = ''; scoringRecord = null; animating = false; onAnimation(false);
    })();
  }
  function scoredWinner(front: number, player: number) {
    const values = scoringRecord?.checkpoint?.strengths;
    return !!values && values[player][front] > values[1 - player][front];
  }
  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reduced = media.matches; };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  onDestroy(() => { animationId++; onAnimation(false); });
</script>

<main class="cc-game" class:cc-revealing={animating}>
  <section class="cc-match" aria-label="Match score and turn">
    <div class="cc-player cc-you"><span>{yourName}</span>{#key shown.scores[seat]}<strong class="score-number">{shown.scores[seat]}</strong>{/key}<span class="sr-only">points</span></div>
    <div class="cc-turn"><span>{finished ? 'FINAL' : mode === 'local' ? 'LOCAL TABLE' : mode === 'online' ? 'PRIVATE TABLE' : 'SOLO TABLE'}</span><strong>{finished ? '12 / 12' : `${turn} / 12`}</strong><small>{finished ? 'Game complete' : animating ? 'Revealing' : 'Turn'}</small></div>
    <div class="cc-player cc-them">{#key shown.scores[1 - seat]}<strong class="score-number">{shown.scores[1 - seat]}</strong>{/key}<span>{opponentName}</span><span class="sr-only">points</span></div>
  </section>
  <button class="cc-scoring" class:cc-scoring-now={checkpoint} on:click={() => scoringDialog.showModal()} aria-label="Scoring details">
    <span>{finished ? 'All three checkpoints scored' : checkpoint ? 'Scoring this turn' : `Next score: turn ${nextCheckpoint}`}</span>
    <span>{phase} {phase === 1 ? 'point' : 'points'} / front <span aria-hidden="true">↗</span></span>
  </button>
  <div class="cc-turn-track" aria-hidden="true">{#each Array(12) as _, index}<span class:done={index < game.turn} class:current={index === game.turn} class:checkpoint={(index + 1) % 4 === 0}></span>{/each}</div>

  {#if mode === 'online' && connectionStatus !== 'Live'}
    <div class="cc-connection" role="status"><span>{connectionStatus === 'Connecting' ? 'Connecting to your table…' : 'Connection paused'}</span><button class="text-button" on:click={onReconnect}>Reconnect</button></div>
  {/if}
  {#if mode === 'online' && !joined[1 - seat]}
    <section class="cc-invite" aria-label="Invite a friend">
      <div><span class="eyebrow">YOUR TABLE IS OPEN</span><h2>Bring your opponent.</h2><p>Send this private invitation to play from another device.</p></div>
      <div class="cc-invite-controls"><button class="primary" on:click={onCopy}>Copy invitation <Icon name="arrow" size={18} /></button><input aria-label="Invitation link" readonly value={inviteLink} on:focus={event => event.currentTarget.select()} />{#if toast}<small role="status">{toast}</small>{/if}</div>
    </section>
  {/if}
  {#if finished}
    <section class="cc-result" role="status">
      <div><p class="eyebrow">TWELVE TURNS. ONE RESULT.</p><h1>{shown.scores[seat] === shown.scores[1 - seat] ? 'An even match.' : shown.scores[seat] > shown.scores[1 - seat] ? `${yourName === 'You' ? 'You win' : `${yourName} wins`}.` : `${mode === 'solo' ? 'The computer' : opponentName} wins.`}</h1></div>
      <button class="primary" on:click={onAgain} disabled={busy}>{mode === 'online' ? 'Create a new table' : 'Play again'} <Icon name="arrow" size={20} /></button>
    </section>
  {/if}

  <section class="cc-public-hand" aria-label="Opponent public hand">
    <div class="cc-hand-heading"><h2>{mode === 'local' ? `${opponentName}’s hand` : 'Their hand'}</h2><span>{mode === 'online' && locked[1 - seat] && !finished ? 'Order locked' : 'Public'}</span></div>
    <div class="cc-mini-hand">
      {#each theirs.hand as card (card)}
        <span in:receive={{ key: `${1 - seat}:${card}` }} out:send={{ key: `${1 - seat}:${card}` }} aria-label={`${rankName(card)}, value ${card}`}>{rank(card)}</span>
      {/each}
    </div>
  </section>

  <section class="cc-board" aria-label="Sea, Land and Air fronts">
    {#each fronts as front, index}
      <Front
        {front}
        {index}
        {mine}
        {theirs}
        {seat}
        {opponentName}
        {yourName}
        {kind}
        {origin}
        {destination}
        {order}
        {animating}
        {selected}
        {blocked}
        {choosingFront}
        projected={projected[index]}
        enemyScored={scoredWinner(index, 1 - seat)}
        ownScored={scoredWinner(index, seat)}
        {send}
        {receive}
        {onFront}
        {onBoardCard}
      />
    {/each}
  </section>
  <div class="cc-board-key"><span>↑ {opponentName}</span><span>{checkpoint && !finished ? 'Highest cards leave after scoring' : 'Strength = sum of card values'}</span><span>↓ {yourName}</span></div>

  <section class="cc-controls" aria-label="Choose your order">
    {#if !finished && !localReview}
      <div class="cc-action-tabs" aria-label="Action">
        {#each ['deploy', 'shift', 'recall'] as action}
          <button class:cc-active={kind === action} aria-pressed={kind === action} disabled={blocked || (action !== 'deploy' && mine.board.flat().length === 0)} on:click={() => onKind(action as ActionKind)}><Icon name={action} size={19} />{action === 'deploy' ? 'Deploy' : action === 'shift' ? 'Shift' : 'Recall'}</button>
        {/each}
      </div>
    {/if}
    <div class="cc-hand-heading"><h2>{mode === 'local' ? `${yourName}’s hand` : 'Your hand'}</h2><span>{!finished && kind !== 'deploy' && !localReview ? `Payment: ${rank(payment)}` : `${mine.hand.length} cards · Public`}</span></div>
    <div class="cc-hand">
      {#each mine.hand as card (card)}
        <button class="cc-hand-card" class:cc-picked={selected === card && kind === 'deploy' && !animating} class:cc-payment={kind !== 'deploy' && card === payment && !animating && !localReview} in:receive={{ key: `${seat}:${card}` }} out:send={{ key: `${seat}:${card}` }} disabled={blocked || kind !== 'deploy' || localReview || finished} on:click={() => onCard(card)} aria-label={`Play ${rankName(card)}`} aria-pressed={selected === card && kind === 'deploy' && !animating}><b>{rank(card)}</b><span class="cc-card-suit" aria-hidden="true">{seat === 0 ? '♠' : '♦'}</span><small>{card}</small></button>
      {/each}
    </div>
  </section>

  {#if !finished}
    <div class="cc-command" class:cc-command-ready={!!order || pending || localReview}>
      <div class="cc-guidance" aria-live="polite">
        {#if pending && !animating}<span class="cc-pending-icon"><Icon name="lock" size={18} /></span>{/if}
        <div><p>{localReview && !animating ? 'Review both moves together.' : instruction}</p>{#if !localReview && detail}<small>{detail}</small>{/if}</div>
      </div>
      {#if localReview}<button class="primary cc-lock" disabled={animating} on:click={onNext}>Next turn <Icon name="arrow" size={18} /></button>
      {:else}<button class="primary cc-lock" disabled={blocked || !order} on:click={onLock}><Icon name="lock" size={17} />{locked[seat] ? 'Locked' : busy ? 'Locking…' : animating ? 'Revealing…' : 'Lock order'}</button>{/if}
    </div>
  {/if}
  {#if lastTurn}
    <section class="cc-reveal" aria-label="Last revealed orders" aria-live="polite">
      <h2>TURN {lastTurn.turn} <span>REVEALED</span></h2>
      <p><span>{yourName}: {orderText(lastTurn.actions[seat])}</span><span>{opponentName}: {orderText(lastTurn.actions[1 - seat])}</span></p>
      {#if lastTurn.checkpoint}<div class="cc-checkpoint-result">Checkpoint: {yourName.toLowerCase()} +{lastTurn.checkpoint.gained[seat]}, {opponentName.toLowerCase()} +{lastTurn.checkpoint.gained[1 - seat]}. Highest cards spent; recalled cards returned.</div>{/if}
    </section>
  {/if}
  <details class="cc-details">
    <summary>Game details <span>{history.length} turns revealed</span></summary>
    <p>{mode === 'online' ? `Private table · ${connectionStatus}` : mode === 'local' ? 'Local table. Completed turns are saved on this device. Unrevealed local orders are not saved after leaving the table.' : `${opponentName}. Saved on this device.`}</p>
    {#if mode === 'online'}<button class="text-button" on:click={onReconnect}>Reconnect</button>{/if}
    <p>All hands are public. Only the current orders are secret. Ace = 1, Jack = 11, Queen = 12, King = 13.</p>
    <button class="text-button" on:click={() => scoringDialog.showModal()}>Scoring & exhaustion ↗</button>
    {#if history.length}
      <table class="cc-history"><thead><tr><th>Turn</th><th>{yourName}</th><th>{opponentName}</th></tr></thead><tbody>{#each history as entry}<tr><td>{entry.turn}</td><td>{orderText(entry.actions[seat])}{#if entry.checkpoint}<small>+{entry.checkpoint.gained[seat]} points</small>{/if}</td><td>{orderText(entry.actions[1 - seat])}{#if entry.checkpoint}<small>+{entry.checkpoint.gained[1 - seat]} points</small>{/if}</td></tr>{/each}</tbody></table>
    {/if}
    <p>Your spent cards: {mine.spent.map(rank).join(' · ') || 'None'}<br />Their spent cards: {theirs.spent.map(rank).join(' · ') || 'None'}</p>
  </details>
</main>

<dialog bind:this={scoringDialog} aria-labelledby="scoring-title">
  <div class="dialog-top"><span class="eyebrow">FIELD GUIDE / SCORING</span><button class="close-button" on:click={() => scoringDialog.close()} aria-label="Close scoring details">×</button></div>
  <h2 id="scoring-title">Three chances to score.</h2>
  <p>At each checkpoint, more strength wins the front. A tied front awards nothing.</p>
  <div class="rule-scoring">{#each [1, 2, 3] as stage}<span>TURN {stage * 4}<b>{stage} {stage === 1 ? 'point' : 'points'}</b>per front</span>{/each}</div>
  <h3>After scoring</h3>
  <p>Each player removes their own highest card at every occupied front, whether they win, lose or tie.</p>
  <p>Recall keeps its card there for scoring, then returns it to your hand. If it was the highest, no replacement card is removed.</p>
  <p>The higher total score after turn 12 wins. Equal scores are a draw.</p>
  <button class="primary" on:click={() => scoringDialog.close()}>Back to game <Icon name="arrow" size={20} /></button>
</dialog>
