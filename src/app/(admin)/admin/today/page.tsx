import { redirect } from 'next/navigation'

import { AdminTodayClient } from '@/app/(admin)/admin/today/admin-today-client'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
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
      paymentsToday={{ count: paymentsToday.length, total: paymentsToday.reduce((sum, payment) => sum + payment.amount_ghs, 0) }}
      pendingExtensions={pendingExtensions}
      recentExtensions={recentExtensions}
      roomStats={roomStats}
      unresolvedCharges={unresolvedCharges}
      unreadNotifications={unreadNotifications}
      upcomingBookings={upcomingBookings}
    />
  )
}