import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    // Emit ES2015-safe bundle: Android WebView / Samsung Internet < 92 do not
    // support modern syntax (Object.hasOwn, Array.prototype.at, optional chaining in
    // emitted helpers, etc). esbuild transpiles everything down to this target.
    build: {
      target: 'es2018',
      cssMinify: 'esbuild' as const,
    },
    server: {
      host: '0.0.0.0',
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      allowedHosts: true as const,
      // HMR port must not collide with Express when PORT=24678 (default Vite HMR=24678)
      hmr: process.env.DISABLE_HMR === 'true' ? false : { port: process.env.PORT === '24678' ? 24679 : 24678, host: '0.0.0.0' },
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
