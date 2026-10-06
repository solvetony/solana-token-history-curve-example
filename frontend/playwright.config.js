import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  use: { baseURL: 'http://127.0.0.1:5174' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: { command: 'npm run dev -- --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false }
})
