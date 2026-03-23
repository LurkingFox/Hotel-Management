'use client'

import { useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { triggerHistoryExport } from '@/lib/admin-history/client'
import { formatDate } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type AccessCredentialRow = Database['public']['Tables']['booking_access_credentials']['Row']

type AccessCredentialWithRelations = AccessCredentialRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

type AdminGuestAccessClientProps = {
  activeProvider: 'seam'
  currentPage: number
  filters: {
    fromDate: string
    query: string
    status: 'all' | 'active' | 'revoked'
    toDate: string
  }
  credentials: AccessCredentialWithRelations[]
  roomCoverage: Array<{
    activeCredentials: number
    mappedDeviceId: string | null
    mappedDeviceName: string | null
    room: RoomRow
  }>
  summary: {
    active: number
    legacyRfid: number
    revoked: number
    roomsCovered: number
    seam: number
    warnings: number
  }
  totalCount: number
  totalPages: number
}

const credentialStatusStyles: Record<'active' | 'revoked', string> = {
  active: 'bg-green-50 border-green-200 text-green-800',
  revoked: 'bg-red-50 border-red-200 text-red-800'
}

const providerStyles: Record<'local_rfid' | 'seam', string> = {
  local_rfid: 'bg-[#e7edf5] text-[#27435a]',
  seam: 'bg-[#f8e8dc] text-[#8a431d]'
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

function getCredentialLabel(credential: AccessCredentialWithRelations) {
  return credential.credential_code ?? credential.note ?? credential.provider_reference ?? credential.id
}

function getProviderLabel(provider: string) {
  return provider === 'seam' ? 'Seam' : 'Local RFID'
}

function getProviderStatusLabel(value: string | null) {
  if (!value) {
    return 'No provider events yet'
  }

  return value.replaceAll('_', ' ')
}

export function AdminGuestAccessClient({ activeProvider, currentPage, filters, credentials, roomCoverage, summary, totalCount, totalPages }: AdminGuestAccessClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [extendDates, setExtendDates] = useState<Record<string, string>>({})
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

    return 'All credential dates'
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

  function handleRevoke(credential: AccessCredentialWithRelations) {
    resetMessages()

    startTransition(async () => {
      const response = await fetch('/api/access-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: credential.id,
          action: 'revoke'
        })
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Could not revoke access credential.')
        return
      }

      setSuccessMessage(`${credential.provider === 'seam' ? 'Access code' : 'Guest credential'} revoked.`)
      router.refresh()
    })
  }

  function handleExtend(credential: AccessCredentialWithRelations) {
    resetMessages()
    const validUntil = extendDates[credential.id] ?? (credential.valid_until ? credential.valid_until.slice(0, 10) : '')

    if (!validUntil) {
      setErrorMessage('Extended valid-until date is required.')
      return
    }

    if (credential.valid_from && Date.parse(validUntil) < Date.parse(credential.valid_from)) {
      setErrorMessage('Extended valid-until date must be on or after the valid-from date.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/access-credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: credential.id,
          action: 'extend',
          validUntil
        })
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Could not extend access validity.')
        return
      }

      setSuccessMessage(`Validity extended to ${formatDate(validUntil)}.`)
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

  function handleExport() {
    triggerHistoryExport('guest-access', {
      from: filters.fromDate || undefined,
      query: filters.query || undefined,
      status: filters.status === 'all' ? undefined : filters.status,
      to: filters.toDate || undefined
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="admin-guest-access">
      <span className="sr-only">smoke:admin-guest-access</span>
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Guest access</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">Review live guest credentials, mapped devices, and manual access interventions.</p>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching active credentials</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.active}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching Seam credentials</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.seam}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Matching revoked credentials</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.revoked}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Provider warnings</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.warnings}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Legacy RFID credentials</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.legacyRfid}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="ui-panel-soft rounded-[1.5rem] p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Registry mode</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Credential operations</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
                    The live provider is {getProviderLabel(activeProvider)}. Revoke or extend active guest credentials here without switching back to the bookings screen.
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Rooms covered</p>
                  <p className="mt-1 text-2xl font-semibold text-ink">{summary.roomsCovered}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {([
                { label: 'All credentials', value: 'all' },
                { label: 'Active', value: 'active' },
                { label: 'Revoked', value: 'revoked' }
              ] as const).map((statusOption) => (
                <button
                  key={statusOption.value}
                  className={`${filters.status === statusOption.value ? 'ui-chip-active' : 'ui-chip'} disabled:opacity-60`}
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
                  className="ui-input w-full rounded-2xl px-4 py-3"
                  disabled={isPending}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search by code, guest, issuer, room, device id, provider, or provider status"
                  value={searchDraft}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-ink/65">
                  <span className="font-semibold text-ink">Created from</span>
                  <input
                    className="ui-input w-full rounded-2xl px-4 py-3"
                    disabled={isPending}
                    onChange={(event) => setFromDateDraft(event.target.value)}
                    type="date"
                    value={fromDateDraft}
                  />
                </label>
                <label className="space-y-2 text-sm text-ink/65">
                  <span className="font-semibold text-ink">Created until</span>
                  <input
                    className="ui-input w-full rounded-2xl px-4 py-3"
                    disabled={isPending}
                    onChange={(event) => setToDateDraft(event.target.value)}
                    type="date"
                    value={toDateDraft}
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} type="submit">Apply</button>
                <button className="ui-button-secondary disabled:opacity-60" disabled={isPending} onClick={handleClearFilters} type="button">Clear</button>
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
                  className={`${activePreset === preset.value ? 'ui-chip-active' : 'ui-chip'} disabled:opacity-60`}
                  disabled={isPending}
                  onClick={() => handlePreset(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="ui-panel-soft mt-4 rounded-[1.5rem] px-4 py-4 text-sm text-ink/65">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <span>Showing {credentials.length} of {totalCount} matching credentials · {visibleRangeLabel}</span>
                <button className="ui-button-secondary px-4 py-2" onClick={handleExport} type="button">
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {credentials.map((credential) => {
                const extendValue = extendDates[credential.id] ?? (credential.valid_until ? credential.valid_until.slice(0, 10) : '')

                return (
                  <article key={credential.id} className="ui-panel-soft rounded-[1.5rem] p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-semibold text-ink">{getCredentialLabel(credential)}</h3>
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${credentialStatusStyles[credential.status === 'revoked' ? 'revoked' : 'active']}`}>
                            {credential.status}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${providerStyles[credential.provider === 'seam' ? 'seam' : 'local_rfid']}`}>
                            {getProviderLabel(credential.provider)}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink/65">
                            {getProviderStatusLabel(credential.provider_status)}
                          </span>
                        </div>
                        <div className="grid gap-3 text-sm text-ink/70 md:grid-cols-2 xl:grid-cols-5">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Guest</p>
                            <p className="mt-1 font-semibold text-ink">{credential.bookings?.guest_name ?? credential.issued_to}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Room</p>
                            <p className="mt-1 font-semibold text-ink">{credential.rooms ? `Room ${credential.rooms.number}` : 'Unassigned'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Created</p>
                            <p className="mt-1 font-semibold text-ink">{credential.created_at ? formatDate(credential.created_at) : 'Not recorded'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Validity</p>
                            <p className="mt-1 font-semibold text-ink">{credential.valid_from ? formatDate(credential.valid_from) : 'Unknown'} to {credential.valid_until ? formatDate(credential.valid_until) : 'Unknown'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Device / reference</p>
                            <p className="mt-1 font-semibold text-ink">{credential.provider_device_id ?? credential.provider_reference ?? 'Not linked yet'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Issued by</p>
                        <p className="mt-1 font-semibold text-ink">{credential.issued_by}</p>
                        {credential.provider_error_message ? <p className="mt-3 max-w-xs text-sm text-red-700">{credential.provider_error_message}</p> : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto]">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Extend valid until</span>
                        <input
                          className="ui-input w-full rounded-2xl px-4 py-3"
                          min={credential.valid_from ? credential.valid_from.slice(0, 10) : undefined}
                          onChange={(event) => setExtendDates((current) => ({ ...current, [credential.id]: event.target.value }))}
                          type="date"
                          value={extendValue}
                        />
                      </label>
                      <div className="flex flex-wrap items-end gap-3 xl:justify-end">
                        {credential.status !== 'revoked' ? (
                          <button
                            className="rounded-full bg-red-100 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-200 disabled:opacity-60"
                            disabled={isPending}
                            onClick={() => handleRevoke(credential)}
                            type="button"
                          >
                            Revoke credential
                          </button>
                        ) : null}
                        <button
                          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => handleExtend(credential)}
                          type="button"
                        >
                          Extend validity
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}

              {credentials.length === 0 ? (
                <div className="ui-panel-muted rounded-[1.75rem] border-dashed px-6 py-10 text-center text-sm text-ink/55">
                  No access credentials match the current registry filters.
                </div>
              ) : null}
            </div>

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-ink/60">Page {currentPage} of {totalPages}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === 1} onClick={() => navigateRegistry({ page: '1' })} type="button">First</button>
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === 1} onClick={() => navigateRegistry({ page: String(Math.max(1, currentPage - 1)) })} type="button">Previous</button>
                  {visiblePages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={`min-w-10 px-4 py-2 text-sm disabled:opacity-50 ${pageNumber === currentPage ? 'ui-chip-active' : 'ui-chip'}`}
                      disabled={isPending || pageNumber === currentPage}
                      onClick={() => navigateRegistry({ page: String(pageNumber) })}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === totalPages} onClick={() => navigateRegistry({ page: String(Math.min(totalPages, currentPage + 1)) })} type="button">Next</button>
                  <button className="ui-button-secondary px-4 py-2 text-sm disabled:opacity-50" disabled={isPending || currentPage === totalPages} onClick={() => navigateRegistry({ page: String(totalPages) })} type="button">Last</button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Room coverage</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Access coverage</h2>
            <div className="ui-panel-soft mt-4 rounded-2xl px-4 py-3 text-sm text-ink/70">
              {activeProvider === 'seam' ? 'Mapped Seam devices are shown alongside active credential counts per room.' : 'Legacy RFID coverage is shown from active booking credentials per room.'}
            </div>
            <div className="mt-6 space-y-3">
              {roomCoverage.map(({ room, activeCredentials, mappedDeviceId, mappedDeviceName }) => (
                <div key={room.id} className="ui-panel-soft rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink">Room {room.number}</p>
                      <p className="text-sm capitalize text-ink/60">{room.type} · {room.status}</p>
                      {mappedDeviceId ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/45">{mappedDeviceName ?? mappedDeviceId}</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-ink/55">Active credentials</p>
                      <p className="font-semibold text-ink">{activeCredentials}</p>
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