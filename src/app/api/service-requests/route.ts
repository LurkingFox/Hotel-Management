import { NextRequest, NextResponse } from 'next/server'

import { isFrontDeskRole } from '@/lib/staff-roles'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type ServiceRequestCategory = Database['public']['Enums']['service_request_category']
type ServiceRequestPriority = Database['public']['Enums']['service_request_priority']
type ServiceRequestSource = Database['public']['Enums']['service_request_source']
type ServiceRequestStatus = Database['public']['Enums']['service_request_status']

type CreateServiceRequestBody = {
  bookingId?: string
  category?: ServiceRequestCategory
  description?: string
  dueAt?: string | null
  guestName?: string
  priority?: ServiceRequestPriority
  roomId?: string
  source?: ServiceRequestSource
  title?: string
}

type UpdateServiceRequestBody = {
  action?: 'acknowledge' | 'assign' | 'cancel' | 'complete' | 'set_due_at' | 'start'
  assignedStaffId?: string | null
  dueAt?: string | null
  id?: string
  resolutionNote?: string | null
}

function normalizeDueAt(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Due time must be a valid date and time.')
  }

  return parsed.toISOString()
}

function getActorName(name: unknown, email: unknown) {
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }

  if (typeof email === 'string' && email.trim().length > 0) {
    return email.trim()
  }

  return 'system'
}

function getActorRole(role: unknown) {
  return typeof role === 'string' ? role : null
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

async function createRequestEvent(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['service_request_events']['Insert']
) {
  const { error } = await supabase.from('service_request_events').insert(payload)

  if (error) {
    throw new Error(error.message)
  }
}

async function createNotification(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['notifications']['Insert']
) {
  const { error } = await supabase.from('notifications').insert(payload)

  if (error) {
    throw new Error(error.message)
  }
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, session } = await createAuthenticatedServerSupabaseClient()

    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const status = request.nextUrl.searchParams.get('status') as ServiceRequestStatus | null
    const priority = request.nextUrl.searchParams.get('priority') as ServiceRequestPriority | null
    const roomId = request.nextUrl.searchParams.get('roomId')
    const bookingId = request.nextUrl.searchParams.get('bookingId')

    let query = supabase
      .from('service_requests')
      .select('*, rooms(number, type, status), bookings(id, guest_name, status, check_in, check_out_expected), staff(id, name, role)')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (roomId) {
      query = query.eq('room_id', roomId)
    }

    if (bookingId) {
      query = query.eq('booking_id', bookingId)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, session, user } = await createAuthenticatedServerSupabaseClient()

    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const role = getActorRole(user?.user_metadata?.role)

    if (!isFrontDeskRole(role)) {
      return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
    }

    const actor = getActorName(user?.user_metadata?.name, user?.email)
    const body = (await request.json()) as CreateServiceRequestBody

    if (!body.title?.trim() || !body.category) {
      return NextResponse.json({ error: 'Title and category are required.' }, { status: 400 })
    }

    let dueAt: string | null = null

    try {
      dueAt = normalizeDueAt(body.dueAt)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Due time is invalid.' }, { status: 400 })
    }

    const insertPayload: Database['public']['Tables']['service_requests']['Insert'] = {
      booking_id: body.bookingId ?? null,
      category: body.category,
      description: body.description?.trim() ? body.description.trim() : null,
      due_at: dueAt,
      guest_name: body.guestName?.trim() ? body.guestName.trim() : null,
      priority: body.priority ?? 'normal',
      requested_by: actor,
      requested_by_role: role,
      room_id: body.roomId ?? null,
      source: body.source ?? 'reception',
      status: 'new',
      title: body.title.trim()
    }

    const { data, error } = await supabase.from('service_requests').insert(insertPayload).select('*').single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await createRequestEvent(supabase, {
      actor_name: actor,
      actor_role: role,
      event_type: 'created',
      message: `Service request created: ${data.title}`,
      metadata: {
        category: data.category,
        due_at: data.due_at,
        priority: data.priority,
        source: data.source
      },
      service_request_id: data.id
    })

    await createNotification(supabase, {
      booking_id: data.booking_id,
      message: `${data.category.replaceAll('_', ' ')} request created: ${data.title}.`,
      triggered_by: actor,
      type: 'request_created'
    })

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, session, user } = await createAuthenticatedServerSupabaseClient()

    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const role = getActorRole(user?.user_metadata?.role)

    if (!isFrontDeskRole(role)) {
      return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
    }

    const actor = getActorName(user?.user_metadata?.name, user?.email)
    const body = (await request.json()) as UpdateServiceRequestBody

    if (!body.id || !body.action) {
      return NextResponse.json({ error: 'Request id and action are required.' }, { status: 400 })
    }

    const { data: existing, error: lookupError } = await supabase
      .from('service_requests')
      .select('*')
      .eq('id', body.id)
      .single()

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 })
    }

    const updatePayload: Database['public']['Tables']['service_requests']['Update'] = {}
    let eventType = body.action
    let eventMessage = `Service request updated: ${existing.title}`
    let notificationType = 'request_updated'
    let notificationMessage = `${existing.title} was updated.`

    if (body.action === 'acknowledge') {
      updatePayload.acknowledged_at = new Date().toISOString()
      updatePayload.acknowledged_by = actor
      updatePayload.status = 'acknowledged'
      eventMessage = `Service request acknowledged: ${existing.title}`
      notificationType = 'request_acknowledged'
      notificationMessage = `${existing.title} was acknowledged.`
    }

    if (body.action === 'assign') {
      if (!body.assignedStaffId) {
        return NextResponse.json({ error: 'Assigned staff is required for assignment.' }, { status: 400 })
      }

      updatePayload.assigned_staff_id = body.assignedStaffId
      updatePayload.status = existing.status === 'in_progress' ? existing.status : 'assigned'
      eventMessage = existing.assigned_staff_id && existing.assigned_staff_id !== body.assignedStaffId ? `Service request reassigned: ${existing.title}` : `Service request assigned: ${existing.title}`
      notificationType = 'request_assigned'
      notificationMessage = existing.assigned_staff_id && existing.assigned_staff_id !== body.assignedStaffId ? `${existing.title} was reassigned.` : `${existing.title} was assigned.`
    }

    if (body.action === 'set_due_at') {
      let normalizedDueAt: string | null = null

      try {
        normalizedDueAt = normalizeDueAt(body.dueAt)
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Due time is invalid.' }, { status: 400 })
      }

      updatePayload.due_at = normalizedDueAt
      eventMessage = normalizedDueAt ? `Service request due time updated: ${existing.title}` : `Service request due time cleared: ${existing.title}`
      notificationType = 'request_updated'
      notificationMessage = normalizedDueAt ? `${existing.title} due time was updated.` : `${existing.title} due time was cleared.`
    }

    if (body.action === 'start') {
      if (!existing.assigned_staff_id) {
        return NextResponse.json({ error: 'Assign the request before starting work.' }, { status: 400 })
      }

      updatePayload.status = 'in_progress'
      eventMessage = `Work started on request: ${existing.title}`
      notificationType = 'request_started'
      notificationMessage = `${existing.title} is now in progress.`
    }

    if (body.action === 'complete') {
      updatePayload.completed_at = new Date().toISOString()
      updatePayload.completed_by = actor
      updatePayload.resolution_note = body.resolutionNote?.trim() ? body.resolutionNote.trim() : null
      updatePayload.status = 'completed'
      eventMessage = `Service request completed: ${existing.title}`
      notificationType = 'request_completed'
      notificationMessage = `${existing.title} was completed.`
    }

    if (body.action === 'cancel') {
      updatePayload.resolution_note = body.resolutionNote?.trim() ? body.resolutionNote.trim() : null
      updatePayload.status = 'cancelled'
      eventMessage = `Service request cancelled: ${existing.title}`
      notificationType = 'request_cancelled'
      notificationMessage = `${existing.title} was cancelled.`
    }

    const { data, error } = await supabase.from('service_requests').update(updatePayload).eq('id', body.id).select('*').single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await createRequestEvent(supabase, {
      actor_name: actor,
      actor_role: role,
      event_type: eventType,
      message: eventMessage,
      metadata: {
        assigned_staff_id: data.assigned_staff_id,
        due_at: data.due_at,
        status: data.status
      },
      service_request_id: data.id
    })

    await createNotification(supabase, {
      booking_id: data.booking_id,
      message: notificationMessage,
      triggered_by: actor,
      type: notificationType
    })

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}