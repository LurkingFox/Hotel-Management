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
type PayMethod = Database['public']['Enums']['pay_method']
type BookingStatus = Database['public']['Enums']['booking_status']
type GuestKycStatus = Database['public']['Enums']['guest_kyc_status']

type BookingWithRoom = BookingRow & {
  guest_profiles:
    | Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>
    | Array<Pick<GuestProfileRow, 'id' | 'full_name' | 'phone' | 'email' | 'kyc_status' | 'nationality'>>
    | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

type ExtensionState = {
  acknowledged: boolean
  method: PayMethod
  paymentAmount: string
  reason: string
  reference: string
}

type ReceptionDeskClientProps = {
  accessCredentials: Array<Pick<AccessCredentialRow, 'booking_id' | 'credential_code' | 'status' | 'valid_until'>>
  accessPresentation: BookingAccessPresentation
  bookings: BookingWithRoom[]
  currentRole: string | null
  guestPortalLinks: Map<string, string>
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

const kycStyles: Record<GuestKycStatus, string> = {
  not_started: 'bg-stone-100 border-stone-200 text-stone-700',
  pending: 'bg-amber-50 border-amber-200 text-amber-800',
  verified: 'bg-green-50 border-green-200 text-green-800',
  rejected: 'bg-red-50 border-red-200 text-red-700'
}

function formatInputDate(offsetDays = 0) {
  const current = new Date()
  current.setDate(current.getDate() + offsetDays)
  return current.toISOString().split('T')[0]
}

function needsReference(method: PayMethod) {
  return method === 'momo' || method === 'bank_transfer' || method === 'cheque'
}

function getNightCount(checkIn: string, checkOut: string) {
  const difference = Date.parse(checkOut) - Date.parse(checkIn)
  return Math.max(1, Math.ceil(difference / 86400000))
}

function getGuestProfile(
  profile:
    | BookingWithRoom['guest_profiles']
    | null
) {
  return Array.isArray(profile) ? profile[0] ?? null : profile
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

export function ReceptionDeskClient({ accessCredentials, accessPresentation, bookings, currentRole, guestPortalLinks, rooms }: ReceptionDeskClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [roomId, setRoomId] = useState(rooms.find((room) => room.status === 'vacant')?.id ?? '')
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestNationality, setGuestNationality] = useState('')
  const [guestCity, setGuestCity] = useState('')
  const [guestDateOfBirth, setGuestDateOfBirth] = useState('')
  const [checkIn, setCheckIn] = useState(formatInputDate())
  const [checkOutExpected, setCheckOutExpected] = useState(formatInputDate(1))
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>('reserved')
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>('cash')
  const [paymentAmount, setPaymentAmount] = useState('0')
  const [paymentReference, setPaymentReference] = useState('')
  const [checkoutSettlement, setCheckoutSettlement] = useState<Record<string, { amount: string; method: PayMethod; reference: string }>>({})
  const [extendDates, setExtendDates] = useState<Record<string, string>>({})
  const [extensionState, setExtensionState] = useState<Record<string, ExtensionState>>({})
  const [extensionReviewBookingId, setExtensionReviewBookingId] = useState<string | null>(null)

  const availableRooms = useMemo(() => rooms.filter((room) => room.status === 'vacant'), [rooms])
  const selectedRoom = rooms.find((entry) => entry.id === roomId) ?? null
  const nights = useMemo(() => getNightCount(checkIn, checkOutExpected), [checkIn, checkOutExpected])
  const totalGhs = (selectedRoom?.rate_ghs ?? 0) * nights

  const reservedBookings = bookings.filter((booking) => booking.status === 'reserved')
  const activeBookings = bookings.filter((booking) => booking.status === 'active')
  const extensionReviewBooking = extensionReviewBookingId ? activeBookings.find((booking) => booking.id === extensionReviewBookingId) ?? null : null
  const activeCredentialByBookingId = useMemo(
    () => new Map(accessCredentials.filter((credential) => credential.credential_code).map((credential) => [credential.booking_id, credential])),
    [accessCredentials]
  )

  function getGuestPortalHref(bookingId: string) {
    return guestPortalLinks.get(bookingId) ?? null
  }

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
          guestEmail,
          guestNationality,
          guestCity,
          guestDateOfBirth,
          guestPhone,
          checkIn,
          checkOutExpected,
          totalGhs,
          status: bookingStatus,
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
      setGuestEmail('')
      setGuestNationality('')
      setGuestCity('')
      setGuestDateOfBirth('')
      setPaymentAmount('0')
      setPaymentReference('')
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

    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          action: 'check_in',
          issuedTo
        })
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Check-in failed.')
        return
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

  function getExtensionForm(bookingId: string): ExtensionState {
    return extensionState[bookingId] ?? {
      acknowledged: false,
      method: 'cash',
      paymentAmount: '',
      reason: '',
      reference: ''
    }
  }

  function validateExtensionForm(booking: BookingWithRoom, form: ExtensionState, nextDate: string) {
    const paymentAmountValue = form.paymentAmount ? Number(form.paymentAmount) : 0

    if (Date.parse(nextDate) <= Date.parse(booking.check_out_expected)) {
      return 'Extended checkout date must be after the current checkout date.'
    }

    if (currentRole === 'receptionist' && !form.reason.trim()) {
      return 'Reception must record the reason for the stay extension.'
    }

    if (needsReference(form.method) && paymentAmountValue > 0 && !form.reference.trim()) {
      return 'Payment reference is required for this payment method.'
    }

    return null
  }

  function openExtensionReview(booking: BookingWithRoom) {
    resetMessages()
    const nextDate = extendDates[booking.id] ?? booking.check_out_expected
    const form = getExtensionForm(booking.id)
    const validationError = validateExtensionForm(booking, form, nextDate)

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setExtensionReviewBookingId(booking.id)
  }

  function handleExtend(booking: BookingWithRoom) {
    resetMessages()
    const nextDate = extendDates[booking.id] ?? booking.check_out_expected
    const form = getExtensionForm(booking.id)
    const validationError = validateExtensionForm(booking, form, nextDate)
    const paymentAmountValue = form.paymentAmount ? Number(form.paymentAmount) : 0

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    if (currentRole === 'receptionist' && !form.acknowledged) {
      setErrorMessage('Reception must accept the accountability confirmation before extending the stay.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'extend',
          bookingId: booking.id,
          extensionAcknowledged: currentRole === 'receptionist' ? form.acknowledged : undefined,
          extensionAuthorization: form.reason.trim() ? { reason: form.reason.trim() } : undefined,
          extensionPayment:
            paymentAmountValue > 0
              ? {
                  amountGhs: paymentAmountValue,
                  method: form.method,
                  reference: form.reference.trim() || null
                }
              : undefined,
          newCheckOutExpected: nextDate
        })
      })

      const payload = (await response.json()) as BookingMutationResponse

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Stay extension failed.')
        return
      }

      setExtensionState((current) => ({
        ...current,
        [booking.id]: {
          acknowledged: false,
          method: 'cash',
          paymentAmount: '',
          reason: '',
          reference: ''
        }
      }))
      setExtensionReviewBookingId(null)
      refreshWithMessage(formatAccessSuccess(payload, 'Stay extended successfully.'))
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="reception-desk">
      <span className="sr-only">smoke:reception-desk</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Desk</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Run arrivals, walk-ins, stay changes, and checkout handling from one live desk surface.</p>
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
              <div className="ui-panel-soft px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Projected total</p>
                <p className="text-2xl font-semibold text-ink">{formatGHS(totalGhs)}</p>
              </div>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleCreateBooking}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Guest name</span>
                  <input
                    className="ui-input"
                    onChange={(event) => setGuestName(event.target.value)}
                    required
                    value={guestName}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Phone</span>
                  <input
                    className="ui-input"
                    onChange={(event) => setGuestPhone(event.target.value)}
                    value={guestPhone}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Email</span>
                  <input
                    className="ui-input"
                    onChange={(event) => setGuestEmail(event.target.value)}
                    placeholder="Optional for guest portal onboarding"
                    value={guestEmail}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Nationality</span>
                  <input
                    className="ui-input"
                    onChange={(event) => setGuestNationality(event.target.value)}
                    placeholder="Optional"
                    value={guestNationality}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">City</span>
                  <input
                    className="ui-input"
                    onChange={(event) => setGuestCity(event.target.value)}
                    placeholder="Home city or residence"
                    value={guestCity}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Date of birth</span>
                  <input
                    className="ui-input"
                    onChange={(event) => setGuestDateOfBirth(event.target.value)}
                    type="date"
                    value={guestDateOfBirth}
                  />
                </label>
              </div>

              <div className="ui-panel-muted px-4 py-4 text-sm text-ink/62">
                These identity fields feed the guest profile and KYC workspace so future stays and guest self-service do not start from scratch.
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Room</span>
                  <select
                    className="ui-input"
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
                    className="ui-input"
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
                    className="ui-input"
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
                      className={bookingStatus === option.value ? 'ui-chip-active px-5 py-3' : 'ui-chip px-5 py-3'}
                      onClick={() => setBookingStatus(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {bookingStatus === 'active' ? (
                <div className="ui-panel-muted bg-white px-4 py-3 text-sm text-ink/65">
                  {accessPresentation.generatedCredentialLabel} will be generated automatically after the guest is checked in.
                </div>
              ) : null}

              <div className="ui-panel-soft p-5">
                <p className="text-sm font-semibold text-ink/75">Initial payment</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      className={paymentMethod === method.value ? 'ui-chip-active px-4 py-2' : `rounded-full px-4 py-2 text-sm font-semibold transition ${method.tone}`}
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
                      className="ui-input"
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
                      className="ui-input"
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
                <div key={room.id} className="ui-panel-soft border border-ink/10 p-4">
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
              <div className="ui-pill">{reservedBookings.length} pending</div>
            </div>

            <div className="mt-6 space-y-4">
              {reservedBookings.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No pending arrivals.</div> : null}
              {reservedBookings.map((booking) => (
                <div key={booking.id} className="ui-panel-soft border border-ink/10 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      {(() => {
                        const guestProfile = getGuestProfile(booking.guest_profiles)

                        return (
                          <>
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xl font-semibold text-ink">{booking.guest_name}</p>
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${guestProfile ? kycStyles[guestProfile.kyc_status] : 'bg-stone-100 border-stone-200 text-stone-700'}`}
                              >
                                {guestProfile ? formatLabel(guestProfile.kyc_status) : 'profile linked'}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-ink/65">
                              Room {booking.rooms?.number ?? 'Unassigned'} · {formatDate(booking.check_in)} to {formatDate(booking.check_out_expected)}
                            </p>
                            <p className="mt-2 text-sm text-ink/65">Balance: {formatGHS(Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs))}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink/60">
                              <span>{guestProfile?.email || booking.guest_phone || 'No contact captured yet'}</span>
                              <Link className="font-semibold text-ink underline-offset-4 hover:underline" href="/reception/guests">
                                Open guest profile desk
                              </Link>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                    <div className="w-full max-w-xs space-y-3">
                      <div className="ui-panel-muted bg-white px-4 py-3 text-sm text-ink/65">
                        {accessPresentation.generatedCredentialLabel} will be generated automatically.
                      </div>
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
              <div className="ui-pill">{activeBookings.length} in house</div>
            </div>

            <div className="mt-6 space-y-4">
              {activeBookings.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No active stays yet.</div> : null}
              {activeBookings.map((booking) => {
                const balance = Number(booking.balance_ghs ?? booking.total_ghs - booking.paid_ghs)
                const settlement = checkoutSettlement[booking.id] ?? { amount: '', method: 'cash' as PayMethod, reference: '' }
                const nextExtensionDate = extendDates[booking.id] ?? booking.check_out_expected
                const extensionForm = getExtensionForm(booking.id)
                const projectedTotal = (booking.rooms?.rate_ghs ?? 0) * getNightCount(booking.check_in, nextExtensionDate)
                const additionalCharge = Math.max(0, projectedTotal - booking.total_ghs)
                const guestProfile = getGuestProfile(booking.guest_profiles)
                const guestPortalHref = getGuestPortalHref(booking.id)
                const activeCredential = activeCredentialByBookingId.get(booking.id)

                return (
                  <div key={booking.id} className="ui-panel-soft border border-ink/10 p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xl font-semibold text-ink">{booking.guest_name}</p>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${guestProfile ? kycStyles[guestProfile.kyc_status] : 'bg-stone-100 border-stone-200 text-stone-700'}`}>
                              {guestProfile ? formatLabel(guestProfile.kyc_status) : 'profile linked'}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-ink/65">
                            Room {booking.rooms?.number ?? 'Unassigned'} · Due out {formatDate(booking.check_out_expected)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink/60">
                            <span>{guestProfile?.email || booking.guest_phone || 'No contact captured yet'}</span>
                            <Link className="font-semibold text-ink underline-offset-4 hover:underline" href="/reception/guests">
                              Open guest profile desk
                            </Link>
                            {guestPortalHref ? (
                              <Link className="font-semibold text-ink underline-offset-4 hover:underline" href={guestPortalHref} target="_blank">
                                Open guest portal
                              </Link>
                            ) : null}
                          </div>
                        </div>
                        <div className="ui-panel-soft px-4 py-3 text-right">
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
                                className={settlement.method === method.value ? 'ui-chip-active px-4 py-2' : `rounded-full px-4 py-2 text-sm font-semibold transition ${method.tone}`}
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
                              className="ui-input"
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
                              className="ui-input"
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

                      {guestPortalHref ? (
                        <div className="rounded-2xl border border-ink/10 bg-white p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-ink/75">Guest portal handoff</p>
                              <p className="mt-1 text-sm text-ink/60">
                                Share the active portal so the guest can see their current balance and stay details.
                              </p>
                              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/45">
                                Access code {activeCredential?.credential_code} {activeCredential?.valid_until ? `· valid until ${formatDate(activeCredential.valid_until)}` : ''}
                              </p>
                            </div>
                            <Link className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90" href={guestPortalHref} target="_blank">
                              Open portal
                            </Link>
                          </div>
                        </div>
                      ) : null}

                      {guestPortalHref ? (
                        <GuestPortalHandoffCard
                          guestName={booking.guest_name}
                          portalHref={guestPortalHref}
                          roomLabel={`Room ${booking.rooms?.number ?? 'Unassigned'}`}
                          validUntil={activeCredential?.valid_until ?? null}
                        />
                      ) : null}

                      <div className="rounded-2xl border border-ink/10 bg-white p-4">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-ink/75">Extend stay and access validity</p>
                            <p className="mt-1 text-sm text-ink/60">
                              The system recalculates the stay total automatically. Reception extensions apply immediately and remain pending manager confirmation until reviewed.
                            </p>
                          </div>
                          <div className="ui-panel-soft px-4 py-3 text-right">
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Added charge</p>
                            <p className="text-xl font-semibold text-ink">{formatGHS(additionalCharge)}</p>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-ink/75">New checkout date</span>
                            <input
                              className="ui-input"
                              min={booking.check_out_expected}
                              onChange={(event) => setExtendDates((current) => ({ ...current, [booking.id]: event.target.value }))}
                              type="date"
                              value={nextExtensionDate}
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="text-sm font-semibold text-ink/75">Reason for extension</span>
                            <input
                              className="ui-input"
                              onChange={(event) =>
                                setExtensionState((current) => ({
                                  ...current,
                                  [booking.id]: { ...extensionForm, reason: event.target.value }
                                }))
                              }
                              placeholder="Late flight, guest requested extra night, payment pending, etc."
                              value={extensionForm.reason}
                            />
                          </label>
                        </div>

                        <div className="ui-panel-muted mt-4 px-4 py-3 text-sm text-ink/65">
                          {currentRole === 'receptionist'
                            ? 'Reception extensions become pending manager confirmation after the final review. Managers will see them immediately on Today.'
                            : 'Admin users confirm the extension directly at the final review step.'}
                        </div>

                        <div className="ui-panel-soft mt-4 p-4">
                          <p className="text-sm font-semibold text-ink/75">Optional payment recorded now</p>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {paymentMethods.map((method) => (
                              <button
                                key={`${booking.id}-extend-${method.value}`}
                                className={extensionForm.method === method.value ? 'ui-chip-active px-4 py-2' : `rounded-full px-4 py-2 text-sm font-semibold transition ${method.tone}`}
                                onClick={() =>
                                  setExtensionState((current) => ({
                                    ...current,
                                    [booking.id]: { ...extensionForm, method: method.value }
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
                              className="ui-input"
                              max={Math.max(0, projectedTotal - booking.paid_ghs)}
                              min="0"
                              onChange={(event) =>
                                setExtensionState((current) => ({
                                  ...current,
                                  [booking.id]: { ...extensionForm, paymentAmount: event.target.value }
                                }))
                              }
                              placeholder="Amount collected now"
                              step="0.01"
                              type="number"
                              value={extensionForm.paymentAmount}
                            />
                            <input
                              className="ui-input"
                              onChange={(event) =>
                                setExtensionState((current) => ({
                                  ...current,
                                  [booking.id]: { ...extensionForm, reference: event.target.value }
                                }))
                              }
                              placeholder={needsReference(extensionForm.method) ? 'Reference required for this method' : 'Optional reference'}
                              value={extensionForm.reference}
                            />
                          </div>
                        </div>

                        <button
                          className="mt-4 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => openExtensionReview(booking)}
                          type="button"
                        >
                          Review extension
                        </button>
                      </div>

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

      {extensionReviewBooking ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/45 backdrop-blur-sm">
          <button
            aria-label="Close extension review"
            className="flex-1 cursor-default"
            onClick={() => setExtensionReviewBookingId(null)}
            type="button"
          />
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-ink/10 bg-surface-sunken p-6 shadow-2xl">
            {(() => {
              const form = getExtensionForm(extensionReviewBooking.id)
              const nextDate = extendDates[extensionReviewBooking.id] ?? extensionReviewBooking.check_out_expected
              const paymentAmountValue = form.paymentAmount ? Number(form.paymentAmount) : 0
              const projectedTotal = (extensionReviewBooking.rooms?.rate_ghs ?? 0) * getNightCount(extensionReviewBooking.check_in, nextDate)
              const additionalCharge = Math.max(0, projectedTotal - extensionReviewBooking.total_ghs)
              const remainingBalance = Math.max(0, projectedTotal - (extensionReviewBooking.paid_ghs + paymentAmountValue))

              return (
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Final review</p>
                      <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Confirm stay extension</h2>
                      <p className="mt-3 text-sm leading-6 text-ink/65">
                        Review the full financial impact before changing the guest stay and access validity.
                      </p>
                    </div>
                    <button
                      className="ui-button-secondary px-4 py-2"
                      onClick={() => setExtensionReviewBookingId(null)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-6 rounded-[1.75rem] border border-ink/10 bg-white p-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-2xl font-semibold text-ink">{extensionReviewBooking.guest_name}</p>
                        <p className="mt-1 text-sm text-ink/65">
                          Room {extensionReviewBooking.rooms?.number ?? 'Unassigned'} · {formatDate(extensionReviewBooking.check_in)} to {formatDate(nextDate)}
                        </p>
                      </div>
                      <div className="ui-panel-soft px-4 py-3 text-right">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Added charge</p>
                        <p className="text-2xl font-semibold text-ink">{formatGHS(additionalCharge)}</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="ui-panel-soft p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Current checkout</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatDate(extensionReviewBooking.check_out_expected)}</p>
                      </div>
                      <div className="ui-panel-soft p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">New checkout</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatDate(nextDate)}</p>
                      </div>
                      <div className="ui-panel-soft p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Payment recorded now</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatGHS(paymentAmountValue)}</p>
                      </div>
                      <div className="ui-panel-soft p-4">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Remaining balance</p>
                        <p className="mt-2 text-lg font-semibold text-ink">{formatGHS(remainingBalance)}</p>
                      </div>
                    </div>

                    <div className="ui-panel-soft mt-5 p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Reason recorded</p>
                      <p className="mt-2 text-sm leading-6 text-ink/72">{form.reason.trim() || 'No reason provided.'}</p>
                    </div>

                    {additionalCharge > 0 && paymentAmountValue === 0 ? (
                      <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        No payment is being recorded for this extension. The booking balance will increase immediately.
                      </div>
                    ) : null}

                    <div className="ui-panel-muted mt-5 bg-white p-4 text-sm text-ink/65">
                      {currentRole === 'receptionist'
                        ? 'After you confirm, the stay will extend immediately and appear as pending manager confirmation on Today.'
                        : 'As an admin, confirming here finalizes the extension immediately and records your approval in the audit trail.'}
                    </div>

                    {currentRole === 'receptionist' ? (
                      <label className="mt-5 flex items-start gap-3 rounded-2xl bg-ink px-4 py-4 text-sm text-white">
                        <input
                          checked={form.acknowledged}
                          className="mt-1 h-4 w-4 rounded border-white/40 text-accent focus:ring-accent"
                          onChange={(event) =>
                            setExtensionState((current) => ({
                              ...current,
                              [extensionReviewBooking.id]: { ...form, acknowledged: event.target.checked }
                            }))
                          }
                          type="checkbox"
                        />
                        <span>
                          I confirm this extension is intentional, I accept responsibility for it, and I will notify the manager for review.
                        </span>
                      </label>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-3">
                      <button
                        className="ui-button-secondary px-5 py-3"
                        onClick={() => setExtensionReviewBookingId(null)}
                        type="button"
                      >
                        Back
                      </button>
                      <button
                        className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isPending || (currentRole === 'receptionist' && !form.acknowledged)}
                        onClick={() => handleExtend(extensionReviewBooking)}
                        type="button"
                      >
                        {currentRole === 'receptionist' ? 'Extend stay and mark pending confirmation' : 'Extend stay now'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}
    </main>
  )
}