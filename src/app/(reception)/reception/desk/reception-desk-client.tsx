'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { BookingAccessPresentation } from '@/lib/access-provider/types'
import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type PayMethod = Database['public']['Enums']['pay_method']
type BookingStatus = Database['public']['Enums']['booking_status']

type BookingWithRoom = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

type ReceptionDeskClientProps = {
  accessPresentation: BookingAccessPresentation
  bookings: BookingWithRoom[]
  rooms: RoomRow[]
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

const paymentMethods: Array<{ label: string; tone: string; value: PayMethod }> = [
  { label: 'Cash', value: 'cash', tone: 'bg-green-100 text-green-800' },
  { label: 'MoMo', value: 'momo', tone: 'bg-blue-100 text-blue-800' },
  { label: 'Bank Transfer', value: 'bank_transfer', tone: 'bg-teal-100 text-teal-800' },
  { label: 'Cheque', value: 'cheque', tone: 'bg-gray-100 text-gray-700' }
]

const statusStyles: Record<RoomRow['status'], string> = {
  vacant: 'bg-green-50 border-green-200 text-green-800',
  occupied: 'bg-amber-50 border-amber-200 text-amber-800',
  reserved: 'bg-purple-50 border-purple-200 text-purple-800',
  cleaning: 'bg-blue-50 border-blue-200 text-blue-800',
  maintenance: 'bg-red-50 border-red-200 text-red-800'
}

function formatInputDate(offsetDays = 0) {
  const current = new Date()
  current.setDate(current.getDate() + offsetDays)
  return current.toISOString().split('T')[0]
}

function needsReference(method: PayMethod) {
  return method === 'momo' || method === 'bank_transfer' || method === 'cheque'
}

export function ReceptionDeskClient({ accessPresentation, bookings, rooms }: ReceptionDeskClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [roomId, setRoomId] = useState(rooms.find((room) => room.status === 'vacant')?.id ?? '')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [checkIn, setCheckIn] = useState(formatInputDate())
  const [checkOutExpected, setCheckOutExpected] = useState(formatInputDate(1))
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('reserved')
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('cash')
  const [paymentAmount, setPaymentAmount] = useState('0')
  const [paymentReference, setPaymentReference] = useState('')
  const [cardUid, setCardUid] = useState('')
  const [checkInCardUids, setCheckInCardUids] = useState<Record<string, string>>({})
  const [checkoutSettlement, setCheckoutSettlement] = useState<Record<string, { amount: string; method: PayMethod; reference: string }>>({})

  const availableRooms = useMemo(() => rooms.filter((room) => room.status === 'vacant'), [rooms])
  const selectedRoom = rooms.find((entry) => entry.id === roomId) ?? null
  const nights = useMemo(() => {
    const difference = Date.parse(checkOutExpected) - Date.parse(checkIn)
    return Math.max(1, Math.ceil(difference / 86400000))
  }, [checkIn, checkOutExpected])
  const totalGhs = (selectedRoom?.rate_ghs ?? 0) * nights

  const reservedBookings = bookings.filter((booking) => booking.status === 'reserved')
  const activeBookings = bookings.filter((booking) => booking.status === 'active')

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function refreshWithMessage(message: string) {
    setSuccessMessage(message)
    router.refresh()
  }

  function handleCreateBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetMessages()

    if (!selectedRoom) {
      setErrorMessage('Select a vacant room before creating a booking.')
      return
    }

    if (bookingStatus === 'active' && accessPresentation.requiresManualCredential && !cardUid.trim()) {
      setErrorMessage('A card UID is required for a walk-in check-in.')
      return
    }

    if (needsReference(paymentMethod) && Number(paymentAmount) > 0 && !paymentReference.trim()) {
      setErrorMessage('Payment reference is required for this payment method.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          guestName,
          guestPhone,
          checkIn,
          checkOutExpected,
          totalGhs,
          status: bookingStatus,
          cardUid: bookingStatus === 'active' ? cardUid.trim().toUpperCase() : undefined,
          payment:
            Number(paymentAmount) > 0
              ? {
                  amountGhs: Number(paymentAmount),
                  method: paymentMethod,
                  reference: paymentReference.trim() || null
                }
              : undefined
        })
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Booking creation failed.')
        return
      }

      setGuestName('')
      setGuestPhone('')
      setPaymentAmount('0')
      setPaymentReference('')
      setCardUid('')
      refreshWithMessage(
        formatAccessSuccess(
          payload,
          bookingStatus === 'active'
            ? `Walk-in guest checked in and ${accessPresentation.generatedCredentialLabel.toLowerCase()} issued.`
            : 'Reservation created.'
        )
      )
    })
  }

  function handleCheckIn(bookingId: string, issuedTo: string) {
    resetMessages()
    const value = checkInCardUids[bookingId]?.trim().toUpperCase()

    if (accessPresentation.requiresManualCredential && !value) {
      setErrorMessage('Enter a card UID before checking in a reservation.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          action: 'check_in',
          cardUid: accessPresentation.requiresManualCredential ? value : undefined,
          issuedTo
        })
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Check-in failed.')
        return
      }

      if (accessPresentation.requiresManualCredential) {
        setCheckInCardUids((current) => ({ ...current, [bookingId]: '' }))
      }
      refreshWithMessage(
        formatAccessSuccess(payload, `Reservation checked in and ${accessPresentation.generatedCredentialLabel.toLowerCase()} issued.`)
      )
    })
  }

  function handleCheckout(booking: BookingWithRoom) {
    resetMessages()
    const settlement = checkoutSettlement[booking.id] ?? { amount: '', method: 'cash', reference: '' }
    const amount = settlement.amount ? Number(settlement.amount) : 0

    if (needsReference(settlement.method) && amount > 0 && !settlement.reference.trim()) {
      setErrorMessage('Settlement reference is required for this payment method.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Checkout failed.')
        return
      }

      setCheckoutSettlement((current) => ({
        ...current,
        [booking.id]: { amount: '', method: 'cash', reference: '' }
      }))
      refreshWithMessage(formatAccessSuccess(payload, 'Guest checked out successfully.'))
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/65">Reception Desk</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Live arrivals, stays, and checkout flow</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/75">
              <span className="rounded-full border border-white/20 px-3 py-1 font-semibold">{accessPresentation.providerLabel}</span>
            </div>
            {accessPresentation.statusNote ? <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">{accessPresentation.statusNote}</p> : null}
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">New booking</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Reservation or walk-in</h2>
              </div>
              <div className="rounded-2xl bg-parchment px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Projected total</p>
                <p className="text-2xl font-semibold text-ink">{formatGHS(totalGhs)}</p>
              </div>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleCreateBooking}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Guest name</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    onChange={(event) => setGuestName(event.target.value)}
                    required
                    value={guestName}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Phone</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    onChange={(event) => setGuestPhone(event.target.value)}
                    value={guestPhone}
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Room</span>
                  <select
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    onChange={(event) => setRoomId(event.target.value)}
                    required
                    value={roomId}
                  >
                    <option value="">Select a room</option>
                    {availableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        Room {room.number} · {room.type} · {formatGHS(room.rate_ghs)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Check in</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    min={formatInputDate()}
                    onChange={(event) => setCheckIn(event.target.value)}
                    required
                    type="date"
                    value={checkIn}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Check out</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    min={checkIn}
                    onChange={(event) => setCheckOutExpected(event.target.value)}
                    required
                    type="date"
                    value={checkOutExpected}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink/75">Booking mode</p>
                <div className="flex flex-wrap gap-3">
                  {[
                    { label: 'Reservation', value: 'reserved' as const },
                    { label: 'Walk-in Check-in', value: 'active' as const }
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`rounded-full px-5 py-3 text-sm font-semibold transition ${bookingStatus === option.value ? 'bg-ink text-white' : 'bg-parchment text-ink hover:bg-[#eadfce]'}`}
                      onClick={() => setBookingStatus(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {bookingStatus === 'active' && accessPresentation.requiresManualCredential ? (
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">{accessPresentation.manualCredentialLabel}</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 uppercase outline-none transition focus:border-terracotta"
                    onChange={(event) => setCardUid(event.target.value)}
                    placeholder={accessPresentation.manualCredentialPlaceholder}
                    value={cardUid}
                  />
                </label>
              ) : null}

              {bookingStatus === 'active' && !accessPresentation.requiresManualCredential ? (
                <div className="rounded-[1.5rem] border border-dashed border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                  {accessPresentation.generatedCredentialLabel} will be generated automatically after the guest is checked in.
                </div>
              ) : null}

              <div className="rounded-[1.5rem] bg-parchment p-5">
                <p className="text-sm font-semibold text-ink/75">Initial payment</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${paymentMethod === method.value ? 'bg-ink text-white' : method.tone}`}
                      onClick={() => setPaymentMethod(method.value)}
                      type="button"
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink/75">Amount (GHS)</span>
                    <input
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                      max={totalGhs}
                      min="0"
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      step="0.01"
                      type="number"
                      value={paymentAmount}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink/75">Reference</span>
                    <input
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                      onChange={(event) => setPaymentReference(event.target.value)}
                      placeholder={needsReference(paymentMethod) ? 'Required for this method' : 'Optional for cash'}
                      value={paymentReference}
                    />
                  </label>
                </div>
              </div>

              <button
                className="w-full rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                type="submit"
              >
                {isPending ? 'Saving...' : bookingStatus === 'active' ? 'Check in guest' : 'Create reservation'}
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Room readiness</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Live room board</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {rooms.map((room) => (
                <div key={room.id} className="rounded-2xl border border-ink/10 bg-[#fcfaf6] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">Room {room.number}</p>
                      <p className="text-sm text-ink/65">{room.type} · {formatGHS(room.rate_ghs)}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusStyles[room.status]}`}>
                      {room.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Arrivals</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Reserved bookings</h2>
              </div>
              <div className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-ink">{reservedBookings.length} pending</div>
            </div>

            <div className="mt-6 space-y-4">
              {reservedBookings.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No pending arrivals.</div> : null}
              {reservedBookings.map((booking) => (
                <div key={booking.id} className="rounded-[1.5rem] border border-ink/10 bg-[#fcfaf6] p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xl font-semibold text-ink">{booking.guest_name}</p>
                      <p className="mt-1 text-sm text-ink/65">
                        Room {booking.rooms?.number ?? 'Unassigned'} · {formatDate(booking.check_in)} to {formatDate(booking.check_out_expected)}
                      </p>
                      <p className="mt-2 text-sm text-ink/65">Balance: {formatGHS(Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs))}</p>
                    </div>
                    <div className="w-full max-w-xs space-y-3">
                      {accessPresentation.requiresManualCredential ? (
                        <input
                          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 uppercase outline-none transition focus:border-terracotta"
                          onChange={(event) => setCheckInCardUids((current) => ({ ...current, [booking.id]: event.target.value }))}
                          placeholder={`${accessPresentation.manualCredentialLabel} for check-in`}
                          value={checkInCardUids[booking.id] ?? ''}
                        />
                      ) : (
                        <div className="rounded-2xl border border-dashed border-ink/10 bg-white px-4 py-3 text-sm text-ink/65">
                          {accessPresentation.generatedCredentialLabel} will be generated automatically.
                        </div>
                      )}
                      <button
                        className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => handleCheckIn(booking.id, booking.guest_name)}
                        type="button"
                      >
                        Check in and issue {accessPresentation.credentialKindLabel.toLowerCase()}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Stays</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Active bookings</h2>
              </div>
              <div className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-ink">{activeBookings.length} in house</div>
            </div>

            <div className="mt-6 space-y-4">
              {activeBookings.length === 0 ? <div className="rounded-2xl bg-parchment p-4 text-sm text-ink/70">No active stays yet.</div> : null}
              {activeBookings.map((booking) => {
                const balance = Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs)
                const settlement = checkoutSettlement[booking.id] ?? { amount: '', method: 'cash' as PayMethod, reference: '' }

                return (
                  <div key={booking.id} className="rounded-[1.5rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-xl font-semibold text-ink">{booking.guest_name}</p>
                          <p className="mt-1 text-sm text-ink/65">
                            Room {booking.rooms?.number ?? 'Unassigned'} · Due out {formatDate(booking.check_out_expected)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-parchment px-4 py-3 text-right">
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Outstanding</p>
                          <p className="text-xl font-semibold text-ink">{formatGHS(balance)}</p>
                        </div>
                      </div>

                      {balance > 0 ? (
                        <div className="rounded-2xl border border-ink/10 bg-white p-4">
                          <p className="text-sm font-semibold text-ink/75">Settlement before checkout</p>
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
                            <input
                              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                              max={balance}
                              min="0"
                              onChange={(event) =>
                                setCheckoutSettlement((current) => ({
                                  ...current,
                                  [booking.id]: { ...settlement, amount: event.target.value }
                                }))
                              }
                              placeholder="Settlement amount"
                              step="0.01"
                              type="number"
                              value={settlement.amount}
                            />
                            <input
                              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                              onChange={(event) =>
                                setCheckoutSettlement((current) => ({
                                  ...current,
                                  [booking.id]: { ...settlement, reference: event.target.value }
                                }))
                              }
                              placeholder={needsReference(settlement.method) ? 'Settlement reference required' : 'Optional reference'}
                              value={settlement.reference}
                            />
                          </div>
                        </div>
                      ) : null}

                      <button
                        className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => handleCheckout(booking)}
                        type="button"
                      >
                        Checkout guest
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}