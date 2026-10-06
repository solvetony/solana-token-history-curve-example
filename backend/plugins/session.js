import fp from 'fastify-plugin'
import jwt from 'jsonwebtoken'
import { fail, publicKey } from '../lib/validation.js'

export default fp(async function (fastify, options) {
  const exampleAddress = publicKey(options.exampleAddress || process.env.EXAMPLE_ADDRESS || '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY')
  // ponytail: process-local sessions reset on restart; use shared storage if replicas are needed.
  const sessions = new Map()
  const sessionKey = identity => JSON.stringify([identity.user, identity.sid])
  fastify.addHook('onClose', async () => sessions.clear())
  fastify.decorate('exampleAddress', exampleAddress)
  fastify.decorateRequest('identity', null)
  fastify.decorate('authenticate', async request => {
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1]
    if (!token) fail('Sign in with Privy to change the example address', 401)
    const appId = options.privyAppId || process.env.PRIVY_APP_ID
    const key = options.verificationKey || process.env.PRIVY_VERIFICATION_KEY?.replace(/\\n/g, '\n')
    if (!appId || !key) fail('Privy authentication is not configured', 503)
    try {
      const claims = jwt.verify(token, key, { algorithms: ['ES256'], issuer: 'privy.io', audience: appId })
      if (typeof claims.sub !== 'string' || !claims.sub.startsWith('did:privy:') || typeof claims.sid !== 'string' || !claims.sid || !Number.isFinite(claims.exp)) throw new Error()
      request.identity = { user: claims.sub, sid: claims.sid }
    } catch { fail('Your session expired. Sign in again.', 401) }
  })
  fastify.decorate('session', identity => {
    if (!identity) return { address: exampleAddress, changed: false, authenticated: false }
    const key = sessionKey(identity)
    if (!sessions.has(key)) sessions.set(key, { address: exampleAddress, changed: false })
    return { ...sessions.get(key), authenticated: true }
  })
  fastify.decorate('changeAddress', (identity, address) => {
    publicKey(address)
    const current = fastify.session(identity)
    if (address === current.address) return current
    if (current.changed) fail('This demo allows one address change per session. Subscribe to Solana Index to explore more wallets.', 403, 'DEMO_LIMIT')
    sessions.set(sessionKey(identity), { address, changed: true })
    return fastify.session(identity)
  })
}, { name: 'session' })
