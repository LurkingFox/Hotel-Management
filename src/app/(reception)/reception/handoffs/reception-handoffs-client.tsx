'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { formatDate, formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type RoomRow = Database['public']['Tables']['rooms']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type OperationalHandoffRow = Database['public']['Tables']['operational_handoffs']['Row']
type OperationalHandoffItemRow = Database['public']['Tables']['operational_handoff_items']['Row']
type HandoffItemType = Database['public']['Enums']['operational_handoff_item_type']
type HandoffPriority = Database['public']['Enums']['operational_handoff_priority']

type ActiveBooking = Pick<BookingRow, 'id' | 'guest_name' | 'balance_ghs' | 'check_out_expected' | 'status'> & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
}

type OpenRequest = Pick<ServiceRequestRow, 'id' | 'title' | 'priority' | 'status' | 'guest_name'> & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
}

type RoomIssue = Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>

type HandoffItemWithRelations = OperationalHandoffItemRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
  service_requests: Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'> | Array<Pick<ServiceRequestRow, 'id' | 'title' | 'status' | 'priority'>> | null
}

type HandoffWithItems = OperationalHandoffRow & {
  operational_handoff_items: HandoffItemWithRelations[] | null
}

type ReceptionHandoffsClientProps = {
  activeBalances: ActiveBooking[]
  handoffs: HandoffWithItems[]
  openRequests: OpenRequest[]
  roomIssues: RoomIssue[]
  upcomingBookings: ActiveBooking[]
}

type DraftItem = {
  bookingId: string
  detail: string
  itemType: HandoffItemType
  ownerRole: string
  priority: HandoffPriority
  roomId: string
  serviceRequestId: string
  title: string
}

const itemTypes: HandoffItemType[] = ['carryover_guest', 'unresolved_request', 'payment_risk', 'vip_arrival', 'room_issue', 'general']
const priorityOptions: HandoffPriority[] = ['normal', 'high', 'urgent']

function pickSingle<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ')
}

function createDraftItem(): DraftItem {
  return {
    bookingId: '',
    detail: '',
    itemType: 'general',
    ownerRole: 'receptionist',
    priority: 'normal',
    roomId: '',
    serviceRequestId: '',
    title: ''
  }
}

export function ReceptionHandoffsClient({ activeBalances, handoffs, openRequests, roomIssues, upcomingBookings }: ReceptionHandoffsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [summary, setSummary] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([createDraftItem()])

  const openHandoffs = useMemo(() => handoffs.filter((handoff) => handoff.status !== 'closed'), [handoffs])

  function updateDraft(index: number, value: Partial<DraftItem>) {
    setDraftItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...value } : item)))
  }

  function submitHandoff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const response = await fetch('/api/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: draftItems,
          summary
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Handoff could not be created.')
        return
      }

      setSuccessMessage('Shift handoff recorded.')
      setSummary('')
      setDraftItems([createDraftItem()])
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_22%,_#f7f1e8_22%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/65">Shift support</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Carryover handoffs</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">
              Capture what the next shift or manager must not miss: risky balances, unresolved requests, room issues, and sensitive arrivals.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/15 bg-white/10 px-5 py-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60">Open handoffs</p>
            <p className="mt-2 text-3xl font-semibold text-white">{openHandoffs.length}</p>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Balance risks</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{activeBalances.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open requests</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{openRequests.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Room issues</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{roomIssues.length}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Upcoming arrivals</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{upcomingBookings.length}</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">New handoff</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Package unresolved work</h2>
            </div>

            <form className="mt-8 space-y-5" onSubmit={submitHandoff}>
              <label className="space-y-2">
                <span className="text-sm font-semibold text-ink/75">Shift summary</span>
                <textarea className="ui-input min-h-28 w-full rounded-2xl px-4 py-3" onChange={(event) => setSummary(event.target.value)} placeholder="Summarize what the next shift should watch immediately." value={summary} />
              </label>

              <div className="space-y-4">
                {draftItems.map((item, index) => (
                  <div key={index} className="ui-panel-soft rounded-[1.5rem] p-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Type</span>
                        <select className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { itemType: event.target.value as HandoffItemType })} value={item.itemType}>
                          {itemTypes.map((itemType) => (
                            <option key={itemType} value={itemType}>{formatLabel(itemType)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Priority</span>
                        <select className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { priority: event.target.value as HandoffPriority })} value={item.priority}>
                          {priorityOptions.map((priority) => (
                            <option key={priority} value={priority}>{formatLabel(priority)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Owner role</span>
                        <input className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { ownerRole: event.target.value })} placeholder="receptionist, admin, housekeeping" value={item.ownerRole} />
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Title</span>
                        <input className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { title: event.target.value })} placeholder="What needs follow-up?" value={item.title} />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Booking link</span>
                        <select className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { bookingId: event.target.value })} value={item.bookingId}>
                          <option value="">No booking linked</option>
                          {[...activeBalances, ...upcomingBookings].map((booking) => (
                            <option key={booking.id} value={booking.id}>{booking.guest_name} · Room {pickSingle(booking.rooms)?.number ?? 'N/A'}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Request link</span>
                        <select className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { serviceRequestId: event.target.value })} value={item.serviceRequestId}>
                          <option value="">No request linked</option>
                          {openRequests.map((request) => (
                            <option key={request.id} value={request.id}>{request.title}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold text-ink/75">Room link</span>
                        <select className="ui-input w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { roomId: event.target.value })} value={item.roomId}>
                          <option value="">No room linked</option>
                          {roomIssues.map((room) => (
                            <option key={room.id} value={room.id}>Room {room.number} · {room.status}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="mt-4 block space-y-2">
                      <span className="text-sm font-semibold text-ink/75">Detail</span>
                      <textarea className="ui-input min-h-24 w-full rounded-2xl px-4 py-3" onChange={(event) => updateDraft(index, { detail: event.target.value })} placeholder="Context, risks, or next step." value={item.detail} />
                    </label>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <button className="ui-button-secondary" onClick={() => setDraftItems((current) => [...current, createDraftItem()])} type="button">Add item</button>
                <button className="ui-button-primary disabled:opacity-60" disabled={isPending} type="submit">Record handoff</button>
              </div>
            </form>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Shift watchlist</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Open handoffs</h2>
            <div className="mt-6 space-y-4">
              {openHandoffs.length === 0 ? <div className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/70">No open handoffs yet.</div> : null}
              {openHandoffs.map((handoff) => {
                const unresolvedItems = (handoff.operational_handoff_items ?? []).filter((item) => !item.resolved)
                return (
                  <div key={handoff.id} className="ui-panel-soft rounded-[1.5rem] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-ink">{handoff.summary || 'Reception handoff'}</p>
                        <p className="mt-1 text-sm text-ink/60">Created by {handoff.created_by_name} · {formatDate(handoff.created_at.split('T')[0])}</p>
                      </div>
                      <span className="ui-pill px-3 py-1 text-xs font-semibold uppercase">{formatLabel(handoff.status)}</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {unresolvedItems.map((item) => {
                        const booking = pickSingle(item.bookings)
                        const room = pickSingle(item.rooms)
                        return (
                          <div key={item.id} className="ui-panel rounded-2xl p-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="font-semibold text-ink">{item.title}</p>
                              <span className="rounded-full bg-[#fff1ee] px-3 py-1 text-xs font-semibold uppercase text-[#9f3527]">{formatLabel(item.priority)}</span>
                            </div>
                            <p className="mt-2 text-sm text-ink/60">{item.detail || 'No extra detail provided.'}</p>
                            <p className="mt-2 text-sm text-ink/55">{booking?.guest_name ?? 'No guest linked'} · {room ? `Room ${room.number}` : 'No room linked'}</p>
                          </div>
                        )
                      })}
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