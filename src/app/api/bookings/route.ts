import { NextRequest, NextResponse } from 'next/server'

import { createAuthenticatedServerSupabaseClient, type AuthenticatedUser } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type BookingStatus = Database['public']['Enums']['booking_status']
type PayMethod = Database['public']['Enums']['pay_method']

type PaymentInput = {
  amountGhs: number
  method: PayMethod
  reference?: string | null
}

type CreateBookingBody = {
  roomId?: string
  guestName?: string
  guestPhone?: string
  checkIn?: string
  checkOutExpected?: string
  totalGhs?: number
  status?: BookingStatus
  cardUid?: string
  payment?: PaymentInput
}

type UpdateBookingBody = {
  bookingId?: string
  action?: 'check_in' | 'checkout' | 'extend' | 'cancel'
  cardUid?: string
  issuedTo?: string
  settlement?: PaymentInput
  newCheckOutExpected?: string
  totalGhs?: number
  cancelNote?: string
}

function getActorName(user: AuthenticatedUser) {
  const metadataName = user?.user_metadata?.name
  if (typeof metadataName === 'string' && metadataName.length > 0) {
    return metadataName
  }

  return user?.email ?? 'system'
}

function getNightCount(checkIn: string, checkOut: string): number {
  const difference = Date.parse(checkOut) - Date.parse(checkIn)
  return Math.max(1, Math.ceil(difference / 86400000))
}

function requiresReference(method: PayMethod): boolean {
  return method === 'momo' || method === 'bank_transfer' || method === 'cheque'
}

function normalizeCardUid(value: string): string {
  return value.trim().toUpperCase()
}

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

async function getBookingWithRoom(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  bookingId: string
) {
  return supabase.from('bookings').select('*, rooms(number, type, rate_ghs)').eq('id', bookingId).single()
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
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const status = request.nextUrl.searchParams.get('status')
    let query = supabase
      .from('bookings')
      .select('*, rooms(number, type, rate_ghs)')
      .order('check_in', { ascending: false })

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
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const actor = getActorName(user)
    const body = (await request.json()) as CreateBookingBody

    if (!body.roomId || !body.guestName || !body.checkIn || !body.checkOutExpected || typeof body.totalGhs !== 'number') {
      return NextResponse.json({ error: 'Room, guest, dates, and total are required.' }, { status: 400 })
    }

    const nights = getNightCount(body.checkIn, body.checkOutExpected)
    const bookingStatus = body.status ?? 'reserved'
    const normalizedCardUid = body.cardUid ? normalizeCardUid(body.cardUid) : undefined

    if (bookingStatus === 'active' && !normalizedCardUid) {
      return NextResponse.json({ error: 'cardUid is required for a walk-in check-in.' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        room_id: body.roomId,
        guest_name: body.guestName,
        guest_phone: body.guestPhone ?? null,
        check_in: body.checkIn,
        check_out_expected: body.checkOutExpected,
        nights,
        total_ghs: body.totalGhs,
        paid_ghs: 0,
        status: bookingStatus
      })
      .select('*')
      .single()

    if (bookingError) {
      return NextResponse.json({ error: bookingError.message }, { status: 500 })
    }

    if (body.payment && body.payment.amountGhs > 0) {
      if (requiresReference(body.payment.method) && !body.payment.reference?.trim()) {
        return NextResponse.json({ error: 'Reference is required for this payment method.' }, { status: 400 })
      }

      const { error: paymentError } = await supabase.from('payments').insert({
        booking_id: booking.id,
        amount_ghs: body.payment.amountGhs,
        method: body.payment.method,
        reference: body.payment.reference ?? null,
        received_by: actor
      })

      if (paymentError) {
        return NextResponse.json({ error: paymentError.message }, { status: 500 })
      }

      const { error: bookingPaymentError } = await supabase
        .from('bookings')
        .update({ paid_ghs: body.payment.amountGhs })
        .eq('id', booking.id)

      if (bookingPaymentError) {
        return NextResponse.json({ error: bookingPaymentError.message }, { status: 500 })
      }
    }

    if (bookingStatus === 'active') {
      const { error: roomUpdateError } = await supabase
        .from('rooms')
        .update({ status: 'occupied' })
        .eq('id', body.roomId)

      if (roomUpdateError) {
        return NextResponse.json({ error: roomUpdateError.message }, { status: 500 })
      }

      const { data: keycard, error: keycardError } = await supabase
        .from('keycards')
        .insert({
          booking_id: booking.id,
          card_uid: normalizedCardUid!,
          room_id: body.roomId,
          issued_to: body.guestName,
          issued_by: actor,
          valid_from: body.checkIn,
          valid_until: body.checkOutExpected,
          status: 'active'
        })
        .select('*')
        .single()

      if (keycardError) {
        return NextResponse.json({ error: keycardError.message }, { status: 500 })
      }

      await createNotification(supabase, {
        type: 'walk_in_checked_in',
        message: `Walk-in check-in completed for ${body.guestName}.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_issued',
        message: `Keycard issued for ${body.guestName}.`,
        triggered_by: actor,
        booking_id: booking.id,
        keycard_id: keycard.id
      })
    }

    if (bookingStatus === 'reserved') {
      const { error: roomUpdateError } = await supabase
        .from('rooms')
        .update({ status: 'reserved' })
        .eq('id', body.roomId)

      if (roomUpdateError) {
        return NextResponse.json({ error: roomUpdateError.message }, { status: 500 })
      }

      await createNotification(supabase, {
        type: 'reservation_created',
        message: `Reservation created for ${body.guestName}.`,
        triggered_by: actor,
        booking_id: booking.id
      })
    }

    const { data: persistedBooking, error: persistedBookingError } = await getBookingWithRoom(supabase, booking.id)

    if (persistedBookingError || !persistedBooking) {
      return NextResponse.json(
        { error: persistedBookingError?.message ?? 'Booking was created but could not be reloaded.' },
        { status: 500 }
      )
    }

    return NextResponse.json(persistedBooking, { status: 201 })
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
    }

    const actor = getActorName(user)
    const body = (await request.json()) as UpdateBookingBody

    if (!body.bookingId || !body.action) {
      return NextResponse.json({ error: 'Booking id and action are required.' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', body.bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: bookingError?.message ?? 'Booking not found.' }, { status: 404 })
    }

    if (body.action === 'check_in') {
      const normalizedCardUid = body.cardUid ? normalizeCardUid(body.cardUid) : undefined

      if (!normalizedCardUid) {
        return NextResponse.json({ error: 'cardUid is required to check in.' }, { status: 400 })
      }

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({ status: 'active' })
        .eq('id', booking.id)

      if (bookingUpdateError) {
        return NextResponse.json({ error: bookingUpdateError.message }, { status: 500 })
      }

      if (booking.room_id) {
        const { error: roomError } = await supabase
          .from('rooms')
          .update({ status: 'occupied' })
          .eq('id', booking.room_id)

        if (roomError) {
          return NextResponse.json({ error: roomError.message }, { status: 500 })
        }
      }

      const { data: keycard, error: keycardError } = await supabase
        .from('keycards')
        .insert({
          booking_id: booking.id,
          card_uid: normalizedCardUid,
          room_id: booking.room_id,
          issued_to: body.issuedTo ?? booking.guest_name,
          issued_by: actor,
          valid_from: booking.check_in,
          valid_until: booking.check_out_expected,
          status: 'active'
        })
        .select('*')
        .single()

      if (keycardError) {
        return NextResponse.json({ error: keycardError.message }, { status: 500 })
      }

      await createNotification(supabase, {
        type: 'booking_checked_in',
        message: `${booking.guest_name} checked in.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_issued',
        message: `Keycard issued for ${booking.guest_name}.`,
        triggered_by: actor,
        booking_id: booking.id,
        keycard_id: keycard.id
      })

      return NextResponse.json({ success: true })
    }

    if (body.action === 'checkout') {
      if (body.settlement && body.settlement.amountGhs > 0) {
        if (requiresReference(body.settlement.method) && !body.settlement.reference?.trim()) {
          return NextResponse.json({ error: 'Reference is required for this payment method.' }, { status: 400 })
        }

        const newPaidTotal = booking.paid_ghs + body.settlement.amountGhs
        const { error: paymentError } = await supabase.from('payments').insert({
          booking_id: booking.id,
          amount_ghs: body.settlement.amountGhs,
          method: body.settlement.method,
          reference: body.settlement.reference ?? null,
          received_by: actor
        })

        if (paymentError) {
          return NextResponse.json({ error: paymentError.message }, { status: 500 })
        }

        const { error: paymentUpdateError } = await supabase
          .from('bookings')
          .update({ paid_ghs: newPaidTotal })
          .eq('id', booking.id)

        if (paymentUpdateError) {
          return NextResponse.json({ error: paymentUpdateError.message }, { status: 500 })
        }
      }

      const outstandingBalance = booking.total_ghs - (booking.paid_ghs + (body.settlement?.amountGhs ?? 0))

      if (outstandingBalance > 0) {
        return NextResponse.json({ error: 'Outstanding balance must be settled or intentionally left open before checkout.' }, { status: 400 })
      }

      const today = new Date().toISOString().split('T')[0]

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({ status: 'checked_out', check_out_actual: today })
        .eq('id', booking.id)

      if (bookingUpdateError) {
        return NextResponse.json({ error: bookingUpdateError.message }, { status: 500 })
      }

      if (booking.room_id) {
        const { error: roomError } = await supabase
          .from('rooms')
          .update({ status: 'cleaning' })
          .eq('id', booking.room_id)

        if (roomError) {
          return NextResponse.json({ error: roomError.message }, { status: 500 })
        }
      }

      const { error: revokeError } = await supabase
        .from('keycards')
        .update({ status: 'revoked' })
        .eq('booking_id', booking.id)

      if (revokeError) {
        return NextResponse.json({ error: revokeError.message }, { status: 500 })
      }

      await createNotification(supabase, {
        type: 'booking_checked_out',
        message: `${booking.guest_name} checked out.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_revoked',
        message: `Keycards revoked for ${booking.guest_name}.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      return NextResponse.json({ success: true })
    }

    if (body.action === 'extend') {
      if (!body.newCheckOutExpected || typeof body.totalGhs !== 'number') {
        return NextResponse.json({ error: 'New checkout date and total are required to extend a stay.' }, { status: 400 })
      }

      const nights = getNightCount(booking.check_in, body.newCheckOutExpected)

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({
          check_out_expected: body.newCheckOutExpected,
          nights,
          total_ghs: body.totalGhs,
          status: 'active'
        })
        .eq('id', booking.id)

      if (bookingUpdateError) {
        return NextResponse.json({ error: bookingUpdateError.message }, { status: 500 })
      }

      const { error: keycardError } = await supabase
        .from('keycards')
        .update({ valid_until: body.newCheckOutExpected })
        .eq('booking_id', booking.id)

      if (keycardError) {
        return NextResponse.json({ error: keycardError.message }, { status: 500 })
      }

      await createNotification(supabase, {
        type: 'booking_extended',
        message: `Stay extended for ${booking.guest_name}.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_extended',
        message: `Stay extended for ${booking.guest_name}.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      return NextResponse.json({ success: true })
    }

    const { error: cancelError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancel_note: body.cancelNote ?? 'Cancelled from API.' })
      .eq('id', booking.id)

    if (cancelError) {
      return NextResponse.json({ error: cancelError.message }, { status: 500 })
    }

    if (booking.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status: 'vacant' })
        .eq('id', booking.room_id)

      if (roomError) {
        return NextResponse.json({ error: roomError.message }, { status: 500 })
      }
    }

    await createNotification(supabase, {
      type: 'booking_cancelled',
      message: `Reservation cancelled for ${booking.guest_name}.`,
      triggered_by: actor,
      booking_id: booking.id
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return getErrorResponse(error)
  }
}