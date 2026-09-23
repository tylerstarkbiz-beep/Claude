// Builds a single self-contained HTML file: the app plus its API running in the browser on sample data.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

const shim = (name: string) => resolve(import.meta.dirname, 'demo/shims', name);

export default defineConfig({
  root: resolve(import.meta.dirname, 'demo'),
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  resolve: {
    alias: {
      'node:sqlite': shim('sqlite.ts'),
      'node:fs': shim('fs.ts'),
      'node:path': shim('path.ts'),
      'node:crypto': shim('crypto.ts'),
      express: shim('express.ts'),
    },
  },
  build: { outDir: resolve(import.meta.dirname, 'dist-demo'), emptyOutDir: true, target: 'es2022' },
});
