import { Readable } from 'node:stream'
import { fail, publicKey, slotNumber } from '../lib/validation.js'
import { readPoint, sampleSlots } from '../lib/history.js'

export default async function (fastify) {
  async function authorize (request) {
    if (request.headers.authorization) await fastify.authenticate(request)
    return fastify.session(request.identity).address
  }
  fastify.get('/history-api/history', async (request, reply) => {
    const address = await authorize(request)
    const token = publicKey(request.query.token)
    const current = await fastify.solanaIndex('slot')
    const end = slotNumber(current.slot)
    const slots = sampleSlots(end, request.query.range || '1M')
    const metadata = { address, token, currentSlot: end, range: request.query.range || '1M', sampling: '10 slot samples; time range boundaries estimated at 400 ms per slot. Skipped slots use preceding block timestamps, identified by timestampSlot and resolution.' }
    if (request.query.plan === '1') return { ...metadata, points: slots.map(slot => ({ slot, balance: null, timestamp: null, pending: true })), loaded: 0, total: slots.length }
    async function * snapshots () {
      const points = slots.map(slot => ({ slot, balance: null, timestamp: null, pending: true }))
      yield { ...metadata, points: [...points], loaded: 0, total: slots.length }
      for (let i = 0; i < slots.length; i++) {
        try {
          points[i] = await readPoint(fastify.solanaIndex, address, token, slots[i])
        } catch (error) {
          if (error.statusCode === 429 || error.statusCode === 503) throw error
          points[i] = { slot: slots[i], balance: null, timestamp: null, error: 'Sample unavailable' }
        }
        if (i === slots.length - 1 && points.every(point => point.balance === null)) fail('Solana Index returned no historical samples for this wallet and token.', 502)
        yield { ...metadata, points: [...points], loaded: i + 1, total: slots.length, done: i === slots.length - 1 }
      }
    }
    if (request.headers.accept === 'application/x-ndjson') {
      reply.header('X-Accel-Buffering', 'no').type('application/x-ndjson')
      return reply.send(Readable.from((async function * () {
        try {
          for await (const data of snapshots()) yield JSON.stringify(data) + '\n'
        } catch (error) {
          yield JSON.stringify({ error: error.statusCode ? error.message : 'Upstream service unavailable', code: error.code }) + '\n'
        }
      })()))
    }
    let result
    for await (const data of snapshots()) result = data
    return result
  })
  fastify.get('/history-api/point', async request => {
    const address = await authorize(request)
    const token = publicKey(request.query.token)
    const slot = slotNumber(request.query.slot)
    const current = await fastify.solanaIndex('slot')
    if (slot > slotNumber(current.slot)) fail('Choose a finalized slot at or before the current slot')
    return readPoint(fastify.solanaIndex, address, token, slot)
  })
}
