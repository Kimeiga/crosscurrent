<script lang="ts">
  import Icon from './Icon.svelte';
  import GameDemo from './GameDemo.svelte';
  import './homepage.css';
  import type { Difficulty } from './ai';
  export let difficulty: Difficulty;
  export let joinLink: string;
  export let busy: boolean;
  export let savedSolo: boolean;
  export let savedLocal: boolean;
  export let savedRoom: boolean;
  export let onSolo: () => void;
  export let onLocal: () => void;
  export let onOnline: () => void;
  export let onResumeSolo: () => void;
  export let onResumeLocal: () => void;
  export let onResumeRoom: () => void;
  export let onJoin: () => void;
  export let onRules: () => void;
</script>

<main class="landing">
  <section class="intro">
    <p class="eyebrow"><span class="status-dot"></span> CROSSCURRENT</p>
    <h1>A tactical, balanced card game for two.</h1>
    <div class="hero-cta">
      <button class="primary hero-play" on:click={onSolo} disabled={busy}>Play vs AI <Icon name="arrow" size={20} /></button>
      {#if savedSolo}<button class="hero-resume" on:click={onResumeSolo} disabled={busy}>Continue saved solo game <span>↗</span></button>{/if}
    </div>
  </section>

  <GameDemo />

  <section class="play-options" aria-label="Choose how to play">
    <div class="section-heading"><h2>Choose your table</h2><span>No account needed</span></div>
    <div class="mode-grid">
      <section class="mode-card solo-card">
        <div class="mode-heading"><Icon name="ai" /><span>01 / SOLO</span></div>
        <h3>Read the machine.</h3>
        <div class="difficulty" aria-label="Computer difficulty">
          {#each [['casual', 'Casual'], ['tactical', 'Tactical'], ['expert', 'Deep']] as [value, label]}
            <button class:active={difficulty === value} aria-pressed={difficulty === value} disabled={busy} on:click={() => difficulty = value as Difficulty}>{label}</button>
          {/each}
        </div>
        <p class="mode-copy">{difficulty === 'casual' ? 'A forgiving opponent to learn the flow.' : difficulty === 'expert' ? 'More calculation. Still beatable, not solved.' : 'Plans around scoring and your possible replies.'}</p>
        <button class="primary mode-start" on:click={onSolo} disabled={busy}>Play vs AI <Icon name="arrow" size={20} /></button>
        {#if savedSolo}<button class="resume-button" on:click={onResumeSolo} disabled={busy}>Continue saved solo game <span>↗</span></button>{/if}
      </section>
      <section class="mode-card">
        <div class="mode-heading"><Icon name="local" /><span>02 / SAME DEVICE</span></div>
        <h3>Across the table.</h3>
        <p class="mode-copy">Two players, one screen. Pass the device to choose privately, then reveal together.</p>
        <button class="secondary mode-start" on:click={onLocal} disabled={busy}>Local 2-player <Icon name="arrow" size={20} /></button>
        {#if savedLocal}<button class="resume-button" on:click={onResumeLocal} disabled={busy}>Continue local game <span>↗</span></button>{/if}
      </section>
      <section class="mode-card">
        <div class="mode-heading"><Icon name="online" /><span>03 / ONLINE</span></div>
        <h3>Any distance.</h3>
        <p class="mode-copy">Open a private table and send your friend the invitation. Play from separate devices.</p>
        <button class="secondary mode-start" on:click={onOnline} disabled={busy}>{busy ? 'Opening table…' : 'Invite a friend'} <Icon name="arrow" size={20} /></button>
        {#if savedRoom}<button class="resume-button" on:click={onResumeRoom} disabled={busy}>Rejoin private table <span>↗</span></button>{/if}
      </section>
    </div>
    <details class="join-form" open={!!joinLink}>
      <summary>Already have an invitation?</summary>
      <form on:submit|preventDefault={onJoin}>
        <label for="invite-input">Your friend’s invitation link</label>
        <div class="join-controls"><input id="invite-input" bind:value={joinLink} placeholder="Paste the complete invitation link" autocomplete="off" spellcheck="false" /><button class="primary" disabled={busy}>Join table</button></div>
      </form>
    </details>
  </section>
</main>
<footer><span>THREE FRONTS. TWELVE TURNS. YOUR CALL.</span><button class="text-button" on:click={onRules}>Rules & strategy ↗</button></footer>
