<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Home from './Home.svelte';
  import Table from './Table.svelte';
  import Tutorial from './Tutorial.svelte';
  import Rules from './Rules.svelte';
  import TopBar from './TopBar.svelte';
  import Join from './Join.svelte';
  import Handoff from './Handoff.svelte';
  import TableBanner from './TableBanner.svelte';
  import { initial, resolve, replay, outcome, tiebreakStrength, rulesNamed, RULES, type Action, type Rules as RuleSet, type State, type TurnRecord } from './engine';
  import { chooseAction, normalizeLevel, type Difficulty } from './ai';
  import { createRoom, joinRoom, getRoom, submitOrder, watchRoom, unwatchRoom, disconnect, invitation, offerInvitation, networkError, type Session } from './network';
  import { firstGameTip, statusText, verdictText, pageTitle, type Screen } from './text';
  import type { RoomView } from '../backend/rooms';

  type Mode = 'solo' | 'online' | 'local';
  type Save = { version: number; difficulty?: string; pairs: [Action, Action][] };
  /** Version 3 saves are v0.3 games. Version 2 saves were played under v0.2 scoring and are not resumed under the new rules. */
  const SAVE_VERSION = 3;

  let screen = $state<Screen>('home');
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
  let roomRules = $state.raw<RuleSet>(RULES);
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
  const current = (saved: Save | null): saved is Save => saved?.version === SAVE_VERSION && Array.isArray(saved.pairs);
  /** The saved game for a mode, if it was saved under the current rules and is still in progress. */
  function unfinished(key: 'solo' | 'local') {
    const saved = read<Save>(key);
    return current(saved) && saved.pairs.length < 12 ? saved : null;
  }
  function savedTurn(key: 'solo' | 'local') {
    const saved = unfinished(key);
    return saved ? { turn: saved.pairs.length } : null;
  }
  function refreshSaved() {
    savedSolo = savedTurn('solo'); savedLocal = savedTurn('local'); savedRoom = !!read('room');
  }

  const finished = $derived(game.turn === 12);
  /** The rules of the game on screen: an online table keeps the rules it was started under. */
  const rules = $derived(screen === 'game' && mode === 'online' ? roomRules : RULES);
  /** Short tips through the first game of a player who has not taken the lesson. */
  let tips = $state(false);
  const tip = $derived(tips && !finished ? firstGameTip(game.turn, rules) : '');
  function hideTips() { tips = false; store('tips', 'off'); }
  $effect(() => { if (finished && tips) hideTips(); });
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
  const status = $derived(statusText({
    online: mode === 'online', solo: mode === 'solo', friendHere: joined[1 - seat], lockedIn: locked[seat], connection: connectionStatus, busy,
  }));
  const handingOff = $derived(mode === 'local' && (localStage === 'handoff' || localStage === 'sealed'));
  const reviewing = $derived(mode === 'local' && localStage === 'review' && !finished);
  /** The invitation link while the friend has not opened it yet. */
  const inviteLink = $derived(mode === 'online' && !joined[1 - seat] ? (session ? invitation(session) : '') : null);

  function saveGame(key: 'solo' | 'local') {
    store(key, { version: SAVE_VERSION, difficulty, pairs: history.map(entry => entry.actions) });
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
    const saved = unfinished(value);
    if (saved && saved.pairs.length > 0) {
      replacing = value === 'solo' ? 'your unfinished game against the computer' : 'your unfinished pass-and-play game';
      pendingStart = () => startOffline(value);
      restartDialog?.showModal();
    } else startOffline(value);
  }
  function resumeOffline(value: 'solo' | 'local') {
    try {
      const saved = read<Save>(value);
      if (!current(saved) || saved.pairs.length > 12) throw new Error('That saved game could not be read. Start a new one.');
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
    // The room service enforces hidden orders and legality. The score is rebuilt here from the
    // revealed orders under the table's rules; a room service that does not report them yet
    // sends none, and its tables are played under the current rules.
    roomRules = rulesNamed(view.rules, RULES);
    const match = replay(view.history.map(entry => entry.actions), roomRules);
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
  /** The seat is taken once a join succeeds, so the session is kept for Rejoin even if the player has
   * moved on in the meantime (`current` is false), unless another online table is open by then. */
  function keepSession(value: Session, current: boolean) {
    if (!current && screen === 'game' && mode === 'online') return;
    store('room', value); savedRoom = true;
  }
  async function openSession(value: Session, requestEpoch: number) {
    await unwatchRoom();
    if (epoch !== requestEpoch || !alive) return;
    // Join first: a missing or expired table never replaces the saved one.
    const view = await joinRoom(value);
    keepSession(value, epoch === requestEpoch);
    if (epoch !== requestEpoch || !alive) return;
    session = value; game = initial(); history = []; mode = 'online'; seat = view.seat;
    screen = 'game'; animating = false; joined = [true, false]; locked = [false, false];
    myLockedOrder = null;
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
    if (inviteLink) toast = await offerInvitation(inviteLink);
  }
  function openRules() { rulesDialog?.showModal(); }
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
    newcomer = false; store('learned', true); tips = false;
    if (play) { difficulty = 'easy'; requestStart('solo'); } else home();
  }
  function again() {
    if (mode === 'online') createTable();
    else requestStart(mode);
  }
  const verdict = $derived(finished ? verdictText(outcome(game, history, rules), game.scores, names, rules) : '');

  function startWorker() {
    try { worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' }); }
    catch { worker = null; return; }
    worker.onmessage = event => settleAi(event.data);
    worker.onerror = () => failAi('The computer stopped calculating. Lock in again.');
  }
  function settleAi(data: { id: number; action?: Action; error?: string }) {
    const pending = pendingAi.get(data.id);
    pendingAi.delete(data.id);
    if (data.error) pending?.reject(new Error(data.error)); else pending?.resolve(data.action!);
  }
  function failAi(reason: string) {
    for (const pending of pendingAi.values()) pending.reject(new Error(reason));
    pendingAi.clear(); worker?.terminate(); worker = null;
  }
  function loadPreferences() {
    refreshSaved();
    newcomer = !read('learned');
    tips = newcomer && read('tips') !== 'off';
    const saved = read<string>('difficulty');
    if (saved) difficulty = normalizeLevel(saved);
  }
  /** Opens an invitation or the lesson from the address. Navigation never silently resumes a saved match; invitations ask first. */
  function route() {
    const invite = location.hash.match(/^#\/join\/([\w-]+)\/([a-f0-9]{64})$/);
    if (invite) { epoch++; void unwatchRoom(); message = ''; busy = false; animating = false; joinTarget = { id: invite[1], token: invite[2] }; screen = 'join'; }
    else if (location.hash === '#/learn') learn();
  }
  onMount(() => {
    startWorker();
    loadPreferences();
    route();
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshRoom(); };
    document.addEventListener('visibilitychange', onVisible);
    // An invitation opened in a tab that already shows the game changes only the hash.
    window.addEventListener('hashchange', route);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('hashchange', route); };
  });
  onDestroy(() => { alive = false; epoch++; worker?.terminate(); disconnect(); });
</script>

<svelte:head>
  <title>{pageTitle(screen, game.turn)}</title>
</svelte:head>

<TopBar home={screen === 'home'} online={screen === 'game' && mode === 'online'} onHome={home} onReconnect={reconnect} onRules={openRules} />
{#if message}<div class="notice" role="alert"><span>{message}</span><button onclick={() => (message = '')} aria-label="Dismiss">×</button></div>{/if}

{#if screen === 'home'}
  <Home {difficulty} {busy} {newcomer} {savedSolo} {savedLocal} {savedRoom}
    onDifficulty={value => { difficulty = value; store('difficulty', value); }}
    onSolo={() => requestStart('solo')} onLocal={() => requestStart('local')} onOnline={createTable}
    onLearn={learn} onRules={openRules}
    onResumeSolo={() => resumeOffline('solo')} onResumeLocal={() => resumeOffline('local')} onResumeRoom={resumeTable} />
{:else if screen === 'learn'}
  <Tutorial onDone={finishTutorial} onSkip={home} />
{:else if screen === 'join'}
  <Join {busy} onJoin={acceptInvitation} onRules={openRules} />
{:else if handingOff}
  <Handoff sealed={localStage === 'sealed'} {seat} turn={game.turn} onReveal={revealLocal} onShow={() => (localStage = 'choose')} />
{:else}
  {#key `${mode}:${session?.id || ''}`}
    {#snippet review()}
      <p class="review-note">Both players: check what happened, then pass to Player 1.</p>
      <button class="btn primary" onclick={nextLocalTurn}>Next turn</button>
    {/snippet}
    <Table {game} {history} {rules} {seat} {names} {canAct} {status} locked={myLockedOrder} theirsLocked={mode === 'online' && locked[1 - seat]}
      footer={reviewing ? review : undefined} coach={tip} onDismissCoach={hideTips}
      onLock={lockOrder} onBusy={value => { animating = value; }}>
      {#snippet banner()}
        <TableBanner link={inviteLink} {toast} verdict={animating ? '' : verdict} {busy} online={mode === 'online'} onShare={shareInvite} onAgain={again} onHome={home} />
      {/snippet}
    </Table>
  {/key}
{/if}

<dialog bind:this={rulesDialog} aria-labelledby="rules-title" onclick={event => { if (event.target === event.currentTarget) rulesDialog?.close(); }}>
  <Rules {rules} onClose={() => rulesDialog?.close()} onLearn={() => { rulesDialog?.close(); learn(); }} />
</dialog>
<dialog bind:this={restartDialog} aria-labelledby="restart-title" onclick={event => { if (event.target === event.currentTarget) restartDialog?.close(); }}>
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
  .review-note { flex: 1 1 200px; font-size: 15px; color: var(--ink-2); }
</style>
