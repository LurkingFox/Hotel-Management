import { getAccessMigrationState } from '@/lib/access-provider/config'

function getObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readPath(source: unknown, path: string[]) {
  let current: unknown = source

  for (const key of path) {
    const next = getObject(current)

    if (!next || !(key in next)) {
      return null
    }

    current = next[key]
  }

  return getString(current)
}

export function getSeamConfig() {
  const state = getAccessMigrationState()

  return {
    apiKey: state.seamApiKey,
    roomDeviceMap: state.seamRoomDeviceMap,
    webhookSecret: state.seamWebhookSecret
  }
}

export function getSeamWebhookEventType(payload: unknown) {
  return (
    readPath(payload, ['event_type']) ??
    readPath(payload, ['type']) ??
    readPath(payload, ['data', 'event_type']) ??
    'unknown'
  )
}

export function getSeamWebhookEventId(payload: unknown) {
  return readPath(payload, ['event_id']) ?? readPath(payload, ['id']) ?? readPath(payload, ['data', 'event_id'])
}

export function getSeamWebhookResourceHint(payload: unknown) {
  return (
    readPath(payload, ['device', 'device_id']) ??
    readPath(payload, ['access_code', 'access_code_id']) ??
    readPath(payload, ['device_id']) ??
    readPath(payload, ['access_code_id']) ??
    readPath(payload, ['data', 'device', 'device_id']) ??
    readPath(payload, ['data', 'access_code', 'access_code_id'])
  )
}

export function buildSeamWebhookMessage(payload: unknown) {
  const eventType = getSeamWebhookEventType(payload)
  const resourceHint = getSeamWebhookResourceHint(payload)

  return resourceHint ? `Seam webhook received: ${eventType} (${resourceHint}).` : `Seam webhook received: ${eventType}.`
}