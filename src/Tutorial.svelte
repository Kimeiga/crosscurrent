<script lang="ts">
  import Table from './Table.svelte';
  import { lessons, bestReply } from './lessons';
  import { resolve, sameAction, type Action, type State, type TurnRecord } from './engine';

  let { onDone }: { onDone: (play: boolean) => void } = $props();

  let index = $state(0);
  let game = $state.raw<State>(lessons[0].start().game);
  let history = $state.raw<TurnRecord[]>(lessons[0].start().history);
  let played = $state(false);
  let won = $state(true);
  let animating = $state(false);
  let attempts = $state(0);
  let finished = $state(false);

  const lesson = $derived(lessons[index]);
  const coach = $derived(!played ? lesson.before + (attempts > 0 && lesson.hint ? ` Hint: ${lesson.hint}` : '') : animating ? '' : won ? lesson.after : lesson.retry ?? lesson.after);

  function load(i: number) {
    index = i;
    const start = lessons[i].start();
    game = start.game; history = start.history;
    played = false; won = true;
  }
  function play(mine: Action) {
    const theirs = lesson.reply ? lesson.reply(game, mine) : bestReply(game, mine);
    const out = resolve(game, mine, theirs);
    won = lesson.check ? lesson.check(out.state, out.record) : true;
    if (!won) attempts++;
    game = out.state; history = [...history, out.record];
    played = true;
  }
  function next() {
    if (index + 1 < lessons.length) load(index + 1);
    else finished = true;
    window.scrollTo(0, 0);
  }
  function retry() { load(index); }
</script>

{#if finished}
  <main class="done">
    <h1>That’s the whole game</h1>
    <p>Deploy, Shift and Recall; scoring on turns 4, 8 and 12; highest cards spent after each scoring. The rest is reading your opponent and saving strength for when it counts.</p>
    <div class="row">
      <button class="btn primary big" onclick={() => onDone(true)}>Play the computer (Easy)</button>
      <button class="btn big" onclick={() => onDone(false)}>Back to start</button>
    </div>
  </main>
{:else}
  <div class="lesson-head">
    <p><span class="step">Lesson {index + 1} of {lessons.length}</span> {lesson.title}</p>
    <button class="link" onclick={() => onDone(false)}>Skip</button>
  </div>
  {#key index}
    {#snippet navigation()}
      <div class="next" role="status">
        {#if won}
          <button class="btn primary" onclick={next}>{index + 1 < lessons.length ? 'Next lesson' : 'Finish'}</button>
        {:else}
          <button class="btn primary" onclick={retry}>Try again</button>
          <button class="btn quiet" onclick={next}>Move on</button>
        {/if}
      </div>
    {/snippet}
    <Table {game} {history} seat={0} names={['You', 'Computer']} canAct={!played} {coach}
      allowed={lesson.allowed} onLock={play} onBusy={value => { animating = value; }}
      footer={played && !animating ? navigation : undefined} />
  {/key}
{/if}

<style>
  .lesson-head { width: min(100%, 760px); margin: 0 auto; padding: 0 var(--gutter); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .lesson-head p { font-size: 15px; color: var(--ink-2); }
  .step { color: var(--ink); font-weight: 650; margin-right: 6px; }
  .next { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .done { width: min(100%, 640px); margin: 0 auto; padding: 48px var(--gutter); display: grid; gap: 18px; }
  .done h1 { font-family: var(--serif); font-size: clamp(32px, 6vw, 44px); line-height: 1.1; }
  .done p { color: var(--ink-2); font-size: 17px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  .big { min-height: 54px; }
</style>
