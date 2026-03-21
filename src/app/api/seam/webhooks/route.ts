import { NextResponse } from 'next/server'
import { Webhook } from 'svix'

import {
  buildSeamWebhookMessage,
  getSeamConfig,
  getSeamWebhookAccessCodeId,
  getSeamWebhookDescription,
  getSeamWebhookDeviceId,
  getSeamWebhookErrorCode,
  getSeamWebhookErrorMessage,
  getSeamWebhookEventId,
  getSeamWebhookEventType,
  getSeamWebhookOccurredAt
} from '@/lib/access-provider/seam'
import { createAdminSupabaseClient, hasAdminSupabaseCredentials } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

type BookingAccessCredentialRow = Pick<
  Database['public']['Tables']['booking_access_credentials']['Row'],
  'booking_id' | 'id' | 'provider_reference' | 'status'
>

function deriveWebhookCredentialState(eventType: string, errorCode: string | null) {
  if (eventType === 'access_code.deleted' || eventType.endsWith('.deleted') || eventType.endsWith('.removed')) {
    return {
      credentialStatus: 'revoked' as const,
      providerStatus: 'deleted'
    }
  }

  if (errorCode || eventType.endsWith('.failed') || eventType.includes('.error')) {
    return {
      credentialStatus: 'active' as const,
      providerStatus: 'error'
    }
  }

  if (eventType === 'access_code.modified_external_to_seam') {
    return {
      credentialStatus: 'active' as const,
      providerStatus: 'warning'
    }
  }

  if (eventType.startsWith('access_code.')) {
    return {
      credentialStatus: 'active' as const,
      providerStatus: eventType.replace(/^access_code\./, '')
    }
  }

  return {
    credentialStatus: null,
    providerStatus: eventType
  }
}

function getSvixHeaders(request: Request) {
  return {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? ''
  }
}

export async function POST(request: Request) {
  const { webhookSecret } = getSeamConfig()

  if (!webhookSecret) {
    return NextResponse.json({ error: 'SEAM_WEBHOOK_SECRET is not configured.' }, { status: 503 })
  }

  const payload = await request.text()
  const headers = getSvixHeaders(request)

  if (!headers['svix-id'] || !headers['svix-signature'] || !headers['svix-timestamp']) {
    return NextResponse.json({ error: 'Missing Svix verification headers.' }, { status: 400 })
  }

  let verifiedPayload: unknown

  try {
    verifiedPayload = new Webhook(webhookSecret).verify(payload, headers)
  } catch {
    return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 400 })
  }

  if (!hasAdminSupabaseCredentials()) {
    return NextResponse.json({ eventId: getSeamWebhookEventId(verifiedPayload), persisted: false, received: true }, { status: 202 })
  }

  const supabase = createAdminSupabaseClient()
  const eventType = getSeamWebhookEventType(verifiedPayload)

  const accessCodeId = getSeamWebhookAccessCodeId(verifiedPayload)
  const deviceId = getSeamWebhookDeviceId(verifiedPayload)
  const eventId = getSeamWebhookEventId(verifiedPayload)
  const eventDescription = getSeamWebhookDescription(verifiedPayload)
  const occurredAt = getSeamWebhookOccurredAt(verifiedPayload)
  const errorCode = getSeamWebhookErrorCode(verifiedPayload)
  const errorMessage = getSeamWebhookErrorMessage(verifiedPayload)

  let credential: BookingAccessCredentialRow | null = null

  if (accessCodeId) {
    const credentialResult = await supabase
      .from('booking_access_credentials')
      .select('id, booking_id, provider_reference, status')
      .eq('provider', 'seam')
      .eq('provider_reference', accessCodeId)
      .maybeSingle<BookingAccessCredentialRow>()

    if (credentialResult.error) {
      return NextResponse.json({ error: credentialResult.error.message }, { status: 500 })
    }

    credential = credentialResult.data ?? null
  }

  if (credential) {
    const nextState = deriveWebhookCredentialState(eventType, errorCode)
    const { error: credentialUpdateError } = await supabase
      .from('booking_access_credentials')
      .update({
        provider_device_id: deviceId ?? undefined,
        provider_error_code: errorCode,
        provider_error_message: errorMessage ?? eventDescription,
        provider_event_id: eventId,
        provider_event_occurred_at: occurredAt,
        provider_event_type: eventType,
        provider_status: nextState.providerStatus,
        status: nextState.credentialStatus ?? credential.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', credential.id)

    if (credentialUpdateError) {
      return NextResponse.json({ error: credentialUpdateError.message }, { status: 500 })
    }
  }

  const { error } = await supabase.from('notifications').insert({
    booking_id: credential?.booking_id ?? null,
    message: buildSeamWebhookMessage(verifiedPayload),
    triggered_by: 'seam_webhook',
    type: `seam_${eventType.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    bookingId: credential?.booking_id ?? null,
    credentialMatched: Boolean(credential),
    eventId,
    persisted: true,
    received: true
  })
}