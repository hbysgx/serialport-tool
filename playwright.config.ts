import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node --import tsx src/index.ts',
    url: 'http://localhost:8765',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
