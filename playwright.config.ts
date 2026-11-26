import { defineConfig } from '@playwright/test'

// E2E against the web dev server: PGlite + local Storage in .data/e2e, login bypass, /api/dev/reset.
// One worker: every spec shares the dev server's single database (and PGlite needs ~500 MB).
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/zz-screens.spec.ts'],
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true', HUB_DEV_AUTH: '1', HUB_E2E: '1', VITE_DEV_AUTH: '1', HUB_DATA_DIR: '.data/e2e' }
  }
})
