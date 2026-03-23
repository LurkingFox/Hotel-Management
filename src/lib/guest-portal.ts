import { createAdminSupabaseClient, hasAdminSupabaseCredentials } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type GuestProfileRow = Database['public']['Tables']['guest_profiles']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ServiceRequestEventRow = Database['public']['Tables']['service_request_events']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']

export type GuestPortalServiceRequest = Pick<
  ServiceRequestRow,
  'category' | 'created_at' | 'description' | 'id' | 'priority' | 'resolution_note' | 'status' | 'title' | 'updated_at'
>

export type GuestPortalServiceRequestEvent = Pick<
  ServiceRequestEventRow,
  'actor_name' | 'actor_role' | 'created_at' | 'event_type' | 'id' | 'message' | 'service_request_id'
>

export type GuestPortalPayment = Pick<PaymentRow, 'amount_ghs' | 'id' | 'method' | 'paid_at' | 'reference'>

export type GuestPortalNotification = Pick<NotificationRow, 'created_at' | 'id' | 'message' | 'read' | 'triggered_by' | 'type'>

export type GuestPortalServiceCharge = Pick<
  ServiceChargeRow,
  'amount_ghs' | 'created_at' | 'description' | 'id' | 'payment_confirmed' | 'resolved' | 'resolved_at' | 'type'
>

export type GuestPortalBooking = Pick<
  BookingRow,
  'balance_ghs' | 'check_in' | 'check_out_expected' | 'guest_name' | 'guest_phone' | 'id' | 'paid_ghs' | 'room_id' | 'status' | 'total_ghs'
> & {
  guest_profiles:
    | Pick<GuestProfileRow, 'email' | 'full_name' | 'phone'>
    | Array<Pick<GuestProfileRow, 'email' | 'full_name' | 'phone'>>
    | null
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

export type GuestPortalCredential = Pick<AccessCredentialRow, 'credential_code' | 'id' | 'issued_to' | 'provider' | 'status' | 'valid_from' | 'valid_until'> & {
  bookings: GuestPortalBooking | Array<GuestPortalBooking> | null
}

type LoadPortalLookup = {
  bookingId?: string
  bypassProof?: boolean
}

export function getSingleParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }

  return value?.trim() ?? ''
}

export function pickSingle<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

export function normalizeAccessCode(value: string) {
  return value.trim().toUpperCase()
}

export function normalizeProof(value: string) {
  return value.trim().toLowerCase()
}

function normalizeName(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function getDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function getSurname(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''

  if (!trimmed) {
    return ''
  }

  const parts = trimmed.split(/\s+/)
  return parts[parts.length - 1]?.toLowerCase() ?? ''
}

export function isVerifiedGuestProof(booking: GuestPortalBooking, proof: string) {
  const normalizedProof = normalizeProof(proof)

  if (!normalizedProof) {
    return false
  }

  const guestProfile = pickSingle(booking.guest_profiles)
  const nameCandidates = [booking.guest_name, guestProfile?.full_name]
  const phoneCandidates = [booking.guest_phone, guestProfile?.phone]

  if (nameCandidates.some((candidate) => normalizeName(candidate) === normalizedProof)) {
    return true
  }

  if (nameCandidates.some((candidate) => getSurname(candidate) === normalizedProof)) {
    return true
  }

  const proofDigits = getDigits(normalizedProof)

  if (proofDigits.length >= 4 && phoneCandidates.some((candidate) => getDigits(candidate).endsWith(proofDigits))) {
    return true
  }

  return false
}

export function getOutstandingBalance(booking: GuestPortalBooking) {
  return Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs)
}

export async function loadGuestPortalContext(accessCode: string, proof: string, lookup?: LoadPortalLookup) {
  if (!hasAdminSupabaseCredentials()) {
    return {
      booking: null,
      credential: null,
      error: 'Guest portal lookup is not available until Supabase server credentials are configured.',
      notifications: [] as GuestPortalNotification[],
      payments: [] as GuestPortalPayment[],
      requestEvents: [] as GuestPortalServiceRequestEvent[],
      serviceCharges: [] as GuestPortalServiceCharge[],
      requests: [] as GuestPortalServiceRequest[]
    }
  }

  const supabase = createAdminSupabaseClient()
  const normalizedCode = normalizeAccessCode(accessCode)

  if (!normalizedCode) {
    return {
      booking: null,
      credential: null,
      error: null,
      notifications: [] as GuestPortalNotification[],
      payments: [] as GuestPortalPayment[],
      requestEvents: [] as GuestPortalServiceRequestEvent[],
      serviceCharges: [] as GuestPortalServiceCharge[],
      requests: [] as GuestPortalServiceRequest[]
    }
  }

  if (!lookup?.bypassProof && !proof.trim()) {
    return {
      booking: null,
      credential: null,
      error: 'Enter your full guest name, last name, or the last 4 digits of your booking phone number to open the portal.',
      notifications: [] as GuestPortalNotification[],
      payments: [] as GuestPortalPayment[],
      requestEvents: [] as GuestPortalServiceRequestEvent[],
      serviceCharges: [] as GuestPortalServiceCharge[],
      requests: [] as GuestPortalServiceRequest[]
    }
  }

  const { data, error } = await supabase
    .from('booking_access_credentials')
    .select(
      'id, credential_code, issued_to, provider, status, valid_from, valid_until, bookings(id, guest_name, guest_phone, room_id, check_in, check_out_expected, status, total_ghs, paid_ghs, balance_ghs, rooms(number, type), guest_profiles(full_name, phone, email))'
    )
    .eq('credential_code', normalizedCode)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    return {
      booking: null,
      credential: null,
      error: 'Guest portal lookup failed. Please try again.',
      notifications: [] as GuestPortalNotification[],
      payments: [] as GuestPortalPayment[],
      requestEvents: [] as GuestPortalServiceRequestEvent[],
      serviceCharges: [] as GuestPortalServiceCharge[],
      requests: [] as GuestPortalServiceRequest[]
    }
  }

  const credential = data as GuestPortalCredential | null
  const booking = pickSingle(credential?.bookings)

  const proofAccepted = lookup?.bypassProof ? true : isVerifiedGuestProof(booking as GuestPortalBooking, proof)

  if (!credential || !booking || !proofAccepted || (lookup?.bookingId && booking.id !== lookup.bookingId)) {
    return {
      booking: null,
      credential: null,
      error: 'We could not verify those guest details. Check the access code and use your full guest name, last name, or the last 4 digits of the booking phone number.',
      notifications: [] as GuestPortalNotification[],
      payments: [] as GuestPortalPayment[],
      requestEvents: [] as GuestPortalServiceRequestEvent[],
      serviceCharges: [] as GuestPortalServiceCharge[],
      requests: [] as GuestPortalServiceRequest[]
    }
  }

  const [notificationsResult, paymentsResult, serviceChargesResult, requestsResult] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, type, message, triggered_by, read, created_at')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase.from('payments').select('id, amount_ghs, method, reference, paid_at').eq('booking_id', booking.id).order('paid_at', { ascending: false }),
    supabase
      .from('service_charges')
      .select('id, type, amount_ghs, description, resolved, resolved_at, payment_confirmed, created_at')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('service_requests')
      .select('id, title, description, category, priority, status, resolution_note, created_at, updated_at')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: false })
      .limit(12)
  ])

  const requestIds = (requestsResult.data ?? []).map((request) => request.id)
  const requestEventsResult = requestIds.length
    ? await supabase
        .from('service_request_events')
        .select('id, service_request_id, event_type, message, actor_name, actor_role, created_at')
        .in('service_request_id', requestIds)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (notificationsResult.error || paymentsResult.error || serviceChargesResult.error || requestsResult.error || requestEventsResult.error) {
    return {
      booking,
      credential,
      error: 'Guest stay verified, but part of the portal history could not be loaded right now.',
      notifications: (notificationsResult.data ?? []) as GuestPortalNotification[],
      payments: (paymentsResult.data ?? []) as GuestPortalPayment[],
      requestEvents: (requestEventsResult.data ?? []) as GuestPortalServiceRequestEvent[],
      requests: (requestsResult.data ?? []) as GuestPortalServiceRequest[],
      serviceCharges: (serviceChargesResult.data ?? []) as GuestPortalServiceCharge[]
    }
  }

  return {
    booking,
    credential,
    error: null,
    notifications: (notificationsResult.data ?? []) as GuestPortalNotification[],
    payments: (paymentsResult.data ?? []) as GuestPortalPayment[],
    requestEvents: (requestEventsResult.data ?? []) as GuestPortalServiceRequestEvent[],
    requests: (requestsResult.data ?? []) as GuestPortalServiceRequest[],
    serviceCharges: (serviceChargesResult.data ?? []) as GuestPortalServiceCharge[]
  }
}