'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type NotificationRow = Database['public']['Tables']['notifications']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type ExtensionAuditRow = Database['public']['Tables']['booking_extension_audits']['Row']

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

type TodayClientProps = {
  activeBalances: BookingWithRoom[]
  dueOutToday: BookingWithRoom[]
  paymentsToday: {
    count: number
    total: number
  }
  pendingExtensions: PendingExtensionAudit[]
  recentExtensions: PendingExtensionAudit[]
  roomStats: Record<Database['public']['Enums']['room_status'], number>
  unresolvedCharges: ServiceChargeWithBooking[]
  unreadNotifications: NotificationWithBooking[]
  upcomingBookings: BookingWithRoom[]
}

type BookingMutationResponse = {
  error?: string
  message?: string
}

function pickSingle<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Unknown time'
  }

  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short'
  })
}

function summarizeUpcoming(booking: BookingWithRoom) {
  const room = pickSingle(booking.rooms)
  return `${formatDate(booking.check_in)} · Room ${room?.number ?? 'Pending'} · Balance ${formatGHS(Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs))}`
}

export function AdminTodayClient({
  activeBalances,
  dueOutToday,
  paymentsToday,
  pendingExtensions,
  recentExtensions,
  roomStats,
  unresolvedCharges,
  unreadNotifications,
  upcomingBookings,
}: TodayClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  function runReview(auditId: string, action: 'confirm_extension' | 'flag_extension') {
    const note = reviewNotes[auditId]?.trim() ?? ''

    if (action === 'flag_extension' && !note) {
      setErrorMessage('Add a discrepancy note before marking an extension as disputed.')
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          confirmationNote: note || undefined,
          extensionAuditId: auditId
        })
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Manager review failed.')
        return
      }

      setSuccessMessage(payload.message ?? 'Extension review saved.')
      setReviewNotes((current) => ({ ...current, [auditId]: '' }))
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_20%,_#f7f1e8_20%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Manager queue</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Today</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
              Review what needs confirmation, what is arriving, and where revenue or room readiness needs attention.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">Pending confirmations</p>
              <p className="mt-2 text-3xl font-semibold text-white">{pendingExtensions.length}</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.24em] text-white/60">Payments today</p>
              <p className="mt-2 text-3xl font-semibold text-white">{formatGHS(paymentsToday.total)}</p>
            </div>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Upcoming stays</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{upcomingBookings.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Due out today</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{dueOutToday.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open balances</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{activeBalances.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unresolved charges</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{unresolvedCharges.length}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Unconfirmed events</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Pending extension confirmations</h2>
              </div>
              <div className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-ink">{pendingExtensions.length} waiting</div>
            </div>

            <div className="mt-6 space-y-4">
              {pendingExtensions.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No pending stay confirmations right now.</div> : null}
              {pendingExtensions.map((audit) => {
                const booking = pickSingle(audit.bookings)
                const room = pickSingle(booking?.rooms)

                return (
                  <div key={audit.id} className="rounded-[1.5rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-2xl font-semibold text-ink">{booking?.guest_name ?? 'Unknown guest'}</p>
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase text-amber-800">Pending review</span>
                        </div>
                        <p className="mt-2 text-sm text-ink/65">
                          Room {room?.number ?? 'Unassigned'} · Extended from {formatDate(audit.previous_check_out_expected)} to {formatDate(audit.new_check_out_expected)}
                        </p>
                        <p className="mt-1 text-sm text-ink/65">Requested by {audit.requested_by} ({audit.requester_role}) at {formatDateTime(audit.created_at)}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-right">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Added charge</p>
                        <p className="text-xl font-semibold text-ink">{formatGHS(audit.incremental_amount_ghs)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Reason</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{audit.reason}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recorded now</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatGHS(audit.payment_recorded_ghs)}</p>
                        <p className="mt-1 text-sm text-ink/55">{audit.payment_method ? audit.payment_method.replace('_', ' ') : 'No payment method recorded'}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Current stay total</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatGHS(booking?.total_ghs ?? 0)}</p>
                        <p className="mt-1 text-sm text-ink/55">Balance {formatGHS(Number(booking?.balance_ghs ?? (booking ? booking.total_ghs - booking.paid_ghs : 0)))}</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Reference</p>
                        <p className="mt-2 text-sm leading-6 text-ink/72">{audit.payment_reference ?? 'No reference recorded'}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                      <textarea
                        className="min-h-[108px] w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-terracotta"
                        onChange={(event) => setReviewNotes((current) => ({ ...current, [audit.id]: event.target.value }))}
                        placeholder="Optional manager note for confirmation, required if you mark a discrepancy."
                        value={reviewNotes[audit.id] ?? ''}
                      />
                      <div className="flex flex-wrap items-end gap-3 lg:flex-col lg:items-stretch">
                        <button
                          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => runReview(audit.id, 'confirm_extension')}
                          type="button"
                        >
                          Confirm extension
                        </button>
                        <button
                          className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => runReview(audit.id, 'flag_extension')}
                          type="button"
                        >
                          Mark discrepancy
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Operational alerts</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Unread notifications</h2>
              <div className="mt-5 space-y-3">
                {unreadNotifications.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No unread notifications.</div> : null}
                {unreadNotifications.map((notification) => {
                  const booking = pickSingle(notification.bookings)
                  return (
                    <div key={notification.id} className="rounded-2xl bg-[#fcfaf6] p-4">
                      <p className="text-sm font-semibold text-ink">{notification.message}</p>
                      <p className="mt-2 text-sm text-ink/60">{booking?.guest_name ?? 'General event'} · {formatDateTime(notification.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Revenue exceptions</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Unresolved charges</h2>
              <div className="mt-5 space-y-3">
                {unresolvedCharges.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No unresolved service charges.</div> : null}
                {unresolvedCharges.map((charge) => {
                  const booking = pickSingle(charge.bookings)
                  const room = pickSingle(booking?.rooms)
                  return (
                    <div key={charge.id} className="rounded-2xl bg-[#fcfaf6] p-4">
                      <p className="text-sm font-semibold text-ink">{charge.type.replace('_', ' ')} · {formatGHS(charge.amount_ghs)}</p>
                      <p className="mt-2 text-sm text-ink/60">
                        {booking?.guest_name ?? 'Unknown guest'} · Room {room?.number ?? 'Unassigned'} · {charge.description ?? 'No description'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Upcoming stays</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Arrivals in the next 48 hours</h2>
              </div>
              <div className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-ink">{upcomingBookings.length} upcoming</div>
            </div>

            <div className="mt-6 space-y-3">
              {upcomingBookings.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No imminent arrivals.</div> : null}
              {upcomingBookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl bg-[#fcfaf6] p-4">
                  <p className="text-lg font-semibold text-ink">{booking.guest_name}</p>
                  <p className="mt-1 text-sm text-ink/60">{summarizeUpcoming(booking)}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Active stays</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Due outs, balances, and recent changes</h2>
              </div>
              <div className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-ink">{recentExtensions.length} changed today</div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-[1.5rem] bg-[#fcfaf6] p-4">
                <p className="text-sm font-semibold text-ink/75">Due out today</p>
                {dueOutToday.length === 0 ? <p className="text-sm text-ink/60">No due-outs today.</p> : null}
                {dueOutToday.map((booking) => (
                  <div key={booking.id} className="rounded-2xl bg-white p-4">
                    <p className="font-semibold text-ink">{booking.guest_name}</p>
                    <p className="mt-1 text-sm text-ink/60">Room {pickSingle(booking.rooms)?.number ?? 'Unassigned'} · {formatDate(booking.check_out_expected)}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3 rounded-[1.5rem] bg-[#fcfaf6] p-4">
                <p className="text-sm font-semibold text-ink/75">Open balances</p>
                {activeBalances.length === 0 ? <p className="text-sm text-ink/60">No active stays with balances.</p> : null}
                {activeBalances.map((booking) => (
                  <div key={booking.id} className="rounded-2xl bg-white p-4">
                    <p className="font-semibold text-ink">{booking.guest_name}</p>
                    <p className="mt-1 text-sm text-ink/60">Balance {formatGHS(Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs))}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[1.5rem] bg-parchment p-4">
              <p className="text-sm font-semibold text-ink/75">Recent extension activity</p>
              <div className="mt-3 space-y-3">
                {recentExtensions.length === 0 ? <p className="text-sm text-ink/60">No extension activity recorded today.</p> : null}
                {recentExtensions.map((audit) => {
                  const booking = pickSingle(audit.bookings)
                  return (
                    <div key={audit.id} className="rounded-2xl bg-white p-4">
                      <p className="font-semibold text-ink">{booking?.guest_name ?? 'Unknown guest'} · {formatGHS(audit.incremental_amount_ghs)}</p>
                      <p className="mt-1 text-sm text-ink/60">{audit.confirmation_status.replace('_', ' ')} · {formatDateTime(audit.created_at)}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Rooms needing attention</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">House status at a glance</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(roomStats).map(([status, count]) => (
                <div key={status} className="rounded-[1.5rem] bg-[#fcfaf6] p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">{status}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Cash today</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Collection snapshot</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[1.5rem] bg-[#fcfaf6] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Payments recorded</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{paymentsToday.count}</p>
              </div>
              <div className="rounded-[1.5rem] bg-[#fcfaf6] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Value collected</p>
                <p className="mt-2 text-3xl font-semibold text-ink">{formatGHS(paymentsToday.total)}</p>
              </div>
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}