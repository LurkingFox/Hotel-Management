'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { formatDate } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type KeycardRow = Database['public']['Tables']['keycards']['Row']
type KeycardScope = 'room' | 'master'

type KeycardWithRelations = KeycardRow & {
  scope?: KeycardScope | null
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

type AdminKeycardsClientProps = {
  currentPage: number
  filters: {
    fromDate: string
    query: string
    status: 'all' | 'active' | 'revoked'
    toDate: string
  }
  keycards: KeycardWithRelations[]
  liveActiveMasterCount: number
  roomCoverage: Array<{
    activeCards: number
    room: RoomRow
  }>
  summary: {
    active: number
    master: number
    revoked: number
    roomsCovered: number
    taps: number
  }
  totalCount: number
  totalPages: number
}

const keycardStatusStyles: Record<'active' | 'revoked', string> = {
  active: 'bg-green-50 border-green-200 text-green-800',
  revoked: 'bg-red-50 border-red-200 text-red-800'
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

export function AdminKeycardsClient({ currentPage, filters, keycards, liveActiveMasterCount, roomCoverage, summary, totalCount, totalPages }: AdminKeycardsClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [extendDates, setExtendDates] = useState<Record<string, string>>({})
  const [masterCardUid, setMasterCardUid] = useState('')
  const [masterIssuedTo, setMasterIssuedTo] = useState('')
  const [masterValidFrom, setMasterValidFrom] = useState(new Date().toISOString().split('T')[0])
  const [masterValidUntil, setMasterValidUntil] = useState(new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0])
  const [searchDraft, setSearchDraft] = useState(filters.query)
  const [fromDateDraft, setFromDateDraft] = useState(filters.fromDate)
  const [toDateDraft, setToDateDraft] = useState(filters.toDate)

  useEffect(() => {
    setSearchDraft(filters.query)
    setFromDateDraft(filters.fromDate)
    setToDateDraft(filters.toDate)
  }, [filters.fromDate, filters.query, filters.toDate])

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

    return 'All issue dates'
  }, [filters.fromDate, filters.toDate])

  const activePreset = useMemo(() => getActivePreset(filters.fromDate, filters.toDate), [filters.fromDate, filters.toDate])
  const visiblePages = useMemo(() => getVisiblePages(currentPage, totalPages), [currentPage, totalPages])

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function navigateRegistry(next: Partial<Record<'from' | 'page' | 'query' | 'status' | 'to', string | undefined>>) {
    const params = new URLSearchParams()
    const merged = {
      from: filters.fromDate,
      page: currentPage > 1 ? String(currentPage) : '',
      query: filters.query,
      status: filters.status === 'all' ? '' : filters.status,
      to: filters.toDate,
      ...next
    }

    for (const [key, value] of Object.entries(merged)) {
      if (!value || (key === 'status' && value === 'all')) {
        continue
      }

      params.set(key, value)
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    startTransition(() => router.replace(nextUrl))
  }

  function handleRevoke(keycard: KeycardWithRelations) {
    resetMessages()

    startTransition(async () => {
      const response = await fetch('/api/keycards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: keycard.id,
          action: 'revoke',
          bookingId: keycard.booking_id,
          scope: keycard.scope ?? 'room'
        })
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Could not revoke keycard.')
        return
      }

      setSuccessMessage(`Keycard ${keycard.card_uid} revoked.`)
      router.refresh()
    })
  }

  function handleExtend(keycard: KeycardWithRelations) {
    resetMessages()
    const validUntil = extendDates[keycard.id] ?? keycard.valid_until

    if (Date.parse(validUntil) < Date.parse(keycard.valid_from)) {
      setErrorMessage('Extended valid-until date must be on or after the valid-from date.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/keycards', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: keycard.id,
          action: 'extend',
          validUntil,
          bookingId: keycard.booking_id,
          scope: keycard.scope ?? 'room'
        })
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Could not extend keycard validity.')
        return
      }

      setSuccessMessage(`Keycard ${keycard.card_uid} extended to ${formatDate(validUntil)}.`)
      router.refresh()
    })
  }

  function handleIssueMasterKey() {
    resetMessages()

    if (!masterCardUid.trim() || !masterIssuedTo.trim()) {
      setErrorMessage('Master key UID and issued-to name are required.')
      return
    }

    if (Date.parse(masterValidUntil) < Date.parse(masterValidFrom)) {
      setErrorMessage('Master key valid-until date must be on or after valid-from.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/keycards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardUid: masterCardUid.trim().toUpperCase(),
          issuedTo: masterIssuedTo.trim(),
          validFrom: masterValidFrom,
          validUntil: masterValidUntil,
          scope: 'master'
        })
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Could not issue master key.')
        return
      }

      setMasterCardUid('')
      setMasterIssuedTo('')
      setSuccessMessage('Master key issued successfully.')
      router.refresh()
    })
  }

  function handleApplyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigateRegistry({
      from: fromDateDraft || undefined,
      page: undefined,
      query: searchDraft.trim() || undefined,
      to: toDateDraft || undefined
    })
  }

  function handleClearFilters() {
    setSearchDraft('')
    setFromDateDraft('')
    setToDateDraft('')
    navigateRegistry({ from: undefined, page: undefined, query: undefined, status: undefined, to: undefined })
  }

  function handlePreset(preset: 'last7' | 'thisMonth' | 'today') {
    const range = getPresetRange(preset)
    setFromDateDraft(range.from)
    setToDateDraft(range.to)
    navigateRegistry({ from: range.from, page: undefined, to: range.to })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Admin Tower</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Keycard registry</h1>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching active cards</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.active}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching master keys</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.master}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching revoked cards</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.revoked}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Logged taps</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.taps}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Rooms covered</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.roomsCovered}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="rounded-[1.5rem] bg-parchment p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Admin override</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Issue master keys</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
                    Master keys are admin-only cards that can unlock any room while still writing every granted and denied tap to the access log.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2 text-sm text-ink/65">
                    <span className="font-semibold text-ink">Card UID</span>
                    <input
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 uppercase outline-none transition focus:border-terracotta"
                      onChange={(event) => setMasterCardUid(event.target.value)}
                      placeholder="A3:F2:91:BC"
                      value={masterCardUid}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-ink/65">
                    <span className="font-semibold text-ink">Issued to</span>
                    <input
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                      onChange={(event) => setMasterIssuedTo(event.target.value)}
                      placeholder="Night Manager"
                      value={masterIssuedTo}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-ink/65">
                    <span className="font-semibold text-ink">Valid from</span>
                    <input
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                      onChange={(event) => setMasterValidFrom(event.target.value)}
                      type="date"
                      value={masterValidFrom}
                    />
                  </label>
                  <label className="space-y-2 text-sm text-ink/65">
                    <span className="font-semibold text-ink">Valid until</span>
                    <input
                      className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                      min={masterValidFrom}
                      onChange={(event) => setMasterValidUntil(event.target.value)}
                      type="date"
                      value={masterValidUntil}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
                  disabled={isPending}
                  onClick={handleIssueMasterKey}
                  type="button"
                >
                  Issue master key
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {([
                { label: 'All cards', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Revoked', value: 'revoked' }
              ] as const).map((statusOption) => (
                <button
                  key={statusOption.value}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${filters.status === statusOption.value ? 'bg-ink text-white' : 'bg-parchment text-ink hover:bg-[#eadfce]'}`}
                  disabled={isPending}
                  onClick={() => navigateRegistry({ page: undefined, status: statusOption.value === 'all' ? undefined : statusOption.value })}
                  type="button"
                >
                  {statusOption.label}
                </button>
              ))}
            </div>

            <form className="mt-4 grid gap-4" onSubmit={handleApplyFilters}>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Search registry</span>
                <input
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta"
                  disabled={isPending}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search by card UID, guest, issuer, room, or scope"
                  value={searchDraft}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-ink/65">
                  <span className="font-semibold text-ink">Issued from</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta"
                    disabled={isPending}
                    onChange={(event) => setFromDateDraft(event.target.value)}
                    type="date"
                    value={fromDateDraft}
                  />
                </label>
                <label className="space-y-2 text-sm text-ink/65">
                  <span className="font-semibold text-ink">Issued until</span>
                  <input
                    className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta"
                    disabled={isPending}
                    onChange={(event) => setToDateDraft(event.target.value)}
                    type="date"
                    value={toDateDraft}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} type="submit">Apply</button>
                <button className="rounded-full border border-ink/12 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-60" disabled={isPending} onClick={handleClearFilters} type="button">Clear</button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap gap-3">
              {([
                { label: 'Today', value: 'today' },
                { label: 'Last 7 days', value: 'last7' },
                { label: 'This month', value: 'thisMonth' }
              ] as const).map((preset) => (
                <button
                  key={preset.value}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${activePreset === preset.value ? 'border border-ink bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'}`}
                  disabled={isPending}
                  onClick={() => handlePreset(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[1.5rem] bg-[#fcfaf6] px-4 py-4 text-sm text-ink/65">
              Showing {keycards.length} of {totalCount} matching keycards · {visibleRangeLabel}
            </div>

            <div className="mt-6 grid gap-4">
              {keycards.map((keycard) => {
                const extendValue = extendDates[keycard.id] ?? keycard.valid_until

                return (
                  <article key={keycard.id} className="rounded-[1.5rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-semibold text-ink">{keycard.card_uid}</h3>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${keycardStatusStyles[keycard.status === 'revoked' ? 'revoked' : 'active']}`}>
                            {keycard.status}
                          </span>
                          <span className="rounded-full bg-[#e7edf5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#27435a]">
                            {(keycard.scope ?? 'room') === 'master' ? 'master key' : 'room key'}
                          </span>
                        </div>
                        <div className="grid gap-3 text-sm text-ink/70 md:grid-cols-2 xl:grid-cols-5">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest</p>
                            <p className="mt-1 font-semibold text-ink">{keycard.bookings?.guest_name ?? keycard.issued_to}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Room</p>
                            <p className="mt-1 font-semibold text-ink">{(keycard.scope ?? 'room') === 'master' ? 'All rooms' : keycard.rooms ? `Room ${keycard.rooms.number}` : 'Unassigned'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Issued</p>
                            <p className="mt-1 font-semibold text-ink">{keycard.issued_at ? formatDate(keycard.issued_at) : 'Not recorded'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Validity</p>
                            <p className="mt-1 font-semibold text-ink">{formatDate(keycard.valid_from)} to {formatDate(keycard.valid_until)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Access count</p>
                            <p className="mt-1 font-semibold text-ink">{keycard.access_count}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Issued by</p>
                        <p className="mt-1 font-semibold text-ink">{keycard.issued_by}</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto]">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Extend valid until</span>
                        <input
                          className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta"
                          min={keycard.valid_from}
                          onChange={(event) => setExtendDates((current) => ({ ...current, [keycard.id]: event.target.value }))}
                          type="date"
                          value={extendValue}
                        />
                      </label>
                      <div className="flex flex-wrap items-end gap-3 xl:justify-end">
                        {keycard.status !== 'revoked' ? (
                          <button
                            className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60"
                            disabled={isPending}
                            onClick={() => handleRevoke(keycard)}
                            type="button"
                          >
                            Revoke keycard
                          </button>
                        ) : null}
                        <button
                          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => handleExtend(keycard)}
                          type="button"
                        >
                          Extend validity
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}

              {keycards.length === 0 ? (
                <div className="rounded-[1.75rem] border border-dashed border-ink/15 bg-[#fcfaf6] px-6 py-10 text-center text-sm text-ink/55">
                  No keycards match the current registry filters.
                </div>
              ) : null}
            </div>

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-ink/60">Page {currentPage} of {totalPages}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPage === 1} onClick={() => navigateRegistry({ page: '1' })} type="button">First</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPage === 1} onClick={() => navigateRegistry({ page: String(Math.max(1, currentPage - 1)) })} type="button">Previous</button>
                  {visiblePages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={`min-w-10 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${pageNumber === currentPage ? 'bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'}`}
                      disabled={isPending || pageNumber === currentPage}
                      onClick={() => navigateRegistry({ page: String(pageNumber) })}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPage === totalPages} onClick={() => navigateRegistry({ page: String(Math.min(totalPages, currentPage + 1)) })} type="button">Next</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentPage === totalPages} onClick={() => navigateRegistry({ page: String(totalPages) })} type="button">Last</button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Room coverage</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Door-readiness view</h2>
            <div className="mt-4 rounded-2xl bg-[#f8f5f0] px-4 py-3 text-sm text-ink/70">
              {liveActiveMasterCount} active master {liveActiveMasterCount === 1 ? 'key is' : 'keys are'} available across the hotel.
            </div>
            <div className="mt-6 space-y-3">
              {roomCoverage.map(({ room, activeCards }) => (
                <div key={room.id} className="rounded-2xl bg-[#fcfaf6] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">Room {room.number}</p>
                      <p className="text-sm capitalize text-ink/60">{room.type} · {room.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-ink/55">Active cards</p>
                      <p className="font-semibold text-ink">{activeCards}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}