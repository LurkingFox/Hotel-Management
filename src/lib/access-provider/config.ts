import type { AccessProviderTarget, BookingAccessPresentation } from '@/lib/access-provider/types'

const VALID_TARGETS = new Set<AccessProviderTarget>(['local_rfid', 'seam'])

function getTrimmedEnv(name: string) {
  const value = process.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function parseRoomDeviceMap(value: string) {
  if (!value) {
    return {} as Record<string, string>
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
        .map(([roomNumber, deviceId]) => [roomNumber.trim(), deviceId.trim()])
    )
  } catch {
    throw new Error('SEAM_ROOM_DEVICE_MAP_JSON must be a valid JSON object keyed by room number.')
  }
}

export function getAccessProviderTarget(): AccessProviderTarget {
  const configured = getTrimmedEnv('ACCESS_PROVIDER_TARGET')
  return VALID_TARGETS.has(configured as AccessProviderTarget) ? (configured as AccessProviderTarget) : 'local_rfid'
}

export function getAccessMigrationState() {
  const targetProvider = getAccessProviderTarget()
  const seamApiKey = getTrimmedEnv('SEAM_API_KEY')
  const seamWebhookSecret = getTrimmedEnv('SEAM_WEBHOOK_SECRET')
  const seamRoomDeviceMap = parseRoomDeviceMap(getTrimmedEnv('SEAM_ROOM_DEVICE_MAP_JSON'))
  const seamConfigured = Boolean(seamApiKey)

  return {
    bookingOperationsProvider: targetProvider === 'seam' && seamConfigured ? ('seam' as const) : ('local_rfid' as const),
    seamApiKey,
    seamConfigured,
    seamRoomDeviceMap,
    seamWebhookSecret,
    targetProvider
  }
}

export function getBookingAccessPresentation(state = getAccessMigrationState()): BookingAccessPresentation {
  if (state.bookingOperationsProvider === 'seam') {
    return {
      credentialKindLabel: 'Access code',
      generatedCredentialLabel: 'Generated access code',
      manualCredentialLabel: 'Access code',
      manualCredentialPlaceholder: 'Generated automatically at check-in',
      providerLabel: 'Provider: Seam',
      requiresManualCredential: false,
      statusNote: 'Seam is now issuing live guest access codes. Room-to-device mappings can be bootstrapped from SEAM_ROOM_DEVICE_MAP_JSON and are persisted after first use.'
    }
  }

  return {
    credentialKindLabel: 'Keycard',
    generatedCredentialLabel: 'Issued keycard',
    manualCredentialLabel: 'Card UID',
    manualCredentialPlaceholder: 'A3:F2:91:BC',
    providerLabel: 'Provider: Local RFID',
    requiresManualCredential: true,
    statusNote: null
  }
}