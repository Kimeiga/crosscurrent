<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import Table from './Table.svelte';
  import Lobby from './Lobby.svelte';
  import Icon from './Icon.svelte';
  import './table-ux.css';
  import { initial, resolve, replay, prepare, actions, sameAction, sum, type Action, type ActionKind, type State, type TurnRecord } from './engine';
  import { chooseAction, type Difficulty } from './ai';
  import { createRoom, joinRoom, getRoom, submitOrder, watchRoom, unwatchRoom, disconnect, invitation, networkError, type Session } from './network';
  import type { RoomView } from '../backend/rooms';

  type Mode = 'solo' | 'online' | 'local';
  type Save = { version: number; difficulty?: Difficulty; pairs: [Action, Action][] };
  let screen: 'home' | 'game' = 'home';
  let mode: Mode = 'solo';
  let game: State = initial();
  let history: TurnRecord[] = [];
  let seat: 0 | 1 = 0;
  let difficulty: Difficulty = 'tactical';
  let kind: ActionKind = 'deploy';
  let selected: number | null = null;
  let destination: number | null = null;
  let busy = false;
  let animationBusy = false;
  let message = '';
  let toast = '';
  let connectionStatus = 'Connecting';
  let joined: [boolean, boolean] = [true, true];
  let locked: [boolean, boolean] = [false, false];
  let myLockedOrder: Action | null = null;
  let session: Session | null = null;
  let savedSolo = false;
  let savedRoom = false;
  let savedLocal = false;
  let joinLink = '';
  let localStage: 'handoff' | 'choose' | 'sealed' | 'review' = 'handoff';
  let localOrders: [Action | null, Action | null] = [null, null];
  let rulesDialog: HTMLDialogElement;
  let restartDialog: HTMLDialogElement;
  let pendingStart: (() => void) | null = null;
  let replacement = 'solo';
  let worker: Worker | null = null;
  let workerSequence = 0;
  let aiPromise: Promise<Action> | null = null;
  const pendingAi = new Map<number, { resolve: (action: Action) => void; reject: (error: Error) => void }>();
  let epoch = 0;
  let viewSequence = 0;
  let lastView = 0;
  let alive = true;

  function store(key: string, value: unknown) {
    try { localStorage.setItem(`crosscurrent:${key}`, JSON.stringify(value)); }
    catch { message = 'Browser storage is unavailable. Keep this tab open to retain your game.'; }
  }
  function read<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(`crosscurrent:${key}`) || 'null'); }
    catch { return null; }
  }
  $: mine = game.sides[seat];
  $: finished = game.turn === 12;
  $: turn = Math.min(12, game.turn + 1);
  $: disabled = busy || animationBusy || finished || locked[seat] || (mode === 'online' && !joined.every(Boolean)) || (mode === 'local' && localStage !== 'choose');
  $: order = makeOrder(mine, kind, selected, destination);
  $: projected = order ? prepare(mine, order).side.board.map(sum) : mine.board.map(sum);
  $: opponentName = mode === 'local' ? `Player ${2 - seat}` : mode === 'online' ? 'Your friend' : difficulty === 'casual' ? 'Casual AI' : difficulty === 'expert' ? 'Deep AI' : 'Tactical AI';

  function makeOrder(side: State['sides'][0], action: ActionKind, card: number | null, front: number | null): Action | null {
    if (card === null || (action !== 'recall' && front === null)) return null;
    const candidate: Action = { kind: action, card, front: action === 'recall' ? -1 : front! };
    return actions(side).some(value => sameAction(value, candidate)) ? candidate : null;
  }
  function clearSelection() { kind = 'deploy'; selected = null; destination = null; }
  function selectKind(value: ActionKind) { kind = value; selected = null; destination = null; }
  function selectBoard(card: number) {
    if (!disabled && kind !== 'deploy') { selected = card; destination = null; }
  }
  function saveGame(key: 'solo' | 'local') {
    store(key, { version: 2, difficulty, pairs: history.map(entry => entry.actions) });
    if (key === 'solo') savedSolo = true;
    else savedLocal = true;
  }
  function prepareAi() {
    if (game.turn === 12) { aiPromise = null; return; }
    const snapshot = structuredClone(game);
    const level = difficulty;
    if (worker) {
      const id = ++workerSequence;
      aiPromise = new Promise<Action>((resolve, reject) => {
        pendingAi.set(id, { resolve, reject });
        worker!.postMessage({ id, state: snapshot, level });
      });
      void aiPromise.catch(() => {});
    } else aiPromise = Promise.resolve(chooseAction(snapshot, 1, level));
  }
  function enterOffline(value: 'solo' | 'local') {
    epoch++;
    void unwatchRoom();
    mode = value; screen = 'game'; seat = 0;
    session = null; joined = [true, true]; locked = [false, false];
    myLockedOrder = null; localOrders = [null, null]; localStage = 'handoff';
    busy = false; animationBusy = false; message = ''; clearSelection();
    window.history.replaceState(null, '', `${location.pathname}${location.search}#/${value}`);
  }
  function startOffline(value: 'solo' | 'local') {
    game = initial(); history = [];
    enterOffline(value); saveGame(value);
    if (value === 'solo') prepareAi();
  }
  function requestStart(value: 'solo' | 'local') {
    const saved = read<Save>(value);
    if (saved && Array.isArray(saved.pairs) && saved.pairs.length > 0 && saved.pairs.length < 12) {
      replacement = value === 'solo' ? 'solo' : 'local';
      pendingStart = () => startOffline(value);
      restartDialog.showModal();
    } else startOffline(value);
  }
  function resumeOffline(value: 'solo' | 'local') {
    try {
      const saved = read<Save>(value);
      if (!saved || saved.version !== 2 || !Array.isArray(saved.pairs) || saved.pairs.length > 12) throw new Error('The saved game could not be read. Start a new game.');
      const restored = replay(saved.pairs);
      game = restored.state; history = restored.history;
      if (saved.difficulty && ['casual', 'tactical', 'expert'].includes(saved.difficulty)) difficulty = saved.difficulty;
      enterOffline(value);
      if (value === 'solo') prepareAi();
      else if (game.turn === 12) localStage = 'review';
    } catch (error) { message = networkError(error); }
  }
  function applyView(view: RoomView) {
    if (screen !== 'game' || mode !== 'online' || !session || view.id !== session.id || view.state.turn < game.turn) return;
    if (view.state.turn !== game.turn) clearSelection();
    game = view.state; history = view.history; seat = view.seat;
    joined = view.joined; locked = view.locked; myLockedOrder = view.ownOrder;
  }
  async function refreshRoom() {
    if (!session || mode !== 'online' || screen !== 'game') return;
    const current = session;
    const sequence = ++viewSequence;
    try {
      const view = await getRoom(current);
      if (alive && current === session && sequence > lastView) { lastView = sequence; applyView(view); }
    } catch (error) { if (alive && current === session) message = networkError(error); }
  }
  async function openSession(value: Session, requestEpoch: number) {
    await unwatchRoom();
    if (epoch !== requestEpoch || !alive) return;
    session = value; game = initial(); history = []; mode = 'online'; seat = 0;
    screen = 'game'; animationBusy = false; joined = [true, false]; locked = [false, false];
    myLockedOrder = null; clearSelection();
    store('room', value); savedRoom = true;
    window.history.replaceState(null, '', `${location.pathname}${location.search}#/table/${value.id}`);
    const view = await joinRoom(value);
    if (epoch !== requestEpoch || !alive) return;
    applyView(view);
    void watchRoom(value, () => { void refreshRoom(); }, status => { connectionStatus = status; })
      .catch(error => { if (epoch === requestEpoch) { message = networkError(error); connectionStatus = 'Disconnected'; } });
  }
  async function runOnline(operation: () => Promise<Session>) {
    const requestEpoch = ++epoch;
    message = ''; toast = ''; busy = true;
    try {
      const value = await operation();
      if (epoch === requestEpoch) await openSession(value, requestEpoch);
    } catch (error) { if (epoch === requestEpoch) message = networkError(error); }
    finally { if (epoch === requestEpoch) busy = false; }
  }
  function createTable() { void runOnline(createRoom); }
  function resumeTable() {
    const value = read<Session>('room');
    if (value) void runOnline(async () => value);
  }
  function joinInvitation() {
    const match = joinLink.trim().match(/#\/join\/([\w-]+)\/([a-f0-9]{64})(?:$|\s)/);
    if (!match) { message = 'Paste the complete invitation link from your friend.'; return; }
    void runOnline(async () => ({ id: match[1], token: match[2] }));
  }
  async function reconnect() {
    message = ''; disconnect();
    await refreshRoom();
    if (session && screen === 'game' && mode === 'online') {
      void watchRoom(session, () => { void refreshRoom(); }, status => { connectionStatus = status; })
        .catch(error => { message = networkError(error); });
    }
  }
  async function lockOrder() {
    if (!order || disabled) return;
    const chosen = { ...order };
    if (mode === 'local') {
      localOrders[seat] = chosen;
      localOrders = [...localOrders];
      clearSelection();
      if (localOrders.every(Boolean)) localStage = 'sealed';
      else { seat = (1 - seat) as 0 | 1; localStage = 'handoff'; }
      return;
    }
    const currentEpoch = epoch;
    const oldTurn = game.turn;
    busy = true; message = ''; myLockedOrder = chosen;
    try {
      if (mode === 'solo') {
        const computer = await (aiPromise || Promise.resolve(chooseAction(structuredClone(game), 1, difficulty)));
        if (epoch !== currentEpoch || game.turn !== oldTurn) return;
        const result = resolve(game, chosen, computer);
        game = result.state; history = [...history, result.record]; clearSelection();
        myLockedOrder = null; saveGame('solo'); prepareAi();
      } else if (session) {
        const view = await submitOrder(session, oldTurn + 1, chosen);
        if (epoch === currentEpoch) applyView(view);
      }
    } catch (error) {
      if (epoch === currentEpoch) { message = networkError(error); if (mode === 'solo') prepareAi(); }
    } finally { if (epoch === currentEpoch) busy = false; }
  }
  async function revealLocal() {
    if (!localOrders[0] || !localOrders[1]) return;
    const pair = localOrders as [Action, Action];
    localStage = 'review'; seat = 0;
    await tick();
    const result = resolve(game, pair[0], pair[1]);
    game = result.state; history = [...history, result.record];
    localOrders = [null, null]; clearSelection(); saveGame('local');
  }
  function nextLocalTurn() {
    if (animationBusy || finished) return;
    seat = (game.turn % 2) as 0 | 1;
    localStage = 'handoff'; clearSelection();
  }
  async function copyInvite() {
    if (!session) return;
    try { await navigator.clipboard.writeText(invitation(session)); toast = 'Invitation copied'; }
    catch { toast = 'Copy the invitation from the field below.'; }
  }
  function home() {
    epoch++; screen = 'home'; message = ''; busy = false; animationBusy = false;
    clearSelection(); void unwatchRoom();
    window.history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  }
  onMount(() => {
    try {
      worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => {
        const pending = pendingAi.get(event.data.id);
        if (!pending) return;
        pendingAi.delete(event.data.id);
        if (event.data.error) pending.reject(new Error(event.data.error)); else pending.resolve(event.data.action);
      };
      worker.onerror = () => {
        for (const pending of pendingAi.values()) pending.reject(new Error('The computer calculation stopped. Try locking your order again.'));
        pendingAi.clear(); worker?.terminate(); worker = null;
      };
    } catch { worker = null; }
    savedSolo = !!read('solo'); savedRoom = !!read('room'); savedLocal = !!read('local');
    // Navigation never silently resumes a saved match. Invitations require acceptance too.
    if (location.hash.startsWith('#/join/')) joinLink = location.href;
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshRoom(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
  onDestroy(() => { alive = false; epoch++; worker?.terminate(); disconnect(); });
</script>

<svelte:head>
  <title>Crosscurrent · {screen === 'home' ? 'Sea. Land. Air.' : finished ? 'Final score' : `Turn ${turn} of 12`}</title>
  <meta name="theme-color" content="#101214" />
  <meta name="description" content="Thirteen cards. Three fronts. One equal start. Play Crosscurrent against the computer, a friend online, or together on one device." />
</svelte:head>

<div class="shell" class:at-table={screen === 'game'}>
  <header class="masthead">
    <button class="brand" on:click={home} aria-label="Crosscurrent lobby"><Icon name="shift" size={25} /><span>CROSSCURRENT<small>SEA / LAND / AIR</small></span></button>
    <nav class="header-right" aria-label="Game navigation">
      {#if screen === 'game'}<button class="text-button" on:click={home}>Lobby</button>{/if}
      <button class="help-button" on:click={() => rulesDialog.showModal()} aria-label="How to play">{screen === 'home' ? 'How to play' : 'Rules'} <span aria-hidden="true">↗</span></button>
    </nav>
  </header>
  {#if message}<div class="error-banner" role="alert"><span>{message}</span><button on:click={() => message = ''} aria-label="Dismiss message">×</button></div>{/if}
  {#if screen === 'home'}
    <Lobby bind:difficulty bind:joinLink {busy} {savedSolo} {savedLocal} {savedRoom}
      onSolo={() => requestStart('solo')} onLocal={() => requestStart('local')} onOnline={createTable}
      onResumeSolo={() => resumeOffline('solo')} onResumeLocal={() => resumeOffline('local')}
      onResumeRoom={resumeTable} onJoin={joinInvitation} onRules={() => rulesDialog.showModal()} />
  {:else if mode === 'local' && (localStage === 'handoff' || localStage === 'sealed')}
    <main class="handoff">
      <div class="handoff-symbol"><Icon name="lock" size={40} /></div>
      <p class="eyebrow">LOCAL TWO-PLAYER · TURN {turn} / 12</p>
      <h1>{localStage === 'sealed' ? 'Both orders locked.' : `Player ${seat + 1}, your move.`}</h1>
      <p>{localStage === 'sealed' ? 'Bring the screen back into view for both players.' : 'Pass the device. The other player should look away while you choose your order.'}</p>
      {#if localStage === 'sealed'}
        <button class="primary" on:click={revealLocal}>Reveal together <Icon name="arrow" size={20} /></button>
      {:else}
        <button class="primary" on:click={() => localStage = 'choose'}>I’m ready <Icon name="arrow" size={20} /></button>
      {/if}
      <small>Cards and hands are public. Only this turn’s orders stay secret.</small>
    </main>
  {:else}
    {#key `${mode}:${session?.id || ''}`}
      <Table {game} {history} {seat} {mode} {opponentName} {busy} {disabled} {joined} {locked} {myLockedOrder}
        {connectionStatus} {toast} {kind} {selected} {destination} {order} {projected}
        localReview={mode === 'local' && localStage === 'review'} inviteLink={session ? invitation(session) : ''}
        onKind={selectKind} onCard={card => { selected = card; }} onBoardCard={selectBoard}
        onFront={front => { destination = front; }} onLock={lockOrder} onCopy={copyInvite}
        onReconnect={reconnect} onAnimation={value => { animationBusy = value; }} onNext={nextLocalTurn}
        onAgain={() => mode === 'online' ? createTable() : requestStart(mode)} />
    {/key}
  {/if}
</div>

<dialog bind:this={rulesDialog} class="rules-dialog" aria-labelledby="rules-title">
  <div class="dialog-top"><span class="eyebrow">FIELD GUIDE / CROSSCURRENT V0.2</span><button class="close-button" on:click={() => rulesDialog.close()} aria-label="Close rules">×</button></div>
  <h2 id="rules-title">Same cards.<br />Different decisions.</h2>
  <p>Both players begin with Ace through King. Secretly choose one complete order, then reveal together. Hands, deployed cards and spent cards are public.</p>
  <div class="rule-actions">
    <section><Icon name="deploy" /><h3>Deploy</h3><p>Play a card from your hand to Sea, Land or Air. Its rank adds to your strength there.</p></section>
    <section><Icon name="shift" /><h3>Shift</h3><p>Spend your lowest hand card to move a deployed card to a different front.</p></section>
    <section><Icon name="recall" /><h3>Recall</h3><p>Spend your lowest hand card to recover a deployed card. It still scores this turn, then returns to your hand.</p></section>
  </div>
  <h3>Score three times</h3>
  <div class="rule-scoring"><span>TURN 4<b>1 point</b></span><span>TURN 8<b>2 points</b></span><span>TURN 12<b>3 points</b></span></div>
  <p>At each checkpoint, the higher strength at each front wins its points. A tied front awards nothing. Then <strong>each player removes their own highest card from every occupied front</strong>, whether they won, lost or tied.</p>
  <p>Recall saves its target. If that card was the highest, no replacement is removed. Recalling a lower card does not protect the highest card.</p>
  <h3>Twelve turns. One game.</h3>
  <p>The higher total score wins. Equal scores are a draw. No passes or redeals. Ace is 1, Jack 11, Queen 12 and King 13. Sea, Land and Air have identical rules.</p>
  <div class="strategy-note"><b>Win efficiently.</b><p>Winning by ten earns no more than winning by one. Shift excess strength, or Recall a valuable card before it is spent.</p></div>
  <p class="fine-print">The computer only receives the public position, never your selected order. Its play is not proven optimal. Private invitations grant access to one seat. Local mode relies on players looking away, not security against inspecting this device.</p>
  <button class="primary" on:click={() => rulesDialog.close()}>Got it <Icon name="arrow" size={20} /></button>
</dialog>
<dialog bind:this={restartDialog} class="confirm-dialog" aria-labelledby="restart-title">
  <h2 id="restart-title">Start a new game?</h2><p>This replaces your unfinished saved {replacement} game.</p>
  <div class="dialog-actions"><button class="secondary" on:click={() => restartDialog.close()}>Keep saved game</button><button class="primary" on:click={() => { restartDialog.close(); pendingStart?.(); }}>Start new game</button></div>
</dialog>
