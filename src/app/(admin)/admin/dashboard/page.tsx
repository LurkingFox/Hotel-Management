import { redirect } from 'next/navigation'
import Link from 'next/link'

import { AdminDashboardRealtime } from '@/app/(admin)/admin/dashboard/admin-dashboard-realtime'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { formatGHS } from '@/lib/utils/format'

type PayMethod = Database['public']['Enums']['pay_method']
type RoomStatus = Database['public']['Enums']['room_status']
type AccessResult = Database['public']['Enums']['access_result']
type PaymentSummary = Pick<Database['public']['Tables']['payments']['Row'], 'amount_ghs' | 'method' | 'paid_at' | 'reference'>
type BookingSummary = Pick<Database['public']['Tables']['bookings']['Row'], 'id' | 'status' | 'balance_ghs' | 'total_ghs' | 'paid_ghs'>
type NotificationSummary = Pick<Database['public']['Tables']['notifications']['Row'], 'id' | 'message' | 'read' | 'type' | 'created_at'>
type AccessSummary = Pick<Database['public']['Tables']['access_log']['Row'], 'result' | 'note' | 'accessed_at'> & {
  rooms: Array<{ number: string }> | null
}
type DoorControllerSummary = Pick<
  Database['public']['Tables']['door_controllers']['Row'],
  'controller_id' | 'firmware_version' | 'heartbeat_status' | 'last_card_uid' | 'last_error' | 'last_note' | 'last_result' | 'last_seen_at'
> & {
  rooms: Array<{ number: string }> | null
}
type RoomSummary = Pick<Database['public']['Tables']['rooms']['Row'], 'status'>

const paymentLabels: Record<PayMethod, string> = {
  cash: 'Cash',
  momo: 'MoMo',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque'
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Unknown time'
  }

  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function buildAccessAlert(result: AccessResult, roomNumber: string | null, note: string | null, accessedAt: string | null) {
  const roomLabel = roomNumber ? `Room ${roomNumber}` : 'Unknown room'
  const action = result === 'granted' ? 'Granted access' : result === 'expired' ? 'Expired card used' : 'Denied access'
  return `${action} for ${roomLabel} at ${formatDateTime(accessedAt)}${note ? `. ${note}` : '.'}`
}

function getControllerDisplayStatus(controller: DoorControllerSummary, staleBefore: number): 'degraded' | 'offline' | 'online' {
  const lastSeen = controller.last_seen_at ? Date.parse(controller.last_seen_at) : 0

  if (!lastSeen || Number.isNaN(lastSeen) || lastSeen < staleBefore) {
    return 'offline'
  }

  return controller.heartbeat_status === 'online' || controller.heartbeat_status === 'offline' ? controller.heartbeat_status : 'degraded'
}

const commandLinks = [
  { href: '/admin/bookings', label: 'Manage bookings', detail: 'Check in, extend, cancel, and settle stays.' },
  { href: '/admin/payments', label: 'Review payments', detail: 'Track receipts, balances, and payment channels.' },
  { href: '/admin/reports', label: 'Generate reports', detail: 'Group operations by period, staff member, and export PDF packs.' },
  { href: '/admin/settings', label: 'Hotel settings', detail: 'Update hotel address, contacts, website, and brand logo.' },
  { href: '/admin/keycards', label: 'Control keycards', detail: 'Revoke, extend, and audit room access cards.' },
  { href: '/admin/rooms', label: 'Run room board', detail: 'Change room readiness and occupancy states.' },
  { href: '/admin/staff', label: 'Manage staff', detail: 'Start and end shifts, review payroll load.' },
  { href: '/reception/desk', label: 'Open reception flow', detail: 'Use the same operational desk the front office sees.' }
]

export default async function AdminDashboardPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartIso = monthStart.toISOString()

  const [paymentsResult, bookingsResult, notificationsResult, accessResult, roomsResult, controllersResult] = await Promise.all([
    supabase.from('payments').select('amount_ghs, method, paid_at, reference').order('paid_at', { ascending: false }),
    supabase.from('bookings').select('id, status, balance_ghs, total_ghs, paid_ghs').order('check_in', { ascending: false }),
    supabase.from('notifications').select('id, message, read, type, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('access_log').select('result, note, accessed_at, rooms(number)').order('accessed_at', { ascending: false }).limit(6),
    supabase.from('rooms').select('status').order('number'),
    supabase.from('door_controllers').select('controller_id, firmware_version, heartbeat_status, last_card_uid, last_error, last_note, last_result, last_seen_at, rooms(number)').order('last_seen_at', { ascending: false })
  ])

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message)
  }

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message)
  }

  if (notificationsResult.error) {
    throw new Error(notificationsResult.error.message)
  }

  if (accessResult.error) {
    throw new Error(accessResult.error.message)
  }

  if (roomsResult.error) {
    throw new Error(roomsResult.error.message)
  }

  if (controllersResult.error) {
    throw new Error(controllersResult.error.message)
  }

  const payments = (paymentsResult.data ?? []) as PaymentSummary[]
  const bookings = (bookingsResult.data ?? []) as BookingSummary[]
  const notifications = (notificationsResult.data ?? []) as NotificationSummary[]
  const accessEvents = (accessResult.data ?? []) as AccessSummary[]
  const controllers = (controllersResult.data ?? []) as DoorControllerSummary[]
  const rooms = (roomsResult.data ?? []) as RoomSummary[]
  const staleBefore = Date.now() - 2 * 60 * 1000

  const monthRevenue = payments.reduce((sum, payment) => {
    if (!payment.paid_at || payment.paid_at < monthStartIso) {
      return sum
    }

    return sum + payment.amount_ghs
  }, 0)

  const outstandingBalances = bookings.reduce((sum, booking) => sum + (booking.balance_ghs ?? 0), 0)
  const activeStays = bookings.filter((booking) => booking.status === 'active').length
  const unreadNotifications = notifications.filter((notification) => !notification.read).length
  const openBalances = bookings.filter((booking) => (booking.balance_ghs ?? 0) > 0).length

  const paymentTotalsByMethod = payments.reduce<Record<PayMethod, number>>(
    (totals, payment) => {
      totals[payment.method] += payment.amount_ghs
      return totals
    },
    { cash: 0, momo: 0, bank_transfer: 0, cheque: 0 }
  )
  const totalCollected = Object.values(paymentTotalsByMethod).reduce((sum, amount) => sum + amount, 0)

  const paymentShares = (['cash', 'momo', 'bank_transfer', 'cheque'] as const).map((method) => ({
    label: paymentLabels[method],
    value: totalCollected === 0 ? 0 : (paymentTotalsByMethod[method] / totalCollected) * 100,
    total: paymentTotalsByMethod[method]
  }))

  const roomSummary = rooms.reduce<Record<RoomStatus, number>>(
    (totals, room) => {
      totals[room.status] += 1
      return totals
    },
    { vacant: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0 }
  )

  const controllerSummary = controllers.reduce(
    (totals, controller) => {
      const status = getControllerDisplayStatus(controller, staleBefore)
      totals[status] += 1
      return totals
    },
    { degraded: 0, offline: 0, online: 0 }
  )

  const alerts = [
    ...notifications.map((notification) => ({
      id: notification.id,
      label: notification.type.replaceAll('_', ' '),
      message: `${notification.message} ${formatDateTime(notification.created_at)}`
    })),
    ...accessEvents.map((event, index) => ({
      id: `access-${index}`,
      label: event.result,
      message: buildAccessAlert(event.result, event.rooms?.[0]?.number ?? null, event.note, event.accessed_at)
    }))
  ].slice(0, 8)

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <AdminDashboardRealtime />
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-6 rounded-[2rem] border border-ink/10 bg-white/70 p-7 shadow-card backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">University Hotel admin</p>
              <h1 className="font-[family-name:var(--font-display)] text-5xl">Operational command</h1>
              <p className="max-w-3xl text-sm leading-6 text-ink/70">
                Run front-office procedures, room readiness, payment oversight, security controls, and staff operations from one board.
              </p>
            </div>
          </div>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {commandLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-[1.5rem] border border-ink/10 bg-parchment px-5 py-4 transition hover:-translate-y-0.5 hover:border-ink/20 hover:bg-white"
              >
                <p className="text-sm font-semibold text-ink">{link.label}</p>
                <p className="mt-2 text-sm leading-6 text-ink/65">{link.detail}</p>
              </Link>
            ))}
          </section>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.75rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Month revenue</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(monthRevenue)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Outstanding balances</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(outstandingBalances)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Active stays</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{activeStays} bookings</p>
          </article>
          <article className="rounded-[1.75rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unread notifications</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{unreadNotifications} alerts</p>
          </article>
          <article className="rounded-[1.75rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open balances</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{openBalances} bookings</p>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] bg-ink p-7 text-white shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-white/50">Financial pulse</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {paymentShares.slice(0, 2).map((share) => (
                <div key={share.label} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-sm text-white/60">{share.label} share</p>
                  <p className="mt-2 text-4xl font-semibold">{formatPercent(share.value)}</p>
                  <p className="mt-2 text-sm text-white/55">{formatGHS(share.total)}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {paymentShares.slice(2).map((share) => (
                <div key={share.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                  <div className="flex items-center justify-between gap-3">
                    <span>{share.label}</span>
                    <span>{formatPercent(share.value)}</span>
                  </div>
                  <div className="mt-2 text-white/55">{formatGHS(share.total)}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
              Payments are live from Supabase. `received_by` is session-driven, and booking balances are derived from `paid_ghs` against the booking total.
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Security watch</p>
            <div className="mt-5 space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl bg-parchment p-4 text-sm text-ink/80">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{alert.label}</p>
                  <p className="mt-2">{alert.message}</p>
                </div>
              ))}
              {alerts.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No recent notifications or access events yet.</div> : null}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Room readiness</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {([
                ['Vacant', roomSummary.vacant],
                ['Occupied', roomSummary.occupied],
                ['Reserved', roomSummary.reserved],
                ['Cleaning', roomSummary.cleaning],
                ['Maintenance', roomSummary.maintenance]
              ] as const).map(([label, count]) => (
                <div key={label} className="rounded-2xl bg-parchment p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Booking exposure</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-[#f8f5f0] p-5">
                <p className="text-sm text-ink/55">Paid so far</p>
                <p className="mt-2 text-4xl font-semibold text-ink">{formatGHS(bookings.reduce((sum, booking) => sum + booking.paid_ghs, 0))}</p>
              </div>
              <div className="rounded-3xl bg-[#f8f5f0] p-5">
                <p className="text-sm text-ink/55">Booked total</p>
                <p className="mt-2 text-4xl font-semibold text-ink">{formatGHS(bookings.reduce((sum, booking) => sum + booking.total_ghs, 0))}</p>
              </div>
            </div>
            <div className="mt-5 rounded-3xl bg-[#f8f5f0] p-5 text-sm text-ink/70">
              {openBalances} bookings still carry balances totaling {formatGHS(outstandingBalances)}.
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Door controller watch</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {([
                ['Online', controllerSummary.online],
                ['Degraded', controllerSummary.degraded],
                ['Offline', controllerSummary.offline]
              ] as const).map(([label, count]) => (
                <div key={label} className="rounded-2xl bg-parchment p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-3xl bg-[#f8f5f0] p-5 text-sm text-ink/70">
              Controllers are marked offline when no heartbeat has been seen for more than two minutes.
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Latest controller status</p>
            <div className="mt-5 space-y-3">
              {controllers.map((controller) => {
                const status = getControllerDisplayStatus(controller, staleBefore)

                return (
                  <div key={controller.controller_id} className="rounded-2xl bg-parchment p-4 text-sm text-ink/80">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-ink">{controller.rooms?.[0]?.number ? `Room ${controller.rooms[0].number}` : controller.controller_id}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink/45">{controller.controller_id}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                          status === 'online'
                            ? 'bg-green-50 text-green-800'
                            : status === 'degraded'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <p>Last seen: <span className="font-semibold text-ink">{formatDateTime(controller.last_seen_at)}</span></p>
                      <p>Firmware: <span className="font-semibold text-ink">{controller.firmware_version ?? 'Unknown'}</span></p>
                      <p>Last card: <span className="font-semibold text-ink">{controller.last_card_uid ?? 'None'}</span></p>
                      <p>Last result: <span className="font-semibold text-ink">{controller.last_result ?? 'Heartbeat only'}</span></p>
                    </div>
                    {controller.last_note ? <p className="mt-3 text-sm text-ink/70">{controller.last_note}</p> : null}
                    {controller.last_error ? <p className="mt-2 text-sm text-red-700">{controller.last_error}</p> : null}
                  </div>
                )
              })}
              {controllers.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No controller heartbeats reported yet.</div> : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}