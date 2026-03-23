'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { triggerHistoryExport } from '@/lib/admin-history/client'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type AccessLogRow = Database['public']['Tables']['access_log']['Row']
type AccessResult = Database['public']['Enums']['access_result']

type AccessLogWithRoom = AccessLogRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'status' | 'type'> | null
}

type AdminAccessLogClientProps = {
  currentPage: number
  events: AccessLogWithRoom[]
  filters: {
    fromDate: string
    query: string
    result: 'all' | AccessResult
    toDate: string
  }
  latestDenied: AccessLogWithRoom[]
  summary: {
    denied: number
    expired: number
    granted: number
    roomsOnPage: number
  }
  totalCount: number
  totalPages: number
}

const resultStyles: Record<AccessResult, string> = {
  granted: 'bg-green-50 border-green-200 text-green-800',
  denied: 'bg-red-50 border-red-200 text-red-800',
  expired: 'bg-amber-50 border-amber-200 text-amber-800'
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

export function AdminAccessLogClient({ currentPage, events, filters, latestDenied, summary, totalCount, totalPages }: AdminAccessLogClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [searchDraft, setSearchDraft] = useState(filters.query)
  const [fromDateDraft, setFromDateDraft] = useState(filters.fromDate)
  const [toDateDraft, setToDateDraft] = useState(filters.toDate)

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
  const visiblePages = useMemo(() => getVisiblePages(currentPage, totalPages), [currentPage, totalPages])

  function navigate(next: Partial<Record<'from' | 'page' | 'query' | 'result' | 'to', string | undefined>>) {
    const params = new URLSearchParams()
    const merged = {
      from: filters.fromDate,
      page: currentPage > 1 ? String(currentPage) : '',
      query: filters.query,
      result: filters.result === 'all' ? '' : filters.result,
      to: filters.toDate,
      ...next
    }

    for (const [key, value] of Object.entries(merged)) {
      if (!value || (key === 'result' && value === 'all')) {
        continue
      }

      params.set(key, value)
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    startTransition(() => router.replace(nextUrl))
  }

  function handleApplyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate({ from: fromDateDraft || undefined, page: '1', query: searchDraft.trim() || undefined, to: toDateDraft || undefined })
  }

  function handleClearFilters() {
    setSearchDraft('')
    setFromDateDraft('')
    setToDateDraft('')
    navigate({ from: undefined, page: undefined, query: undefined, result: undefined, to: undefined })
  }

  function handlePreset(preset: 'last7' | 'thisMonth' | 'today') {
    const range = getPresetRange(preset)
    setFromDateDraft(range.from)
    setToDateDraft(range.to)
    navigate({ from: range.from, page: '1', to: range.to })
  }

  function handleExport() {
    triggerHistoryExport('access-log', {
      from: filters.fromDate || undefined,
      query: filters.query || undefined,
      result: filters.result === 'all' ? undefined : filters.result,
      to: filters.toDate || undefined
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="admin-access-log">
      <span className="sr-only">smoke:admin-access-log</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Access history</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Search and review historical entry events with server-backed filters and pagination.</p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Granted entries</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.granted}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Denied entries</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.denied}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Expired credentials used</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.expired}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Rooms on page</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.roomsOnPage}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Access audit trail</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Historical entry search</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {(['all', 'granted', 'denied', 'expired'] as const).map((filter) => (
                  <button
                    key={filter}
                    className={filters.result === filter ? 'ui-chip-active' : 'ui-chip'}
                    disabled={isPending}
                    onClick={() => navigate({ page: '1', result: filter === 'all' ? undefined : filter })}
                    type="button"
                  >
                    {filter === 'all' ? 'All events' : filter}
                  </button>
                ))}
              </div>
            </div>

            <form className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.55fr_0.55fr_auto_auto] lg:items-end" onSubmit={handleApplyFilters}>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">Search audit trail</span>
                <input
                  className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm"
                  disabled={isPending}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search room, credential identifier, guest, issuer, result, note"
                  value={searchDraft}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">From</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" disabled={isPending} onChange={(event) => setFromDateDraft(event.target.value)} type="date" value={fromDateDraft} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-ink/75">To</span>
                <input className="ui-input mt-2 w-full rounded-2xl px-4 py-3 text-sm" disabled={isPending} onChange={(event) => setToDateDraft(event.target.value)} type="date" value={toDateDraft} />
              </label>
              <button className="ui-button-primary disabled:opacity-60" disabled={isPending} type="submit">
                Apply
              </button>
              <button className="ui-button-secondary disabled:opacity-60" disabled={isPending} onClick={handleClearFilters} type="button">
                Clear
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-3">
              {([
                { label: 'Today', value: 'today' },
                { label: 'Last 7 days', value: 'last7' },
                { label: 'This month', value: 'thisMonth' }
              ] as const).map((preset) => (
                <button
                  key={preset.value}
                  className={`${activePreset === preset.value ? 'ui-chip-active' : 'ui-chip'} disabled:opacity-60`}
                  disabled={isPending}
                  onClick={() => handlePreset(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="ui-panel-soft mt-4 flex flex-col gap-3 rounded-[1.5rem] px-4 py-4 text-sm text-ink/65 lg:flex-row lg:items-center lg:justify-between">
              <span>Showing {events.length} of {totalCount} matching events</span>
              <div className="flex flex-wrap items-center gap-3">
                <span>{visibleRangeLabel}</span>
                <button className="ui-button-secondary px-4 py-2" onClick={handleExport} type="button">
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {events.map((event) => (
                <article key={event.id} className="ui-panel-soft rounded-[1.5rem] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${resultStyles[event.result]}`}>
                          {event.result}
                        </span>
                        <span className="text-sm text-ink/55">{formatDateTime(event.accessed_at)}</span>
                      </div>
                      <div className="grid gap-3 text-sm text-ink/70 md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Room</p>
                          <p className="mt-1 font-semibold text-ink">{event.rooms ? `Room ${event.rooms.number}` : 'Unknown room'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Credential identifier</p>
                          <p className="mt-1 font-semibold text-ink">{event.credential_identifier}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest</p>
                          <p className="mt-1 font-semibold text-ink">{event.guest_name ?? 'Unknown guest'}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Issued by</p>
                          <p className="mt-1 font-semibold text-ink">{event.issued_by ?? 'System'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="max-w-sm rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
                      <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Note</p>
                      <p className="mt-1">{event.note || 'No additional note recorded.'}</p>
                    </div>
                  </div>
                </article>
              ))}

              {events.length === 0 ? (
                <div className="ui-panel-muted rounded-[1.75rem] border-dashed px-6 py-10 text-center text-sm text-ink/55">
                  No access events match the current server filters.
                </div>
              ) : null}
            </div>

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-ink/60">Page {currentPage} of {totalPages}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === 1} onClick={() => navigate({ page: '1' })} type="button">First</button>
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === 1} onClick={() => navigate({ page: String(Math.max(1, currentPage - 1)) })} type="button">Previous</button>
                  {visiblePages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={`min-w-10 px-4 py-2 text-sm disabled:opacity-50 ${pageNumber === currentPage ? 'ui-chip-active' : 'ui-chip'}`}
                      disabled={isPending || pageNumber === currentPage}
                      onClick={() => navigate({ page: String(pageNumber) })}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === totalPages} onClick={() => navigate({ page: String(Math.min(totalPages, currentPage + 1)) })} type="button">Next</button>
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === totalPages} onClick={() => navigate({ page: String(totalPages) })} type="button">Last</button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Security watch</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Recent denied entries</h2>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              This watchlist follows the active search and date range, but it stays focused on denied access only.
            </p>
            <div className="mt-6 space-y-3">
              {latestDenied.map((event) => (
                <div key={event.id} className="ui-panel-soft rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">{event.rooms ? `Room ${event.rooms.number}` : 'Unknown room'}</p>
                      <p className="text-sm text-ink/60">{event.credential_identifier}</p>
                    </div>
                    <p className="text-sm text-ink/55">{formatDateTime(event.accessed_at)}</p>
                  </div>
                  <p className="mt-3 text-sm text-ink/70">{event.note || 'No note recorded.'}</p>
                </div>
              ))}

              {latestDenied.length === 0 ? (
                <div className="ui-panel-soft rounded-2xl px-4 py-6 text-sm text-ink/55">No denied access attempts match the current server filters.</div>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}
