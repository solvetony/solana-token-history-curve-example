import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'
import Fastify from 'fastify'
import application from '../app.js'
import { sampleSlots } from '../lib/history.js'

const example = '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY'
const other = '11111111111111111111111111111111'
const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const appId = 'test-app'
const verificationKey = publicKey.export({ type: 'spki', format: 'pem' })
const accessToken = (sid = 'session-one', extra = {}) => jwt.sign({ sid, aud: appId, ...extra }, privateKey, { algorithm: 'ES256', issuer: 'privy.io', subject: 'did:privy:user-one', expiresIn: '1h' })
const headers = token => ({ authorization: `Bearer ${token}` })

test('session allowance is atomic, survives token refresh, isolates sessions and resets on restart', async () => {
  let app
  async function open () {
    app = Fastify()
    await app.register(application, { privyAppId: appId, verificationKey })
    await app.ready()
  }
  try {
    await open()
    assert.equal((await app.inject('/history-api/session')).statusCode, 401)
    assert.equal((await app.inject({ url: '/history-api/session', headers: headers(accessToken('bad', { aud: 'wrong-app' })) })).statusCode, 401)
    const first = await app.inject({ url: '/history-api/session', headers: headers(accessToken()) })
    assert.equal(first.json().address, example)
    const invalid = await app.inject({ method: 'POST', url: '/history-api/session/address', headers: headers(accessToken()), payload: { address: '0'.repeat(32) } })
    assert.equal(invalid.statusCode, 400)
    const concurrent = await Promise.all([other, mint].map(address => app.inject({ method: 'POST', url: '/history-api/session/address', headers: headers(accessToken()), payload: { address } })))
    assert.deepEqual(concurrent.map(r => r.statusCode).sort(), [200, 403])
    assert.equal(concurrent.find(r => r.statusCode === 403).json().code, 'DEMO_LIMIT')
    const chosen = concurrent.find(r => r.statusCode === 200).json().address
    const refreshed = await app.inject({ url: '/history-api/session', headers: headers(accessToken('session-one', { jti: 'refreshed' })) })
    assert.equal(refreshed.json().address, chosen)
    assert.equal(refreshed.json().changed, true)
    const newSession = await app.inject({ url: '/history-api/session', headers: headers(accessToken('session-two')) })
    assert.equal(newSession.json().changed, false)
    const same = await app.inject({ method: 'POST', url: '/history-api/session/address', headers: headers(accessToken()), payload: { address: chosen } })
    assert.equal(same.statusCode, 200)
    await app.close()
    await open()
    const restarted = await app.inject({ url: '/history-api/session', headers: headers(accessToken()) })
    assert.equal(restarted.json().address, example)
    assert.equal(restarted.json().changed, false)
  } finally { await app?.close() }
})

test('history uses production routes, preserves balances, shows gaps and prevents arbitrary wallet reads', async () => {
  const calls = []
  let unavailable = false
  const app = Fastify()
  await app.register(application, {
    apiKey: 'test-key',
    privyAppId: appId,
    verificationKey,
    fetchApi: async (url, options) => {
      assert.ok(url.startsWith('https://solanaindex.top/api/v1/solana/'))
      assert.equal(options.headers.Authorization, 'Bearer test-key')
      calls.push(url)
      if (url.endsWith('/slot')) return Response.json({ slot: 10000000, timestamp: '2026-10-05T00:00:00Z' })
      const slot = Number(url.split('/').at(-1))
      if (unavailable || slot === sampleSlots(10000000, '1D')[3]) return Response.json({ error: 'Missing' }, { status: 404 })
      if (url.includes('slot-timestamp')) return Response.json({ slot, timestamp: '2026-10-04T12:00:00Z' })
      return Response.json({ slot, balance: '123.4567890123456789', balanceRaw: '1234567890123456789', decimals: 16, source: 'test-source' })
    }
  })
  try {
    const response = await app.inject(`/history-api/history?token=${mint}&range=1D&address=${other}`)
    assert.equal(response.statusCode, 200)
    const data = response.json()
    assert.equal(data.points.length, 10)
    const beforePlan = calls.length
    const plan = await app.inject(`/history-api/history?token=${mint}&range=1D&plan=1`)
    assert.equal(plan.json().total, 10)
    assert.ok(plan.json().points.every(point => point.pending))
    assert.equal(calls.length, beforePlan)

    assert.equal(data.points[0].balance, '123.4567890123456789')
    assert.equal(data.points[3].balance, null)
    assert.equal(data.points.at(-1).slot, 10000000)
    const streamed = await app.inject({ url: `/history-api/history?token=${mint}&range=1D`, headers: { accept: 'application/x-ndjson' } })
    assert.equal(streamed.headers['x-accel-buffering'], 'no')
    const snapshots = streamed.body.trim().split('\n').map(line => JSON.parse(line))
    assert.deepEqual(snapshots.map(data => data.loaded), Array.from({ length: 11 }, (_, i) => i))
    assert.equal(snapshots[1].points[0].balance, '123.4567890123456789')
    assert.equal(snapshots[1].points[1].pending, true)
    assert.equal(snapshots.at(-1).done, true)

    assert.ok(calls.filter(url => url.includes('token-balance')).every(url => url.includes(`/${example}/`)))
    const count = calls.length
    await app.inject(`/history-api/history?token=${mint}&range=1D`)
    assert.equal(calls.length, count + 1)
    assert.equal((await app.inject(`/history-api/history?token=${mint}&range=bad`)).statusCode, 400)
    assert.equal((await app.inject('/history-api/history?token=invalid')).statusCode, 400)
    assert.equal((await app.inject(`/history-api/point?token=${mint}&slot=10000001`)).statusCode, 400)
    assert.equal((await app.inject({ url: `/history-api/history?token=${mint}`, headers: headers('forged') })).statusCode, 401)
    await app.inject({ method: 'POST', url: '/history-api/session/address', headers: headers(accessToken()), payload: { address: other } })
    const point = await app.inject({ url: `/history-api/point?token=${mint}&slot=9999999`, headers: headers(accessToken()) })
    assert.equal(point.statusCode, 200)
    assert.ok(calls.some(url => url.includes(`token-balance/${other}/`)))
    unavailable = true
    assert.equal((await app.inject(`/history-api/history?token=${other}&range=7D`)).statusCode, 502)
  } finally { await app.close() }
})

test('missing production key fails explicitly and never supplies invented history', async () => {
  const app = Fastify()
  await app.register(application)
  try {
    const response = await app.inject(`/history-api/history?token=${mint}`)
    assert.equal(response.statusCode, 503)
    assert.match(response.json().error, /SOLANA_INDEX_API_KEY/)
    assert.equal(response.json().points, undefined)
  } finally { await app.close() }
})
