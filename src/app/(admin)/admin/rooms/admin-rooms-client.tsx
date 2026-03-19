'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type RoomRow = Database['public']['Tables']['rooms']['Row']
type RoomStatus = Database['public']['Enums']['room_status']
type RoomType = Database['public']['Enums']['room_type']
type RoomDraft = {
  number: string
  type: RoomType
  rate_ghs: string
}

type AdminRoomsClientProps = {
  rooms: RoomRow[]
}

const statusStyles: Record<RoomStatus, string> = {
  vacant: 'bg-green-50 border-green-200 text-green-800',
  occupied: 'bg-amber-50 border-amber-200 text-amber-800',
  reserved: 'bg-purple-50 border-purple-200 text-purple-800',
  cleaning: 'bg-blue-50 border-blue-200 text-blue-800',
  maintenance: 'bg-red-50 border-red-200 text-red-800'
}

const roomTypes: RoomType[] = ['single', 'double', 'suite', 'family']
const roomStatuses: RoomStatus[] = ['vacant', 'occupied', 'reserved', 'cleaning', 'maintenance']

function createDraft(room: RoomRow): RoomDraft {
  return {
    number: room.number,
    type: room.type,
    rate_ghs: String(room.rate_ghs)
  }
}

export function AdminRoomsClient({ rooms }: AdminRoomsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState<'all' | RoomStatus>('all')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [newRoom, setNewRoom] = useState<{ number: string; type: RoomType; rate_ghs: string; status: RoomStatus }>({
    number: '',
    type: 'single',
    rate_ghs: '',
    status: 'vacant'
  })
  const [drafts, setDrafts] = useState<Record<string, RoomDraft>>(() =>
    Object.fromEntries(rooms.map((room) => [room.id, createDraft(room)]))
  )

  const filteredRooms = useMemo(
    () => (statusFilter === 'all' ? rooms : rooms.filter((room) => room.status === statusFilter)),
    [rooms, statusFilter]
  )

  const summary = useMemo(() => {
    return {
      total: rooms.length,
      vacant: rooms.filter((room) => room.status === 'vacant').length,
      occupied: rooms.filter((room) => room.status === 'occupied').length,
      cleaning: rooms.filter((room) => room.status === 'cleaning').length
    }
  }, [rooms])

  function resetMessages() {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  function updateDraft(roomId: string, patch: Partial<RoomDraft>) {
    setDrafts((current) => ({
      ...current,
      [roomId]: {
        ...(current[roomId] ?? createDraft(rooms.find((room) => room.id === roomId) ?? rooms[0])),
        ...patch
      }
    }))
  }

  function updateRoomStatus(roomId: string, status: RoomStatus) {
    resetMessages()
    startTransition(async () => {
      const response = await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: roomId, status })
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Room update failed.')
        return
      }

      setSuccessMessage(`Room status changed to ${status}.`)
      router.refresh()
    })
  }

  function saveRoomDetails(roomId: string) {
    const draft = drafts[roomId]

    if (!draft || !draft.number.trim() || !draft.rate_ghs.trim()) {
      setErrorMessage('Room number and nightly rate are required.')
      return
    }

    resetMessages()
    startTransition(async () => {
      const response = await fetch('/api/rooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: roomId,
          number: draft.number.trim(),
          type: draft.type,
          rate_ghs: Number(draft.rate_ghs)
        })
      })

      const payload = (await response.json()) as { error?: string; number?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Room update failed.')
        return
      }

      setSuccessMessage(`Updated room ${payload.number ?? draft.number.trim()}.`)
      router.refresh()
    })
  }

  function createRoom() {
    if (!newRoom.number.trim() || !newRoom.rate_ghs.trim()) {
      setErrorMessage('Room number and nightly rate are required.')
      return
    }

    resetMessages()
    startTransition(async () => {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: newRoom.number.trim(),
          type: newRoom.type,
          rate_ghs: Number(newRoom.rate_ghs),
          status: newRoom.status
        })
      })

      const payload = (await response.json()) as { error?: string; number?: string }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Room creation failed.')
        return
      }

      setSuccessMessage(`Added room ${payload.number ?? newRoom.number.trim()}.`)
      setNewRoom({ number: '', type: 'single', rate_ghs: '', status: 'vacant' })
      router.refresh()
    })
  }

  function seedRooms() {
    resetMessages()
    startTransition(async () => {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_default_rooms' })
      })

      const payload = (await response.json()) as { error?: string; seeded?: number }
      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Room seeding failed.')
        return
      }

      setSuccessMessage(`Seeded ${payload.seeded ?? 0} rooms.`)
      router.refresh()
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Admin Tower</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Rooms</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-full border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
              disabled={isPending}
              onClick={seedRooms}
              type="button"
            >
              Seed default rooms
            </button>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Total rooms</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.total}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Vacant</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.vacant}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Occupied</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.occupied}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Cleaning</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.cleaning}</p>
          </article>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Inventory control</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Add rooms and set commercial rates</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/65">
                Create new inventory with the room number, room type, default nightly rate, and opening status before the desk starts selling it.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Room number</span>
                <input
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                  onChange={(event) => setNewRoom((current) => ({ ...current, number: event.target.value }))}
                  placeholder="401"
                  value={newRoom.number}
                />
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Room type</span>
                <select
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                  onChange={(event) => setNewRoom((current) => ({ ...current, type: event.target.value as RoomType }))}
                  value={newRoom.type}
                >
                  {roomTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Nightly rate</span>
                <input
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                  inputMode="decimal"
                  onChange={(event) => setNewRoom((current) => ({ ...current, rate_ghs: event.target.value }))}
                  placeholder="650"
                  value={newRoom.rate_ghs}
                />
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Opening status</span>
                <select
                  className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                  onChange={(event) => setNewRoom((current) => ({ ...current, status: event.target.value as RoomStatus }))}
                  value={newRoom.status}
                >
                  {roomStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163a2e] disabled:opacity-60"
              disabled={isPending}
              onClick={createRoom}
              type="button"
            >
              Add room
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Room board</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Live status and readiness</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {(['all', ...roomStatuses] as const).map((filter) => (
                <button
                  key={filter}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition ${statusFilter === filter ? 'bg-ink text-white' : 'bg-parchment text-ink hover:bg-[#eadfce]'}`}
                  onClick={() => setStatusFilter(filter)}
                  type="button"
                >
                  {filter === 'all' ? 'All rooms' : filter}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {filteredRooms.map((room) => (
              <article key={room.id} className="rounded-[1.75rem] border border-ink/10 bg-[#fcfaf6] p-6">
                <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Room {room.number}</p>
                    <p className="mt-2 text-2xl font-semibold capitalize text-ink">{drafts[room.id]?.type ?? room.type}</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusStyles[room.status]}`}>
                    {room.status}
                  </span>
                </div>

                  <div className="grid gap-3">
                    <label className="space-y-2 text-sm text-ink/65">
                      <span className="font-semibold text-ink">Room number</span>
                      <input
                        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                        onChange={(event) => updateDraft(room.id, { number: event.target.value })}
                        value={drafts[room.id]?.number ?? room.number}
                      />
                    </label>

                    <label className="space-y-2 text-sm text-ink/65">
                      <span className="font-semibold text-ink">Room type</span>
                      <select
                        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                        onChange={(event) => updateDraft(room.id, { type: event.target.value as RoomType })}
                        value={drafts[room.id]?.type ?? room.type}
                      >
                        {roomTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm text-ink/65">
                      <span className="font-semibold text-ink">Nightly rate</span>
                      <input
                        className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-ink outline-none transition focus:border-ink/25"
                        inputMode="decimal"
                        onChange={(event) => updateDraft(room.id, { rate_ghs: event.target.value })}
                        value={drafts[room.id]?.rate_ghs ?? String(room.rate_ghs)}
                      />
                    </label>
                  </div>

                  <div>
                    <p className="text-sm text-ink/65">Current nightly rate</p>
                    <p className="text-2xl font-semibold text-ink">{formatGHS(room.rate_ghs)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                  {roomStatuses.map((status) => (
                    <button
                      key={`${room.id}-${status}`}
                      className={`rounded-full px-3 py-2 text-xs font-semibold uppercase transition ${room.status === status ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-parchment'}`}
                      disabled={isPending || room.status === status}
                      onClick={() => updateRoomStatus(room.id, status)}
                      type="button"
                    >
                      {status}
                    </button>
                  ))}
                  </div>

                  <button
                    className="w-full rounded-full bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#163a2e] disabled:opacity-60"
                    disabled={isPending}
                    onClick={() => saveRoomDetails(room.id)}
                    type="button"
                  >
                    Save room details
                  </button>
                </div>
              </article>
            ))}

            {filteredRooms.length === 0 ? (
              <div className="col-span-full rounded-[1.75rem] border border-dashed border-ink/15 bg-[#fcfaf6] px-6 py-10 text-center text-sm text-ink/55">
                No rooms match this filter.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  )
}