<script lang="ts">
  export let name: string;
  export let size = 24;
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  {#if name === 'sea'}
    <path d="M2 7c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 12c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 17c3-4 5 4 8 0s5 4 8 0 4 0 4 0" />
  {:else if name === 'land'}
    <path d="m2 19 8-14 5 9 3-5 4 10H2Z M7 10l3 2 2-2" />
  {:else if name === 'air'}
    <path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M5 16h5a3 3 0 1 1-3 3" />
  {:else if name === 'lock'}
    <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
  {:else if name === 'ai'}
    <rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4M10 10h4v4h-4Z" />
  {:else if name === 'local'}
    <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 5h4M11 19h2M3 8l-2 3 2 3m18-4 2 3-2 3" />
  {:else if name === 'online'}
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18Z" />
  {:else if name === 'shift'}
    <path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" />
  {:else if name === 'recall'}
    <path d="M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12" />
  {:else if name === 'deploy'}
    <path d="M12 3v17m-6-6 6 6 6-6M5 4H3v5m16-5h2v5" />
  {:else}
    <path d="M5 12h14m-6-6 6 6-6 6" />
  {/if}
</svg>
