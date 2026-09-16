import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: {
    // Minification otherwise collapses every class to a short mangled name
    // (Scene subclasses, entity types). Nothing in gameplay code reads
    // `.constructor.name`, but the verification harness identifies which
    // scene is active by it, and debug tooling reads it too — keeping real
    // names costs a negligible amount of bundle size for that.
    keepNames: true,
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
