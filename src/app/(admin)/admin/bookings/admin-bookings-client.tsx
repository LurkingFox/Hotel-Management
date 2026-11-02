'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { GuestPortalHandoffCard } from '@/components/guest-portal-handoff-card'
import type { BookingAccessPresentation } from '@/lib/access-provider/types'
import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type GuestProfileRow = Database['public']['Tables']['guest_profiles']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']
type BookingStatus = Database['public']['Enums']['booking_status']
type PayMethod = Database['public']['Enums']['pay_method']
type GuestKycStatus = Database['public']['Enums']['guest_kyc_status']

type BookingWithRoom = BookingRow & {
  guest_profiles:
    | Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>
    | Array<Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>>
    | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

type PendingExtensionAudit = Pick<
  Database['public']['Tables']['booking_extension_audits']['Row'],
  'id' | 'booking_id' | 'requested_by' | 'reason' | 'created_at' | 'incremental_amount_ghs' | 'new_check_out_expected' | 'confirmation_status'
>

type AdminBookingsClientProps = {
  accessPresentation: BookingAccessPresentation
  accessCredentials: Array<Pick<AccessCredentialRow, 'booking_id' | 'credential_code' | 'status' | 'valid_until'>>
  bookings: BookingWithRoom[]
  guestPortalLinks: Map<string, string>
  pendingExtensionAudits: PendingExtensionAudit[]
  rooms: RoomRow[]
}

type SettlementState = {
  amount: string
  method: PayMethod
  reference: string
}

type BookingMutationResponse = {
  access?: {
    code?: string | null
    label?: string | null
    note?: string | null
    provider?: string | null
  }
  error?: string
  message?: string
}

function formatAccessSuccess(payload: BookingMutationResponse, fallback: string) {
  if (!payload.message) {
    return fallback
  }

  return payload.access?.code ? `${payload.message} Code: ${payload.access.code}.` : payload.message
}

const statusStyles: Record<BookingStatus, string> = {
  reserved: 'bg-purple-50 border-purple-200 text-purple-800',
  active: 'bg-amber-50 border-amber-200 text-amber-800',
  checked_out: 'bg-green-50 border-green-200 text-green-800',
  cancelled: 'bg-red-50 border-red-200 text-red-800'
}

const kycStyles: Record<GuestKycStatus, string> = {
  not_started: 'bg-stone-100 border-stone-200 text-stone-700',
  pending: 'bg-amber-50 border-amber-200 text-amber-800',
  verified: 'bg-green-50 border-green-200 text-green-800',
  rejected: 'bg-red-50 border-red-200 text-red-700'
}

const paymentMethods: Array<{ label: string; tone: string; value: PayMethod }> = [
  { label: 'Cash', value: 'cash', tone: 'bg-green-100 text-green-800' },
  { label: 'MoMo', value: 'momo', tone: 'bg-blue-100 text-blue-800' },
  { label: 'Bank Transfer', value: 'bank_transfer', tone: 'bg-teal-100 text-teal-800' },
  { label: 'Cheque', value: 'cheque', tone: 'bg-gray-100 text-gray-700' }
]

function needsReference(method: PayMethod) {
  return method === 'momo' || method === 'bank_transfer' || method === 'cheque'
}

function getNightCount(checkIn: string, checkOut: string) {
  const difference = Date.parse(checkOut) - Date.parse(checkIn)
  return Math.max(1, Math.ceil(difference / 86400000))
}

function getGuestProfile(profile: BookingWithRoom['guest_profiles']) {
  return Array.isArray(profile) ? profile[0] ?? null : profile
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

export function AdminBookingsClient({ accessPresentation, accessCredentials, bookings, guestPortalLinks, pendingExtensionAudits, rooms }: AdminBookingsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeFilter, setActiveFilter] = useState<'all' | BookingStatus | 'pending_confirmation'>('all')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [cancelNotes, setCancelNotes] = useState<Record<string, string>>({})
  const [extendDates, setExtendDates] = useState<Record<string, string>>({})
  const [checkoutSettlement, setCheckoutSettlement] = useState<Record<string, SettlementState>>({})

  const pendingAuditByBookingId = useMemo(
    () => new Map(pendingExtensionAudits.map((audit) => [audit.booking_id, audit])),
    [pendingExtensionAudits]
  )
  const activeCredentialByBookingId = useMemo(
    () => new Map(accessCredentials.filter((credential) => credential.credential_code).map((credential) => [credential.booking_id, credential])),
    [accessCredentials]
  )

  const filteredBookings = useMemo(() => {
    if (activeFilter === 'all') {
      return bookings
    }

    if (activeFilter === 'pending_confirmation') {
      return bookings.filter((booking) => pendingAuditByBookingId.has(booking.id))
    }

    return bookings.filter((booking) => booking.status === activeFilter)
  }, [activeFilter, bookings, pendingAuditByBookingId])

  const summary = useMemo(() => {
    return {
      total: bookings.length,
      active: bookings.filter((booking) => booking.status === 'active').length,
      pendingConfirmations: pendingExtensionAudits.length,
      reserved: bookings.filter((booking) => booking.status === 'reserved').length,
      outstanding: bookings.reduce((sum, booking) => sum + (booking.balance_ghs ?? 0), 0)
    }
  }, [bookings, pendingExtensionAudits.length])

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function refreshWithMessage(message: string) {
    setSuccessMessage(message)
    router.refresh()
  }

  function getGuestPortalHref(bookingId: string) {
    return guestPortalLinks.get(bookingId) ?? null
  }

  function runAction(body: Record<string, unknown>, successText: string) {
    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Booking update failed.')
        return
      }

      refreshWithMessage(formatAccessSuccess(payload, successText))
    })
  }

  function handleCheckIn(booking: BookingWithRoom) {
    resetMessages()

    runAction(
      {
        bookingId: booking.id,
        action: 'check_in',
        issuedTo: booking.guest_name
      },
      `Reservation checked in and ${accessPresentation.generatedCredentialLabel.toLowerCase()} issued.`
    )
  }

  function handleCancel(booking: BookingWithRoom) {
    resetMessages()

    runAction(
      {
        bookingId: booking.id,
        action: 'cancel',
        cancelNote: cancelNotes[booking.id]?.trim() || 'Cancelled by admin.'
      },
      'Reservation cancelled.'
    )
  }

  function handleExtend(booking: BookingWithRoom) {
    resetMessages()
    const nextDate = extendDates[booking.id] ?? booking.check_out_expected

    if (Date.parse(nextDate) <= Date.parse(booking.check_out_expected)) {
      setErrorMessage('Extended checkout date must be after the current checkout date.')
      return
    }

    runAction(
      {
        bookingId: booking.id,
        action: 'extend',
        newCheckOutExpected: nextDate
      },
      `Stay extended and ${accessPresentation.credentialKindLabel.toLowerCase()} updated.`
    )
  }

  function handleCheckout(booking: BookingWithRoom) {
    resetMessages()
    const settlement = checkoutSettlement[booking.id] ?? {
      amount: String(booking.balance_ghs ?? 0),
      method: 'cash' as PayMethod,
      reference: ''
    }
    const amount = settlement.amount ? Number(settlement.amount) : 0

    if (needsReference(settlement.method) && amount > 0 && !settlement.reference.trim()) {
      setErrorMessage('Settlement reference is required for this payment method.')
      return
    }

    runAction(
      {
        bookingId: booking.id,
        action: 'checkout',
        settlement:
          amount > 0
            ? {
                amountGhs: amount,
                method: settlement.method,
                reference: settlement.reference.trim() || null
              }
            : undefined
      },
      'Booking checked out and room moved to cleaning.'
    )
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="admin-bookings">
      <span className="sr-only">smoke:admin-bookings</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Guest stays</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Manage arrivals, in-house stays, extensions, cancellations, and checkout progress.</p>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Total bookings</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.total}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Active stays</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.active}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Reserved arrivals</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.reserved}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Outstanding balance</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(summary.outstanding)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Pending confirmations</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.pendingConfirmations}</p>
          </article>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Filter bookings</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Track every stay state</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {(['all', 'pending_confirmation', 'reserved', 'active', 'checked_out', 'cancelled'] as const).map((filter) => (
                <button
                  key={filter}
                  className={activeFilter === filter ? 'ui-chip-active' : 'ui-chip'}
                  onClick={() => setActiveFilter(filter)}
                  type="button"
                >
                  {filter === 'all' ? 'All bookings' : filter.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-5">
            {filteredBookings.map((booking) => {
              const pendingAudit = pendingAuditByBookingId.get(booking.id)
              const settlement = checkoutSettlement[booking.id] ?? {
                amount: String(booking.balance_ghs ?? 0),
                method: 'cash' as PayMethod,
                reference: ''
              }
              const extensionDate = extendDates[booking.id] ?? booking.check_out_expected
              const extensionRate = booking.rooms?.rate_ghs ?? rooms.find((room) => room.id === booking.room_id)?.rate_ghs ?? 0
              const extensionTotal = extensionRate * getNightCount(booking.check_in, extensionDate)
              const extensionIncrease = Math.max(0, extensionTotal - booking.total_ghs)
              const guestProfile = getGuestProfile(booking.guest_profiles)
              const credential = activeCredentialByBookingId.get(booking.id)
              const guestPortalHref = getGuestPortalHref(booking.id)

              return (
                <article key={booking.id} className="ui-panel-soft rounded-[1.75rem] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-2xl font-semibold text-ink">{booking.guest_name}</h3>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusStyles[booking.status]}`}>
                          {booking.status.replace('_', ' ')}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${guestProfile ? kycStyles[guestProfile.kyc_status] : 'bg-stone-100 border-stone-200 text-stone-700'}`}>
                          {guestProfile ? formatLabel(guestProfile.kyc_status) : 'profile linked'}
                        </span>
                        {pendingAudit ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-800">
                            Pending confirmation
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-3 text-sm text-ink/70 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Room</p>
                          <p className="mt-1 font-semibold text-ink">{booking.rooms ? `Room ${booking.rooms.number}` : 'Unassigned'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Stay</p>
                          <p className="mt-1 font-semibold text-ink">
                            {formatDate(booking.check_in)} to {formatDate(booking.check_out_expected)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Financials</p>
                          <p className="mt-1 font-semibold text-ink">
                            {formatGHS(booking.paid_ghs)} paid of {formatGHS(booking.total_ghs)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Balance</p>
                          <p className="mt-1 font-semibold text-ink">{formatGHS(booking.balance_ghs ?? 0)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
                      <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest profile</p>
                      <p className="mt-1 font-semibold text-ink">{guestProfile?.email || booking.guest_phone || 'No contact captured'}</p>
                      <p className="mt-1 text-xs text-ink/55">{guestProfile?.nationality || 'Nationality not captured'}</p>
                      <Link className="mt-2 inline-flex font-semibold text-ink underline-offset-4 hover:underline" href="/admin/guests">
                        Open guest workspace
                      </Link>
                    </div>
                  </div>

                  {pendingAudit ? (
                    <div className="mt-5 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-800">Pending manager confirmation</p>
                          <p className="mt-2 text-sm leading-6 text-ink/72">
                            Requested by {pendingAudit.requested_by}. Reason: {pendingAudit.reason}
                          </p>
                          <p className="mt-1 text-sm text-ink/60">
                            Added {formatGHS(pendingAudit.incremental_amount_ghs)} and extended checkout to {formatDate(pendingAudit.new_check_out_expected)}.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-ink/60">Review this item on Today.</p>
                          <Link
                            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90"
                            href="/admin/today"
                          >
                            Open Today
                          </Link>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {booking.status === 'reserved' ? (
                    <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto]">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-dashed border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                          {accessPresentation.generatedCredentialLabel} will be generated automatically at check-in.
                        </div>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold text-ink/75">Cancel note</span>
                          <input
                            className="ui-input w-full rounded-2xl px-4 py-3"
                            onChange={(event) => setCancelNotes((current) => ({ ...current, [booking.id]: event.target.value }))}
                            placeholder="Optional reason"
                            value={cancelNotes[booking.id] ?? ''}
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-end gap-3 xl:justify-end">
                        <button
                          className="ui-button-primary disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => handleCheckIn(booking)}
                          type="button"
                        >
                          Check in guest
                        </button>
                        <button
                          className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => handleCancel(booking)}
                          type="button"
                        >
                          Cancel reservation
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {booking.status === 'active' ? (
                    <div className="mt-5 grid gap-5 xl:grid-cols-2">
                      <div className="rounded-[1.5rem] bg-white p-5">
                        <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Extend stay</p>
                        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-ink/75">New checkout date</span>
                            <input
                              className="ui-input w-full rounded-2xl px-4 py-3"
                              min={booking.check_out_expected}
                              onChange={(event) => setExtendDates((current) => ({ ...current, [booking.id]: event.target.value }))}
                              type="date"
                              value={extensionDate}
                            />
                          </label>
                          <div className="flex items-end">
                            <button
                              className="ui-button-primary disabled:opacity-60"
                              disabled={isPending}
                              onClick={() => handleExtend(booking)}
                              type="button"
                            >
                              Extend by {formatGHS(extensionIncrease)}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.5rem] bg-white p-5">
                        <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Checkout settlement</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {paymentMethods.map((method) => (
                            <button
                              key={`${booking.id}-${method.value}`}
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${settlement.method === method.value ? 'bg-ink text-white' : method.tone}`}
                              onClick={() =>
                                setCheckoutSettlement((current) => ({
                                  ...current,
                                  [booking.id]: { ...settlement, method: method.value }
                                }))
                              }
                              type="button"
                            >
                              {method.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-ink/75">Settlement amount (GHS)</span>
                            <input
                              className="ui-input w-full rounded-2xl px-4 py-3"
                              min="0"
                              onChange={(event) =>
                                setCheckoutSettlement((current) => ({
                                  ...current,
                                  [booking.id]: { ...settlement, amount: event.target.value }
                                }))
                              }
                              step="0.01"
                              type="number"
                              value={settlement.amount}
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-ink/75">Reference</span>
                            <input
                              className="ui-input w-full rounded-2xl px-4 py-3"
                              onChange={(event) =>
                                setCheckoutSettlement((current) => ({
                                  ...current,
                                  [booking.id]: { ...settlement, reference: event.target.value }
                                }))
                              }
                              placeholder={needsReference(settlement.method) ? 'Required for this method' : 'Optional for cash'}
                              value={settlement.reference}
                            />
                          </label>
                        </div>
                        <button
                          className="ui-button-primary mt-4 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => handleCheckout(booking)}
                          type="button"
                        >
                          Checkout guest
                        </button>
                      </div>

                      {credential && guestPortalHref ? (
                        <div className="space-y-4 rounded-[1.5rem] bg-white p-5">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Guest portal handoff</p>
                              <h4 className="mt-2 text-xl font-semibold text-ink">Share balance and request access from admin</h4>
                              <p className="mt-2 text-sm leading-6 text-ink/65">
                                Open the guest portal directly, or hand the guest a scannable slip without sending them back to reception.
                              </p>
                            </div>
                            <Link
                              className="ui-button-primary inline-flex"
                              href={guestPortalHref}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open guest portal
                            </Link>
                          </div>

                          <GuestPortalHandoffCard
                            guestName={booking.guest_name}
                            portalHref={guestPortalHref}
                            roomLabel={booking.rooms ? `Room ${booking.rooms.number}` : 'Current stay'}
                            validUntil={credential.valid_until}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}

            {filteredBookings.length === 0 ? (
              <div className="ui-panel-muted rounded-[1.75rem] border-dashed px-6 py-10 text-center text-sm text-ink/55">
                No bookings match this filter.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}