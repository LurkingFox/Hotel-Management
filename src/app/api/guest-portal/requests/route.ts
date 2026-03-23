import { NextRequest, NextResponse } from 'next/server'

import { createAdminSupabaseClient, hasAdminSupabaseCredentials } from '@/lib/supabase/admin'
import { loadGuestPortalContext } from '@/lib/guest-portal'
import { verifyGuestPortalToken } from '@/lib/guest-portal-token'
import type { Database } from '@/lib/supabase/types'

type ServiceRequestCategory = Database['public']['Enums']['service_request_category']
type ServiceRequestPriority = Database['public']['Enums']['service_request_priority']

type GuestPortalCreateRequestBody = {
  accessCode?: string
  category?: ServiceRequestCategory
  description?: string
  priority?: ServiceRequestPriority
  proof?: string
  token?: string
  title?: string
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected guest portal error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest) {
  try {
    if (!hasAdminSupabaseCredentials()) {
      return NextResponse.json({ error: 'Guest portal request submission is not available right now.' }, { status: 503 })
    }

    const body = (await request.json()) as GuestPortalCreateRequestBody

    const tokenPayload = body.token?.trim() ? verifyGuestPortalToken(body.token.trim()) : null

    if (!tokenPayload && (!body.accessCode?.trim() || !body.proof?.trim())) {
      return NextResponse.json({ error: 'Guest verification details are required.' }, { status: 400 })
    }

    if (!body.title?.trim() || !body.category) {
      return NextResponse.json({ error: 'Request title and category are required.' }, { status: 400 })
    }

    if (body.token?.trim() && !tokenPayload) {
      return NextResponse.json({ error: 'This guest portal link is invalid or has expired.' }, { status: 403 })
    }

    const context = await loadGuestPortalContext(
      tokenPayload?.code ?? body.accessCode ?? '',
      body.proof ?? '',
      tokenPayload
        ? {
            bookingId: tokenPayload.bookingId,
            bypassProof: true
          }
        : undefined
    )

    if (!context.booking || !context.credential) {
      return NextResponse.json({ error: context.error ?? 'Guest verification failed.' }, { status: 403 })
    }

    const supabase = createAdminSupabaseClient()
    const actor = context.booking.guest_name

    const { data: createdRequest, error: requestError } = await supabase
      .from('service_requests')
      .insert({
        booking_id: context.booking.id,
        category: body.category,
        description: body.description?.trim() || null,
        guest_name: context.booking.guest_name,
        priority: body.priority ?? 'normal',
        requested_by: actor,
        requested_by_role: 'guest',
        room_id: context.booking.room_id,
        source: 'guest_portal',
        status: 'new',
        title: body.title.trim()
      })
      .select('*')
      .single()

    if (requestError || !createdRequest) {
      return NextResponse.json({ error: requestError?.message ?? 'Request could not be created.' }, { status: 500 })
    }

    const { error: eventError } = await supabase.from('service_request_events').insert({
      actor_name: actor,
      actor_role: 'guest',
      event_type: 'created',
      message: `Guest request created: ${createdRequest.title}`,
      metadata: {
        category: createdRequest.category,
        priority: createdRequest.priority,
        source: createdRequest.source
      },
      service_request_id: createdRequest.id
    })

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      booking_id: context.booking.id,
      message: `${createdRequest.category.replaceAll('_', ' ')} request created from the guest portal: ${createdRequest.title}.`,
      triggered_by: actor,
      type: 'request_created'
    })

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return getErrorResponse(error)
  }
}