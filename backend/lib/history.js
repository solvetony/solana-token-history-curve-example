import { fail } from './validation.js'

export const ranges = { '1D': 1, '7D': 7, '1M': 30, '3M': 90, '1Y': 365, ALL: null }

export function sampleSlots (end, range) {
  if (!Object.hasOwn(ranges, range)) fail('Invalid time range')
  const start = ranges[range] ? Math.max(1, end - Math.round(ranges[range] * 86400 / 0.4)) : 1
  return [...new Set(Array.from({ length: 10 }, (_, i) => Math.round(start + (end - start) * i / 9)))]
}

export async function readPoint (query, address, token, slot) {
  const balance = await query(`token-balance/${address}/${token}/${slot}`)
  if (!/^\d+(\.\d+)?$/.test(String(balance.balance)) || !Number.isFinite(Number(balance.balance)) || Number(balance.slot) !== slot) fail('Invalid balance returned by Solana Index', 502)
  const time = await query(`slot-timestamp/${slot}`)
  if (!Number.isFinite(Date.parse(time.timestamp)) || Number(time.slot) !== slot) fail('Invalid timestamp returned by Solana Index', 502)
  return { ...balance, timestamp: time.timestamp, timestampSlot: time.timestampSlot ?? slot, resolution: time.resolution || 'exact' }
}
