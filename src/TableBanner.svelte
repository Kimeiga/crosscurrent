<script lang="ts">
  type Props = {
    /** The invitation link while the friend has not joined; null otherwise. */
    link: string | null;
    toast: string;
    /** The result line once the game is over and the last reveal has played. */
    verdict: string;
    busy: boolean;
    online: boolean;
    onShare: () => void;
    onAgain: () => void;
    onHome: () => void;
  };
  let { link, toast, verdict, busy, online, onShare, onAgain, onHome }: Props = $props();
</script>

{#if link !== null}
  <section class="panel">
    <h2>Send this link to your friend</h2>
    <p>The game starts when they open it. Only they can use it, so share it with one person.</p>
    <div class="invite">
      <input aria-label="Invitation link" readonly value={link} onfocus={event => event.currentTarget.select()} />
      <button class="btn primary" onclick={onShare}>Share link</button>
    </div>
    {#if toast}<p class="toast" role="status">{toast}</p>{/if}
  </section>
{:else if verdict}
  <section class="panel result" role="status">
    <h2>{verdict}</h2>
    <div class="row">
      <button class="btn primary" onclick={onAgain} disabled={busy}>{online ? 'New table' : 'Play again'}</button>
      <button class="btn" onclick={onHome}>Back to start</button>
    </div>
  </section>
{/if}

<style>
  .panel { display: grid; gap: 10px; padding: 16px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--line); }
  .panel h2 { font-family: var(--serif); font-size: 22px; line-height: 1.2; }
  .panel p { color: var(--ink-2); font-size: 15px; }
  .invite { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
  .invite input { min-width: 0; min-height: 48px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--paper); font-size: 15px; }
  .toast { color: var(--ink) !important; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; }
  @media (max-width: 480px) { .invite { grid-template-columns: 1fr; } }
</style>
