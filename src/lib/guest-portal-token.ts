import { createHmac, timingSafeEqual } from 'node:crypto'

type GuestPortalTokenPayload = {
  bookingId: string
  code: string
  exp: number
}

const DEFAULT_TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000

function getTokenSecret() {
  const secret = process.env.GUEST_PORTAL_TOKEN_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''

  if (!secret) {
    throw new Error('GUEST_PORTAL_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY is required for guest portal token signing.')
  }

  return secret
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signValue(value: string) {
  return createHmac('sha256', getTokenSecret()).update(value).digest('base64url')
}

export function createGuestPortalToken(input: { bookingId: string; code: string; expiresAt?: number }) {
  const payload: GuestPortalTokenPayload = {
    bookingId: input.bookingId,
    code: input.code,
    exp: input.expiresAt ?? Date.now() + DEFAULT_TOKEN_LIFETIME_MS
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = signValue(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifyGuestPortalToken(token: string) {
  const [encodedPayload, providedSignature] = token.split('.')

  if (!encodedPayload || !providedSignature) {
    return null
  }

  const expectedSignature = signValue(encodedPayload)
  const providedBuffer = Buffer.from(providedSignature)
  const expectedBuffer = Buffer.from(expectedSignature)

  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as GuestPortalTokenPayload

    if (!payload.code || !payload.bookingId || !Number.isFinite(payload.exp) || payload.exp < Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}