'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import { triggerHistoryExport } from '@/lib/admin-history/client'
import { getRoleLabel, isStaffRole, STAFF_ROLE_OPTIONS, type StaffRole } from '@/lib/staff-roles'
import { formatGHS } from '@/lib/utils/format'
import type { Database } from '@/lib/supabase/types'

type StaffRow = Database['public']['Tables']['staff']['Row']
type ShiftRow = Database['public']['Tables']['shifts']['Row']
type StaffRecord = StaffRow & {
  active?: boolean | null
  auth_user_id?: string | null
}
type StaffAccount = {
  id: string
  email: string | null
  created_at: string | null
  staff_id: string | null
  role: StaffRole | null
  name: string | null
  active?: boolean
}
type ShiftHistoryRow = ShiftRow & {
  staff: Pick<StaffRow, 'id' | 'name' | 'role'> | null
}

type AdminStaffClientProps = {
  canManageAdminAccounts: boolean
  currentAuthUserId: string
  currentShiftPage: number
  historyFilters: {
    fromDate: string
    query: string
    status: 'all' | 'closed' | 'open'
    toDate: string
  }
  historyShifts: ShiftHistoryRow[]
  latestShifts: ShiftRow[]
  openShiftCount: number
  staff: StaffRecord[]
  staffAccounts: StaffAccount[]
  totalShiftCount: number
  totalShiftPages: number
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not recorded'
  }

  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function findStaffAccount(member: StaffRecord, staffAccounts: StaffAccount[]) {
  return staffAccounts.find((account) => account.staff_id === member.id || (!!member.auth_user_id && account.id === member.auth_user_id))
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

export function AdminStaffClient({
  canManageAdminAccounts,
  currentAuthUserId,
  currentShiftPage,
  historyFilters,
  historyShifts,
  latestShifts,
  openShiftCount,
  staff,
  staffAccounts,
  totalShiftCount,
  totalShiftPages
}: AdminStaffClientProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<'all' | 'on' | 'off' | 'inactive'>('all')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [newStaff, setNewStaff] = useState({
    name: '',
    role: 'receptionist' as StaffRole,
    dailyRateGhs: '',
    email: '',
    password: ''
  })
  const [identityDrafts, setIdentityDrafts] = useState<Record<string, { name: string; role: StaffRole; dailyRateGhs: string; email: string; password: string }>>(() =>
    Object.fromEntries(
      staff.map((member) => {
        const account = findStaffAccount(member, staffAccounts)
        return [
          member.id,
          {
            name: member.name,
            role: isStaffRole(member.role) ? member.role : 'receptionist',
            dailyRateGhs: String(member.daily_rate_ghs),
            email: account?.email ?? '',
            password: ''
          }
        ]
      })
    )
  )
  const [shiftSearchDraft, setShiftSearchDraft] = useState(historyFilters.query)
  const [shiftFromDateDraft, setShiftFromDateDraft] = useState(historyFilters.fromDate)
  const [shiftToDateDraft, setShiftToDateDraft] = useState(historyFilters.toDate)

  useEffect(() => {
    setShiftSearchDraft(historyFilters.query)
    setShiftFromDateDraft(historyFilters.fromDate)
    setShiftToDateDraft(historyFilters.toDate)
  }, [historyFilters.fromDate, historyFilters.query, historyFilters.toDate])

  const filteredStaff = useMemo(() => {
    if (filter === 'inactive') {
      return staff.filter((member) => member.active === false)
    }

    if (filter === 'on') {
      return staff.filter((member) => member.active !== false && member.on_shift)
    }

    if (filter === 'off') {
      return staff.filter((member) => member.active !== false && !member.on_shift)
    }

    return staff
  }, [filter, staff])

  const summary = useMemo(() => {
    const activeStaff = staff.filter((member) => member.active !== false)
    const onShift = activeStaff.filter((member) => member.on_shift).length
    const offShift = activeStaff.length - onShift
    const inactive = staff.length - activeStaff.length
    const payrollPerDay = activeStaff.reduce((sum, member) => sum + member.daily_rate_ghs, 0)
    const activeShiftRows = openShiftCount

    return { onShift, offShift, inactive, payrollPerDay, activeShiftRows }
  }, [openShiftCount, staff])

  const latestShiftByStaff = useMemo(() => {
    const entries = new Map<string, ShiftRow>()

    for (const shift of latestShifts) {
      if (shift.staff_id && !entries.has(shift.staff_id)) {
        entries.set(shift.staff_id, shift)
      }
    }

    return entries
  }, [latestShifts])

  const visibleRangeLabel = useMemo(() => {
    if (historyFilters.fromDate && historyFilters.toDate) {
      return `${historyFilters.fromDate} to ${historyFilters.toDate}`
    }

    if (historyFilters.fromDate) {
      return `From ${historyFilters.fromDate}`
    }

    if (historyFilters.toDate) {
      return `Up to ${historyFilters.toDate}`
    }

    return 'All recorded dates'
  }, [historyFilters.fromDate, historyFilters.toDate])

  const activePreset = useMemo(() => getActivePreset(historyFilters.fromDate, historyFilters.toDate), [historyFilters.fromDate, historyFilters.toDate])
  const visibleShiftPages = useMemo(() => getVisiblePages(currentShiftPage, totalShiftPages), [currentShiftPage, totalShiftPages])

  const staffAccountByStaffId = useMemo(() => {
    const entries = new Map<string, StaffAccount>()

    for (const member of staff) {
      const account = findStaffAccount(member, staffAccounts)

      if (account) {
        entries.set(member.id, account)
      }
    }

    for (const account of staffAccounts) {
      if (account.staff_id && !entries.has(account.staff_id)) {
        entries.set(account.staff_id, account)
      }
    }

    return entries
  }, [staff, staffAccounts])

  function navigateShiftHistory(next: Partial<Record<'shiftFrom' | 'shiftPage' | 'shiftQuery' | 'shiftStatus' | 'shiftTo', string | undefined>>) {
    const params = new URLSearchParams()
    const merged = {
      shiftFrom: historyFilters.fromDate,
      shiftPage: currentShiftPage > 1 ? String(currentShiftPage) : '',
      shiftQuery: historyFilters.query,
      shiftStatus: historyFilters.status === 'all' ? '' : historyFilters.status,
      shiftTo: historyFilters.toDate,
      ...next
    }

    for (const [key, value] of Object.entries(merged)) {
      if (!value || (key === 'shiftStatus' && value === 'all')) {
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

  function updateIdentityDraft(
    staffId: string,
    patch: Partial<{ name: string; role: StaffRole; dailyRateGhs: string; email: string; password: string }>
  ) {
    setIdentityDrafts((current) => ({
      ...current,
      [staffId]: {
        ...current[staffId],
        ...patch
      }
    }))
  }

  function createStaffMember() {
    resetMessages()

    if (!newStaff.name.trim() || !newStaff.email.trim() || !newStaff.password.trim() || !newStaff.dailyRateGhs.trim()) {
      setErrorMessage('Name, daily rate, email, and password are required to create staff.')
      return
    }

    if (newStaff.role === 'admin' && !canManageAdminAccounts) {
      setErrorMessage('Only the hotel manager account can provision additional admin users.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStaff.name.trim(),
          role: newStaff.role,
          dailyRateGhs: Number(newStaff.dailyRateGhs),
          email: newStaff.email.trim(),
          password: newStaff.password
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Staff creation failed.')
        return
      }

      setNewStaff({ name: '', role: 'receptionist', dailyRateGhs: '', email: '', password: '' })
      setSuccessMessage('Staff member and login account created.')
      router.refresh()
    })
  }

  function saveIdentity(member: StaffRow) {
    resetMessages()
    const draft = identityDrafts[member.id]
    const account = staffAccountByStaffId.get(member.id)

    if (!draft || !account || !draft.name.trim() || !draft.email.trim() || !draft.dailyRateGhs.trim()) {
      setErrorMessage('Name, daily rate, and login email are required to save staff changes.')
      return
    }

    if (draft.role === 'admin' && !canManageAdminAccounts) {
      setErrorMessage('Only the hotel manager account can assign admin role.')
      return
    }

    if (account.id === currentAuthUserId && draft.role !== 'admin') {
      setErrorMessage('You cannot remove admin access from your own account.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_identity',
          id: member.id,
          authUserId: account.id,
          name: draft.name.trim(),
          role: draft.role,
          dailyRateGhs: Number(draft.dailyRateGhs),
          email: draft.email.trim(),
          password: draft.password.trim() || undefined
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Staff update failed.')
        return
      }

      setIdentityDrafts((current) => ({
        ...current,
        [member.id]: {
          ...current[member.id],
          password: ''
        }
      }))
      setSuccessMessage(`Updated ${draft.name.trim()} and synced login credentials.`)
      router.refresh()
    })
  }

  function toggleStaffArchive(member: StaffRecord) {
    resetMessages()
    const account = staffAccountByStaffId.get(member.id)

    if (!account) {
      setErrorMessage('This staff member has no linked login account to remove.')
      return
    }

    if (account.id === currentAuthUserId) {
      setErrorMessage('You cannot archive your own account.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/staff', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          authUserId: account.id,
          active: member.active === false
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Staff archive update failed.')
        return
      }

      setSuccessMessage(member.active === false ? `${member.name} was reactivated.` : `${member.name} was archived and login access was disabled.`)
      router.refresh()
    })
  }

  function toggleShift(member: StaffRecord) {
    resetMessages()

    if (member.active === false) {
      setErrorMessage('Archived staff cannot be put on shift until reactivated.')
      return
    }

    startTransition(async () => {
      const response = await fetch('/api/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          onShift: !member.on_shift
        })
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Staff shift update failed.')
        return
      }

      setSuccessMessage(`${member.name} is now marked ${member.on_shift ? 'off shift' : 'on shift'}.`)
      router.refresh()
    })
  }

  function handleApplyShiftFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigateShiftHistory({
      shiftFrom: shiftFromDateDraft || undefined,
      shiftPage: undefined,
      shiftQuery: shiftSearchDraft.trim() || undefined,
      shiftTo: shiftToDateDraft || undefined
    })
  }

  function handleClearShiftFilters() {
    setShiftSearchDraft('')
    setShiftFromDateDraft('')
    setShiftToDateDraft('')
    navigateShiftHistory({ shiftFrom: undefined, shiftPage: undefined, shiftQuery: undefined, shiftStatus: undefined, shiftTo: undefined })
  }

  function handleShiftPreset(preset: 'last7' | 'thisMonth' | 'today') {
    const range = getPresetRange(preset)
    setShiftFromDateDraft(range.from)
    setShiftToDateDraft(range.to)
    navigateShiftHistory({ shiftFrom: range.from, shiftPage: undefined, shiftTo: range.to })
  }

  function handleExportShiftHistory() {
    triggerHistoryExport('staff', {
      shiftFrom: historyFilters.fromDate || undefined,
      shiftQuery: historyFilters.query || undefined,
      shiftStatus: historyFilters.status === 'all' ? undefined : historyFilters.status,
      shiftTo: historyFilters.toDate || undefined
    })
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 text-white lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-white/70">Admin Tower</p>
            <h1 className="font-[family-name:var(--font-display)] text-5xl">Staff</h1>
          </div>
        </header>

        {errorMessage ? <div className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{errorMessage}</div> : null}
        {successMessage ? <div className="rounded-2xl bg-green-50 px-5 py-4 text-sm text-green-700">{successMessage}</div> : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">On shift</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.onShift}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Off shift</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.offShift}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Inactive staff</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.inactive}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Daily payroll</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(summary.payrollPerDay)}</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/40 bg-white/80 p-5 shadow-card backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open shifts</p>
            <p className="mt-3 text-4xl font-semibold text-ink">{summary.activeShiftRows}</p>
          </article>
        </section>

        <section className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Staff intake</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Create staff records and logins</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/65">
                Add the staff member to payroll and provision the corresponding Supabase login in one step so the person can actually enter the system.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Full name</span>
                <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => setNewStaff((current) => ({ ...current, name: event.target.value }))} value={newStaff.name} />
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Role</span>
                <select className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => setNewStaff((current) => ({ ...current, role: event.target.value as StaffRole }))} value={newStaff.role}>
                  {STAFF_ROLE_OPTIONS.map((role) => (
                    <option key={role} disabled={role === 'admin' && !canManageAdminAccounts} value={role}>
                      {getRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Daily rate</span>
                <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" inputMode="decimal" onChange={(event) => setNewStaff((current) => ({ ...current, dailyRateGhs: event.target.value }))} value={newStaff.dailyRateGhs} />
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Login email</span>
                <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => setNewStaff((current) => ({ ...current, email: event.target.value }))} value={newStaff.email} />
              </label>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Temporary password</span>
                <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => setNewStaff((current) => ({ ...current, password: event.target.value }))} type="password" value={newStaff.password} />
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} onClick={createStaffMember} type="button">
              Add staff member
            </button>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Shift control</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Live staffing board</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {([
                  ['all', 'All staff'],
                  ['on', 'On shift'],
                  ['off', 'Off shift'],
                  ['inactive', 'Inactive']
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    className={`rounded-full px-5 py-3 text-sm font-semibold transition ${filter === value ? 'bg-ink text-white' : 'bg-parchment text-ink hover:bg-[#eadfce]'}`}
                    onClick={() => setFilter(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {filteredStaff.map((member) => {
                const latestShift = latestShiftByStaff.get(member.id)

                return (
                  <article key={member.id} className="rounded-[1.75rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    {(() => {
                      const account = staffAccountByStaffId.get(member.id)
                      const draft = identityDrafts[member.id]

                      return (
                        <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-2xl font-semibold text-ink">{member.name}</p>
                        <p className="mt-2 text-sm uppercase tracking-[0.24em] text-ink/45">{getRoleLabel(member.role)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${member.on_shift ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-100 border-gray-200 text-gray-700'}`}>
                          {member.on_shift ? 'On shift' : 'Off shift'}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${member.active === false ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                          {member.active === false ? 'Archived' : 'Active'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 space-y-2 text-sm text-ink/70">
                      <p>Daily rate: <span className="font-semibold text-ink">{formatGHS(member.daily_rate_ghs)}</span></p>
                      <p>Latest shift start: <span className="font-semibold text-ink">{formatDateTime(latestShift?.started_at ?? null)}</span></p>
                      <p>Latest shift end: <span className="font-semibold text-ink">{formatDateTime(latestShift?.ended_at ?? null)}</span></p>
                      <p>Login email: <span className="font-semibold text-ink">{account?.email ?? 'Not provisioned'}</span></p>
                      <p>Account access: <span className="font-semibold text-ink">{member.active === false ? 'Disabled' : 'Enabled'}</span></p>
                    </div>

                    <div className="mt-5 grid gap-3">
                      <label className="space-y-2 text-sm text-ink/65">
                        <span className="font-semibold text-ink">Staff name</span>
                        <input className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => updateIdentityDraft(member.id, { name: event.target.value })} value={draft?.name ?? member.name} />
                      </label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="font-semibold text-ink">Role</span>
                          <select className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => updateIdentityDraft(member.id, { role: event.target.value as StaffRole })} value={draft?.role ?? 'receptionist'}>
                            {STAFF_ROLE_OPTIONS.map((role) => (
                              <option key={role} disabled={role === 'admin' && !canManageAdminAccounts} value={role}>
                                {getRoleLabel(role)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm text-ink/65">
                          <span className="font-semibold text-ink">Daily rate</span>
                          <input className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" inputMode="decimal" onChange={(event) => updateIdentityDraft(member.id, { dailyRateGhs: event.target.value })} value={draft?.dailyRateGhs ?? String(member.daily_rate_ghs)} />
                        </label>
                      </div>
                      <label className="space-y-2 text-sm text-ink/65">
                        <span className="font-semibold text-ink">Login email</span>
                        <input className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => updateIdentityDraft(member.id, { email: event.target.value })} value={draft?.email ?? account?.email ?? ''} />
                      </label>
                      <label className="space-y-2 text-sm text-ink/65">
                        <span className="font-semibold text-ink">Reset password</span>
                        <input className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 outline-none transition focus:border-terracotta" onChange={(event) => updateIdentityDraft(member.id, { password: event.target.value })} placeholder="Leave blank to keep current password" type="password" value={draft?.password ?? ''} />
                      </label>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        className={`rounded-full px-5 py-3 text-sm font-semibold transition ${member.on_shift ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-ink text-white hover:bg-ink/90'} disabled:opacity-60`}
                        disabled={isPending || member.active === false}
                        onClick={() => toggleShift(member)}
                        type="button"
                      >
                        {member.on_shift ? 'End shift' : 'Start shift'}
                      </button>
                      <button className="rounded-full bg-[#27435a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1f3647] disabled:opacity-60" disabled={isPending || !account} onClick={() => saveIdentity(member)} type="button">
                        Save identity
                      </button>
                      <button className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${member.active === false ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`} disabled={isPending || !account} onClick={() => toggleStaffArchive(member)} type="button">
                        {member.active === false ? 'Reactivate staff' : 'Archive staff'}
                      </button>
                    </div>
                        </>
                      )
                    })()}
                  </article>
                )
              })}

              {filteredStaff.length === 0 ? (
                <div className="col-span-full rounded-[1.75rem] border border-dashed border-ink/15 bg-[#fcfaf6] px-6 py-10 text-center text-sm text-ink/55">
                  No staff members match this filter.
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
            <p className="text-sm uppercase tracking-[0.24em] text-ink/45">Shift history</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Historical attendance</h2>

            <div className="mt-6 flex flex-wrap gap-3">
              {([
                { label: 'All shifts', value: 'all' },
                { label: 'Open', value: 'open' },
                { label: 'Closed', value: 'closed' }
              ] as const).map((statusOption) => (
                <button
                  key={statusOption.value}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${historyFilters.status === statusOption.value ? 'bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'}`}
                  disabled={isPending}
                  onClick={() => navigateShiftHistory({ shiftPage: undefined, shiftStatus: statusOption.value === 'all' ? undefined : statusOption.value })}
                  type="button"
                >
                  {statusOption.label}
                </button>
              ))}
            </div>

            <form className="mt-4 grid gap-4" onSubmit={handleApplyShiftFilters}>
              <label className="space-y-2 text-sm text-ink/65">
                <span className="font-semibold text-ink">Search staff history</span>
                <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" disabled={isPending} onChange={(event) => setShiftSearchDraft(event.target.value)} placeholder="Search by staff name or role" value={shiftSearchDraft} />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2 text-sm text-ink/65">
                  <span className="font-semibold text-ink">From</span>
                  <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" disabled={isPending} onChange={(event) => setShiftFromDateDraft(event.target.value)} type="date" value={shiftFromDateDraft} />
                </label>
                <label className="space-y-2 text-sm text-ink/65">
                  <span className="font-semibold text-ink">To</span>
                  <input className="w-full rounded-2xl border border-ink/10 bg-[#fcfaf6] px-4 py-3 outline-none transition focus:border-terracotta" disabled={isPending} onChange={(event) => setShiftToDateDraft(event.target.value)} type="date" value={shiftToDateDraft} />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60" disabled={isPending} type="submit">Apply</button>
                <button className="rounded-full border border-ink/12 px-5 py-3 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-60" disabled={isPending} onClick={handleClearShiftFilters} type="button">Clear</button>
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
                  onClick={() => handleShiftPreset(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-[1.5rem] bg-[#fcfaf6] px-4 py-4 text-sm text-ink/65">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <span>Showing {historyShifts.length} of {totalShiftCount} matching shifts · {visibleRangeLabel}</span>
                <button className="rounded-full border border-ink/12 px-4 py-2 font-semibold text-ink transition hover:bg-parchment" onClick={handleExportShiftHistory} type="button">
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {historyShifts.map((shift) => {
                const member = shift.staff

                return (
                  <div key={shift.id} className="rounded-2xl bg-[#fcfaf6] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{member?.name ?? 'Unknown staff member'}</p>
                        <p className="text-sm uppercase tracking-[0.2em] text-ink/45">{getRoleLabel(member?.role)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${shift.ended_at ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-800'}`}>
                        {shift.ended_at ? 'Closed' : 'Open'}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-ink/70">
                      <p>Started: {formatDateTime(shift.started_at)}</p>
                      <p>Ended: {formatDateTime(shift.ended_at)}</p>
                    </div>
                  </div>
                )
              })}

              {historyShifts.length === 0 ? <div className="rounded-2xl bg-[#fcfaf6] px-4 py-6 text-sm text-ink/55">No shifts match the current historical filters.</div> : null}
            </div>

            {totalShiftPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-ink/60">Page {currentShiftPage} of {totalShiftPages}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentShiftPage === 1} onClick={() => navigateShiftHistory({ shiftPage: '1' })} type="button">First</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentShiftPage === 1} onClick={() => navigateShiftHistory({ shiftPage: String(Math.max(1, currentShiftPage - 1)) })} type="button">Previous</button>
                  {visibleShiftPages.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      className={`min-w-10 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${pageNumber === currentShiftPage ? 'bg-ink text-white' : 'border border-ink/12 text-ink hover:bg-parchment'}`}
                      disabled={isPending || pageNumber === currentShiftPage}
                      onClick={() => navigateShiftHistory({ shiftPage: String(pageNumber) })}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentShiftPage === totalShiftPages} onClick={() => navigateShiftHistory({ shiftPage: String(Math.min(totalShiftPages, currentShiftPage + 1)) })} type="button">Next</button>
                  <button className="rounded-full border border-ink/12 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-parchment disabled:opacity-50" disabled={isPending || currentShiftPage === totalShiftPages} onClick={() => navigateShiftHistory({ shiftPage: String(totalShiftPages) })} type="button">Last</button>
                </div>
              </div>
            ) : null}
          </article>
        </section>
      </div>
    </main>
  )
}