import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 8192,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // Single chunk keeps mobile first-load to one request; the bundle is small
        // enough that code splitting would cost more in round-trips than it saves.
        manualChunks: undefined,
      },
    },
  },
  server: { host: true, port: 5173 },
});
