import { defineConfig, devices } from '@playwright/test';

// En CI no hay GPU: Chromium dibuja con SwiftShader (lento), de ahí los tiempos generosos.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4175/',
    viewport: { width: 1400, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM || undefined,
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
        },
      },
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4175 --strictPort',
    url: 'http://localhost:4175/',
    reuseExistingServer: !process.env.CI,
  },
});
