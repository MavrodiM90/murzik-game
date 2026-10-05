import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const gpuArgs = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 1,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${PORT}/murzik-game/`,
    launchOptions: { args: gpuArgs },
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'pixel7', use: { ...devices['Pixel 7'] } },
    // iPhone 13 в эмуляции Chromium (WebKit-движок не используется — это не настоящий Safari)
    { name: 'iphone13', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: `http://localhost:${PORT}/murzik-game/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
