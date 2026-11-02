import { getAccessMigrationState } from '@/lib/access-provider/config'

function getObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : null
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

export function getSeamWebhookOccurredAt(payload: unknown) {
  return readPath(payload, ['occurred_at']) ?? readPath(payload, ['created_at']) ?? readPath(payload, ['data', 'occurred_at'])
}

export function getSeamWebhookDescription(payload: unknown) {
  return (
    readPath(payload, ['event_description']) ??
    readPath(payload, ['description']) ??
    readPath(payload, ['data', 'event_description'])
  )
}

export function getSeamWebhookAccessCodeId(payload: unknown) {
  return (
    readPath(payload, ['access_code_id']) ??
    readPath(payload, ['access_code', 'access_code_id']) ??
    readPath(payload, ['data', 'access_code_id']) ??
    readPath(payload, ['data', 'access_code', 'access_code_id'])
  )
}

export function getSeamWebhookDeviceId(payload: unknown) {
  return readPath(payload, ['device_id']) ?? readPath(payload, ['device', 'device_id']) ?? readPath(payload, ['data', 'device_id'])
}

export function getSeamWebhookErrorCode(payload: unknown) {
  const root = getObject(payload)
  const rootErrors = getArray(root?.errors)
  const accessCodeErrors = getArray(getObject(root?.access_code)?.errors)
  const dataErrors = getArray(getObject(root?.data)?.errors)
  const candidates = [rootErrors, accessCodeErrors, dataErrors].filter(Boolean) as unknown[][]

  for (const errorList of candidates) {
    const firstError = getObject(errorList[0])
    const errorCode = getString(firstError?.error_code) ?? getString(firstError?.warning_code) ?? getString(firstError?.code)

    if (errorCode) {
      return errorCode
    }
  }

  return readPath(payload, ['error', 'type'])
}

export function getSeamWebhookErrorMessage(payload: unknown) {
  const root = getObject(payload)
  const rootErrors = getArray(root?.errors)
  const accessCodeErrors = getArray(getObject(root?.access_code)?.errors)
  const dataErrors = getArray(getObject(root?.data)?.errors)
  const candidates = [rootErrors, accessCodeErrors, dataErrors].filter(Boolean) as unknown[][]

  for (const errorList of candidates) {
    const firstError = getObject(errorList[0])
    const message = getString(firstError?.message)

    if (message) {
      return message
    }
  }

  return readPath(payload, ['error', 'message'])
}

export function buildSeamWebhookMessage(payload: unknown) {
  const eventType = getSeamWebhookEventType(payload)
  const resourceHint = getSeamWebhookResourceHint(payload)

  return resourceHint ? `Seam webhook received: ${eventType} (${resourceHint}).` : `Seam webhook received: ${eventType}.`
}