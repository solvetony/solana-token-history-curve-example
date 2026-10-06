export default async function (fastify) {
  fastify.get('/history-api/config', async () => ({ exampleAddress: fastify.exampleAddress, exampleLabel: 'toly.sol · Anatoly Yakovenko (unverified attribution)' }))
  fastify.get('/history-api/session', { preHandler: fastify.authenticate }, async request => fastify.session(request.identity))
  fastify.post('/history-api/session/address', {
    preHandler: fastify.authenticate,
    schema: { body: { type: 'object', required: ['address'], additionalProperties: false, properties: { address: { type: 'string', minLength: 32, maxLength: 44 } } } }
  }, async request => fastify.changeAddress(request.identity, request.body.address))
}
