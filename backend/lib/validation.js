import bs58 from 'bs58'

export function fail (message, statusCode = 400, code) {
  throw Object.assign(new Error(message), { statusCode, code })
}

export function publicKey (value) {
  try {
    if (typeof value !== 'string' || value.length > 44 || bs58.decode(value).length !== 32) throw new Error()
    return value
  } catch { fail('Enter a valid Solana address') }
}

export function slotNumber (value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) fail('Enter a positive, safe integer slot')
  return Number(value)
}
