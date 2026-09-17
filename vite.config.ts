import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const standaloneClient = process.env.VERCEL === '1'
  ? './src/vercel-client.ts'
  : './local/client.ts';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  resolve: process.env.APPDEPLOY !== '1' ? {
    alias: {
      '@appdeploy/client': new URL(standaloneClient, import.meta.url).pathname,
    },
  } : undefined,
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap: process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: { maxParallelFileOps: 128 },
  },
});
