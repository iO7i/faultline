import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative assets keep the static bundle suitable for a project-page deployment.
  base: './',
  root: here,
  resolve: {
    // The public AEL model uses Node's synchronous SHA-256 call. This alias supplies
    // the same narrow API in the browser; the AEL checker itself remains unchanged.
    alias: { 'node:crypto': resolve(here, 'src/faultline/browser-crypto.ts') },
  },
  server: { fs: { allow: [resolve(here, '../..')] } },
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true, sourcemap: false },
});
