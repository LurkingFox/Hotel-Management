import { NextRequest, NextResponse } from 'next/server'

import { isFrontDeskRole } from '@/lib/staff-roles'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type HandoffStatus = Database['public']['Enums']['operational_handoff_status']
type HandoffItemType = Database['public']['Enums']['operational_handoff_item_type']
type HandoffPriority = Database['public']['Enums']['operational_handoff_priority']
type StaffRow = Database['public']['Tables']['staff']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']

type CreateHandoffBody = {
  items?: Array<{
    bookingId?: string
    detail?: string
    dueAt?: string | null
    itemType?: HandoffItemType
    ownerRole?: string
    priority?: HandoffPriority
    roomId?: string
    serviceRequestId?: string
    title?: string
  }>
  summary?: string
}

type UpdateHandoffBody = {
  action?: 'acknowledge_handoff' | 'close_handoff' | 'resolve_item' | 'reopen_item'
  handoffId?: string
  itemId?: string
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

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected handoff error.'
  return NextResponse.json({ error: message }, { status: 500 })
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

async function resolveLinkedStaff() {
  const { supabase, user, session } = await createAuthenticatedServerSupabaseClient()

  if (!session || !user) {
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }
  }

  const metadataStaffId = typeof user.user_metadata?.staff_id === 'string' ? user.user_metadata.staff_id : null
  let staff: StaffRow | null = null

  const { data: linkedStaff, error: linkedStaffError } = await supabase.from('staff').select('*').eq('auth_user_id', user.id).maybeSingle()

  if (linkedStaffError) {
    return { error: NextResponse.json({ error: linkedStaffError.message }, { status: 500 }) }
  }

  staff = linkedStaff

  if (!staff && metadataStaffId) {
    const { data: metadataStaff, error: metadataStaffError } = await supabase.from('staff').select('*').eq('id', metadataStaffId).maybeSingle()

    if (metadataStaffError) {
      return { error: NextResponse.json({ error: metadataStaffError.message }, { status: 500 }) }
    }

    staff = metadataStaff
  }

  return { staff, supabase, user }
}

async function loadOpenShift(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  staffId: string
) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('staff_id', staffId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as ShiftRow | null
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, session, user } = await createAuthenticatedServerSupabaseClient()

    if (!session || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    if (!isFrontDeskRole(typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null)) {
      return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
    }

    const status = request.nextUrl.searchParams.get('status') as HandoffStatus | null
    let query = supabase
      .from('operational_handoffs')
      .select('*, operational_handoff_items(*, bookings(id, guest_name, status), rooms(id, number, type, status), service_requests(id, title, status, priority))')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
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
    const context = await resolveLinkedStaff()

    if ('error' in context) {
      return context.error
    }

    const role = typeof context.user.user_metadata?.role === 'string' ? context.user.user_metadata.role : null

    if (!isFrontDeskRole(role)) {
      return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
    }

    const actor = getActorName(context.user.user_metadata?.name, context.user.email)
    const body = (await request.json()) as CreateHandoffBody
    const items = (body.items ?? []).filter((item) => item.title?.trim() && item.itemType)

    if (!body.summary?.trim() && items.length === 0) {
      return NextResponse.json({ error: 'Add a handoff summary or at least one carryover item.' }, { status: 400 })
    }

    const openShift = context.staff ? await loadOpenShift(context.supabase, context.staff.id) : null

    const { data: handoff, error: handoffError } = await context.supabase
      .from('operational_handoffs')
      .insert({
        created_by_name: actor,
        created_by_role: role,
        created_by_staff_id: context.staff?.id ?? null,
        shift_id: openShift?.id ?? null,
        summary: body.summary?.trim() || null,
        status: 'open'
      })
      .select('*')
      .single()

    if (handoffError) {
      return NextResponse.json({ error: handoffError.message }, { status: 500 })
    }

    if (items.length > 0) {
      const { error: itemsError } = await context.supabase.from('operational_handoff_items').insert(
        items.map((item) => ({
          booking_id: item.bookingId || null,
          detail: item.detail?.trim() || null,
          due_at: item.dueAt || null,
          handoff_id: handoff.id,
          item_type: item.itemType as HandoffItemType,
          owner_role: item.ownerRole?.trim() || null,
          priority: item.priority ?? 'normal',
          room_id: item.roomId || null,
          service_request_id: item.serviceRequestId || null,
          title: item.title!.trim()
        }))
      )

      if (itemsError) {
        return NextResponse.json({ error: itemsError.message }, { status: 500 })
      }
    }

    await createNotification(context.supabase, {
      type: 'shift_handoff_created',
      message: `${actor} created a shift handoff with ${items.length} carryover item${items.length === 1 ? '' : 's'}.`,
      triggered_by: actor,
      booking_id: items[0]?.bookingId ?? null
    })

    return NextResponse.json({ handoffId: handoff.id, success: true }, { status: 201 })
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await resolveLinkedStaff()

    if ('error' in context) {
      return context.error
    }

    const role = typeof context.user.user_metadata?.role === 'string' ? context.user.user_metadata.role : null

    if (!isFrontDeskRole(role)) {
      return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
    }

    const actor = getActorName(context.user.user_metadata?.name, context.user.email)
    const body = (await request.json()) as UpdateHandoffBody

    if (!body.action) {
      return NextResponse.json({ error: 'Handoff action is required.' }, { status: 400 })
    }

    if (body.action === 'resolve_item' || body.action === 'reopen_item') {
      if (!body.itemId) {
        return NextResponse.json({ error: 'Item id is required.' }, { status: 400 })
      }

      const { error } = await context.supabase
        .from('operational_handoff_items')
        .update({
          resolved: body.action === 'resolve_item',
          resolved_at: body.action === 'resolve_item' ? new Date().toISOString() : null,
          resolved_by: body.action === 'resolve_item' ? actor : null
        })
        .eq('id', body.itemId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (!body.handoffId) {
      return NextResponse.json({ error: 'Handoff id is required.' }, { status: 400 })
    }

    const { data: handoff, error: handoffError } = await context.supabase
      .from('operational_handoffs')
      .select('*')
      .eq('id', body.handoffId)
      .single()

    if (handoffError || !handoff) {
      return NextResponse.json({ error: handoffError?.message ?? 'Handoff not found.' }, { status: 404 })
    }

    if (body.action === 'acknowledge_handoff') {
      const { error } = await context.supabase
        .from('operational_handoffs')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: actor,
          acknowledged_by_staff_id: context.staff?.id ?? null,
          status: 'acknowledged'
        })
        .eq('id', handoff.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    const { count: unresolvedCount, error: unresolvedError } = await context.supabase
      .from('operational_handoff_items')
      .select('id', { count: 'exact', head: true })
      .eq('handoff_id', handoff.id)
      .eq('resolved', false)

    if (unresolvedError) {
      return NextResponse.json({ error: unresolvedError.message }, { status: 500 })
    }

    if ((unresolvedCount ?? 0) > 0) {
      return NextResponse.json({ error: 'Resolve all handoff items before closing the handoff.' }, { status: 400 })
    }

    const { error } = await context.supabase
      .from('operational_handoffs')
      .update({ closed_at: new Date().toISOString(), status: 'closed' })
      .eq('id', handoff.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return getErrorResponse(error)
  }
}