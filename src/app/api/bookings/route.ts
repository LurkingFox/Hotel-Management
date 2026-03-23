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
  guestEmail?: string
  guestNationality?: string
  guestCity?: string
  guestDateOfBirth?: string
  guestPhone?: string
  checkIn?: string
  checkOutExpected?: string
  totalGhs?: number
  status?: BookingStatus
  payment?: PaymentInput
}

type UpdateBookingBody = {
  bookingId?: string
  action?: 'check_in' | 'checkout' | 'extend' | 'cancel' | 'confirm_extension' | 'flag_extension'
  confirmationNote?: string
  extensionAcknowledged?: boolean
  extensionAuditId?: string
  extensionAuthorization?: {
    reason?: string
  }
  extensionPayment?: PaymentInput
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

function getActorRole(user: AuthenticatedUser) {
  return typeof user?.user_metadata?.role === 'string' ? user.user_metadata.role : null
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
  return access.credentialCode
    ? `Access code ${access.credentialCode} issued for ${guestName}.`
    : `Access code issued for ${guestName}.`
}

function getCredentialExtendedMessage(guestName: string, access: BookingAccessOperationResult) {
  return `Access code updated for ${guestName}.`
}

function getCredentialRevokedMessage(guestName: string, access: BookingAccessOperationResult) {
  return `Access code revoked for ${guestName}.`
}

function formatCurrencyAmount(amount: number) {
  return `GHS ${amount.toFixed(2)}`
}

function buildBookingExtensionMessage(values: {
  actor: string
  addedAmount: number
  authorizationMode: 'admin_direct' | 'reception_confirmed'
  confirmationStatus: 'confirmed' | 'pending'
  guestName: string
  newCheckOutExpected: string
  paymentRecorded: number
  reason: string
  remainingBalance: number
}) {
  const amountLine = `Stay extended for ${values.guestName} to ${values.newCheckOutExpected} (+${formatCurrencyAmount(values.addedAmount)}).`
  const paymentLine = values.paymentRecorded > 0
    ? `${formatCurrencyAmount(values.paymentRecorded)} recorded now; remaining balance ${formatCurrencyAmount(values.remainingBalance)}.`
    : `No extension payment was recorded; remaining balance ${formatCurrencyAmount(values.remainingBalance)}.`

  if (values.authorizationMode === 'reception_confirmed' && values.confirmationStatus === 'pending') {
    return `${amountLine} Confirmed by reception staff ${values.actor}. Reason: ${values.reason}. Pending manager confirmation. ${paymentLine}`
  }

  return `${amountLine} Updated by ${values.actor}. ${paymentLine}`
}

function buildExtensionReviewMessage(values: {
  confirmationNote: string | null
  guestName: string
  manager: string
  newCheckOutExpected: string
  status: 'confirmed' | 'disputed'
}) {
  const statusLine = values.status === 'confirmed'
    ? `Manager ${values.manager} confirmed the stay extension for ${values.guestName} through ${values.newCheckOutExpected}.`
    : `Manager ${values.manager} marked the stay extension for ${values.guestName} as disputed.`

  return values.confirmationNote ? `${statusLine} Note: ${values.confirmationNote}` : statusLine
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

function normalizeGuestName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizePhone(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

async function upsertGuestProfile(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: {
    city?: string
    dateOfBirth?: string
    email?: string
    fullName: string
    nationality?: string
    phone?: string | null
    stayDate?: string
  }
) {
  const fullName = normalizeGuestName(payload.fullName)
  const phone = normalizePhone(payload.phone)

  let query = supabase.from('guest_profiles').select('*').eq('full_name', fullName)
  query = phone ? query.eq('phone', phone) : query.is('phone', null)

  const { data: existingProfiles, error: lookupError } = await query.order('updated_at', { ascending: false }).limit(1)

  if (lookupError) {
    throw new Error(lookupError.message)
  }

  const existing = existingProfiles?.[0] ?? null
  const updatePayload: Database['public']['Tables']['guest_profiles']['Update'] = {
    city: payload.city?.trim() || existing?.city || null,
    date_of_birth: payload.dateOfBirth?.trim() || existing?.date_of_birth || null,
    email: payload.email?.trim() || existing?.email || null,
    full_name: fullName,
    last_stayed_at:
      payload.stayDate && (!existing?.last_stayed_at || Date.parse(payload.stayDate) > Date.parse(existing.last_stayed_at))
        ? payload.stayDate
        : existing?.last_stayed_at || payload.stayDate || null,
    nationality: payload.nationality?.trim() || existing?.nationality || null,
    phone
  }

  if (existing) {
    const { data, error } = await supabase.from('guest_profiles').update(updatePayload).eq('id', existing.id).select('*').single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  const { data, error } = await supabase
    .from('guest_profiles')
    .insert({
      city: updatePayload.city,
      date_of_birth: updatePayload.date_of_birth,
      email: updatePayload.email,
      full_name: fullName,
      last_stayed_at: updatePayload.last_stayed_at,
      nationality: updatePayload.nationality,
      phone
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function createExtensionAudit(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['booking_extension_audits']['Insert']
) {
  const { data, error } = await supabase.from('booking_extension_audits').insert(payload).select('*').single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function createManagerApproval(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  payload: Database['public']['Tables']['manager_approvals']['Insert']
) {
  const { error } = await supabase.from('manager_approvals').insert(payload)

  if (error) {
    throw new Error(error.message)
  }
}

async function updateManagerApprovalByTarget(
  supabase: Awaited<ReturnType<typeof createAuthenticatedServerSupabaseClient>>['supabase'],
  values: Database['public']['Tables']['manager_approvals']['Update'],
  targetId: string,
  targetTable: string
) {
  const { error } = await supabase
    .from('manager_approvals')
    .update(values)
    .eq('target_id', targetId)
    .eq('target_table', targetTable)
    .eq('status', 'pending')

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
    const guestProfile = await upsertGuestProfile(supabase, {
      city: body.guestCity,
      dateOfBirth: body.guestDateOfBirth,
      email: body.guestEmail,
      fullName: body.guestName,
      nationality: body.guestNationality,
      phone: body.guestPhone,
      stayDate: body.checkOutExpected
    })

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        room_id: body.roomId,
        guest_name: body.guestName,
        guest_profile_id: guestProfile.id,
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
        manualCredential: null,
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
        type: 'access_credential_issued',
        message: getCredentialIssuedMessage(body.guestName, accessOperation),
        triggered_by: actor,
        booking_id: booking.id
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

    if (!body.action) {
      return NextResponse.json({ error: 'Booking action is required.' }, { status: 400 })
    }

    if (body.action === 'confirm_extension' || body.action === 'flag_extension') {
      if (getActorRole(user) !== 'admin') {
        return NextResponse.json({ error: 'Only admin users can review pending stay extensions.' }, { status: 403 })
      }

      if (!body.extensionAuditId) {
        return NextResponse.json({ error: 'Extension audit id is required for manager review.' }, { status: 400 })
      }

      const confirmationStatus = body.action === 'confirm_extension' ? 'confirmed' : 'disputed'
      const confirmationNote = body.confirmationNote?.trim() || null

      if (confirmationStatus === 'disputed' && !confirmationNote) {
        return NextResponse.json({ error: 'Add a discrepancy note before flagging the extension.' }, { status: 400 })
      }

      const { data: extensionAudit, error: extensionAuditError } = await supabase
        .from('booking_extension_audits')
        .select('*')
        .eq('id', body.extensionAuditId)
        .single()

      if (extensionAuditError || !extensionAudit) {
        return NextResponse.json({ error: extensionAuditError?.message ?? 'Extension audit not found.' }, { status: 404 })
      }

      if (extensionAudit.confirmation_status !== 'pending') {
        return NextResponse.json({ error: 'This stay extension has already been reviewed.' }, { status: 400 })
      }

      const reviewedAt = new Date().toISOString()
      const managerNote = confirmationNote ?? 'Manager confirmed the extension.'

      const { error: reviewError } = await supabase
        .from('booking_extension_audits')
        .update({
          confirmation_note: managerNote,
          confirmation_status: confirmationStatus,
          confirmed_at: reviewedAt,
          confirmed_by: actor
        })
        .eq('id', extensionAudit.id)

      if (reviewError) {
        return NextResponse.json({ error: reviewError.message }, { status: 500 })
      }

      const { data: reviewedBooking, error: reviewedBookingError } = await getBookingWithRoom(supabase, extensionAudit.booking_id)

      if (reviewedBookingError || !reviewedBooking) {
        return NextResponse.json(
          { error: reviewedBookingError?.message ?? 'Extension review saved but the booking could not be reloaded.' },
          { status: 500 }
        )
      }

      const reviewMessage = buildExtensionReviewMessage({
        confirmationNote: confirmationStatus === 'confirmed' ? confirmationNote : managerNote,
        guestName: reviewedBooking.guest_name,
        manager: actor,
        newCheckOutExpected: extensionAudit.new_check_out_expected,
        status: confirmationStatus
      })

      await createNotification(supabase, {
        type: confirmationStatus === 'confirmed' ? 'extension_confirmation_confirmed' : 'extension_confirmation_disputed',
        message: reviewMessage,
        triggered_by: actor,
        booking_id: reviewedBooking.id
      })

      await updateManagerApprovalByTarget(
        supabase,
        {
          review_note: managerNote,
          reviewed_at: reviewedAt,
          reviewed_by: actor,
          status: confirmationStatus === 'confirmed' ? 'approved' : 'rejected'
        },
        extensionAudit.id,
        'booking_extension_audits'
      )

      return NextResponse.json({ booking: reviewedBooking, message: reviewMessage, success: true } satisfies BookingMutationResponse)
    }

    if (!body.bookingId) {
      return NextResponse.json({ error: 'Booking id is required.' }, { status: 400 })
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
        manualCredential: null,
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
        type: 'access_credential_issued',
        message: getCredentialIssuedMessage(booking.guest_name, accessOperation),
        triggered_by: actor,
        booking_id: booking.id
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
        type: 'access_credential_revoked',
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
      if (!body.newCheckOutExpected) {
        return NextResponse.json({ error: 'New checkout date is required to extend a stay.' }, { status: 400 })
      }

      if (Date.parse(body.newCheckOutExpected) <= Date.parse(booking.check_out_expected)) {
        return NextResponse.json({ error: 'Extended checkout date must be after the current checkout date.' }, { status: 400 })
      }

      const { data: bookingWithRoom, error: bookingWithRoomError } = await getBookingWithRoom(supabase, booking.id)

      if (bookingWithRoomError || !bookingWithRoom) {
        return NextResponse.json({ error: bookingWithRoomError?.message ?? 'Booking could not be reloaded for extension.' }, { status: 500 })
      }

      const roomRate = bookingWithRoom.rooms?.rate_ghs ?? 0

      if (roomRate <= 0) {
        return NextResponse.json({ error: 'A room rate is required before extending this stay.' }, { status: 400 })
      }

      const nights = getNightCount(booking.check_in, body.newCheckOutExpected)
      const recalculatedTotal = roomRate * nights
      const addedAmount = recalculatedTotal - booking.total_ghs

      if (addedAmount <= 0) {
        return NextResponse.json({ error: 'This extension does not increase the stay total. Check the checkout date and room rate.' }, { status: 400 })
      }

      const actorRole = getActorRole(user)
      let authorizationMode: 'admin_direct' | 'reception_confirmed' = 'admin_direct'
      let authorizedBy: string | null = actor
      let authorizationReason = body.extensionAuthorization?.reason?.trim() || 'Stay extension processed.'
      let confirmationStatus: 'confirmed' | 'pending' = 'confirmed'
      let confirmedAt: string | null = new Date().toISOString()
      let confirmedBy: string | null = actor
      let confirmationNote: string | null = 'Confirmed directly at extension time.'

      if (actorRole === 'receptionist') {
        if (!body.extensionAcknowledged) {
          return NextResponse.json({ error: 'Reception must confirm the extension summary before the stay can be updated.' }, { status: 400 })
        }

        if (!body.extensionAuthorization?.reason?.trim()) {
          return NextResponse.json({ error: 'Reception must capture the reason for the stay extension.' }, { status: 400 })
        }

        authorizationMode = 'reception_confirmed'
        authorizedBy = null
        authorizationReason = body.extensionAuthorization.reason.trim()
        confirmationStatus = 'pending'
        confirmedAt = null
        confirmedBy = null
        confirmationNote = null
      }

      let paymentRecorded = 0

      if (body.extensionPayment && body.extensionPayment.amountGhs > 0) {
        if (requiresReference(body.extensionPayment.method) && !body.extensionPayment.reference?.trim()) {
          return NextResponse.json({ error: 'Reference is required for this payment method.' }, { status: 400 })
        }

        const maxReceivable = recalculatedTotal - booking.paid_ghs

        if (body.extensionPayment.amountGhs > maxReceivable) {
          return NextResponse.json({ error: 'Extension payment cannot exceed the booking balance after the extension.' }, { status: 400 })
        }

        const { error: paymentError } = await supabase.from('payments').insert({
          booking_id: booking.id,
          amount_ghs: body.extensionPayment.amountGhs,
          method: body.extensionPayment.method,
          reference: body.extensionPayment.reference ?? null,
          received_by: actor
        })

        if (paymentError) {
          return NextResponse.json({ error: paymentError.message }, { status: 500 })
        }

        paymentRecorded = body.extensionPayment.amountGhs
      }

      const newPaidTotal = booking.paid_ghs + paymentRecorded

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({
          check_out_expected: body.newCheckOutExpected,
          nights,
          paid_ghs: newPaidTotal,
          total_ghs: recalculatedTotal,
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

      const remainingBalance = recalculatedTotal - newPaidTotal

      const extensionAudit = await createExtensionAudit(supabase, {
        authorization_mode: authorizationMode,
        authorized_by: authorizedBy,
        booking_id: booking.id,
        confirmation_note: confirmationNote,
        confirmation_status: confirmationStatus,
        confirmed_at: confirmedAt,
        confirmed_by: confirmedBy,
        incremental_amount_ghs: addedAmount,
        new_check_out_expected: body.newCheckOutExpected,
        new_total_ghs: recalculatedTotal,
        payment_method: body.extensionPayment?.amountGhs ? body.extensionPayment.method : null,
        payment_recorded_ghs: paymentRecorded,
        payment_reference: body.extensionPayment?.amountGhs ? body.extensionPayment.reference ?? null : null,
        previous_check_out_expected: booking.check_out_expected,
        previous_total_ghs: booking.total_ghs,
        reason: authorizationReason,
        requested_by: actor,
        requester_role: actorRole ?? 'unknown'
      })

      if (confirmationStatus === 'pending') {
        await createManagerApproval(supabase, {
          approval_type: 'booking_extension',
          booking_id: booking.id,
          detail: `${booking.guest_name} extended to ${body.newCheckOutExpected}. Review the receptionist justification and payment record.`,
          metadata: {
            added_amount_ghs: addedAmount,
            extension_audit_id: extensionAudit.id,
            new_check_out_expected: body.newCheckOutExpected,
            payment_method: body.extensionPayment?.amountGhs ? body.extensionPayment.method : null,
            payment_recorded_ghs: paymentRecorded,
            previous_check_out_expected: booking.check_out_expected
          },
          requested_by: actor,
          requested_by_role: actorRole ?? 'unknown',
          target_id: extensionAudit.id,
          target_table: 'booking_extension_audits',
          title: `Stay extension review for ${booking.guest_name}`
        })
      }

      const extensionMessage = buildBookingExtensionMessage({
        actor,
        addedAmount,
        authorizationMode,
        confirmationStatus,
        guestName: booking.guest_name,
        newCheckOutExpected: body.newCheckOutExpected,
        paymentRecorded,
        reason: authorizationReason,
        remainingBalance
      })

      await createNotification(supabase, {
        type: confirmationStatus === 'pending' ? 'extension_confirmation_pending' : 'booking_extended',
        message: extensionMessage,
        triggered_by: actor,
        booking_id: booking.id
      })

      await createNotification(supabase, {
        type: 'access_credential_extended',
        message: getCredentialExtendedMessage(booking.guest_name, accessOperation),
        triggered_by: actor,
        booking_id: booking.id
      })

      return NextResponse.json({
        access: buildAccessPayload(accessOperation),
        message: extensionMessage,
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