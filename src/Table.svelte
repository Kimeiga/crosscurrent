<script lang="ts">
  import { onDestroy, onMount, untrack, type Snippet } from 'svelte';
  import { crossfade } from 'svelte/transition';
  import Card from './Card.svelte';
  import { actions as legalActions, prepare, sameAction, sum, rank, rankName, pointsAt, scoringTurns, tiebreakStrength, RULES, type Action, type State, type TurnRecord } from './engine';
  import { fronts, orderText, revealFrames, exhaustTargets } from './ui';

  type Props = {
    game: State;
    history: TurnRecord[];
    seat: 0 | 1;
    /** Display names indexed by seat. */
    names: [string, string];
    canAct: boolean;
    /** Shown in the command bar whenever the player cannot act. */
    status?: string;
    /** My committed order while the other player is still choosing. */
    locked?: Action | null;
    /** The other player has committed this turn's order (online). */
    theirsLocked?: boolean;
    /** Tutorial constraint. */
    allowed?: ((a: Action) => boolean) | null;
    /** Coaching line shown above the board (tutorial and first-game tips). */
    coach?: string;
    /** Adds a Hide tips button to the coaching line. */
    onDismissCoach?: () => void;
    lockLabel?: string;
    onLock: (a: Action) => void;
    onBusy?: (busy: boolean) => void;
    banner?: Snippet;
    /** Replaces the command buttons (tutorial navigation). */
    footer?: Snippet;
  };
  let { game, history, seat, names, canAct, status = '', locked = null, theirsLocked = false, allowed = null, coach = '', onDismissCoach, lockLabel = 'Lock in', onLock, onBusy = () => {}, banner, footer }: Props = $props();

  type Phase = 'idle' | 'reveal' | 'score' | 'settle';
  let shown = $state.raw<State>(untrack(() => game));
  let phase = $state<Phase>('idle');
  let scoring = $state.raw<TurnRecord | null>(null);
  let pick = $state<{ from: 'hand' | 'board'; card: number } | null>(null);
  let target = $state<number | 'recall' | null>(null);
  let refusal = $state('');
  let movesDialog = $state<HTMLDialogElement>();
  let reduced = $state(false);
  let observed = untrack(() => game.turn);
  let run = 0;

  const [send, receive] = crossfade({
    duration: () => (reduced ? 0 : 420),
    fallback: () => ({ duration: reduced ? 0 : 220, css: (t: number) => `opacity: ${t}; transform: scale(${0.9 + t * 0.1});` }),
  });
  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, reduced ? 0 : ms));

  $effect(() => {
    const next = game;
    const records = history;
    untrack(() => accept(next, records));
  });

  function accept(next: State, records: TurnRecord[]) {
    if (next.turn === observed) {
      if (phase === 'idle') shown = next;
      return;
    }
    const previous = shown;
    const record = records.at(-1);
    const consecutive = next.turn === observed + 1 && record?.turn === next.turn;
    observed = next.turn;
    pick = null; target = null; refusal = '';
    const id = ++run;
    if (reduced || !consecutive || !record) {
      shown = next; phase = 'idle'; scoring = null; onBusy(false);
      return;
    }
    const frames = revealFrames(previous, next, record);
    onBusy(true);
    phase = 'reveal'; shown = frames.revealed; scoring = null;
    void (async () => {
      await wait(900);
      if (id !== run) return;
      if (record.checkpoint) {
        phase = 'score'; shown = frames.scored; scoring = record;
        await wait(1700);
        if (id !== run) return;
      }
      phase = 'settle'; shown = frames.settled;
      await wait(450);
      if (id !== run) return;
      phase = 'idle'; scoring = null; onBusy(false);
    })();
  }

  const me = $derived(shown.sides[seat]);
  const them = $derived(shown.sides[1 - seat]);
  const interactive = $derived(canAct && phase === 'idle' && !locked && game.turn < 12);
  const nextTurn = $derived(Math.min(12, game.turn + 1));
  const stake = $derived(pointsAt(nextTurn));
  const upcoming = $derived(scoringTurns().find(t => t >= nextTurn) ?? 12);
  const scoringTurn = $derived(phase === 'idle' && game.turn < 12 && stake > 0);
  const live = $derived(game.sides[seat]);
  const payment = $derived(live.hand[0]);
  const origin = $derived(pick?.from === 'board' ? live.board.findIndex(f => f.includes(pick!.card)) : -1);
  const order = $derived.by((): Action | null => {
    if (!pick || target === null) return null;
    const candidate: Action = pick.from === 'hand'
      ? { kind: 'deploy', card: pick.card, front: target as number }
      : target === 'recall' ? { kind: 'recall', card: pick.card, front: -1 } : { kind: 'shift', card: pick.card, front: target as number };
    return legalActions(live).some(a => sameAction(a, candidate)) ? candidate : null;
  });
  const staged = $derived(locked ?? order);
  const projected = $derived(staged ? prepare(live, staged).side : null);
  const myStrength = $derived(me.board.map(sum));
  const theirStrength = $derived(them.board.map(sum));
  /** Cards spent after this turn's scoring: my side reflects a staged Recall, which saves its card. */
  const marks = $derived.by(() => {
    if (!scoringTurn || nextTurn === 12) return null;
    const result = [exhaustTargets(shown.sides[0]), exhaustTargets(shown.sides[1])];
    if (staged?.kind === 'recall') {
      const front = live.board.findIndex(f => f.includes(staged.card));
      if (front >= 0 && result[seat][front] === staged.card) result[seat][front] = null;
    }
    return result;
  });
  /** On scoring turns: fronts whose lead no single order of the other side can overturn. */
  const safe = $derived.by(() => {
    if (!scoringTurn) return null;
    const mine = projected ?? live;
    const theirs = game.sides[1 - seat];
    const reach = (side: typeof live, front: number) => Math.max(0, ...side.hand, ...side.board.flatMap((cards, f) => (f === front ? [] : cards)));
    return [0, 1, 2].map(f => {
      const a = sum(mine.board[f]), b = sum(theirs.board[f]);
      return { mine: a > b + reach(theirs, f), theirs: b > a + reach(live, f) };
    });
  });
  const last = $derived(history.at(-1));
  /** Shown only while points are level and the tiebreak could decide the game. */
  const tiebreak = $derived.by(() => {
    if (RULES.tiebreak === 'none' || shown.scores[0] !== shown.scores[1] || phase !== 'idle') return null;
    const recorded = history.filter(entry => entry.turn <= shown.turn);
    if (RULES.tiebreak === 'total-strength' && !recorded.some(entry => entry.checkpoint)) return null;
    if (RULES.tiebreak === 'final-strength' && shown.turn < 12) return null;
    return tiebreakStrength(recorded);
  });
  const revealing = $derived(phase !== 'idle' && last && last.turn === shown.turn ? last : null);

  function choose(from: 'hand' | 'board', card: number) {
    if (!interactive) return;
    refusal = '';
    if (pick && pick.from === from && pick.card === card) { pick = null; target = null; return; }
    pick = { from, card }; target = null;
  }
  function aim(front: number | 'recall') {
    if (!interactive || !pick) return;
    if (pick.from === 'board' && front === origin) { pick = null; target = null; return; }
    target = front; refusal = '';
    if (order && allowed && !allowed(order)) { refusal = 'Not this time. Follow the highlighted step.'; target = null; }
  }
  function lock() {
    if (!order || !interactive) return;
    if (allowed && !allowed(order)) { refusal = 'Not this time. Follow the highlighted step.'; return; }
    const chosen = order;
    pick = null; target = null;
    onLock(chosen);
  }
  function clear() { pick = null; target = null; refusal = ''; }
  function scored(front: number, side: number) {
    const values = scoring?.checkpoint?.strengths;
    return !!values && values[side][front] > values[1 - side][front];
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') clear();
    if (event.key === 'Enter' && order && interactive && !(event.target instanceof HTMLButtonElement)) lock();
  }
  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced = media.matches;
    const update = () => { reduced = media.matches; };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });
  onDestroy(() => { run++; onBusy(false); });

  const instruction = $derived.by(() => {
    if (phase === 'reveal') return 'Both orders revealed.';
    if (phase === 'score') return `Scoring: ${scoring?.checkpoint?.points ?? ''} per front won.`;
    if (phase === 'settle') return scoring || last?.checkpoint ? 'Highest cards are spent. Recalled cards return.' : 'Recalled cards return.';
    if (game.turn >= 12) return 'Game over.';
    if (locked) return status || 'Locked in. Waiting for the other order.';
    if (!canAct) return status;
    if (refusal) return refusal;
    if (order) return orderText(order);
    if (!pick) return live.board.flat().length ? 'Pick a card in your hand or on the board.' : 'Pick a card from your hand.';
    if (pick.from === 'hand') return `Deploy ${rank(pick.card)}: tap a front.`;
    return `Move ${rank(pick.card)}: tap another front, or recall it.`;
  });
  const detail = $derived.by(() => {
    if (phase !== 'idle' || game.turn >= 12) return '';
    const cost = rank(payment);
    if (locked) return orderText(locked);
    if (order && order.kind !== 'deploy') return `Pays your lowest card, ${cost}.${order.kind === 'recall' ? stake ? ' It still counts for this scoring.' : '' : ''}`;
    if (pick?.from === 'board') return `Shift or recall pays your lowest card, ${cost}.`;
    if (!pick && last) return `Last turn · ${names[seat]}: ${orderText(last.actions[seat])} · ${names[1 - seat]}: ${orderText(last.actions[1 - seat])}`;
    return '';
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="table" class:busy={phase !== 'idle'} style={`--mine: var(--seat${seat}); --theirs: var(--seat${1 - seat}); --mine-wash: var(--seat${seat}-wash); --theirs-wash: var(--seat${1 - seat}-wash);`}>
  <section class="scoreline" aria-label="Score">
    <div class="player me"><span class="name">{names[seat]}</span><strong>{shown.scores[seat]}</strong></div>
    <div class="player them"><strong>{shown.scores[1 - seat]}</strong><span class="name">{names[1 - seat]}{#if theirsLocked && phase === 'idle' && game.turn < 12}<em class="ready">locked in</em>{/if}</span></div>
    {#if tiebreak}
      <p class="tiebreak" title={RULES.tiebreak === 'total-strength' ? 'Equal points are decided by total strength summed over every scoring' : 'Equal points are decided by total strength at the last scoring'}>
        Level on points. Tiebreak strength: {names[seat]} {tiebreak[seat]}, {names[1 - seat]} {tiebreak[1 - seat]}
      </p>
    {/if}
  </section>
  <ol class="track" aria-hidden="true">
    {#each Array(12) as _, i}
      {@const t = i + 1}
      <li class:done={t <= shown.turn} class:now={phase === 'idle' && t === nextTurn && game.turn < 12} class:cp={pointsAt(t) > 0}></li>
    {/each}
  </ol>
  <p class="stakes" class:hot={scoringTurn}>
    {#if game.turn >= 12 && phase === 'idle'}<b>Final score</b>
    {:else if phase !== 'idle'}<b>Turn {shown.turn} of 12</b> · revealing
    {:else if scoringTurn}<b>Turn {nextTurn} of 12 · scores {stake} per front won</b>
    {:else}<b>Turn {nextTurn} of 12</b> · next scoring on turn {upcoming}, {pointsAt(upcoming)} per front{/if}
  </p>

  {#if coach}<div class="coach" role="note"><p>{coach}</p>{#if onDismissCoach}<button class="hide" onclick={onDismissCoach} aria-label="Hide tips" title="Hide tips">×</button>{/if}</div>{/if}
  {#if banner}{@render banner()}{/if}

  <section class="side-row them-row" aria-label={`${names[1 - seat]}’s hand`}>
    <span class="row-label">{names[1 - seat] === 'You' ? 'Your' : `${names[1 - seat]}’s`} hand</span>
    <div class="mini-hand">
      {#each them.hand as card (card)}
        <span class="mini" in:receive={{ key: `${1 - seat}:${card}` }} out:send={{ key: `${1 - seat}:${card}` }}><Card {card} seat={1 - seat} size="xs" /></span>
      {/each}
    </div>
    <div class="spent" title="Spent cards" class:empty={!them.spent.length}>
      {#if them.spent.length}<span class="row-label">Spent</span>{/if}
      {#each them.spent as card (card)}
        <span class="mini gone" in:receive={{ key: `${1 - seat}:${card}` }} out:send={{ key: `${1 - seat}:${card}` }}><Card {card} seat={1 - seat} size="xs" /></span>
      {/each}
    </div>
  </section>

  <section class="board" aria-label="Fronts">
    {#each fronts as name, f}
      {@const mine = myStrength[f]}
      {@const theirs = theirStrength[f]}
      {@const projectedHere = projected ? sum(projected.board[f]) : mine}
      {@const canAim = interactive && !!pick && !(pick.from === 'board' && origin === f)}
      <div class="front" class:target={canAim} class:chosen={staged && staged.kind !== 'recall' && staged.front === f}
        class:lead-me={phase === 'idle' && mine > theirs} class:lead-them={phase === 'idle' && theirs > mine}>
        <div class="pile theirs">
          {#each them.board[f] as card (card)}
            <span class="placed" class:doomed={marks?.[1 - seat][f] === card} in:receive={{ key: `${1 - seat}:${card}` }} out:send={{ key: `${1 - seat}:${card}` }}><Card {card} seat={1 - seat} size="sm" /></span>
          {/each}
        </div>
        <div class="num theirs" class:won={scored(f, 1 - seat)}>{theirs}{#if scored(f, 1 - seat)}<em>+{scoring?.checkpoint?.points}</em>{/if}{#if safe?.[f].theirs}<span class="safe" title="No single order of yours can overturn this">safe</span>{/if}</div>
        <button class="label" disabled={!canAim} onclick={() => aim(f)} aria-label={`${name} front${canAim ? `: ${pick?.from === 'hand' ? 'deploy' : 'shift'} here` : ''}`}>
          <span>{name}</span>
        </button>
        <div class="num mine" class:won={scored(f, seat)}>
          {mine}{#if projected && projectedHere !== mine}<i>→ {projectedHere}</i>{/if}{#if scored(f, seat)}<em>+{scoring?.checkpoint?.points}</em>{/if}{#if safe?.[f].mine}<span class="safe" title="No single order of theirs can overturn this">safe</span>{/if}
        </div>
        <div class="pile mine">
          {#each me.board[f] as card (card)}
            <button class="placed" class:picked={pick?.from === 'board' && pick.card === card} class:doomed={marks?.[seat][f] === card}
              class:moving={staged && staged.kind !== 'deploy' && staged.card === card}
              disabled={!interactive} onclick={() => choose('board', card)} aria-label={`Your ${rankName(card)} on ${name}`} aria-pressed={pick?.from === 'board' && pick.card === card}
              in:receive={{ key: `${seat}:${card}` }} out:send={{ key: `${seat}:${card}` }}><Card {card} {seat} size="sm" /></button>
          {/each}
          {#if staged && staged.kind !== 'recall' && staged.front === f}
            <span class="ghost" aria-hidden="true"><Card card={staged.card} {seat} size="sm" /></span>
          {/if}
        </div>
      </div>
    {/each}
  </section>
  {#if marks}<p class="legend"><span class="swatch"></span> Dashed cards are spent after scoring unless recalled.</p>{/if}

  <div class="side-row me-row" class:empty={!me.spent.length && !history.length}>
    {#if history.length}<button class="link moves" onclick={() => movesDialog?.showModal()}>Moves so far</button>{/if}
    <section class="spent mine-spent" aria-label="Your spent cards">
      {#if me.spent.length}<span class="row-label">Your spent cards</span>{/if}
      {#each me.spent as card (card)}
        <span class="mini gone" in:receive={{ key: `${seat}:${card}` }} out:send={{ key: `${seat}:${card}` }}><Card {card} {seat} size="xs" /></span>
      {/each}
    </section>
  </div>


  <div class="dock">
    <section class="hand" aria-label="Your hand">
      {#each me.hand as card (card)}
        <button class="in-hand" class:picked={pick?.from === 'hand' && pick.card === card}
          class:pays={(pick?.from === 'board' || (staged && staged.kind !== 'deploy')) && card === payment && phase === 'idle'}
          class:leaving={staged?.kind === 'deploy' && staged.card === card}
          disabled={!interactive} onclick={() => choose('hand', card)} aria-label={`${rankName(card)} in your hand`} aria-pressed={pick?.from === 'hand' && pick.card === card}
          in:receive={{ key: `${seat}:${card}` }} out:send={{ key: `${seat}:${card}` }}><Card {card} {seat} /></button>
      {/each}
    </section>
      {#if footer && phase === 'idle'}
        <div class="command">{@render footer()}</div>
      {:else if game.turn < 12 || phase !== 'idle'}
        <div class="command" class:stacked={pick?.from === 'board' && interactive} aria-live="polite">
          <div class="say">
            <p>{instruction}</p>
            {#if revealing}
              <small>{names[seat]}: {orderText(revealing.actions[seat])} · {names[1 - seat]}: {orderText(revealing.actions[1 - seat])}</small>
            {:else if detail}<small class:recap={detail.startsWith('Last turn')}>{detail}</small>{/if}
          </div>
          <div class="do">
            {#if pick?.from === 'board' && interactive}
              <button class="btn small recall" aria-pressed={target === 'recall'} onclick={() => aim('recall')}>{target === 'recall' ? '✓ Recall' : 'Recall'}</button>
            {/if}
            {#if pick && interactive}<button class="btn quiet small" onclick={clear}>Cancel</button>{/if}
            {#if game.turn < 12 && !locked}
              <button class="btn primary lock" disabled={!order || !interactive} onclick={lock}>{lockLabel}</button>
            {/if}
          </div>
        </div>
      {/if}
  </div>

<dialog bind:this={movesDialog} aria-labelledby="moves-title" onclick={event => { if (event.target === event.currentTarget) movesDialog?.close(); }}>
  <div class="sheet">
    <div class="sheet-top">
      <h2 id="moves-title">Moves so far</h2>
      <button class="close" onclick={() => movesDialog?.close()} aria-label="Close the move list">×</button>
    </div>
    <ol class="log">
      <li class="head" aria-hidden="true"><span class="t">Turn</span><span>{names[seat]}</span><span class="opp">{names[1 - seat]}</span></li>
      {#each history as entry}
        <li>
          <span class="t">{entry.turn}</span><span>{orderText(entry.actions[seat])}</span><span class="opp">{orderText(entry.actions[1 - seat])}</span>
          {#if entry.checkpoint}<span class="pts">Scoring: {names[seat]} +{entry.checkpoint.gained[seat]}, {names[1 - seat]} +{entry.checkpoint.gained[1 - seat]}</span>{/if}
        </li>
      {/each}
    </ol>
  </div>
</dialog>
</div>

<style>
  .table { width: min(100%, 760px); margin: 0 auto; padding: 4px var(--gutter) max(16px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; flex: 1 0 auto; gap: 10px; }
  .scoreline { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 8px; }
  .player { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .player strong { font-family: var(--serif); font-size: 34px; line-height: 1; font-variant-numeric: tabular-nums; }
  .player .name { font-size: 15px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .player.them { justify-content: flex-end; }
  .tiebreak { grid-column: 1 / -1; font-size: 13px; color: var(--ink-2); }
  .ready { display: block; font-style: normal; font-size: 12px; font-weight: 650; color: var(--theirs); text-align: right; }
  .player.me strong { color: var(--mine); }
  .player.them strong { color: var(--theirs); }
  .track { list-style: none; display: grid; grid-template-columns: repeat(12, 1fr); gap: 3px; margin: 0; padding: 0; }
  .track li { position: relative; height: 6px; border-radius: 3px; background: var(--paper-3); }
  .track li.cp { background: var(--ink-3); opacity: .55; }
  .track li.done { background: var(--ink-3); opacity: 1; }
  .track li.now { background: var(--ink); opacity: 1; }
  .stakes { font-size: 14px; color: var(--ink-2); min-height: 20px; }
  .stakes b { color: var(--ink); }
  .stakes.hot { color: var(--ink); }
  .stakes b { font-weight: 650; }

  .side-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px 12px; min-height: 32px; }
  .row-label { font-size: 13px; color: var(--ink-2); margin-right: 4px; align-self: center; }
  .them-row > .row-label { flex-basis: 100%; }
  .mini-hand, .spent { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0; }
  .spent.empty { display: none; }
  .me-row.empty { min-height: 0; margin-top: -10px; }
  .spent { justify-content: flex-end; }
  .mini { display: inline-flex; }
  .mini.gone { opacity: .45; }
  .me-row { min-height: 30px; }
  .mine-spent { margin-left: auto; }
  .moves { font-size: 14px; color: var(--ink-2); }

  /* One row grid shared by all three fronts (subgrid), so their labels line up whatever each pile holds. */
  .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: minmax(58px, auto) 30px 40px 30px minmax(58px, auto); gap: 0 8px; }
  .front { grid-row: span 5; display: grid; grid-template-rows: minmax(58px, auto) 30px 40px 30px minmax(58px, auto); grid-template-rows: subgrid; border-radius: var(--radius); background: var(--paper-2); transition: box-shadow 140ms, background-color 200ms; min-width: 0; }
  .front.lead-me { background: linear-gradient(to top, var(--mine-wash), transparent 70%), var(--paper-2); }
  .front.lead-them { background: linear-gradient(to bottom, var(--theirs-wash), transparent 70%), var(--paper-2); }
  .front.target { box-shadow: inset 0 0 0 2px var(--ink-3); }
  .front.chosen { box-shadow: inset 0 0 0 2px var(--ink); }
  .pile { display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: 4px; padding: 6px 4px; min-width: 0; }
  .pile.theirs { align-content: flex-end; }
  .pile.mine { align-content: flex-start; }
  .placed { display: inline-flex; border-radius: 6px; }
  button.placed:not(:disabled):hover { transform: translateY(-2px); }
  .placed.picked { outline: 2px solid var(--ink); outline-offset: 2px; transform: translateY(-2px); }
  .placed.moving { opacity: .5; }
  .placed.doomed :global(.card) { border-style: dashed; border-color: var(--heart); }
  .ghost { display: inline-flex; opacity: .55; }
  .num { display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; font-family: var(--serif); font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .num.theirs { color: var(--theirs); }
  .num.mine { color: var(--mine); }
  .num i { font-style: normal; font-family: var(--sans); font-size: 14px; font-weight: 600; color: var(--ink-2); }
  .num em { font-style: normal; font-family: var(--sans); font-size: 13px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--mine); color: var(--paper); }
  .num.theirs em { background: var(--theirs); }
  .num.won { animation: pop 500ms ease-out; }
  .safe { font-family: var(--sans); font-size: 11px; font-weight: 650; letter-spacing: .02em; padding: 1px 6px; border-radius: 999px; border: 1px solid currentColor; opacity: .85; }
  .label { display: flex; align-items: center; justify-content: center; border-block: 1px solid var(--line); font-size: 13px; font-weight: 600; letter-spacing: .02em; color: var(--ink-2); text-transform: none; }
  .label:not(:disabled) { color: var(--ink); background: var(--surface); }
  .label:not(:disabled):hover { background: var(--paper); }
  .legend { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-2); margin-top: -2px; }
  .swatch { width: 14px; height: 18px; border: 1.5px dashed var(--heart); border-radius: 3px; flex-shrink: 0; }

  .hand { display: grid; grid-template-columns: repeat(13, minmax(0, 1fr)); gap: 6px; }
  .in-hand { display: flex; justify-content: center; border-radius: 8px; transition: transform 120ms; }
  .in-hand :global(.card) { --cw: 100%; max-width: 54px; --ch: 74px; }
  .in-hand:not(:disabled):hover { transform: translateY(-3px); }
  .in-hand.picked { transform: translateY(-8px); }
  .in-hand.picked :global(.card) { outline: 2px solid var(--ink); outline-offset: 2px; }
  .in-hand.pays :global(.card) { outline: 2px dashed var(--heart); outline-offset: 2px; }
  .in-hand.leaving { opacity: .4; }
  .in-hand:disabled { cursor: default; }

  .dock { position: sticky; bottom: 0; z-index: 3; display: grid; gap: 8px; padding: 10px 0 max(10px, env(safe-area-inset-bottom)); background: var(--paper); border-top: 1px solid var(--line); box-shadow: 0 -10px 16px -12px #2a20101f; }
  .coach { display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); font-size: 15px; line-height: 1.4; }
  .coach p { flex: 1; }
  .coach .hide { width: 36px; height: 36px; margin: -8px -10px -8px 0; border-radius: 50%; font-size: 22px; line-height: 1; color: var(--ink-2); flex-shrink: 0; }
  .coach .hide:hover { background: var(--paper-2); }
  @media (max-width: 640px) { .coach { font-size: 14px; padding: 8px 12px; } }
  .command { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .say { min-width: 0; flex: 1 1 160px; }
  .say p { font-size: 16px; font-weight: 600; line-height: 1.3; }
  .say small { display: block; margin-top: 2px; font-size: 13px; color: var(--ink-2); }
  .do { display: flex; gap: 6px; align-items: center; flex-shrink: 0; margin-left: auto; }
  .lock { min-width: 108px; }
  .recall[aria-pressed='true'] { border-color: var(--ink); background: var(--paper-2); }
  @media (max-width: 640px) {
    .command.stacked .say { flex-basis: 100%; }
  }

  .log { list-style: none; margin: 4px 0 0; padding: 0; font-size: 15px; }
  .log li { display: grid; grid-template-columns: 40px 1fr 1fr; gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--line); color: var(--ink); }
  .log li.head { padding-top: 0; border-top: 0; font-size: 13px; font-weight: 600; color: var(--ink-2); }
  .log .t { color: var(--ink-3); font-variant-numeric: tabular-nums; }
  .log .opp { color: var(--theirs); }
  .log .pts { grid-column: 2 / -1; font-size: 13px; color: var(--ink-2); }
  .busy .command { opacity: 1; }
  @keyframes pop { 40% { transform: scale(1.25); } }

  @media (max-width: 640px) {
    .table { gap: 8px; }
    .player strong { font-size: 30px; }
    .hand { grid-template-columns: repeat(7, minmax(0, 1fr)); }
    .in-hand :global(.card) { --ch: 64px; }
    .board { grid-template-rows: minmax(52px, auto) 26px 38px 26px minmax(52px, auto); column-gap: 6px; }
    .num { font-size: 20px; }
    .log { font-size: 14px; }
    .lock { min-width: 96px; }
  }
  /* Phones and portrait tablets: the board takes the spare height, so the hand and Lock in sit at the bottom of the screen. */
  @media (max-width: 640px), (max-width: 899px) and (orientation: portrait) {
    .board { flex: 1 0 auto; }
    .dock { margin-top: auto; }
  }
  @media (max-width: 640px) and (max-height: 760px), (max-height: 500px) {
    .in-hand :global(.card) { --ch: 54px; --rs: 20px; --ss: 12px; --bs: 20px; padding-top: 4px; }
    .hand { gap: 4px 6px; }
    .board { grid-template-rows: minmax(46px, auto) 24px 34px 24px minmax(46px, auto); }
    .say small.recap { display: none; }
    .dock { gap: 6px; padding-top: 8px; }
  }
  @media (max-width: 370px) {
    .pile :global(.card.sm) { --cw: 30px; --ch: 42px; --rs: 14px; }
    .num { gap: 3px; }
    .num i { font-size: 12px; }
    .safe { font-size: 10px; padding: 0 4px; }
  }
  @media (min-width: 900px) {
    .table { width: min(100%, 980px); gap: 12px; }
    .player strong { font-size: 40px; }
    .board { grid-template-rows: minmax(84px, auto) 34px 44px 34px minmax(84px, auto); }
    .pile :global(.card.sm) { --cw: 52px; --ch: 72px; --rs: 23px; --ss: 14px; padding: 5px 0 0 6px; border-radius: 7px; }
    .num { font-size: 26px; }
    .label { font-size: 15px; }
    .in-hand :global(.card) { max-width: 66px; --ch: 92px; --rs: 26px; --ss: 16px; --bs: 30px; }
    .mini :global(.card.xs) { --cw: 26px; --ch: 36px; --rs: 14px; }
  }
</style>
