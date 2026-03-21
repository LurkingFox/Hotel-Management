import { NextRequest, NextResponse } from 'next/server'

import { createBookingAccessService } from '@/lib/access-provider/booking-service'
import type { BookingAccessOperationResult } from '@/lib/access-provider/types'
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

type BookingMutationResponse = {
  access?: {
    code: string | null
    label: string
    note: string | null
    provider: string
  }
  booking?: Database['public']['Tables']['bookings']['Row'] & {
    rooms: Pick<Database['public']['Tables']['rooms']['Row'], 'number' | 'rate_ghs' | 'type'> | null
  }
  message?: string
  provider?: string
  success?: boolean
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

function getErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected server error.'
  return NextResponse.json({ error: message }, { status: 500 })
}

function getCredentialIssuedMessage(guestName: string, access: BookingAccessOperationResult) {
  if (access.provider === 'seam') {
    return access.credentialCode
      ? `Access code ${access.credentialCode} issued for ${guestName}.`
      : `Access code issued for ${guestName}.`
  }

  return `Keycard issued for ${guestName}.`
}

function getCredentialExtendedMessage(guestName: string, access: BookingAccessOperationResult) {
  return access.provider === 'seam' ? `Access code updated for ${guestName}.` : `Stay extended for ${guestName}.`
}

function getCredentialRevokedMessage(guestName: string, access: BookingAccessOperationResult) {
  return access.provider === 'seam' ? `Access code revoked for ${guestName}.` : `Keycards revoked for ${guestName}.`
}

function buildAccessPayload(access: BookingAccessOperationResult) {
  return {
    code: access.credentialCode,
    label: access.credentialLabel,
    note: access.note,
    provider: access.provider
  }
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
    const accessService = createBookingAccessService(supabase)

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

    if (bookingStatus === 'active' && accessService.provider === 'local_rfid' && !body.cardUid?.trim()) {
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

      const accessOperation = await accessService.issueBookingAccess({
        bookingId: booking.id,
        issuedBy: actor,
        issuedTo: body.guestName,
        manualCredential: body.cardUid ?? null,
        roomId: body.roomId,
        validFrom: body.checkIn,
        validUntil: body.checkOutExpected
      })

      await createNotification(supabase, {
        type: 'walk_in_checked_in',
        message: `Walk-in check-in completed for ${body.guestName}.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_issued',
        message: getCredentialIssuedMessage(body.guestName, accessOperation),
        triggered_by: actor,
        booking_id: booking.id,
        keycard_id: accessOperation.localRecordId
      })

      const { data: persistedBooking, error: persistedBookingError } = await getBookingWithRoom(supabase, booking.id)

      if (persistedBookingError || !persistedBooking) {
        return NextResponse.json(
          { error: persistedBookingError?.message ?? 'Booking was created but could not be reloaded.' },
          { status: 500 }
        )
      }

      const payload: BookingMutationResponse = {
        access: buildAccessPayload(accessOperation),
        booking: persistedBooking,
        message: getCredentialIssuedMessage(body.guestName, accessOperation)
      }

      return NextResponse.json(payload, { status: 201 })
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

    return NextResponse.json({ booking: persistedBooking } satisfies BookingMutationResponse, { status: 201 })
  } catch (error) {
    return getErrorResponse(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase, user } = await createAuthenticatedServerSupabaseClient()
    const accessService = createBookingAccessService(supabase)

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
      if (accessService.provider === 'local_rfid' && !body.cardUid?.trim()) {
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

      const accessOperation = await accessService.issueBookingAccess({
        bookingId: booking.id,
        issuedBy: actor,
        issuedTo: body.issuedTo ?? booking.guest_name,
        manualCredential: body.cardUid ?? null,
        roomId: booking.room_id,
        validFrom: booking.check_in,
        validUntil: booking.check_out_expected
      })

      await createNotification(supabase, {
        type: 'booking_checked_in',
        message: `${booking.guest_name} checked in.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_issued',
        message: getCredentialIssuedMessage(booking.guest_name, accessOperation),
        triggered_by: actor,
        booking_id: booking.id,
        keycard_id: accessOperation.localRecordId
      })

      return NextResponse.json({
        access: buildAccessPayload(accessOperation),
        message: getCredentialIssuedMessage(booking.guest_name, accessOperation),
        provider: accessOperation.provider,
        success: true
      } satisfies BookingMutationResponse)
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

      const accessOperation = await accessService.revokeBookingAccess({ bookingId: booking.id })

      await createNotification(supabase, {
        type: 'booking_checked_out',
        message: `${booking.guest_name} checked out.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_revoked',
        message: getCredentialRevokedMessage(booking.guest_name, accessOperation),
        triggered_by: actor,
        booking_id: booking.id
      })

      return NextResponse.json({
        access: buildAccessPayload(accessOperation),
        message: getCredentialRevokedMessage(booking.guest_name, accessOperation),
        provider: accessService.provider,
        success: true
      } satisfies BookingMutationResponse)
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

      const accessOperation = await accessService.extendBookingAccess({
        bookingId: booking.id,
        validUntil: body.newCheckOutExpected
      })

      await createNotification(supabase, {
        type: 'booking_extended',
        message: `Stay extended for ${booking.guest_name}.`,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'keycard_extended',
        message: getCredentialExtendedMessage(booking.guest_name, accessOperation),
        triggered_by: actor,
        booking_id: booking.id
      })

      return NextResponse.json({
        access: buildAccessPayload(accessOperation),
        message: getCredentialExtendedMessage(booking.guest_name, accessOperation),
        provider: accessService.provider,
        success: true
      } satisfies BookingMutationResponse)
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