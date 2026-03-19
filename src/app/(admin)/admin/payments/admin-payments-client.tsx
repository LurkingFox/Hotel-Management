'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type PaymentRow = Database['public']['Tables']['payments']['Row']
type ServiceChargeRow = Database['public']['Tables']['service_charges']['Row']
type PayMethod = Database['public']['Enums']['pay_method']

type PaymentWithBooking = PaymentRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'room_id' | 'status' | 'total_ghs' | 'paid_ghs' | 'balance_ghs'> | null
}

type ServiceChargeWithBooking = ServiceChargeRow & {
  bookings:
    | (Pick<BookingRow, 'id' | 'guest_name' | 'status'> & {
        rooms: Pick<RoomRow, 'number' | 'type'> | null
      })
    | null
}

type AdminPaymentsClientProps = {
  bookings: BookingRow[]
  breakdown: Array<{ method: PayMethod; total: number }>
  currentPaymentsPage: number
  currentServicePage: number
  filters: {
    fromDate: string
    method: 'all' | PayMethod
    query: string
    toDate: string
  }
  payments: PaymentWithBooking[]
  rooms: RoomRow[]
  serviceCharges: ServiceChargeWithBooking[]
  summary: {
    awaitingReceipt: number
    openBalances: number
    outstandingBalance: number
    todayCollected: number
    totalCollected: number
  }
  totalPaymentCount: number
  totalPaymentPages: number
  totalServiceCount: number
  totalServicePages: number
}

const paymentStyles: Record<PayMethod, string> = {
  cash: 'bg-green-100 text-green-800',
  momo: 'bg-blue-100 text-blue-800',
  bank_transfer: 'bg-teal-100 text-teal-800',
  cheque: 'bg-gray-100 text-gray-700'
}

const paymentLabels: Record<PayMethod, string> = {
  cash: 'Cash',
  momo: 'MoMo',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque'
}

function toInputDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPresetRange(preset: 'last7' | 'thisMonth' | 'today') {
  const today = new Date()
  const end = toInputDate(today)

  if (preset === 'today') {
    return { from: end, to: end }
  }

  if (preset === 'last7') {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return { from: toInputDate(start), to: end }
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from: toInputDate(start), to: end }
}

function getActivePreset(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) {
    return null
  }

  for (const preset of ['today', 'last7', 'thisMonth'] as const) {
    const range = getPresetRange(preset)

    if (range.from === fromDate && range.to === toDate) {
      return preset
    }
  }

  return null
}

function getVisiblePages(currentPage: number, totalPages: number, maxButtons = 5) {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const half = Math.floor(maxButtons / 2)
  let start = Math.max(1, currentPage - half)
  let end = start + maxButtons - 1

  if (end > totalPages) {
    end = totalPages
    start = end - maxButtons + 1
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function AdminPaymentsClient({
  bookings,
  breakdown,
  currentPaymentsPage,
  currentServicePage,
  filters,
  payments,
  rooms,
  serviceCharges,
  summary,
  totalPaymentCount,
  totalPaymentPages,
  totalServiceCount,
  totalServicePages
}: AdminPaymentsClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, { method: PayMethod; reference: string }>>({})
  const [searchDraft, setSearchDraft] = useState(filters.query)
  const [fromDateDraft, setFromDateDraft] = useState(filters.fromDate)
  const [toDateDraft, setToDateDraft] = useState(filters.toDate)

  useEffect(() => {
    setSearchDraft(filters.query)
    setFromDateDraft(filters.fromDate)
    setToDateDraft(filters.toDate)
  }, [filters.fromDate, filters.query, filters.toDate])

  const roomMap = useMemo(() => new Map(rooms.map((room) => [room.id, room.number])), [rooms])

  const visibleRangeLabel = useMemo(() => {
    if (filters.fromDate && filters.toDate) {
      return `${filters.fromDate} to ${filters.toDate}`
    }

    if (filters.fromDate) {
      return `From ${filters.fromDate}`
    }

    if (filters.toDate) {
      return `Up to ${filters.toDate}`
    }

    return 'All recorded dates'
  }, [filters.fromDate, filters.toDate])
  const activePreset = useMemo(() => getActivePreset(filters.fromDate, filters.toDate), [filters.fromDate, filters.toDate])
  const visiblePaymentPages = useMemo(() => getVisiblePages(currentPaymentsPage, totalPaymentPages), [currentPaymentsPage, totalPaymentPages])
  const visibleServicePages = useMemo(() => getVisiblePages(currentServicePage, totalServicePages), [currentServicePage, totalServicePages])

  const outstandingBookings = useMemo(() => {
    return bookings
      .filter((booking) => (booking.balance_ghs ?? 0) > 0)
      .sort((left, right) => (right.balance_ghs ?? 0) - (left.balance_ghs ?? 0))
      .slice(0, 8)
  }, [bookings])

  function navigate(next: Partial<Record<'from' | 'method' | 'ppage' | 'query' | 'spage' | 'to', string | undefined>>) {
    const params = new URLSearchParams()
    const merged = {
      from: filters.fromDate,
      method: filters.method === 'all' ? '' : filters.method,
      ppage: currentPaymentsPage > 1 ? String(currentPaymentsPage) : '',
      query: filters.query,
      spage: currentServicePage > 1 ? String(currentServicePage) : '',
      to: filters.toDate,
      ...next
    }

    for (const [key, value] of Object.entries(merged)) {
      if (!value || (key === 'method' && value === 'all')) {
        continue
      }

      params.set(key, value)
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    startTransition(() => router.replace(nextUrl))
  }

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function updateReceiptDraft(id: string, patch: Partial<{ method: PayMethod; reference: string }>) {
    setReceiptDrafts((current) => ({
      ...current,
      [id]: {
        method: current[id]?.method ?? 'cash',
        reference: current[id]?.reference ?? '',
        ...patch
      }
    }))
  }

  function handleApplyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate({ from: fromDateDraft || undefined, ppage: undefined, query: searchDraft.trim() || undefined, spage: undefined, to: toDateDraft || undefined })
  }

  function handleClearFilters() {
    setSearchDraft('')
    setFromDateDraft('')
    setToDateDraft('')
    navigate({ from: undefined, method: undefined, ppage: undefined, query: undefined, spage: undefined, to: undefined })
  }

  function handlePreset(preset: 'last7' | 'thisMonth' | 'today') {
    const range = getPresetRange(preset)
    setFromDateDraft(range.from)
    setToDateDraft(range.to)
    navigate({ from: range.from, ppage: undefined, spage: undefined, to: range.to })
  }

  function handleConfirmReceipt(charge: ServiceChargeWithBooking) {
    resetMessages()
    const draft = receiptDrafts[charge.id] ?? { method: 'cash' as PayMethod, reference: '' }

    if (draft.method !== 'cash' && !draft.reference.trim()) {
      setErrorMessage('Reference is required for non-cash service receipt confirmation.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/services', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_receipt',
          id: charge.id,
          method: draft.method,
          reference: draft.reference.trim() || null
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Could not confirm this service receipt.')
        return
      }

      setSuccessMessage(`Receipt confirmed for ${charge.bookings?.guest_name ?? 'the selected stay'} and posted into the payment ledger.`)
      setReceiptDrafts((current) => ({ ...current, [charge.id]: { method: 'cash', reference: '' } }))
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Admin Tower</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Payments ledger</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
              Payments history and receipt review now run on server-backed filters, so older finance records can be pulled in by date range, method, and search instead of being limited to the currently loaded slice.
            </p>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching payments total</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(summary.totalCollected)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching payments today</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(summary.todayCollected)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Outstanding balance</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(summary.outstandingBalance)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Bookings with balance</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.openBalances}</p>
          </article>
          <article className="rounded-[1.75rem] border border-[#d6c1a0] bg-[#f8efe3] p-5 shadow-card">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Awaiting receipt review</p>
            <p className="mt-3 text-4xl font-semibold text-terracotta">{summary.awaitingReceipt}</p>
          </article>
        </section>

        <section className="rounded-[2rem] border border-[#d6c1a0] bg-[#fff8ef] p-6 shadow-card">
          <p className="text-sm uppercase tracking-[0.24em] text-terracotta">Control note</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Service receipts now need admin confirmation</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-ink/70">
            Reception can raise and complete service requests, but they cannot close the money side anymore. A service charge only leaves the review queue after an admin confirms receipt and the system writes a matching payment entry against the booking.
          </p>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Method breakdown</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Collection channels</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {(['all', 'cash', 'momo', 'bank_transfer', 'cheque'] as const).map((method) => (
                  <button
                    key={method}
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition ${filters.method === method ? 'bg-ink text-white' : 'bg-parchment text-ink hover:bg-[#eadfce]'}`}
                    disabled={isPending}
                    onClick={() => navigate({ method: method === 'all' ? undefined : method, ppage: undefined, spage: undefined })}
                    type="button"
                  >
                    {method === 'all' ? 'All methods' : paymentLabels[method]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {breakdown.map((entry) => (
                <article key={entry.method} className="rounded-[1.5rem] border border-ink/10 bg-[#fcfaf6] p-5">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${paymentStyles[entry.method]}`}>
                    {paymentLabels[entry.method]}
                  </span>
                  <p className="mt-4 text-3xl font-semibold text-ink">{formatGHS(entry.total)}</p>
                </article>
              ))}
            </div>

            <form className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.55fr_0.55fr_auto_auto] lg:items-end" onSubmit={handleApplyFilters}>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Search ledger and review queues</span>
                <input
                  className="mt-2 w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-sm outline-none transition focus:border-terracotta"
                  disabled={isPending}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search guest, room, reference, receiver, service note"
                  value={searchDraft}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">From</span>
                <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-sm outline-none transition focus:border-terracotta" disabled={isPending} onChange={(event) => setFromDateDraft(event.target.value)} type="date" value={fromDateDraft} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">To</span>
                <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-sm outline-none transition focus:border-terracotta" disabled={isPending} onChange={(event) => setToDateDraft(event.target.value)} type="date" value={toDateDraft} />
              </label>
              <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1e2735] disabled:opacity-60" disabled={isPending} type="submit">Apply</button>
              <button className="rounded-full border border-ink/12 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-60" disabled={isPending} onClick={handleClearFilters} type="button">Clear</button>
            </form>

            <div className="mt-4 flex flex-wrap gap-3">
              {([
                { label: 'Today', value: 'today' },
                { label: 'Last 7 days', value: 'last7' },
                { label: 'This month', value: 'thisMonth' }
              ] as const).map((preset) => (
                <button
                  key={preset.value}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                    activePreset === preset.value ? 'border border-ink bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'
                  }`}
                  disabled={isPending}
                  onClick={() => handlePreset(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-[1.5rem] bg-[#fcfaf6] px-4 py-4 text-sm text-ink/65 lg:flex-row lg:items-center lg:justify-between">
              <span>Showing {payments.length} of {totalPaymentCount} matching payments</span>
              <span>{visibleRangeLabel}</span>
            </div>

            <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-ink/10">
              <div className="grid grid-cols-[1.2fr_0.7fr_0.9fr_0.8fr_0.8fr_1fr] gap-4 border-b border-ink/10 bg-[#fcfaf6] px-5 py-4 text-xs uppercase tracking-[0.24em] text-ink/45">
                <span>Guest</span>
                <span>Room</span>
                <span>Method</span>
                <span>Amount</span>
                <span>Paid at</span>
                <span>Received by</span>
              </div>
              {payments.map((payment) => (
                <div key={payment.id} className="grid grid-cols-[1.2fr_0.7fr_0.9fr_0.8fr_0.8fr_1fr] gap-4 border-b border-ink/10 px-5 py-4 text-sm text-ink/80 last:border-b-0">
                  <span>
                    <span className="block font-semibold text-ink">{payment.bookings?.guest_name ?? 'Unknown guest'}</span>
                    {payment.reference ? <span className="text-xs text-ink/45">Ref: {payment.reference}</span> : null}
                  </span>
                  <span>{payment.bookings?.room_id ? `Room ${roomMap.get(payment.bookings.room_id) ?? 'Unknown'}` : 'Unassigned'}</span>
                  <span>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${paymentStyles[payment.method]}`}>
                      {paymentLabels[payment.method]}
                    </span>
                  </span>
                  <span className="font-semibold text-ink">{formatGHS(payment.amount_ghs)}</span>
                  <span>{payment.paid_at ? formatDate(payment.paid_at) : 'Pending'}</span>
                  <span>{payment.received_by}</span>
                </div>
              ))}
              {payments.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-ink/55">No payments match the current server filters.</div>
              ) : null}
            </div>

            {totalPaymentPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-ink/60">Page {currentPaymentsPage} of {totalPaymentPages}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPaymentsPage === 1} onClick={() => navigate({ ppage: '1' })} type="button">First</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPaymentsPage === 1} onClick={() => navigate({ ppage: String(Math.max(1, currentPaymentsPage - 1)) })} type="button">Previous</button>
                  {visiblePaymentPages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={`min-w-10 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${pageNumber === currentPaymentsPage ? 'bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'}`}
                      disabled={isPending || pageNumber === currentPaymentsPage}
                      onClick={() => navigate({ ppage: String(pageNumber) })}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPaymentsPage === totalPaymentPages} onClick={() => navigate({ ppage: String(Math.min(totalPaymentPages, currentPaymentsPage + 1)) })} type="button">Next</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPaymentsPage === totalPaymentPages} onClick={() => navigate({ ppage: String(totalPaymentPages) })} type="button">Last</button>
                </div>
              </div>
            ) : null}
          </article>

          <div className="space-y-6">
            <article className="rounded-[2rem] border border-[#d6c1a0] bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-terracotta">Receipt review queue</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Service charges awaiting money confirmation</h2>
              <p className="mt-3 text-sm leading-6 text-ink/65">
                This queue follows the same server filters as the ledger, using resolved service dates for its historical range.
              </p>

              <div className="mt-4 rounded-[1.5rem] bg-[#fcfaf6] px-4 py-4 text-sm text-ink/65">
                Showing {serviceCharges.length} of {totalServiceCount} matching service receipts
              </div>

              <div className="mt-6 space-y-4">
                {serviceCharges.map((charge) => {
                  const draft = receiptDrafts[charge.id] ?? { method: 'cash' as PayMethod, reference: '' }

                  return (
                    <article key={charge.id} className="rounded-[1.5rem] border border-[#ead6bd] bg-[#fff8ef] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink/60">{charge.type}</p>
                          <p className="mt-2 text-lg font-semibold text-ink">Room {charge.bookings?.rooms?.number ?? 'N/A'} - {charge.bookings?.guest_name ?? 'Unknown guest'}</p>
                          <p className="mt-2 text-sm text-ink/70">{charge.description ?? 'No service note provided.'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-ink">{formatGHS(charge.amount_ghs)}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-terracotta">Raised by {charge.requested_by ?? 'system'}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">Completed by {charge.resolved_by ?? 'Unrecorded'}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="font-semibold text-ink">Receipt method</span>
                          <select className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => updateReceiptDraft(charge.id, { method: event.target.value as PayMethod })} value={draft.method}>
                            {(['cash', 'momo', 'bank_transfer', 'cheque'] as const).map((method) => (
                              <option key={method} value={method}>{paymentLabels[method]}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="font-semibold text-ink">Receipt reference</span>
                          <input className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => updateReceiptDraft(charge.id, { reference: event.target.value })} placeholder={draft.method === 'cash' ? 'Optional for cash' : 'Required for this method'} value={draft.reference} />
                        </label>
                      </div>

                      <button className="mt-4 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} onClick={() => handleConfirmReceipt(charge)} type="button">
                        Confirm receipt and post payment
                      </button>
                    </article>
                  )
                })}

                {serviceCharges.length === 0 ? (
                  <div className="rounded-2xl bg-[#fcfaf6] px-4 py-6 text-sm text-ink/55">No service charges currently match the active receipt-review filters.</div>
                ) : null}
              </div>

              {totalServicePages > 1 ? (
                <div className="mt-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-ink/60">Page {currentServicePage} of {totalServicePages}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentServicePage === 1} onClick={() => navigate({ spage: '1' })} type="button">First</button>
                    <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentServicePage === 1} onClick={() => navigate({ spage: String(Math.max(1, currentServicePage - 1)) })} type="button">Previous</button>
                    {visibleServicePages.map((pageNumber) => (
                      <button
                        key={pageNumber}
                        className={`min-w-10 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${pageNumber === currentServicePage ? 'bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'}`}
                        disabled={isPending || pageNumber === currentServicePage}
                        onClick={() => navigate({ spage: String(pageNumber) })}
                        type="button"
                      >
                        {pageNumber}
                      </button>
                    ))}
                    <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentServicePage === totalServicePages} onClick={() => navigate({ spage: String(Math.min(totalServicePages, currentServicePage + 1)) })} type="button">Next</button>
                    <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentServicePage === totalServicePages} onClick={() => navigate({ spage: String(totalServicePages) })} type="button">Last</button>
                  </div>
                </div>
              ) : null}
            </article>

            <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Outstanding bookings</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Balance watch</h2>
              <p className="mt-3 text-sm leading-6 text-ink/65">
                This stays open and unhidden. It is not narrowed by the historical ledger filters.
              </p>
              <div className="mt-6 space-y-3">
                {outstandingBookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl bg-[#fcfaf6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{booking.guest_name}</p>
                        <p className="text-sm text-ink/60">
                          {booking.room_id ? `Room ${roomMap.get(booking.room_id) ?? 'Unknown'}` : 'Unassigned'} - {booking.status.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-ink/55">Balance</p>
                        <p className="font-semibold text-ink">{formatGHS(booking.balance_ghs ?? 0)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-ink/65">
                      <span>{formatGHS(booking.paid_ghs)} paid</span>
                      <span>of {formatGHS(booking.total_ghs)}</span>
                    </div>
                  </div>
                ))}
                {outstandingBookings.length === 0 ? (
                  <div className="rounded-2xl bg-[#fcfaf6] px-4 py-6 text-sm text-ink/55">No open balances right now.</div>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  )
}
