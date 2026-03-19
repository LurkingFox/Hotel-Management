import { NextRequest, NextResponse } from 'next/server'

import { isFrontDeskRole } from '@/lib/staff-roles'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type ChargeType = Database['public']['Enums']['charge_type']
type PayMethod = Database['public']['Enums']['pay_method']

function getActorName(name: unknown, email: unknown) {
  if (typeof name === 'string' && name.trim().length > 0) {
    return name
  }

  if (typeof email === 'string' && email.trim().length > 0) {
    return email
  }

  return 'system'
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, session } = await createAuthenticatedServerSupabaseClient()

    if (!session) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const unresolvedOnly = request.nextUrl.searchParams.get('resolved') === 'false'
    let query = supabase
      .from('service_charges')
      .select('*, bookings(guest_name, room_id)')
      .order('created_at', { ascending: false })

    if (unresolvedOnly) {
      query = query.eq('resolved', false)
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

    if (!isFrontDeskRole(typeof user?.user_metadata?.role === 'string' ? user.user_metadata.role : null)) {
      return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
    }

    const actor = getActorName(user?.user_metadata?.name, user?.email)

    const body = (await request.json()) as {
      bookingId?: string
      type?: ChargeType
      amountGhs?: number
      description?: string
    }

    if (!body.bookingId || !body.type || typeof body.amountGhs !== 'number') {
      return NextResponse.json({ error: 'Booking, type, and amount are required.' }, { status: 400 })
    }

    if (body.amountGhs <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than zero.' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('id', body.bookingId)
      .single()

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }

    if (!booking || booking.status !== 'active') {
      return NextResponse.json({ error: 'Service charges can only be added to active stays.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('service_charges')
      .insert({
        booking_id: body.bookingId,
        type: body.type,
        amount_ghs: body.amountGhs,
        description: body.description?.trim() ? body.description.trim() : null,
        requested_by: actor,
        resolved: false
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      type: 'service_charge_added',
      message: `${body.type.replaceAll('_', ' ')} charge of GHS ${body.amountGhs.toLocaleString('en-GH')} added.`,
      triggered_by: actor,
      booking_id: body.bookingId
    })

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 })
    }

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

    const actor = getActorName(user?.user_metadata?.name, user?.email)
    const role = typeof user?.user_metadata?.role === 'string' ? user.user_metadata.role : null

    const body = (await request.json()) as {
      action?: 'resolve' | 'confirm_receipt'
      id?: string
      method?: PayMethod
      reference?: string | null
    }

    if (!body.id) {
      return NextResponse.json({ error: 'Service charge id is required.' }, { status: 400 })
    }

    const action = body.action ?? 'resolve'

    const { data: charge, error: chargeLookupError } = await supabase
      .from('service_charges')
      .select('*')
      .eq('id', body.id)
      .single()

    if (chargeLookupError) {
      return NextResponse.json({ error: chargeLookupError.message }, { status: 500 })
    }

    if (action === 'resolve') {
      if (!isFrontDeskRole(role)) {
        return NextResponse.json({ error: 'Reception or admin access is required.' }, { status: 403 })
      }

      if (charge.resolved) {
        return NextResponse.json({ error: 'This service charge is already marked as completed.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('service_charges')
        .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: actor })
        .eq('id', body.id)
        .select('*')
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const { error: notificationError } = await supabase.from('notifications').insert({
        type: 'service_charge_receipt_review_required',
        message: `Service completed for GHS ${data.amount_ghs.toLocaleString('en-GH')} and now awaits admin receipt confirmation.`,
        triggered_by: actor,
        booking_id: data.booking_id
      })

      if (notificationError) {
        return NextResponse.json({ error: notificationError.message }, { status: 500 })
      }

      return NextResponse.json(data)
    }

    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin approval is required to confirm receipt.' }, { status: 403 })
    }

    if (!charge.booking_id) {
      return NextResponse.json({ error: 'This service charge is not attached to a booking.' }, { status: 400 })
    }

    if (!body.method) {
      return NextResponse.json({ error: 'Payment method is required for receipt confirmation.' }, { status: 400 })
    }

    if (body.method !== 'cash' && !body.reference?.trim()) {
      return NextResponse.json({ error: 'Reference is required for non-cash receipt confirmation.' }, { status: 400 })
    }

    if (charge.payment_confirmed) {
      return NextResponse.json({ error: 'Receipt has already been confirmed for this service charge.' }, { status: 400 })
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        booking_id: charge.booking_id,
        amount_ghs: charge.amount_ghs,
        method: body.method,
        reference: body.reference?.trim() || null,
        received_by: actor
      })
      .select('*')
      .single()

    if (paymentError) {
      return NextResponse.json({ error: paymentError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('service_charges')
      .update({
        resolved: true,
        resolved_at: charge.resolved_at ?? new Date().toISOString(),
        resolved_by: charge.resolved_by ?? actor,
        payment_confirmed: true,
        payment_confirmed_at: new Date().toISOString(),
        payment_confirmed_by: actor,
        payment_id: payment.id
      })
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: notificationError } = await supabase.from('notifications').insert({
      type: 'service_charge_receipt_confirmed',
      message: `Receipt confirmed for GHS ${data.amount_ghs.toLocaleString('en-GH')} using ${body.method.replaceAll('_', ' ')}.`,
      triggered_by: actor,
      booking_id: data.booking_id
    })

    if (notificationError) {
      return NextResponse.json({ error: notificationError.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return getErrorResponse(error)
  }
}