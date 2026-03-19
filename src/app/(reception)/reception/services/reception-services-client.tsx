'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { Database } from '@/lib/supabase/types'
import { formatDate, formatGHS } from '@/lib/utils/format'

type ChargeType = Database['public']['Enums']['charge_type']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']

type ActiveBooking = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'rate_ghs' | 'status'> | null
}

type ServiceChargeWithBooking = ServiceChargeRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | null
      })
    | null
}

type ReceptionServicesClientProps = {
  activeBookings: ActiveBooking[]
  serviceCharges: ServiceChargeWithBooking[]
}

const PAGE_SIZE = 8

const chargeTypes: Array<{ detail: string; tone: string; value: ChargeType }> = [
  { value: 'laundry', detail: 'Washing, pressing, linen support', tone: 'bg-[#f4ead9] text-[#7a5530]' },
  { value: 'food', detail: 'Kitchen tickets and room delivery', tone: 'bg-[#e6f3ea] text-[#255b40]' },
  { value: 'minibar', detail: 'In-room refreshment consumption', tone: 'bg-[#e8eef8] text-[#2d4e83]' },
  { value: 'other', detail: 'Extra towels, transfers, and misc.', tone: 'bg-[#f1ebf6] text-[#6a4c8d]' }
]

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

function normalizeQuery(value: string) {
  return value.trim().toLowerCase()
}

function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) {
    return true
  }

  return values.some((value) => value?.toLowerCase().includes(query))
}

function paginate<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE

  return {
    items: items.slice(start, start + PAGE_SIZE),
    page: safePage,
    totalPages
  }
}

export function ReceptionServicesClient({ activeBookings, serviceCharges }: ReceptionServicesClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedBookingId, setSelectedBookingId] = useState(activeBookings[0]?.id ?? '')
  const [chargeType, setChargeType] = useState<ChargeType>('laundry')
  const [amountGhs, setAmountGhs] = useState('')
  const [description, setDescription] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [openPage, setOpenPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const normalizedQuery = normalizeQuery(searchQuery)
  const unresolvedCharges = useMemo(
    () =>
      serviceCharges.filter(
        (charge) =>
          !charge.resolved &&
          matchesQuery(
            [charge.bookings?.guest_name, charge.bookings?.rooms?.number, charge.type, charge.description, charge.requested_by],
            normalizedQuery
          )
      ),
    [normalizedQuery, serviceCharges]
  )
  const awaitingConfirmationCharges = useMemo(
    () =>
      serviceCharges.filter(
        (charge) =>
          charge.resolved &&
          !charge.payment_confirmed &&
          matchesQuery(
            [charge.bookings?.guest_name, charge.bookings?.rooms?.number, charge.type, charge.description, charge.resolved_by],
            normalizedQuery
          )
      ),
    [normalizedQuery, serviceCharges]
  )
  const settledCharges = useMemo(
    () =>
      serviceCharges.filter(
        (charge) =>
          charge.payment_confirmed &&
          matchesQuery(
            [charge.bookings?.guest_name, charge.bookings?.rooms?.number, charge.type, charge.description, charge.payment_confirmed_by],
            normalizedQuery
          )
      ),
    [normalizedQuery, serviceCharges]
  )
  const pendingValue = useMemo(() => unresolvedCharges.reduce((sum, charge) => sum + charge.amount_ghs, 0), [unresolvedCharges])
  const selectedBooking = activeBookings.find((booking) => booking.id === selectedBookingId) ?? null
  const openPageData = useMemo(() => paginate(unresolvedCharges, openPage), [openPage, unresolvedCharges])
  const historyCharges = useMemo(() => [...awaitingConfirmationCharges, ...settledCharges], [awaitingConfirmationCharges, settledCharges])
  const historyPageData = useMemo(() => paginate(historyCharges, historyPage), [historyCharges, historyPage])

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function handleAddCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetMessages()

    if (!selectedBookingId) {
      setErrorMessage('Select an active booking before adding a service charge.')
      return
    }

    const amount = Number(amountGhs)
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Enter a valid service charge amount.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: selectedBookingId,
          type: chargeType,
          amountGhs: amount,
          description
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Service charge could not be added.')
        return
      }

      setAmountGhs('')
      setDescription('')
      setSuccessMessage('Service request logged. It remains visible until admin confirms receipt through the payments board.')
      router.refresh()
    })
  }

  function handleResolveCharge(id: string) {
    resetMessages()

    startTransition(async () => {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', id })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Service request could not be marked as completed.')
        return
      }

      setSuccessMessage('Service marked as completed. Admin still needs to confirm receipt before it leaves the finance queue.')
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/65">Reception Desk</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Live service charges</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
              Reception can log and complete services, but finance closure now stays under admin review so money cannot be silently cleared from the desk.
            </p>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/85 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Active stays</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{activeBookings.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/85 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open requests</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{unresolvedCharges.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-[#d6c1a0] bg-[#fff6ea] p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Awaiting admin receipt</p>
            <p className="mt-3 text-4xl font-semibold text-terracotta">{awaitingConfirmationCharges.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/85 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Pending value</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(pendingValue)}</p>
          </article>
        </section>

        <section className="rounded-[2rem] border border-[#d6c1a0] bg-[#fff8ef] p-6 shadow-card">
          <p className="text-sm uppercase tracking-[0.24em] text-terracotta">Cash control</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Service completion is no longer receipt confirmation</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-ink/70">
            Marking a request as complete now only says the guest received the service. The money side stays visible to admin until receipt is reviewed and a matching payment entry is posted on the finance board.
          </p>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">New service charge</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Add to an active stay</h2>
              </div>
              {selectedBooking ? (
                <div className="rounded-2xl bg-parchment px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Selected stay</p>
                  <p className="text-sm font-semibold text-ink">Room {selectedBooking.rooms?.number ?? 'N/A'}</p>
                  <p className="text-sm text-ink/65">{selectedBooking.guest_name}</p>
                </div>
              ) : null}
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleAddCharge}>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-ink/75">Active booking</span>
                <select
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                  onChange={(event) => setSelectedBookingId(event.target.value)}
                  value={selectedBookingId}
                >
                  <option value="">Select an active stay</option>
                  {activeBookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      Room {booking.rooms?.number ?? 'N/A'} - {booking.guest_name} - Checkout {formatDate(booking.check_out_expected)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink/75">Service type</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {chargeTypes.map((type) => (
                    <button
                      key={type.value}
                      className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                        chargeType === type.value ? 'border-ink bg-ink text-white' : `border-transparent ${type.tone}`
                      }`}
                      onClick={() => setChargeType(type.value)}
                      type="button"
                    >
                      <p className="text-sm font-semibold uppercase">{type.value}</p>
                      <p className={`mt-2 text-sm leading-6 ${chargeType === type.value ? 'text-white/75' : 'text-current/80'}`}>{type.detail}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[0.45fr_0.55fr]">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Amount (GHS)</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    inputMode="decimal"
                    onChange={(event) => setAmountGhs(event.target.value)}
                    placeholder="120"
                    value={amountGhs}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Description</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Two shirts and one trouser for same-day delivery"
                    value={description}
                  />
                </label>
              </div>

              <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e2735] disabled:opacity-60" disabled={isPending || activeBookings.length === 0} type="submit">
                Add service charge
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Open service ledger</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Complete active requests</h2>
              </div>
              <div className="rounded-2xl bg-[#f8f5f0] px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open value</p>
                <p className="text-2xl font-semibold text-ink">{formatGHS(pendingValue)}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <label className="block lg:max-w-md lg:flex-1">
                <span className="text-sm font-semibold text-ink/75">Search service ledger</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-sm outline-none transition focus:border-terracotta"
                  onChange={(event) => {
                    setSearchQuery(event.target.value)
                    setOpenPage(1)
                    setHistoryPage(1)
                  }}
                  placeholder="Search guest, room, type, note, staff actor"
                  value={searchQuery}
                />
              </label>
              <div className="rounded-2xl bg-[#fcfaf6] px-4 py-3 text-sm text-ink/65">Showing {openPageData.items.length} of {unresolvedCharges.length} open requests</div>
            </div>

            <div className="mt-6 space-y-4">
              {openPageData.items.map((charge) => (
                <article key={charge.id} className="rounded-[1.5rem] border border-ink/10 bg-[#fcfaf6] p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">{charge.type}</span>
                        <span className="text-sm font-semibold text-ink">Room {charge.bookings?.rooms?.number ?? 'N/A'} - {charge.bookings?.guest_name ?? 'Unknown guest'}</span>
                      </div>
                      <p className="text-sm text-ink/70">{charge.description ?? 'No service note provided.'}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Raised {formatDateTime(charge.created_at)} by {charge.requested_by ?? 'system'}</p>
                    </div>

                    <div className="flex flex-col items-start gap-3 lg:items-end">
                      <p className="text-2xl font-semibold text-ink">{formatGHS(charge.amount_ghs)}</p>
                      <button
                        className="rounded-full bg-[#255b40] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1b4631] disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => handleResolveCharge(charge.id)}
                        type="button"
                      >
                        Mark service completed
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {openPageData.items.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-[#fcfaf6] px-6 py-10 text-center text-sm text-ink/55">
                  No open service requests match the current search.
                </div>
              ) : null}
            </div>

            {openPageData.totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-ink/60">Page {openPageData.page} of {openPageData.totalPages}</p>
                <div className="flex gap-3">
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={openPageData.page === 1} onClick={() => setOpenPage((current) => Math.max(1, current - 1))} type="button">Previous</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={openPageData.page === openPageData.totalPages} onClick={() => setOpenPage((current) => Math.min(openPageData.totalPages, current + 1))} type="button">Next</button>
                </div>
              </div>
            ) : null}
          </article>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Service history</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Awaiting review and confirmed receipts</h2>
            </div>
            <div className="rounded-2xl bg-[#f8f5f0] px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Awaiting admin</p>
              <p className="text-2xl font-semibold text-terracotta">{awaitingConfirmationCharges.length}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {historyPageData.items.map((charge) => (
              <article key={charge.id} className="rounded-[1.5rem] bg-parchment p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">{charge.type}</p>
                    <p className="mt-2 text-lg font-semibold text-ink">Room {charge.bookings?.rooms?.number ?? 'N/A'} - {charge.bookings?.guest_name ?? 'Unknown guest'}</p>
                    <p className="mt-2 text-sm text-ink/70">{charge.description ?? 'No service note provided.'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-ink">{formatGHS(charge.amount_ghs)}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/45">{charge.payment_confirmed ? 'Receipt confirmed' : 'Awaiting admin receipt'}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-ink/45">Logged {formatDateTime(charge.created_at)}</p>
                {charge.resolved_at ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/45">Completed {formatDateTime(charge.resolved_at)} by {charge.resolved_by ?? 'Unrecorded'}</p> : null}
                {charge.payment_confirmed_at ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink/45">Receipt confirmed {formatDateTime(charge.payment_confirmed_at)} by {charge.payment_confirmed_by ?? 'Admin'}</p> : null}
              </article>
            ))}

            {historyPageData.items.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-ink/15 bg-[#fcfaf6] px-6 py-10 text-center text-sm text-ink/55">
                No service history matches the current search.
              </div>
            ) : null}
          </div>

          {historyPageData.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm text-ink/60">Page {historyPageData.page} of {historyPageData.totalPages}</p>
              <div className="flex gap-3">
                <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={historyPageData.page === 1} onClick={() => setHistoryPage((current) => Math.max(1, current - 1))} type="button">Previous</button>
                <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={historyPageData.page === historyPageData.totalPages} onClick={() => setHistoryPage((current) => Math.min(historyPageData.totalPages, current + 1))} type="button">Next</button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
