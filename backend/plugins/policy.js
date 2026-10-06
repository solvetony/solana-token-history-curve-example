import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'

export default fp(async function (fastify, options) {
  await fastify.register(rateLimit, { max: 30, timeWindow: '1 minute' })
  fastify.addHook('onRequest', async (request, reply) => {
    const origin = options.origin || process.env.APP_ORIGIN || 'http://localhost:5173'
    if (request.headers.origin && request.headers.origin !== origin) return reply.code(403).send({ error: 'Origin not allowed' })
    reply.header('Cache-Control', 'no-store')
  })
  fastify.setErrorHandler((error, request, reply) => {
    if (!error.statusCode) request.log.error({ errorType: error.name }, 'History request failed')
    reply.code(error.statusCode || 502).send({ error: error.statusCode ? error.message : 'Upstream service unavailable', code: error.code })
  })
}, { name: 'policy' })
