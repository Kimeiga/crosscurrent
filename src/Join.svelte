<script lang="ts">
  let { busy, onJoin, onRules }: { busy: boolean; onJoin: () => void; onRules: () => void } = $props();
</script>

<main class="center">
  <h1>You’re invited to a game</h1>
  <p>Your friend opened a table and is waiting. Crosscurrent takes about fifteen minutes; you can learn as you go.</p>
  <button class="btn primary big" onclick={onJoin} disabled={busy}>{busy ? 'Joining…' : 'Join the game'}</button>
  <button class="link" onclick={onRules}>How to play</button>
</main>
