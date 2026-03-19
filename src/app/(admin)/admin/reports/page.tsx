import { redirect } from 'next/navigation'

import { AdminReportsClient } from '@/app/(admin)/admin/reports/admin-reports-client'
import { buildHotelProfile } from '@/lib/hotel-info'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import { defaultReportCategories, type ReportCategory, type ReportFilters, type ReportOperation, resolveDateRange, buildReportSummary } from '@/lib/reporting'
import type { Database } from '@/lib/supabase/types'

type SearchParams = Record<string, string | string[] | undefined>
type StaffRow = Database['public']['Tables']['staff']['Row']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']
type AccessLogRow = Database['public']['Tables']['access_log']['Row']
type HotelProfileRow = Database['public']['Tables']['hotel_profile']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']

type NotificationWithRelations = NotificationRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name' | 'check_in' | 'check_out_expected'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
      })
    | Array<
        Pick<BookingRow, 'id' | 'guest_name' | 'check_in' | 'check_out_expected'> & {
          rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
        }
      >
    | null
}

type PaymentWithRelations = PaymentRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name' | 'status'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
      })
    | Array<
        Pick<BookingRow, 'id' | 'guest_name' | 'status'> & {
          rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
        }
      >
    | null
}

type ServiceChargeWithRelations = ServiceChargeRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
      })
    | Array<
        Pick<BookingRow, 'id' | 'guest_name'> & {
          rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
        }
      >
    | null
}

type ShiftWithStaff = ShiftRow & {
  staff: Pick<StaffRow, 'id' | 'name' | 'role'> | Array<Pick<StaffRow, 'id' | 'name' | 'role'>> | null
}

type AccessWithRoom = AccessLogRow & {
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

function readValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function readValues(value: string | string[] | undefined) {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function mapNotificationType(type: string) {
  if (type === 'reservation_created') {
    return 'Reservation created'
  }

  if (type === 'booking_checked_in' || type === 'walk_in_checked_in') {
    return 'Guest checked in'
  }

  if (type === 'booking_checked_out') {
    return 'Guest checked out'
  }

  if (type === 'booking_cancelled') {
    return 'Reservation cancelled'
  }

  if (type === 'booking_extended') {
    return 'Stay extended'
  }

  if (type === 'service_charge_added') {
    return 'Service charge added'
  }

  if (type === 'service_charge_resolved') {
    return 'Service charge resolved'
  }

  if (type === 'keycard_issued' || type === 'master_key_issued') {
    return 'Keycard issued'
  }

  if (type === 'keycard_revoked' || type === 'master_key_revoked') {
    return 'Keycard revoked'
  }

  if (type === 'keycard_extended' || type === 'master_key_extended') {
    return 'Keycard validity extended'
  }

  return type.replaceAll('_', ' ')
}

function isServiceNotification(type: string) {
  return type === 'service_charge_added' || type === 'service_charge_resolved'
}

function normalizeCategories(categories: string[]): ReportCategory[] {
  const valid = new Set<ReportCategory>(['front_office', 'payments', 'services', 'access', 'staffing'])
  const selected = categories.filter((category): category is ReportCategory => valid.has(category as ReportCategory))
  return selected.length > 0 ? selected : defaultReportCategories()
}

function pickSingle<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function matchesStaffFilter(operation: ReportOperation, staffId: string | null) {
  if (!staffId) {
    return true
  }

  return operation.actorStaffId === staffId
}

export default async function AdminReportsPage({ searchParams }: { searchParams?: SearchParams }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const preset = (readValue(searchParams?.preset) as ReportFilters['preset']) ?? 'this-month'
  const groupBy = (readValue(searchParams?.groupBy) as ReportFilters['groupBy']) ?? 'week'
  const scope = (readValue(searchParams?.scope) as ReportFilters['scope']) ?? 'overview'
  const staffId = readValue(searchParams?.staffId) ?? null
  const selectedCategories = normalizeCategories(readValues(searchParams?.category))
  const dateRange = resolveDateRange(preset, readValue(searchParams?.startDate), readValue(searchParams?.endDate))

  const [hotelProfileResult, staffResult, notificationsResult, paymentsResult, servicesResult, accessResult, shiftsResult] = await Promise.all([
    supabase.from('hotel_profile').select('*').eq('id', true).maybeSingle(),
    supabase.from('staff').select('id, name, role, active').order('active', { ascending: false }).order('name'),
    supabase
      .from('notifications')
      .select('id, type, message, triggered_by, created_at, booking_id, keycard_id, read, bookings(id, guest_name, check_in, check_out_expected, rooms(number, type))')
      .gte('created_at', dateRange.startIso)
      .lt('created_at', dateRange.endExclusiveIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('payments')
      .select('id, amount_ghs, method, paid_at, received_by, reference, bookings(id, guest_name, status, rooms(number, type))')
      .gte('paid_at', dateRange.startIso)
      .lt('paid_at', dateRange.endExclusiveIso)
      .order('paid_at', { ascending: false }),
    supabase
      .from('service_charges')
      .select('id, amount_ghs, type, description, created_at, resolved, bookings(id, guest_name, rooms(number, type))')
      .gte('created_at', dateRange.startIso)
      .lt('created_at', dateRange.endExclusiveIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('access_log')
      .select('id, card_uid, guest_name, issued_by, note, result, accessed_at, rooms(number, type)')
      .gte('accessed_at', dateRange.startIso)
      .lt('accessed_at', dateRange.endExclusiveIso)
      .order('accessed_at', { ascending: false }),
    supabase
      .from('shifts')
      .select('id, started_at, ended_at, staff_id, staff(id, name, role)')
      .gte('started_at', dateRange.startIso)
      .lt('started_at', dateRange.endExclusiveIso)
      .order('started_at', { ascending: false })
  ])

  if (hotelProfileResult.error) {
    throw new Error(hotelProfileResult.error.message)
  }

  if (staffResult.error) {
    throw new Error(staffResult.error.message)
  }

  if (notificationsResult.error) {
    throw new Error(notificationsResult.error.message)
  }

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message)
  }

  if (servicesResult.error) {
    throw new Error(servicesResult.error.message)
  }

  if (accessResult.error) {
    throw new Error(accessResult.error.message)
  }

  if (shiftsResult.error) {
    throw new Error(shiftsResult.error.message)
  }

  const staff = (staffResult.data ?? []) as Array<Pick<StaffRow, 'id' | 'name' | 'role' | 'active'>>
  const hotelProfile = buildHotelProfile((hotelProfileResult.data ?? null) as HotelProfileRow | null)
  const staffByName = new Map(staff.map((member) => [member.name.trim().toLowerCase(), member]))
  const selectedStaff = staffId ? staff.find((member) => member.id === staffId) ?? null : null
  const filters: ReportFilters = {
    categories: selectedCategories,
    endDate: dateRange.endDate,
    groupBy,
    preset,
    scope,
    staffId: selectedStaff?.id ?? null,
    staffName: selectedStaff?.name ?? null,
    startDate: dateRange.startDate
  }

  const operations: ReportOperation[] = []

  for (const notification of (notificationsResult.data ?? []) as unknown as NotificationWithRelations[]) {
    const actor = notification.triggered_by?.trim() || null
    const matchedStaff = actor ? staffByName.get(actor.toLowerCase()) ?? null : null
    const serviceNotification = isServiceNotification(notification.type)
    const category: ReportCategory = serviceNotification ? 'services' : 'front_office'
    const booking = pickSingle(notification.bookings)
    const room = pickSingle(booking?.rooms)

    if (!selectedCategories.includes(category)) {
      continue
    }

    if (scope === 'overview' && serviceNotification) {
      continue
    }

    operations.push({
      actorName: actor,
      actorStaffId: matchedStaff?.id ?? null,
      amountGhs: null,
      category,
      detail: notification.message,
      id: `notification-${notification.id}`,
      occurredAt: notification.created_at ?? new Date().toISOString(),
      roomLabel: room?.number ? `Room ${room.number}` : null,
      status: notification.type,
      title: mapNotificationType(notification.type)
    })
  }

  for (const payment of (paymentsResult.data ?? []) as unknown as PaymentWithRelations[]) {
    if (!selectedCategories.includes('payments') || !payment.paid_at) {
      continue
    }

    const actor = payment.received_by?.trim() || null
    const matchedStaff = actor ? staffByName.get(actor.toLowerCase()) ?? null : null
    const booking = pickSingle(payment.bookings)
    const room = pickSingle(booking?.rooms)
    operations.push({
      actorName: actor,
      actorStaffId: matchedStaff?.id ?? null,
      amountGhs: payment.amount_ghs,
      category: 'payments',
      detail: `${payment.method.replaceAll('_', ' ')} payment${payment.reference ? ` · Ref ${payment.reference}` : ''}`,
      id: `payment-${payment.id}`,
      occurredAt: payment.paid_at,
      roomLabel: room?.number ? `Room ${room.number}` : null,
      status: payment.method,
      title: booking?.guest_name ? `Payment received from ${booking.guest_name}` : 'Payment received'
    })
  }

  for (const charge of (servicesResult.data ?? []) as unknown as ServiceChargeWithRelations[]) {
    if (!selectedCategories.includes('services') || !charge.created_at || scope === 'staff') {
      continue
    }

    const booking = pickSingle(charge.bookings)
    const room = pickSingle(booking?.rooms)

    operations.push({
      actorName: null,
      actorStaffId: null,
      amountGhs: charge.amount_ghs,
      category: 'services',
      detail: charge.description?.trim() ? charge.description : `${charge.type.replaceAll('_', ' ')} charge`,
      id: `service-${charge.id}`,
      occurredAt: charge.created_at,
      roomLabel: room?.number ? `Room ${room.number}` : null,
      status: charge.resolved ? 'resolved' : 'open',
      title: booking?.guest_name ? `Service posted for ${booking.guest_name}` : 'Service charge posted'
    })
  }

  for (const event of (accessResult.data ?? []) as unknown as AccessWithRoom[]) {
    if (!selectedCategories.includes('access') || !event.accessed_at) {
      continue
    }

    const actor = event.issued_by?.trim() || null
    const matchedStaff = actor ? staffByName.get(actor.toLowerCase()) ?? null : null
    const room = pickSingle(event.rooms)
    operations.push({
      actorName: actor,
      actorStaffId: matchedStaff?.id ?? null,
      amountGhs: null,
      category: 'access',
      detail: event.note?.trim() || (event.guest_name ? `${event.guest_name} tapped ${event.card_uid}` : `Card ${event.card_uid} scanned`),
      id: `access-${event.id}`,
      occurredAt: event.accessed_at,
      roomLabel: room?.number ? `Room ${room.number}` : null,
      status: event.result,
      title: event.result === 'granted' ? 'Door opened' : 'Door denied'
    })
  }

  for (const shift of (shiftsResult.data ?? []) as unknown as ShiftWithStaff[]) {
    if (!selectedCategories.includes('staffing') || !shift.started_at) {
      continue
    }

    const staffRecord = pickSingle(shift.staff)

    operations.push({
      actorName: staffRecord?.name ?? null,
      actorStaffId: staffRecord?.id ?? shift.staff_id ?? null,
      amountGhs: null,
      category: 'staffing',
      detail: shift.ended_at ? `Ended ${new Date(shift.ended_at).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })}` : 'Shift still open',
      id: `shift-${shift.id}`,
      occurredAt: shift.started_at,
      roomLabel: null,
      status: shift.ended_at ? 'closed' : 'open',
      title: staffRecord?.name ? `${staffRecord.name} started shift` : 'Shift started'
    })
  }

  const filteredOperations = [...operations]
    .filter((operation) => (scope === 'staff' ? matchesStaffFilter(operation, selectedStaff?.id ?? null) : true))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))

  const serviceChargesTotal = scope === 'staff'
    ? 0
    : ((servicesResult.data ?? []) as unknown as ServiceChargeWithRelations[]).reduce((sum, charge) => sum + charge.amount_ghs, 0)

  const summary = buildReportSummary(filteredOperations, serviceChargesTotal)

  return (
    <AdminReportsClient
      filters={filters}
      hotelProfile={hotelProfile}
      operations={filteredOperations}
      staffOptions={staff}
      summary={summary}
    />
  )
}