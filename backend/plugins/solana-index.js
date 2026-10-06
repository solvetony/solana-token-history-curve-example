import fp from 'fastify-plugin'
import { fail } from '../lib/validation.js'

export default fp(async function (fastify, options) {
  const cache = new Map()
  const fetchApi = options.fetchApi || fetch
  fastify.decorate('solanaIndex', async path => {
    const cached = cache.get(path)
    if (cached && cached.expires > Date.now()) return cached.promise
    const key = options.apiKey || process.env.SOLANA_INDEX_API_KEY
    if (!key) fail('Configure SOLANA_INDEX_API_KEY on the backend to load production balances.', 503)
    const promise = (async () => {
      const response = await fetchApi(`https://solanaindex.top/api/v1/solana/${path}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20000),
        redirect: 'error'
      })
      let size = 0
      const chunks = []
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > 256 * 1024) fail('Solana Index response too large', 502)
        chunks.push(chunk)
      }
      let data
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { fail('Invalid Solana Index response', 502) }
      if (!response.ok) fail(response.status === 429 ? 'Solana Index request allowance exhausted. Try again later.' : 'Solana Index could not return this balance. Check the API key and subscription.', response.status === 429 ? 429 : 502)
      return data
    })()
    if (cache.size >= 3000) cache.delete(cache.keys().next().value)
    cache.set(path, { promise, expires: Date.now() + (path === 'slot' ? 30000 : 86400000) })
    try { return await promise } catch (error) { cache.delete(path); throw error }
  })
}, { name: 'solana-index' })
