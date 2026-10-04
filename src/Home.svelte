<script lang="ts">
  import GameDemo from './GameDemo.svelte';
  import type { Difficulty } from './ai';

  type Saved = { turn: number } | null;
  type Props = {
    difficulty: Difficulty;
    busy: boolean;
    newcomer: boolean;
    savedSolo: Saved;
    savedLocal: Saved;
    savedRoom: boolean;
    onDifficulty: (d: Difficulty) => void;
    onSolo: () => void;
    onLocal: () => void;
    onOnline: () => void;
    onLearn: () => void;
    onRules: () => void;
    onResumeSolo: () => void;
    onResumeLocal: () => void;
    onResumeRoom: () => void;
  };
  let { difficulty, busy, newcomer, savedSolo, savedLocal, savedRoom, onDifficulty, onSolo, onLocal, onOnline, onLearn, onRules, onResumeSolo, onResumeLocal, onResumeRoom }: Props = $props();
  const levels: [Difficulty, string][] = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];
</script>

<main class="home">
  <section class="intro">
    <h1 class="wordmark">Crosscurrent</h1>
    <p class="lede">A card game for two with no shuffle and no dice. You both start with the same thirteen cards, choose each move in secret, and reveal together.</p>

    <div class="actions">
      <div class="solo">
        <button class="btn primary big play-cta" onclick={onSolo} disabled={busy}>Play the computer</button>
        <div class="segmented" role="group" aria-label="Computer strength">
          {#each levels as [value, label]}
            <button aria-pressed={difficulty === value} onclick={() => onDifficulty(value)} disabled={busy}>{label}</button>
          {/each}
        </div>
      </div>
      {#if savedSolo}<button class="resume" onclick={onResumeSolo} disabled={busy}>Continue your game against the computer · turn {savedSolo.turn + 1}</button>{/if}
      <button class="btn big" onclick={onOnline} disabled={busy}>{busy ? 'Opening a table…' : 'Play a friend online'}</button>
      {#if savedRoom}<button class="resume" onclick={onResumeRoom} disabled={busy}>Rejoin your online table</button>{/if}
      <button class="btn big" onclick={onLocal} disabled={busy}>Pass and play on this device</button>
      {#if savedLocal}<button class="resume" onclick={onResumeLocal} disabled={busy}>Continue your pass-and-play game · turn {savedLocal.turn + 1}</button>{/if}
    </div>

    <p class="learn" class:fresh={newcomer}>
      {#if newcomer}New to the game?{:else}Need a refresher?{/if}
      <button class="link" onclick={onLearn}>Learn by playing</button> (about three minutes) or <button class="link" onclick={onRules}>read the rules</button>.
    </p>
  </section>

  <section class="watch" aria-label="A complete example game">
    <GameDemo />
  </section>
</main>

<style>
  .home { width: min(100%, 1120px); margin: 0 auto; padding: clamp(20px, 5vw, 56px) var(--gutter) 40px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(28px, 6vw, 80px); align-items: center; }
  .wordmark { font-family: var(--serif); font-size: clamp(44px, 7vw, 76px); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
  .lede { margin-top: 18px; font-size: clamp(17px, 1.6vw, 19px); color: var(--ink-2); max-width: 30em; }
  .actions { display: grid; gap: 10px; margin-top: 28px; max-width: 420px; }
  .solo { display: grid; gap: 8px; }
  .big { min-height: 54px; font-size: 17px; width: 100%; }
  .solo .segmented { width: 100%; }
  .resume { min-height: 40px; text-align: left; font-size: 15px; color: var(--ink); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 4px; padding: 0 4px; }
  .resume:hover { text-decoration-color: var(--ink-2); }
  .learn { margin-top: 22px; font-size: 15px; color: var(--ink-2); max-width: 420px; }
  .learn .link { min-height: 0; font-size: 15px; color: var(--ink); font-weight: 600; }
  .learn.fresh { padding: 12px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); }
  .watch { min-width: 0; }
  @media (max-width: 860px) {
    .home { grid-template-columns: minmax(0, 1fr); padding-top: 18px; gap: 28px; }
    .actions, .learn { max-width: none; }
  }
</style>
