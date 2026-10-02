<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Home from './Home.svelte';
  import Table from './Table.svelte';
  import Tutorial from './Tutorial.svelte';
  import Rules from './Rules.svelte';
  import { initial, resolve, replay, outcome, tiebreakStrength, type Action, type State, type TurnRecord } from './engine';
  import { chooseAction, normalizeLevel, type Difficulty } from './ai';
  import { createRoom, joinRoom, getRoom, submitOrder, watchRoom, unwatchRoom, disconnect, invitation, networkError, type Session } from './network';
  import type { RoomView } from '../backend/rooms';

  type Mode = 'solo' | 'online' | 'local';
  type Save = { version: number; difficulty?: string; pairs: [Action, Action][] };

  let screen = $state<'home' | 'learn' | 'game' | 'join'>('home');
  let mode = $state<Mode>('solo');
  let game = $state.raw<State>(initial());
  let history = $state.raw<TurnRecord[]>([]);
  let seat = $state<0 | 1>(0);
  let difficulty = $state<Difficulty>('medium');
  let busy = $state(false);
  let animating = $state(false);
  let message = $state('');
  let toast = $state('');
  let connectionStatus = $state('Connecting');
  let joined = $state<[boolean, boolean]>([true, true]);
  let locked = $state<[boolean, boolean]>([false, false]);
  let myLockedOrder = $state.raw<Action | null>(null);
  let session = $state.raw<Session | null>(null);
  let savedSolo = $state<{ turn: number } | null>(null);
  let savedLocal = $state<{ turn: number } | null>(null);
  let savedRoom = $state(false);
  let newcomer = $state(true);
  let joinTarget = $state.raw<Session | null>(null);
  let localStage = $state<'handoff' | 'choose' | 'sealed' | 'review'>('handoff');
  let localOrders = $state.raw<[Action | null, Action | null]>([null, null]);
  let rulesDialog = $state<HTMLDialogElement>();
  let restartDialog = $state<HTMLDialogElement>();
  let pendingStart: (() => void) | null = null;
  let replacing = $state('');
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
    catch { message = 'Browser storage is unavailable. Keep this tab open to keep your game.'; }
  }
  function read<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(`crosscurrent:${key}`) || 'null'); }
    catch { return null; }
  }
  function savedTurn(key: 'solo' | 'local') {
    const saved = read<Save>(key);
    return saved && Array.isArray(saved.pairs) && saved.pairs.length < 12 ? { turn: saved.pairs.length } : null;
  }
  function refreshSaved() {
    savedSolo = savedTurn('solo'); savedLocal = savedTurn('local'); savedRoom = !!read('room');
  }

  const finished = $derived(game.turn === 12);
  const names = $derived.by((): [string, string] => {
    if (mode === 'local') return ['Player 1', 'Player 2'];
    if (mode === 'online') return seat === 0 ? ['You', 'Friend'] : ['Friend', 'You'];
    return ['You', 'Computer'];
  });
  const canAct = $derived(
    !busy && !finished && !locked[seat]
    && !(mode === 'online' && !joined.every(Boolean))
    && !(mode === 'local' && localStage !== 'choose'),
  );
  const status = $derived.by(() => {
    if (mode === 'online') {
      if (!joined[1 - seat]) return 'Waiting for your friend to open the link.';
      if (locked[seat]) return 'Locked in. Waiting for your friend…';
      if (connectionStatus !== 'Live') return connectionStatus === 'Connecting' ? 'Connecting…' : 'Connection lost. Reconnecting…';
    }
    if (busy) return mode === 'solo' ? 'The computer is choosing…' : 'Locking in…';
    return '';
  });

  function saveGame(key: 'solo' | 'local') {
    store(key, { version: 2, difficulty, pairs: history.map(entry => entry.actions) });
    refreshSaved();
  }
  function prepareAi() {
    if (game.turn === 12) { aiPromise = null; return; }
    const snapshot = structuredClone($state.snapshot(game)) as State;
    const level = difficulty;
    const strength = tiebreakStrength(history);
    if (worker) {
      const id = ++workerSequence;
      aiPromise = new Promise<Action>((resolve, reject) => {
        pendingAi.set(id, { resolve, reject });
        worker!.postMessage({ id, state: snapshot, level, strength });
      });
      void aiPromise.catch(() => {});
    } else aiPromise = Promise.resolve(chooseAction(snapshot, 1, level, Math.random, strength));
  }
  function setHash(value: string) {
    window.history.replaceState(null, '', `${location.pathname}${location.search}#/${value}`);
  }
  function enterOffline(value: 'solo' | 'local') {
    epoch++;
    void unwatchRoom();
    mode = value; screen = 'game'; seat = 0;
    session = null; joined = [true, true]; locked = [false, false];
    myLockedOrder = null; localOrders = [null, null]; localStage = 'handoff';
    busy = false; animating = false; message = '';
    setHash(value);
  }
  function startOffline(value: 'solo' | 'local') {
    game = initial(); history = [];
    enterOffline(value); saveGame(value);
    if (value === 'solo') prepareAi();
    window.scrollTo(0, 0);
  }
  function requestStart(value: 'solo' | 'local') {
    const saved = read<Save>(value);
    if (saved && Array.isArray(saved.pairs) && saved.pairs.length > 0 && saved.pairs.length < 12) {
      replacing = value === 'solo' ? 'your unfinished game against the computer' : 'your unfinished pass-and-play game';
      pendingStart = () => startOffline(value);
      restartDialog?.showModal();
    } else startOffline(value);
  }
  function resumeOffline(value: 'solo' | 'local') {
    try {
      const saved = read<Save>(value);
      if (!saved || saved.version !== 2 || !Array.isArray(saved.pairs) || saved.pairs.length > 12) throw new Error('That saved game could not be read. Start a new one.');
      const restored = replay(saved.pairs);
      game = restored.state; history = restored.history;
      if (saved.difficulty) difficulty = normalizeLevel(saved.difficulty);
      enterOffline(value);
      if (value === 'solo') prepareAi();
      else if (game.turn === 12) localStage = 'review';
    } catch (error) { message = networkError(error); }
  }
  function applyView(view: RoomView) {
    if (screen !== 'game' || mode !== 'online' || !session || view.id !== session.id || view.state.turn < game.turn) return;
    // The room service enforces hidden orders and legality; scoring is recomputed
    // here from the revealed orders so a room service on older scoring rules agrees.
    const match = replay(view.history.map(entry => entry.actions));
    game = match.state; history = match.history; seat = view.seat;
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
    // Join first: a missing or expired table never replaces the saved one.
    const view = await joinRoom(value);
    if (epoch !== requestEpoch || !alive) return;
    session = value; game = initial(); history = []; mode = 'online'; seat = view.seat;
    screen = 'game'; animating = false; joined = [true, false]; locked = [false, false];
    myLockedOrder = null;
    store('room', value); savedRoom = true;
    setHash(`table/${value.id}`);
    applyView(view);
    void watchRoom(value, () => { void refreshRoom(); }, s => { connectionStatus = s; })
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
  function acceptInvitation() {
    const target = joinTarget;
    if (target) void runOnline(async () => target);
  }
  async function reconnect() {
    message = ''; disconnect();
    await refreshRoom();
    if (session && screen === 'game' && mode === 'online') {
      void watchRoom(session, () => { void refreshRoom(); }, s => { connectionStatus = s; })
        .catch(error => { message = networkError(error); });
    }
  }
  async function lockOrder(chosen: Action) {
    if (!canAct) return;
    if (mode === 'local') {
      const orders = [...localOrders] as [Action | null, Action | null];
      orders[seat] = chosen;
      localOrders = orders;
      if (orders.every(Boolean)) localStage = 'sealed';
      else { seat = (1 - seat) as 0 | 1; localStage = 'handoff'; }
      return;
    }
    const currentEpoch = epoch;
    const oldTurn = game.turn;
    busy = true; message = ''; myLockedOrder = chosen;
    try {
      if (mode === 'solo') {
        const computer = await (aiPromise || Promise.resolve(chooseAction($state.snapshot(game) as State, 1, difficulty, Math.random, tiebreakStrength(history))));
        if (epoch !== currentEpoch || game.turn !== oldTurn) return;
        const result = resolve(game, chosen, computer);
        game = result.state; history = [...history, result.record];
        myLockedOrder = null; saveGame('solo'); prepareAi();
      } else if (session) {
        const view = await submitOrder(session, oldTurn + 1, chosen);
        if (epoch === currentEpoch) applyView(view);
      }
    } catch (error) {
      if (epoch === currentEpoch) { message = networkError(error); myLockedOrder = null; if (mode === 'solo') prepareAi(); }
    } finally { if (epoch === currentEpoch) busy = false; }
  }
  async function revealLocal() {
    if (!localOrders[0] || !localOrders[1]) return;
    const pair = localOrders as [Action, Action];
    localStage = 'review'; seat = 0;
    await tick();
    const result = resolve(game, pair[0], pair[1]);
    game = result.state; history = [...history, result.record];
    localOrders = [null, null]; saveGame('local');
  }
  function nextLocalTurn() {
    if (animating || finished) return;
    seat = 0;
    localStage = 'handoff';
  }
  async function shareInvite() {
    if (!session) return;
    const link = invitation(session);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'Crosscurrent', text: 'Play a game of Crosscurrent with me.', url: link }); return; }
      await navigator.clipboard.writeText(link); toast = 'Link copied. Send it to your friend.';
    } catch { toast = 'Copy the link from the box below.'; }
  }
  function home() {
    epoch++; screen = 'home'; message = ''; busy = false; animating = false;
    void unwatchRoom(); refreshSaved();
    setHash('');
    window.scrollTo(0, 0);
  }
  function learn() {
    epoch++; void unwatchRoom();
    screen = 'learn'; message = '';
    setHash('learn');
    window.scrollTo(0, 0);
  }
  function finishTutorial(play: boolean) {
    newcomer = false; store('learned', true);
    if (play) { difficulty = 'easy'; requestStart('solo'); } else home();
  }
  function again() {
    if (mode === 'online') createTable();
    else requestStart(mode);
  }
  const verdict = $derived.by(() => {
    if (!finished) return '';
    const result = outcome(game, history);
    const [a, b] = [game.scores[seat], game.scores[1 - seat]];
    const score = `${a}–${b}`;
    if (result.winner === null) return `Draw, ${score}.`;
    const winner = names[result.winner];
    const by = result.by === 'strength' ? ` on the tiebreak (${result.strength[result.winner]}–${result.strength[1 - result.winner]} total strength at the last scoring)` : '';
    if (mode === 'local') return `${winner} wins ${result.winner === seat ? score : `${b}–${a}`}${by}.`;
    return result.winner === seat ? `You win, ${score}${by}.` : `${winner} wins, ${b}–${a}${by}.`;
  });

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
        for (const pending of pendingAi.values()) pending.reject(new Error('The computer stopped calculating. Lock in again.'));
        pendingAi.clear(); worker?.terminate(); worker = null;
      };
    } catch { worker = null; }
    refreshSaved();
    newcomer = !read('learned');
    const saved = read<string>('difficulty');
    if (saved) difficulty = normalizeLevel(saved);
    // Navigation never silently resumes a saved match. Invitations ask first.
    const invite = location.hash.match(/^#\/join\/([\w-]+)\/([a-f0-9]{64})$/);
    if (invite) { joinTarget = { id: invite[1], token: invite[2] }; screen = 'join'; }
    else if (location.hash === '#/learn') screen = 'learn';
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshRoom(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });
  onDestroy(() => { alive = false; epoch++; worker?.terminate(); disconnect(); });
</script>

<svelte:head>
  <title>{screen === 'game' ? finished ? 'Game over · Crosscurrent' : `Turn ${Math.min(12, game.turn + 1)} · Crosscurrent` : screen === 'learn' ? 'Learn to play · Crosscurrent' : 'Crosscurrent · a card game for two'}</title>
</svelte:head>

<header class="bar">
  {#if screen === 'home'}
    <span></span>
  {:else}
    <button class="back" onclick={home} aria-label="Back to the start screen"><span aria-hidden="true">←</span> Crosscurrent</button>
  {/if}
  <nav>
    {#if screen === 'game' && mode === 'online'}<button class="link" onclick={reconnect}>Reconnect</button>{/if}
    <button class="link" onclick={() => rulesDialog?.showModal()}>Rules</button>
  </nav>
</header>
{#if message}<div class="notice" role="alert"><span>{message}</span><button onclick={() => (message = '')} aria-label="Dismiss">×</button></div>{/if}

{#if screen === 'home'}
  <Home {difficulty} {busy} {newcomer} {savedSolo} {savedLocal} {savedRoom}
    onDifficulty={value => { difficulty = value; store('difficulty', value); }}
    onSolo={() => requestStart('solo')} onLocal={() => requestStart('local')} onOnline={createTable}
    onLearn={learn} onRules={() => rulesDialog?.showModal()}
    onResumeSolo={() => resumeOffline('solo')} onResumeLocal={() => resumeOffline('local')} onResumeRoom={resumeTable} />
{:else if screen === 'learn'}
  <Tutorial onDone={finishTutorial} />
{:else if screen === 'join'}
  <main class="center">
    <h1>You’re invited to a game</h1>
    <p>Your friend opened a table and is waiting. Crosscurrent takes about fifteen minutes; you can learn as you go.</p>
    <button class="btn primary big" onclick={acceptInvitation} disabled={busy}>{busy ? 'Joining…' : 'Join the game'}</button>
    <button class="link" onclick={() => rulesDialog?.showModal()}>How to play</button>
  </main>
{:else if mode === 'local' && (localStage === 'handoff' || localStage === 'sealed')}
  <main class="center">
    {#if localStage === 'sealed'}
      <h1>Both orders are in</h1>
      <p>Put the device where you can both see it, then reveal.</p>
      <button class="btn primary big" onclick={revealLocal}>Reveal both orders</button>
    {:else}
      <p class="turn-note">Turn {Math.min(12, game.turn + 1)} of 12</p>
      <h1>Player {seat + 1} <span class="pip" class:heart={seat === 1}>{seat === 0 ? '♠' : '♥'}</span>, your move</h1>
      <p>Pass the device. The other player looks away until you lock in.</p>
      <button class="btn primary big" onclick={() => (localStage = 'choose')}>I’m Player {seat + 1}, show my move</button>
    {/if}
  </main>
{:else}
  {#key `${mode}:${session?.id || ''}`}
    {#snippet review()}
      <p class="review-note">Both players: check what happened, then pass to Player 1.</p>
      <button class="btn primary" onclick={nextLocalTurn}>Next turn</button>
    {/snippet}
    <Table {game} {history} {seat} {names} {canAct} {status} locked={myLockedOrder} theirsLocked={mode === 'online' && locked[1 - seat]}
      footer={mode === 'local' && localStage === 'review' && !finished ? review : undefined}
      onLock={lockOrder} onBusy={value => { animating = value; }}>
      {#snippet banner()}
        {#if mode === 'online' && !joined[1 - seat]}
          <section class="panel">
            <h2>Send this link to your friend</h2>
            <p>The game starts when they open it. Only they can use it, so share it with one person.</p>
            <div class="invite">
              <input aria-label="Invitation link" readonly value={session ? invitation(session) : ''} onfocus={event => event.currentTarget.select()} />
              <button class="btn primary" onclick={shareInvite}>Share link</button>
            </div>
            {#if toast}<p class="toast" role="status">{toast}</p>{/if}
          </section>
        {:else if finished && !animating}
          <section class="panel result" role="status">
            <h2>{verdict}</h2>
            <div class="row">
              <button class="btn primary" onclick={again} disabled={busy}>{mode === 'online' ? 'New table' : 'Play again'}</button>
              <button class="btn" onclick={home}>Back to start</button>
            </div>
          </section>
        {/if}
      {/snippet}
    </Table>
  {/key}
{/if}

<dialog bind:this={rulesDialog} aria-labelledby="rules-title">
  <Rules onClose={() => rulesDialog?.close()} onLearn={() => { rulesDialog?.close(); learn(); }} />
</dialog>
<dialog bind:this={restartDialog} aria-labelledby="restart-title">
  <div class="sheet">
    <h2 id="restart-title">Start a new game?</h2>
    <p>This replaces {replacing}.</p>
    <div class="sheet-actions">
      <button class="btn" onclick={() => restartDialog?.close()}>Keep it</button>
      <button class="btn primary" onclick={() => { restartDialog?.close(); pendingStart?.(); }}>Start new game</button>
    </div>
  </div>
</dialog>

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 0 var(--gutter); padding-top: env(safe-area-inset-top); }
  .back { min-height: 44px; font-family: var(--serif); font-size: 18px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; }
  .back span { font-family: var(--sans); font-weight: 400; color: var(--ink-2); }
  nav { display: flex; gap: 18px; align-items: center; }
  .center { min-height: calc(100dvh - 120px); display: grid; place-content: center; justify-items: center; gap: 16px; padding: 24px var(--gutter); text-align: center; }
  .center h1 { font-family: var(--serif); font-size: clamp(30px, 6vw, 44px); line-height: 1.1; }
  .center p { color: var(--ink-2); max-width: 26em; font-size: 17px; }
  .center .big { min-width: min(320px, 100%); min-height: 54px; font-size: 17px; }
  .turn-note { font-size: 15px !important; }
  .pip { color: var(--spade); }
  .pip.heart { color: var(--heart); }
  .panel { display: grid; gap: 10px; padding: 16px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--line); }
  .panel h2 { font-family: var(--serif); font-size: 22px; line-height: 1.2; }
  .panel p { color: var(--ink-2); font-size: 15px; }
  .invite { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .invite input { min-width: 0; min-height: 48px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--paper); font-size: 15px; }
  .toast { color: var(--ink) !important; }
  .review-note { flex: 1 1 200px; font-size: 15px; color: var(--ink-2); }
  .row { display: flex; flex-wrap: wrap; gap: 10px; }
  @media (max-width: 480px) { .invite { grid-template-columns: 1fr; } }
</style>
