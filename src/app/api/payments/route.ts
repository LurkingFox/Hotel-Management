import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient, type AuthenticatedUser } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type PayMethod = Database['public']['Enums']['pay_method']

function requiresReference(method: PayMethod): boolean {
  return method === 'momo' || method === 'bank_transfer' || method === 'cheque'
}

function getActorName(user: AuthenticatedUser) {
  const metadataName = user?.user_metadata?.name
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName
  }

  return user?.email ?? 'system'
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (user?.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('payments')
      .select('*, bookings(guest_name, room_id)')
      .order('paid_at', { ascending: false })

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
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const body = (await request.json()) as {
      bookingId?: string
      amountGhs?: number
      method?: PayMethod
      reference?: string | null
    }

    if (!body.bookingId || typeof body.amountGhs !== 'number' || !body.method) {
      return NextResponse.json({ error: 'Booking, amount, and method are required.' }, { status: 400 })
    }

    if (requiresReference(body.method) && !body.reference?.trim()) {
      return NextResponse.json({ error: 'Reference is required for this payment method.' }, { status: 400 })
    }

    const actor = getActorName(user)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, paid_ghs')
      .eq('id', body.bookingId)
      .single()

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('payments')
      .insert({
        booking_id: body.bookingId,
        amount_ghs: body.amountGhs,
        method: body.method,
        reference: body.reference ?? null,
        received_by: actor
      })
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({ paid_ghs: booking.paid_ghs + body.amountGhs })
      .eq('id', body.bookingId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    return getErrorResponse(error)
  }
}