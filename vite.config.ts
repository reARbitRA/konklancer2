import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// HMR is opt-in: the Express host in this repo runs Vite in middleware mode on a
// single public port, so a second websocket port (Vite's default 24678/24679)
// would either collide with the app port or be unreachable behind the preview
// proxy. Set VITE_HMR_PORT to enable it when running Vite standalone.
const hmrPort = process.env.VITE_HMR_PORT ? Number(process.env.VITE_HMR_PORT) : null;
const hmrEnabled = process.env.DISABLE_HMR !== 'true' && hmrPort !== null && Number.isFinite(hmrPort);

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
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
      allowedHosts: true as const,
      // Vite 8 renamed the websocket options; without `ws: false` the ws server
      // still binds the default HMR port even when `hmr` is disabled.
      ...(hmrEnabled
        ? { hmr: { port: hmrPort as number, host: '0.0.0.0' }, ws: { port: hmrPort as number, host: '0.0.0.0' } }
        : { hmr: false as const, ws: false as const }),
      // Disable file watching when HMR is off to save CPU during agent edits.
      watch: hmrEnabled ? {} : null,
    },
  };
});
