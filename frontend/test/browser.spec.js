import { createServer } from 'node:http'
import { test, expect } from '@playwright/test'

const address = '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY'
const points = Array.from({ length: 10 }, (_, i) => ({ slot: 10000000 + i * 1000, balance: String([50, 52, 51, 60, 72, 70, 66, 82, 94, 102, 90, 83, 80, 100, 122, 115, 130, 127, 120, 140, 150, 149, 148, 162, 170][i]), timestamp: new Date(Date.UTC(2026, 8, i + 1)).toISOString(), source: 'test-only fixture' }))

test('history interactions, themes, exact slot lookup and responsive layout', async ({ page }, testInfo) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => { if (!localStorage.getItem('solana-history-theme')) localStorage.setItem('solana-history-theme', 'light') })
  await page.route('**/history-api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/config')) return route.fulfill({ json: { exampleAddress: address, exampleLabel: 'toly.sol · Anatoly Yakovenko (unverified attribution)' } })
    if (url.pathname.endsWith('/point')) {
      const slot = Number(url.searchParams.get('slot'))
      return route.fulfill({ json: { ...(points.find(point => point.slot === slot) || { ...points[5], slot, balance: '123.4567890123456789', timestampSlot: 10000120, resolution: 'previous-block' }), address, token: url.searchParams.get('token') } })
    }
    return route.fulfill({ json: { address, points, currentSlot: points.at(-1).slot, sampling: 'Test-only fixture: exact slot samples.' } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Token balance history' })).toBeVisible()
  await expect(page.locator('.curve')).toBeVisible()
  await page.getByRole('slider', { name: 'Select sampled slot' }).fill('5')
  await expect(page.locator('.slot-details')).toContainText('10,005,000')
  await page.getByLabel('Solana slot', { exact: true }).fill('10000123')
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(page.locator('.slot-details')).toContainText('123.4567890123456789 USDC')
  await expect(page.getByRole('link', { name: 'Previous block · slot 10,000,120' })).toHaveAttribute('href', 'https://solscan.io/block/10000120')
  await expect(page.locator('.chart-tooltip')).toContainText('previous block 10,000,120')
  await page.getByRole('button', { name: 'Inspect slot 10003000' }).click()
  await expect(page.locator('.slot-details')).toContainText('10,003,000')
  await page.getByRole('button', { name: '7D', exact: true }).click()
  await expect(page.getByRole('button', { name: '7D', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'wSOL', exact: true }).click()
  await expect(page.locator('.chart-title')).toContainText('Wrapped SOL')
  await expect(page.locator('.curve')).toBeVisible()
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await page.screenshot({ path: testInfo.outputPath(`history-${theme}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('upstream errors show recovery and do not display fictional balances', async ({ page }) => {
  await page.route('**/history-api/config', route => route.fulfill({ json: { exampleAddress: address } }))
  await page.route('**/history-api/history**', route => route.fulfill({ status: 503, json: { error: 'Configure SOLANA_INDEX_API_KEY on the backend.' } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'History is not available yet' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('SOLANA_INDEX_API_KEY')
  await expect(page.locator('.curve')).toHaveCount(0)
  await page.route('**/history-api/history**', route => route.fulfill({ json: { address, points, currentSlot: points.at(-1).slot } }))
  await page.route('**/history-api/point**', route => route.fulfill({ json: { ...points.find(point => point.slot === Number(new URL(route.request().url()).searchParams.get('slot'))), address, token: new URL(route.request().url()).searchParams.get('token') } }))
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.curve')).toBeVisible()
})

test('session wallet change, second-change dialog and refresh persistence', async ({ page }, testInfo) => {
  await page.route('**/src/auth.jsx', route => route.fulfill({
    contentType: 'application/javascript',
    body: "export const useAuth = () => ({ ready: true, configured: true, authenticated: true, user: { id: 'test-user' }, getAccessToken: async () => 'test-privy-token', logout () {} }); export default function AuthProvider ({ children }) { return children }"
  }))
  let selectedAddress = address
  let changed = false
  let changeRequests = 0
  await page.route('**/history-api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/config')) return route.fulfill({ json: { exampleAddress: address } })
    expect(route.request().headers().authorization).toBe('Bearer test-privy-token')
    if (url.pathname.endsWith('/session/address')) {
      changeRequests++
      selectedAddress = route.request().postDataJSON().address
      changed = true
      return route.fulfill({ json: { address: selectedAddress, changed, authenticated: true } })
    }
    if (url.pathname.endsWith('/session')) return route.fulfill({ json: { address: selectedAddress, changed, authenticated: true } })
    if (url.pathname.endsWith('/point')) return route.fulfill({ json: { ...points.find(point => point.slot === Number(url.searchParams.get('slot'))), address: selectedAddress, token: url.searchParams.get('token') } })
    return route.fulfill({ json: { address: selectedAddress, points, currentSlot: points.at(-1).slot } })
  })
  await page.addInitScript(() => localStorage.setItem('solana-history-theme', 'light'))
  await page.goto('/')
  await expect(page.locator('.curve')).toBeVisible()
  await page.getByRole('textbox', { name: 'Solana wallet address' }).fill('11111111111111111111111111111111')
  await page.getByRole('button', { name: 'Explore wallet' }).click()
  await expect(page.getByText('Address change used for this session')).toBeVisible()
  await expect(page.locator('.curve')).toBeVisible()
  await page.getByRole('textbox', { name: 'Solana wallet address' }).fill(address)
  await page.getByRole('button', { name: 'Explore wallet' }).click()
  const dialog = page.getByRole('dialog', { name: 'More wallets. More possibilities.' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Explore subscriptions' })).toHaveAttribute('href', 'https://solanaindex.top/pricing')
  await page.screenshot({ path: testInfo.outputPath('demo-dialog-light.png') })
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Switch to dark theme' }).click()
  await page.getByRole('button', { name: 'Explore wallet' }).click()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('demo-dialog-dark.png') })
  await dialog.getByRole('button', { name: 'Keep exploring this wallet' }).click()
  expect(changeRequests).toBe(1)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Solana wallet address' })).toHaveValue(selectedAddress)
  await expect(page.getByText('Address change used for this session')).toBeVisible()
})

test('renders a completed slot before the remaining history finishes', async ({ page }) => {
  let finish
  const remaining = new Promise(resolve => { finish = resolve })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    const slot = Number(url.searchParams.get('slot'))
    if (slot !== points[0].slot) await remaining
    response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    response.end(JSON.stringify({ ...points.find(point => point.slot === slot), address, token: url.searchParams.get('token') }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await page.route('**/history-api/config', route => route.fulfill({ json: { exampleAddress: address } }))
    await page.route('**/history-api/history**', route => route.fulfill({ json: { address, points, currentSlot: points.at(-1).slot } }))
    await page.route('**/history-api/point**', route => route.continue({ url: `http://127.0.0.1:${server.address().port}/point${new URL(route.request().url()).search}` }))
    await page.goto('/')
    await expect(page.locator('.load-progress')).toContainText('1 / 10 slots loaded')
    await expect(page.locator('.curve')).toBeVisible()
    await expect(page.locator('.slot-details')).toContainText('50 USDC')
    await expect(page.locator('tbody')).toContainText('Loading…')
    finish()
    await expect(page.locator('.load-progress')).toHaveCount(0)
    await expect(page.locator('tbody')).not.toContainText('Loading…')
    await expect(page.locator('.metric').first()).toContainText('102')
  } finally {
    finish()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})

test('localStorage avoids repeated point requests while preserving progress and token isolation', async ({ page }) => {
  let pointRequests = 0
  await page.route('**/history-api/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/config')) return route.fulfill({ json: { exampleAddress: address } })
    if (url.pathname.endsWith('/point')) {
      pointRequests++
      return route.fulfill({ json: { ...points.find(point => point.slot === Number(url.searchParams.get('slot'))), address, token: url.searchParams.get('token') } })
    }
    return route.fulfill({ json: { address, points, currentSlot: points.at(-1).slot } })
  })
  await page.goto('/')
  await expect(page.locator('.metric').first()).toContainText('102')
  await expect(page.locator('.load-progress')).toHaveCount(0)
  expect(pointRequests).toBe(10)
  await page.reload()
  await expect(page.getByRole('progressbar', { name: 'History loading progress' })).toBeVisible()
  await expect(page.locator('.metric').first()).toContainText('102')
  await expect(page.locator('.load-progress')).toHaveCount(0)
  expect(pointRequests).toBe(10)
  await page.getByLabel('Solana slot', { exact: true }).fill(String(points[5].slot))
  await page.getByRole('button', { name: 'Go', exact: true }).click()
  await expect(page.locator('.slot-details')).toContainText('70 USDC')
  expect(pointRequests).toBe(10)
  await page.getByRole('button', { name: 'wSOL', exact: true }).click()
  await expect(page.locator('.metric').first()).toContainText('102')
  await expect(page.locator('.load-progress')).toHaveCount(0)
  await expect.poll(() => pointRequests).toBe(20)
  await page.evaluate(() => localStorage.setItem('solana-history-points-v1', '{broken'))
  await page.reload()
  await expect(page.locator('.load-progress')).toHaveCount(0)
  await expect(page.locator('.metric').first()).toContainText('102')
  expect(pointRequests).toBe(30)
})
