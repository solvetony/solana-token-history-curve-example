export async function request (path, { token, body, signal, onProgress } = {}) {
  const response = await fetch(`/history-api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(onProgress ? { Accept: 'application/x-ndjson' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal
  })
  if (response.ok && onProgress && response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let latest
    try {
      while (true) {
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let newline
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          if (!line.trim()) continue
          latest = JSON.parse(line)
          if (latest.error) throw Object.assign(new Error(latest.error), { code: latest.code })
          onProgress(latest)
        }
        if (done) break
      }
      if (!latest?.done) throw new Error('History loading was interrupted. Try again.')
      return latest
    } finally { await reader.cancel(); reader.releaseLock() }
  }
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { code: data.code, status: response.status })
  return data
}

const cacheKey = 'solana-history-points-v1'
function readCache () {
  try { return JSON.parse(localStorage.getItem(cacheKey) || '{}') || {} } catch { return {} }
}
const pointKey = (address, mint, slot) => `${address}:${mint}:${slot}`
const validPoint = (point, address, mint, slot) => point?.address === address && point.token === mint && point.slot === slot && typeof point.balance === 'string' && /^\d+(\.\d+)?$/.test(point.balance) && Number.isFinite(Number(point.balance)) && Number.isFinite(Date.parse(point.timestamp))

export async function loadPoint (address, mint, slot, options = {}) {
  options.signal?.throwIfAborted()
  const key = pointKey(address, mint, slot)
  try {
    const entry = readCache()[key]
    if (entry?.expires > Date.now() && validPoint(entry.point, address, mint, slot)) return entry.point
  } catch {}
  const point = await request(`point?token=${mint}&slot=${slot}`, options)
  if (validPoint(point, address, mint, slot)) {
    try {
      const entries = Object.entries(readCache()).filter(([entryKey, entry]) => entryKey !== key && entry?.expires > Date.now()).slice(-499)
      localStorage.setItem(cacheKey, JSON.stringify({ ...Object.fromEntries(entries), [key]: { expires: Date.now() + 86400000, point } }))
    } catch {}
  }
  return point
}

export async function loadHistory (address, mint, range, { onProgress, ...options }) {
  const plan = await request(`history?token=${mint}&range=${range}&plan=1`, options)
  if (plan.address !== address) throw new Error('The active wallet changed. Refresh your session.')
  const points = plan.points.map(point => ({ slot: point.slot, balance: null, timestamp: null, pending: true }))
  const snapshot = loaded => ({ ...plan, points: [...points], loaded, total: points.length, done: loaded === points.length })
  onProgress(snapshot(0))
  for (let i = 0; i < points.length; i++) {
    options.signal?.throwIfAborted()
    try { points[i] = await loadPoint(address, mint, points[i].slot, options) } catch (error) {
      if (options.signal?.aborted || [401, 403, 429, 503].includes(error.status)) throw error
      points[i] = { slot: points[i].slot, balance: null, timestamp: null, error: 'Sample unavailable' }
    }
    onProgress(snapshot(i + 1))
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  if (points.every(point => point.balance === null)) throw new Error('Solana Index returned no historical samples for this wallet and token.')
  return snapshot(points.length)
}
