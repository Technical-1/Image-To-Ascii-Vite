import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  publicDir: 'public',
  test: {
    // Default environment stays node, so the existing pure tests are untouched;
    // only files opting in via `// @vitest-environment jsdom` get a DOM. Giving
    // jsdom a real origin URL is required for localStorage to exist (jsdom only
    // provides Storage when the document has a non-opaque origin). hub-1105.
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    // Repairs Vitest 4's broken jsdom localStorage (bare {} with no methods).
    // No-op under the node environment, so the pure tests are unaffected.
    setupFiles: ['./tests/helpers/localstorage-polyfill.js'],
  },
});

