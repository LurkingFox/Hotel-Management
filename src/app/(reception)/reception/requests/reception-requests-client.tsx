'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { formatDate } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type BookingRow = Database['public']['Tables']['bookings']['Row']
type ServiceRequestRow = Database['public']['Tables']['service_requests']['Row']
type ServiceRequestEventRow = Database['public']['Tables']['service_request_events']['Row']
type ServiceRequestCategory = Database['public']['Enums']['service_request_category']
type ServiceRequestPriority = Database['public']['Enums']['service_request_priority']
type ServiceRequestStatus = Database['public']['Enums']['service_request_status']

type ActiveBooking = BookingRow & {
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | null
}

type ServiceRequestWithRelations = ServiceRequestRow & {
  bookings: Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'> | Array<Pick<BookingRow, 'id' | 'guest_name' | 'status' | 'check_in' | 'check_out_expected'>> | null
  rooms: Pick<RoomRow, 'id' | 'number' | 'type' | 'status'> | Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>> | null
}

type ServiceRequestEventSummary = Pick<ServiceRequestEventRow, 'id' | 'service_request_id' | 'event_type' | 'message' | 'actor_name' | 'actor_role' | 'created_at'>

type ReceptionRequestsClientProps = {
  activeBookings: ActiveBooking[]
  requestEvents: ServiceRequestEventSummary[]
  requests: ServiceRequestWithRelations[]
  rooms: Array<Pick<RoomRow, 'id' | 'number' | 'type' | 'status'>>
}

const categoryDetails: Array<{ value: ServiceRequestCategory; label: string; detail: string }> = [
  { value: 'housekeeping', label: 'Housekeeping', detail: 'Cleaning, linen, towels, toiletries.' },
  { value: 'maintenance', label: 'Maintenance', detail: 'AC, power, water, locks, repairs.' },
  { value: 'laundry', label: 'Laundry', detail: 'Pickup, same-day pressing, garment handling.' },
  { value: 'food', label: 'Food', detail: 'Kitchen delivery and hospitality requests.' },
  { value: 'minibar', label: 'Minibar', detail: 'Replenishment and usage follow-up.' },
  { value: 'billing', label: 'Billing', detail: 'Statement corrections and receipt questions.' },
  { value: 'other', label: 'Other', detail: 'Anything outside the default request groups.' }
]

const statusStyles: Record<ServiceRequestStatus, string> = {
  new: 'bg-[#eef3f8] text-[#28465d]',
  acknowledged: 'bg-[#f4ead9] text-[#7a5530]',
  assigned: 'bg-[#e8eef8] text-[#2d4e83]',
  in_progress: 'bg-[#e6f3ea] text-[#255b40]',
  completed: 'bg-[#e8f5ec] text-[#226441]',
  cancelled: 'bg-[#f7e4e2] text-[#9a433d]'
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
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function ReceptionRequestsClient({ activeBookings, requestEvents, requests, rooms }: ReceptionRequestsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState(activeBookings[0]?.id ?? '')
  const [roomId, setRoomId] = useState(activeBookings[0]?.rooms?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<ServiceRequestCategory>('housekeeping')
  const [priority, setPriority] = useState<ServiceRequestPriority>('normal')
  const [dueAt, setDueAt] = useState('')
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({})

  const eventsByRequestId = useMemo(() => {
    const grouped = new Map<string, ServiceRequestEventSummary[]>()

    for (const event of requestEvents) {
      const current = grouped.get(event.service_request_id) ?? []
      current.push(event)
      grouped.set(event.service_request_id, current)
    }

    return grouped
  }, [requestEvents])
  const openRequests = useMemo(() => requests.filter((request) => request.status !== 'completed' && request.status !== 'cancelled'), [requests])
  const recentResolved = useMemo(() => requests.filter((request) => request.status === 'completed').slice(0, 6), [requests])
  const selectedBooking = activeBookings.find((booking) => booking.id === bookingId) ?? null

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function submitNewRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resetMessages()

    if (!title.trim()) {
      setErrorMessage('Request title is required.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/service-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: bookingId || undefined,
          category,
          description: description.trim() || undefined,
          dueAt: dueAt || undefined,
          guestName: selectedBooking?.guest_name,
          priority,
          roomId: roomId || selectedBooking?.rooms?.id || undefined,
          source: 'reception',
          title: title.trim()
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'The request could not be created.')
        return
      }

      setSuccessMessage('Request logged and pushed into the service desk queue.')
      setTitle('')
      setDescription('')
      setDueAt('')
      router.refresh()
    })
  }

  function runAction(id: string, action: 'acknowledge' | 'complete' | 'start') {
    resetMessages()
    const resolutionNote = resolutionDrafts[id]?.trim() || undefined

    if (action === 'complete' && !resolutionNote) {
      setErrorMessage('Add a short completion note before closing the request.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/service-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, resolutionNote })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'The request could not be updated.')
        return
      }

      setSuccessMessage('Request updated.')
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_22%,_#f9fffc_22%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="text-white">
          <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Guest requests</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/72">Log and track guest needs and room issues on the live request board.</p>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">New request</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Log guest or room work</h2>
            </div>

            <form className="mt-8 space-y-5" onSubmit={submitNewRequest}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Active booking</span>
                  <select
                    className="ui-input"
                    disabled={isPending}
                    onChange={(event) => {
                      const nextBookingId = event.target.value
                      setBookingId(nextBookingId)
                      const nextBooking = activeBookings.find((booking) => booking.id === nextBookingId) ?? null
                      setRoomId(nextBooking?.rooms?.id ?? '')
                    }}
                    value={bookingId}
                  >
                    <option value="">No active booking linked</option>
                    {activeBookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        Room {booking.rooms?.number ?? 'N/A'} - {booking.guest_name} - Checkout {formatDate(booking.check_out_expected)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Room</span>
                  <select
                    className="ui-input"
                    disabled={isPending}
                    onChange={(event) => setRoomId(event.target.value)}
                    value={roomId}
                  >
                    <option value="">No room linked</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>Room {room.number} - {room.type}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-ink/75">Request title</span>
                <input
                  className="ui-input"
                  disabled={isPending}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Extra towels and bathroom restock"
                  value={title}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Category</span>
                  <select className="ui-input" disabled={isPending} onChange={(event) => setCategory(event.target.value as ServiceRequestCategory)} value={category}>
                    {categoryDetails.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <p className="text-sm text-ink/55">{categoryDetails.find((item) => item.value === category)?.detail}</p>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Priority</span>
                  <select className="ui-input" disabled={isPending} onChange={(event) => setPriority(event.target.value as ServiceRequestPriority)} value={priority}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink/75">Due by</span>
                  <input
                    className="ui-input"
                    disabled={isPending}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(event) => setDueAt(event.target.value)}
                    type="datetime-local"
                    value={dueAt}
                  />
                  <p className="text-sm text-ink/55">Set a service promise when the request has a clear guest deadline.</p>
                </label>

                <div className="ui-panel p-4 bg-surface-sunken text-sm text-ink/62">
                  <p className="font-semibold text-ink/78">Escalation guidance</p>
                  <p className="mt-2 leading-6">
                    Use a due time for anything tied to checkout, same-day delivery, room readiness, or guest complaints that need manager visibility before they drift.
                  </p>
                </div>
              </div>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-ink/75">Description</span>
                <textarea
                  className="ui-input min-h-[132px]"
                  disabled={isPending}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Guest requested same-day turnaround before 3pm."
                  value={description}
                />
              </label>

              <button className="ui-button-primary disabled:opacity-60" disabled={isPending} type="submit">
                Add request to queue
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] bg-white p-7 shadow-card">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Working queue</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Open requests</h2>
            </div>

            <div className="mt-6 space-y-4">
              {openRequests.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No open requests at the desk.</div> : null}
              {openRequests.map((request) => {
                const booking = pickSingle(request.bookings)
                const room = pickSingle(request.rooms)

                return (
                  <div key={request.id} className="ui-panel p-5 bg-surface-sunken">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-xl font-semibold text-ink">{request.title}</p>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${statusStyles[request.status]}`}>{request.status.replaceAll('_', ' ')}</span>
                        </div>
                        <p className="mt-2 text-sm text-ink/65">{request.category.replaceAll('_', ' ')} · Room {room?.number ?? 'Unassigned'} · {booking?.guest_name ?? request.guest_name ?? 'Guest not linked'}</p>
                        <p className="mt-1 text-sm text-ink/60">Opened {formatDateTime(request.created_at)} via {request.source.replaceAll('_', ' ')}</p>
                        {request.due_at ? <p className="mt-1 text-sm font-medium text-[#975d12]">Due by {formatDateTime(request.due_at)}</p> : null}
                        {request.description ? <p className="mt-3 text-sm leading-6 text-ink/72">{request.description}</p> : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div className="grid gap-4 md:grid-cols-2">
                        <textarea
                          className="ui-input min-h-[96px] text-sm"
                          disabled={isPending}
                          onChange={(event) => setResolutionDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Completion note when the guest receives the service"
                          value={resolutionDrafts[request.id] ?? ''}
                        />

                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Recent timeline</p>
                          <div className="mt-3 space-y-3">
                            {(eventsByRequestId.get(request.id) ?? []).slice(0, 3).map((event) => (
                              <div key={event.id} className="rounded-xl bg-surface-sunken p-3">
                                <p className="text-sm font-semibold text-ink">{event.message}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{event.actor_name ?? 'system'} · {formatDateTime(event.created_at)}</p>
                              </div>
                            ))}
                            {(eventsByRequestId.get(request.id) ?? []).length === 0 ? <p className="text-sm text-ink/55">No request events yet.</p> : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-end gap-3 lg:flex-col lg:items-stretch">
                        {request.status === 'new' ? (
                          <button className="ui-button-primary disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'acknowledge')} type="button">
                            Acknowledge
                          </button>
                        ) : null}
                        {request.status === 'assigned' ? (
                          <button className="rounded-full bg-[#dfe9f6] px-5 py-3 text-sm font-semibold text-[#26456d] transition hover:bg-[#cfddee] disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'start')} type="button">
                            Start work
                          </button>
                        ) : null}
                        {(request.status === 'acknowledged' || request.status === 'in_progress') ? (
                          <button className="ui-button-success disabled:opacity-60" disabled={isPending} onClick={() => runAction(request.id, 'complete')} type="button">
                            Complete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        </section>

        <section className="rounded-[2rem] bg-white p-7 shadow-card">
          <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Recently resolved</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Closed requests</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentResolved.length === 0 ? <div className="ui-panel-soft p-4 text-sm text-ink/70">No resolved requests yet.</div> : null}
            {recentResolved.map((request) => {
              const room = pickSingle(request.rooms)
              return (
                <div key={request.id} className="ui-panel-soft p-4">
                  <p className="text-lg font-semibold text-ink">{request.title}</p>
                  <p className="mt-2 text-sm text-ink/60">Room {room?.number ?? 'Unassigned'} · {formatDateTime(request.completed_at)}</p>
                  <div className="mt-3 space-y-2">
                    {(eventsByRequestId.get(request.id) ?? []).slice(0, 2).map((event) => (
                      <p className="text-sm text-ink/55" key={event.id}>{event.message}</p>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}