import { redirect } from 'next/navigation'

import { AdminTodayClient } from '@/app/(admin)/admin/today/admin-today-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type ManagerApprovalRow = Database['public']['Tables']['manager_approvals']['Row']
type OperationalHandoffRow = Database['public']['Tables']['operational_handoffs']['Row']
type OperationalHandoffItemRow = Database['public']['Tables']['operational_handoff_items']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ExtensionAuditRow = Database['public']['Tables']['booking_extension_audits']['Row']
type RoomStatus = Database['public']['Enums']['room_status']

type BookingWithRoom = Pick<BookingRow, 'id' | 'guest_name' | 'guest_phone' | 'check_in' | 'check_out_expected' | 'total_ghs' | 'paid_ghs' | 'balance_ghs' | 'status'> & {
  rooms: Pick<RoomRow, 'number' | 'type'> | Array<Pick<RoomRow, 'number' | 'type'>> | null
}

type PendingExtensionAudit = Pick<
  ExtensionAuditRow,
  | 'id'
  | 'requested_by'
  | 'requester_role'
  | 'reason'
  | 'previous_check_out_expected'
  | 'new_check_out_expected'
  | 'incremental_amount_ghs'
  | 'payment_recorded_ghs'
  | 'payment_method'
  | 'payment_reference'
  | 'created_at'
  | 'confirmation_status'
> & {
  bookings: BookingWithRoom | Array<BookingWithRoom> | null
}

type NotificationWithBooking = Pick<NotificationRow, 'id' | 'type' | 'message' | 'created_at' | 'triggered_by'> & {
  bookings: Pick<BookingRow, 'guest_name'> | Array<Pick<BookingRow, 'guest_name'>> | null
}

type ServiceChargeWithBooking = Pick<ServiceChargeRow, 'id' | 'amount_ghs' | 'type' | 'description' | 'created_at'> & {
  bookings:
    | (Pick<BookingRow, 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null })
    | Array<Pick<BookingRow, 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null }>
    | null
}

type ServiceRequestWithRelations = Pick<ServiceRequestRow, 'id' | 'category' | 'priority' | 'status' | 'title' | 'created_at' | 'guest_name'> & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null })
    | Array<Pick<BookingRow, 'id' | 'guest_name'> & { rooms: Pick<RoomRow, 'number'> | Array<Pick<RoomRow, 'number'>> | null }>
    | null
} & Pick<ServiceRequestRow, 'assigned_staff_id' | 'due_at'>

type PendingApproval = Pick<ManagerApprovalRow, 'id' | 'approval_type' | 'booking_id' | 'detail' | 'metadata' | 'requested_at' | 'requested_by' | 'requested_by_role' | 'status' | 'title'> & {
  bookings: Pick<BookingRow, 'id' | 'guest_name'> | Array<Pick<BookingRow, 'id' | 'guest_name'>> | null
}

type HandoffSummary = Pick<OperationalHandoffRow, 'id' | 'status' | 'summary' | 'created_at' | 'created_by_name'> & {
  operational_handoff_items: Pick<OperationalHandoffItemRow, 'id' | 'resolved'>[] | null
}

function getDateParts(offsetDays = 0) {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() + offsetDays)

  return {
    dateOnly: value.toISOString().split('T')[0],
    iso: value.toISOString()
  }
}

export default async function AdminTodayPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const today = getDateParts(0)
  const tomorrow = getDateParts(1)
  const dayAfterTomorrow = getDateParts(2)

  const [
    pendingExtensionsResult,
    unreadNotificationsResult,
    upcomingBookingsResult,
    activeBookingsResult,
    unresolvedChargesResult,
    openRequestsResult,
    pendingApprovalsResult,
    handoffsResult,
    unresolvedHandoffItemCountResult,
    roomsResult,
    paymentsTodayResult,
    recentExtensionsResult
  ] = await Promise.all([
    supabase
      .from('booking_extension_audits')
      .select('id, requested_by, requester_role, reason, previous_check_out_expected, new_check_out_expected, incremental_amount_ghs, payment_recorded_ghs, payment_method, payment_reference, created_at, confirmation_status, bookings(id, guest_name, guest_phone, check_in, check_out_expected, total_ghs, paid_ghs, balance_ghs, status, rooms(number, type))')
      .eq('confirmation_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('notifications')
      .select('id, type, message, created_at, triggered_by, bookings(guest_name)')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('bookings')
      .select('id, guest_name, guest_phone, check_in, check_out_expected, total_ghs, paid_ghs, balance_ghs, status, rooms(number, type)')
      .eq('status', 'reserved')
      .gte('check_in', today.dateOnly)
      .lte('check_in', dayAfterTomorrow.dateOnly)
      .order('check_in', { ascending: true })
      .limit(8),
    supabase
      .from('bookings')
      .select('id, guest_name, guest_phone, check_in, check_out_expected, total_ghs, paid_ghs, balance_ghs, status, rooms(number, type)')
      .eq('status', 'active')
      .order('check_out_expected', { ascending: true }),
    supabase
      .from('service_charges')
      .select('id, amount_ghs, type, description, created_at, bookings(guest_name, rooms(number))')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('service_requests')
      .select('id, category, priority, status, title, created_at, guest_name, assigned_staff_id, due_at, bookings(id, guest_name, rooms(number))')
      .in('status', ['new', 'acknowledged', 'assigned', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('manager_approvals')
      .select('id, approval_type, booking_id, detail, metadata, requested_at, requested_by, requested_by_role, status, title, bookings(id, guest_name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(8),
    supabase
      .from('operational_handoffs')
      .select('id, status, summary, created_at, created_by_name, operational_handoff_items(id, resolved)')
      .in('status', ['open', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(3),
    supabase.from('operational_handoff_items').select('id', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('rooms').select('status'),
    supabase
      .from('payments')
      .select('id, amount_ghs, paid_at')
      .gte('paid_at', today.iso)
      .order('paid_at', { ascending: false }),
    supabase
      .from('booking_extension_audits')
      .select('id, requested_by, requester_role, reason, previous_check_out_expected, new_check_out_expected, incremental_amount_ghs, payment_recorded_ghs, payment_method, payment_reference, created_at, confirmation_status, bookings(id, guest_name, guest_phone, check_in, check_out_expected, total_ghs, paid_ghs, balance_ghs, status, rooms(number, type))')
      .gte('created_at', today.iso)
      .order('created_at', { ascending: false })
      .limit(6)
  ])

  if (pendingExtensionsResult.error) {
    throw new Error(pendingExtensionsResult.error.message)
  }

  if (unreadNotificationsResult.error) {
    throw new Error(unreadNotificationsResult.error.message)
  }

  if (upcomingBookingsResult.error) {
    throw new Error(upcomingBookingsResult.error.message)
  }

  if (activeBookingsResult.error) {
    throw new Error(activeBookingsResult.error.message)
  }

  if (unresolvedChargesResult.error) {
    throw new Error(unresolvedChargesResult.error.message)
  }

  if (roomsResult.error) {
    throw new Error(roomsResult.error.message)
  }

  if (openRequestsResult.error) {
    throw new Error(openRequestsResult.error.message)
  }

  if (pendingApprovalsResult.error) {
    throw new Error(pendingApprovalsResult.error.message)
  }

  if (handoffsResult.error) {
    throw new Error(handoffsResult.error.message)
  }

  if (unresolvedHandoffItemCountResult.error) {
    throw new Error(unresolvedHandoffItemCountResult.error.message)
  }

  if (paymentsTodayResult.error) {
    throw new Error(paymentsTodayResult.error.message)
  }

  if (recentExtensionsResult.error) {
    throw new Error(recentExtensionsResult.error.message)
  }

  const pendingExtensions = (pendingExtensionsResult.data ?? []) as PendingExtensionAudit[]
  const unreadNotifications = (unreadNotificationsResult.data ?? []) as NotificationWithBooking[]
  const upcomingBookings = (upcomingBookingsResult.data ?? []) as BookingWithRoom[]
  const activeBookings = (activeBookingsResult.data ?? []) as BookingWithRoom[]
  const unresolvedCharges = (unresolvedChargesResult.data ?? []) as ServiceChargeWithBooking[]
  const openRequests = (openRequestsResult.data ?? []) as ServiceRequestWithRelations[]
  const pendingApprovals = (pendingApprovalsResult.data ?? []) as PendingApproval[]
  const handoffs = (handoffsResult.data ?? []) as HandoffSummary[]
  const recentExtensions = (recentExtensionsResult.data ?? []) as PendingExtensionAudit[]
  const paymentsToday = (paymentsTodayResult.data ?? []) as Pick<PaymentRow, 'id' | 'amount_ghs' | 'paid_at'>[]
  const roomStats = (roomsResult.data ?? []).reduce<Record<RoomStatus, number>>(
    (summary, room) => {
      summary[room.status as RoomStatus] += 1
      return summary
    },
    {
      cleaning: 0,
      maintenance: 0,
      occupied: 0,
      reserved: 0,
      vacant: 0
    }
  )

  const dueOutToday = activeBookings.filter((booking) => booking.check_out_expected === today.dateOnly)
  const activeBalances = activeBookings.filter((booking) => Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs) > 0).slice(0, 6)

  return (
    <AdminTodayClient
      activeBalances={activeBalances}
      dueOutToday={dueOutToday}
      handoffSummary={{ open: handoffs.length, unresolvedItems: unresolvedHandoffItemCountResult.count ?? 0, recent: handoffs }}
      pendingApprovals={pendingApprovals}
      paymentsToday={{ count: paymentsToday.length, total: paymentsToday.reduce((sum, payment) => sum + payment.amount_ghs, 0) }}
      pendingExtensions={pendingExtensions}
      recentExtensions={recentExtensions}
      roomStats={roomStats}
      openRequests={openRequests}
      unresolvedCharges={unresolvedCharges}
      unreadNotifications={unreadNotifications}
      upcomingBookings={upcomingBookings}
    />
  )
}