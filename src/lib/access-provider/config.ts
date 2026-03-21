import type { AccessProviderTarget, BookingAccessPresentation } from '@/lib/access-provider/types'

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
  return 'seam'
}

export function getAccessMigrationState() {
  const seamApiKey = getTrimmedEnv('SEAM_API_KEY')
  const seamWebhookSecret = getTrimmedEnv('SEAM_WEBHOOK_SECRET')
  const seamRoomDeviceMap = parseRoomDeviceMap(getTrimmedEnv('SEAM_ROOM_DEVICE_MAP_JSON'))
  const seamConfigured = Boolean(seamApiKey)

  return {
    bookingOperationsProvider: 'seam' as const,
    seamApiKey,
    seamConfigured,
    seamRoomDeviceMap,
    seamWebhookSecret,
    targetProvider: 'seam' as const
  }
}

export function getBookingAccessPresentation(state = getAccessMigrationState()): BookingAccessPresentation {
  return {
    credentialKindLabel: 'Access code',
    generatedCredentialLabel: 'Generated access code',
    manualCredentialLabel: 'Access code',
    manualCredentialPlaceholder: 'Generated automatically at check-in',
    providerLabel: 'Provider: Seam',
    requiresManualCredential: false,
    statusNote: state.seamConfigured
      ? 'Seam is now issuing live guest access codes. Room-to-device mappings can be bootstrapped from SEAM_ROOM_DEVICE_MAP_JSON and are persisted after first use.'
      : 'Seam is the only active access provider on this branch. Configure SEAM_API_KEY and room-device mappings before running live booking operations.'
  }
}