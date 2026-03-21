import { NextResponse } from 'next/server'
import { Webhook } from 'svix'

import { buildSeamWebhookMessage, getSeamConfig, getSeamWebhookEventId, getSeamWebhookEventType } from '@/lib/access-provider/seam'
import { createAdminSupabaseClient, hasAdminSupabaseCredentials } from '@/lib/supabase/admin'

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
  const { error } = await supabase.from('notifications').insert({
    message: buildSeamWebhookMessage(verifiedPayload),
    triggered_by: 'seam_webhook',
    type: `seam_${eventType.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ eventId: getSeamWebhookEventId(verifiedPayload), persisted: true, received: true })
}