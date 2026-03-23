import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Seam } from 'seam'

import { AdminDashboardRealtime } from '@/app/(admin)/admin/dashboard/admin-dashboard-realtime'
import { getAccessMigrationState } from '@/lib/access-provider/config'
import { buildDashboardIntelligence, type DashboardTrendPoint } from '@/lib/dashboard-intelligence'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'
import { formatGHS } from '@/lib/utils/format'

type PayMethod = Database['public']['Enums']['pay_method']
type RoomStatus = Database['public']['Enums']['room_status']
type AccessResult = Database['public']['Enums']['access_result']
type ServiceRequestStatus = Database['public']['Enums']['service_request_status']
type PaymentSummary = Pick<Database['public']['Tables']['payments']['Row'], 'amount_ghs' | 'method' | 'paid_at' | 'reference'>
type BookingSummary = Pick<Database['public']['Tables']['bookings']['Row'], 'id' | 'status' | 'balance_ghs' | 'total_ghs' | 'paid_ghs' | 'check_in' | 'check_out_expected' | 'nights'>
type NotificationSummary = Pick<Database['public']['Tables']['notifications']['Row'], 'id' | 'message' | 'read' | 'type' | 'created_at'>
type AccessSummary = Pick<Database['public']['Tables']['access_log']['Row'], 'result' | 'note' | 'accessed_at'> & {
  rooms: Array<{ number: string }> | null
}
type AccessMetricSummary = Pick<Database['public']['Tables']['access_log']['Row'], 'result'>
type RoomAccessDeviceMapping = Pick<
  Database['public']['Tables']['room_access_devices']['Row'],
  'display_name' | 'external_device_id' | 'updated_at'
> & {
  rooms: Array<{ number: string; type: Database['public']['Enums']['room_type'] }> | null
}
type RoomSummary = Pick<Database['public']['Tables']['rooms']['Row'], 'status'>
type ServiceRequestSummary = Pick<
  Database['public']['Tables']['service_requests']['Row'],
  'id' | 'assigned_staff_id' | 'completed_at' | 'created_at' | 'priority' | 'status'
>
type ExtensionAuditSummary = Pick<Database['public']['Tables']['booking_extension_audits']['Row'], 'id'>
type ShiftSummary = Pick<Database['public']['Tables']['shifts']['Row'], 'id'>
type AccessInfrastructureStatus = 'degraded' | 'offline' | 'online'
type AccessInfrastructureSummary = {
  degraded: number
  offline: number
  online: number
}
type AccessDeviceStatusCard = {
  deviceId: string
  displayName: string
  errorMessage: string | null
  manufacturer: string | null
  model: string | null
  onlineAccessCodesEnabled: boolean | null
  roomNumber: string | null
  status: AccessInfrastructureStatus
  syncTime: string | null
  warningMessage: string | null
}

const paymentLabels: Record<PayMethod, string> = {
  cash: 'Cash',
  momo: 'MoMo',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque'
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatCurrencyCompact(value: number) {
  return new Intl.NumberFormat('en-GH', {
    maximumFractionDigits: 0,
    notation: 'compact'
  }).format(value)
}

function formatMetric(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('en-GH', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits
  }).format(value)
}

function buildSparklinePath(points: DashboardTrendPoint[], width = 240, height = 72, padding = 8) {
  if (points.length === 0) {
    return ''
  }

  const values = points.map((point) => point.value)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const range = maximum - minimum || 1
  const step = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1)

  return points
    .map((point, index) => {
      const x = padding + step * index
      const normalized = (point.value - minimum) / range
      const y = height - padding - normalized * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function getTrendDirection(delta: number) {
  if (delta > 0) {
    return 'up'
  }

  if (delta < 0) {
    return 'down'
  }

  return 'flat'
}

function renderTrendDelta(delta: number, formatter: (value: number) => string, positiveLabel: string, negativeLabel: string) {
  const direction = getTrendDirection(delta)

  if (direction === 'flat') {
    return 'No net change over 7 days.'
  }

  return `${formatter(Math.abs(delta))} ${direction === 'up' ? positiveLabel : negativeLabel} over 7 days.`
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

function buildAccessAlert(result: AccessResult, roomNumber: string | null, note: string | null, accessedAt: string | null) {
  const roomLabel = roomNumber ? `Room ${roomNumber}` : 'Unknown room'
  const action = result === 'granted' ? 'Granted access' : result === 'expired' ? 'Expired card used' : 'Denied access'
  return `${action} for ${roomLabel} at ${formatDateTime(accessedAt)}${note ? `. ${note}` : '.'}`
}

function getObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getIssues(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return value
    .map((issue) => {
      const issueObject = getObject(issue)

      return getString(issueObject?.message) ?? getString(issueObject?.warning_code) ?? getString(issueObject?.error_code) ?? null
    })
    .filter((issue): issue is string => Boolean(issue))
}

function summarizeAccessInfrastructure(devices: Array<{ status: AccessInfrastructureStatus }>): AccessInfrastructureSummary {
  return devices.reduce<AccessInfrastructureSummary>(
    (totals, device) => {
      totals[device.status] += 1
      return totals
    },
    { degraded: 0, offline: 0, online: 0 }
  )
}

async function getSeamDeviceStatusCards(mappings: RoomAccessDeviceMapping[], apiKey: string) {
  if (mappings.length === 0) {
    return [] as AccessDeviceStatusCard[]
  }

  const seam = new Seam({ apiKey })

  return Promise.all(
    mappings.map(async (mapping) => {
      try {
        const device = (await seam.devices.get({ device_id: mapping.external_device_id })) as unknown
        const deviceObject = getObject(device)
        const properties = getObject(deviceObject?.properties)
        const model = getString(getObject(properties?.model)?.display_name)
        const manufacturer = getString(properties?.manufacturer)
        const warnings = getIssues(deviceObject?.warnings)
        const errors = getIssues(deviceObject?.errors)
        const isOnline = getBoolean(properties?.online)
        const onlineAccessCodesEnabled = getBoolean(properties?.online_access_codes_enabled)
        const batteryLevel = getNumber(properties?.battery_level)
        const batteryStatus = getString(getObject(properties?.battery)?.status)
        const warningMessage = warnings[0] ?? batteryStatus ?? null
        const errorMessage = errors[0] ?? null
        const status: AccessInfrastructureStatus = !isOnline
          ? 'offline'
          : errorMessage || warningMessage || onlineAccessCodesEnabled === false
            ? 'degraded'
            : 'online'

        return {
          deviceId: mapping.external_device_id,
          displayName: getString(deviceObject?.display_name) ?? mapping.display_name ?? mapping.external_device_id,
          errorMessage,
          manufacturer,
          model: batteryLevel !== null && model ? `${model} · ${(batteryLevel * 100).toFixed(0)}% battery` : model,
          onlineAccessCodesEnabled,
          roomNumber: mapping.rooms?.[0]?.number ?? null,
          status,
          syncTime: new Date().toISOString(),
          warningMessage,
        }
      } catch (error) {
        return {
          deviceId: mapping.external_device_id,
          displayName: mapping.display_name ?? mapping.external_device_id,
          errorMessage: error instanceof Error ? error.message : 'Unable to load Seam device state.',
          manufacturer: null,
          model: null,
          onlineAccessCodesEnabled: null,
          roomNumber: mapping.rooms?.[0]?.number ?? null,
          status: 'offline' as const,
          syncTime: mapping.updated_at,
          warningMessage: null,
        }
      }
    })
  )
}

function TrendCard({
  accentClassName,
  description,
  helper,
  lineClassName,
  linkHref,
  points,
  title,
  value
}: {
  accentClassName: string
  description: string
  helper: string
  lineClassName: string
  linkHref?: string
  points: DashboardTrendPoint[]
  title: string
  value: string
}) {
  const path = buildSparklinePath(points)

  return (
    <div className="ui-panel rounded-[1.75rem] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-ink">{value}</p>
          <p className="mt-2 text-sm text-ink/60">{description}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${accentClassName}`}>7 day signal</div>
      </div>
      <div className="ui-panel-soft mt-5 rounded-[1.5rem] px-3 py-4">
        <svg aria-hidden="true" className="h-[72px] w-full" viewBox="0 0 240 72" preserveAspectRatio="none">
          <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" className={lineClassName} />
        </svg>
        <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-ink/38">
          {points.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-sm text-ink/60">{helper}</p>
      {linkHref ? (
        <Link className="ui-button-secondary mt-4 inline-flex px-4 py-2 text-sm" href={linkHref}>
          Open detailed report
        </Link>
      ) : null}
    </div>
  )
}

const commandLinks = [
  { href: '/admin/bookings', label: 'Manage bookings' },
  { href: '/admin/payments', label: 'Review payments' },
  { href: '/admin/reports?mode=export', label: 'Open export studio' },
  { href: '/admin/settings', label: 'Hotel settings' },
  { href: '/admin/guest-access', label: 'Control guest access' },
  { href: '/admin/rooms', label: 'Run room board' },
  { href: '/admin/staff', label: 'Manage staff' },
  { href: '/reception/desk', label: 'Open reception flow' }
]

export default async function AdminDashboardPage() {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()
  const accessMigrationState = getAccessMigrationState()

  if (!user) {
    redirect('/login')
  }

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthStartIso = monthStart.toISOString()
  const today = new Date()
  const lastThirtyDaysStart = new Date(today)
  lastThirtyDaysStart.setDate(lastThirtyDaysStart.getDate() - 29)
  lastThirtyDaysStart.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setHours(0, 0, 0, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const lastThirtyDaysStartIso = lastThirtyDaysStart.toISOString()

  const [paymentsResult, bookingsResult, notificationsResult, accessResult, roomsResult, seamMappingsResult, serviceRequestsResult, extensionAuditsResult, accessMetricsResult, openShiftsResult] = await Promise.all([
    supabase.from('payments').select('amount_ghs, method, paid_at, reference').order('paid_at', { ascending: false }),
    supabase.from('bookings').select('id, status, balance_ghs, total_ghs, paid_ghs, check_in, check_out_expected, nights').order('check_in', { ascending: false }),
    supabase.from('notifications').select('id, message, read, type, created_at').order('created_at', { ascending: false }).limit(6),
    supabase.from('access_log').select('result, note, accessed_at, rooms(number)').order('accessed_at', { ascending: false }).limit(6),
    supabase.from('rooms').select('status').order('number'),
    supabase
      .from('room_access_devices')
      .select('display_name, external_device_id, updated_at, rooms(number, type)')
      .eq('provider', 'seam')
      .order('updated_at', { ascending: false }),
    supabase
      .from('service_requests')
      .select('id, assigned_staff_id, completed_at, created_at, priority, status')
      .gte('created_at', lastThirtyDaysStartIso)
      .lt('created_at', tomorrow.toISOString()),
    supabase
      .from('booking_extension_audits')
      .select('id')
      .gte('created_at', lastThirtyDaysStartIso)
      .lt('created_at', tomorrow.toISOString()),
    supabase
      .from('access_log')
      .select('result')
      .gte('accessed_at', lastThirtyDaysStartIso)
      .lt('accessed_at', tomorrow.toISOString()),
    supabase.from('shifts').select('id').is('ended_at', null)
  ])

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message)
  }

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message)
  }

  if (notificationsResult.error) {
    throw new Error(notificationsResult.error.message)
  }

  if (accessResult.error) {
    throw new Error(accessResult.error.message)
  }

  if (roomsResult.error) {
    throw new Error(roomsResult.error.message)
  }

  if (seamMappingsResult.error) {
    throw new Error(seamMappingsResult.error.message)
  }

  if (serviceRequestsResult.error) {
    throw new Error(serviceRequestsResult.error.message)
  }

  if (extensionAuditsResult.error) {
    throw new Error(extensionAuditsResult.error.message)
  }

  if (accessMetricsResult.error) {
    throw new Error(accessMetricsResult.error.message)
  }

  if (openShiftsResult.error) {
    throw new Error(openShiftsResult.error.message)
  }

  const payments = (paymentsResult.data ?? []) as PaymentSummary[]
  const bookings = (bookingsResult.data ?? []) as BookingSummary[]
  const notifications = (notificationsResult.data ?? []) as NotificationSummary[]
  const accessEvents = (accessResult.data ?? []) as AccessSummary[]
  const seamMappings = (seamMappingsResult.data ?? []) as RoomAccessDeviceMapping[]
  const rooms = (roomsResult.data ?? []) as RoomSummary[]
  const serviceRequests = (serviceRequestsResult.data ?? []) as ServiceRequestSummary[]
  const extensionAudits = (extensionAuditsResult.data ?? []) as ExtensionAuditSummary[]
  const accessMetrics = (accessMetricsResult.data ?? []) as AccessMetricSummary[]
  const openShifts = (openShiftsResult.data ?? []) as ShiftSummary[]
  const seamDeviceCards = accessMigrationState.seamApiKey
    ? await getSeamDeviceStatusCards(seamMappings, accessMigrationState.seamApiKey)
    : []

  const monthRevenue = payments.reduce((sum, payment) => {
    if (!payment.paid_at || payment.paid_at < monthStartIso) {
      return sum
    }

    return sum + payment.amount_ghs
  }, 0)

  const outstandingBalances = bookings.reduce((sum, booking) => sum + (booking.balance_ghs ?? 0), 0)
  const activeStays = bookings.filter((booking) => booking.status === 'active').length
  const unreadNotifications = notifications.filter((notification) => !notification.read).length
  const openBalances = bookings.filter((booking) => (booking.balance_ghs ?? 0) > 0).length
  const totalRooms = rooms.length
  const intelligence = buildDashboardIntelligence({
    accessResults: accessMetrics.map((event) => event.result),
    bookings,
    extensionAuditCount: extensionAudits.length,
    openShiftCount: openShifts.length,
    payments,
    serviceRequests,
    totalRooms,
    today
  })

  const paymentTotalsByMethod = payments.reduce<Record<PayMethod, number>>(
    (totals, payment) => {
      totals[payment.method] += payment.amount_ghs
      return totals
    },
    { cash: 0, momo: 0, bank_transfer: 0, cheque: 0 }
  )
  const totalCollected = Object.values(paymentTotalsByMethod).reduce((sum, amount) => sum + amount, 0)

  const paymentShares = (['cash', 'momo', 'bank_transfer', 'cheque'] as const).map((method) => ({
    label: paymentLabels[method],
    value: totalCollected === 0 ? 0 : (paymentTotalsByMethod[method] / totalCollected) * 100,
    total: paymentTotalsByMethod[method]
  }))

  const roomSummary = rooms.reduce<Record<RoomStatus, number>>(
    (totals, room) => {
      totals[room.status] += 1
      return totals
    },
    { vacant: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0 }
  )

  const accessInfrastructureSummary = summarizeAccessInfrastructure(seamDeviceCards)

  const alerts = [
    ...notifications.map((notification) => ({
      id: notification.id,
      label: notification.type.replaceAll('_', ' '),
      message: `${notification.message} ${formatDateTime(notification.created_at)}`
    })),
    ...accessEvents.map((event, index) => ({
      id: `access-${index}`,
      label: event.result,
      message: buildAccessAlert(event.result, event.rooms?.[0]?.number ?? null, event.note, event.accessed_at)
    }))
  ].slice(0, 8)

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#0f3d2e_0%,_#155d45_24%,_#f9fffc_24%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10" data-smoke-id="admin-dashboard">
      <span className="sr-only">smoke:admin-dashboard</span>
      <AdminDashboardRealtime />
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-4 rounded-[1.55rem] border border-white/55 bg-white p-5 shadow-card">
          <div className="space-y-2">
            <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">Command Center</h1>
            <p className="max-w-3xl text-sm leading-6 text-ink/68">Hotel operations at a glance across bookings, payments, rooms, services, and staff.</p>
          </div>

          <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {commandLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="ui-link-card rounded-[1rem] px-3.5 py-3 transition hover:-translate-y-0.5"
              >
                <p className="text-[12px] font-semibold text-ink md:text-[13px]">{link.label}</p>
              </Link>
            ))}
          </section>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="ui-panel rounded-[1.75rem] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Month revenue</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(monthRevenue)}</p>
          </article>
          <article className="ui-panel rounded-[1.75rem] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Outstanding balances</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(outstandingBalances)}</p>
          </article>
          <article className="ui-panel rounded-[1.75rem] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Active stays</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{activeStays} bookings</p>
          </article>
          <article className="ui-panel rounded-[1.75rem] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unread notifications</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{unreadNotifications} alerts</p>
          </article>
          <article className="ui-panel rounded-[1.75rem] p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Open balances</p>
            <p className="mt-3 text-3xl font-semibold text-ink">{openBalances} bookings</p>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Manager intelligence</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl text-ink">Commercial and stay KPIs</h2>
              </div>
              <p className="text-sm text-ink/55">Last 30 days of booking activity normalized into room-night metrics.</p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="ui-panel-soft rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Occupancy</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{formatPercent(intelligence.occupancyRate)}</p>
                <p className="mt-2 text-sm text-ink/60">Last 30 days of room-night coverage across the full inventory.</p>
              </div>
              <div className="ui-panel-soft rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">ADR</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(intelligence.adr)}</p>
                <p className="mt-2 text-sm text-ink/60">Average revenue per sold room-night in the active window.</p>
              </div>
              <div className="ui-panel-soft rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">RevPAR</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{formatGHS(intelligence.revpar)}</p>
                <p className="mt-2 text-sm text-ink/60">Revenue per available room-night across the full inventory.</p>
              </div>
              <div className="ui-panel-soft rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Average stay</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{formatMetric(intelligence.avgStayLength)} nights</p>
                <p className="mt-2 text-sm text-ink/60">Based on bookings that started within the current 30-day view.</p>
              </div>
              <div className="ui-panel-soft rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Extension rate</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{formatPercent(intelligence.extensionRate)}</p>
                <p className="mt-2 text-sm text-ink/60">Extension frequency over the same 30-day booking-start window.</p>
              </div>
              <div className="ui-panel-soft rounded-[1.5rem] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Cancellation rate</p>
                <p className="mt-3 text-4xl font-semibold text-ink">{formatPercent(intelligence.cancellationRate)}</p>
                <p className="mt-2 text-sm text-ink/60">Measures booked starts that ended up cancelled in the same window.</p>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-emerald-900/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(232,244,237,0.95))] p-7 text-ink shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Execution risk</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl text-ink">Pressure points</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.5rem] border border-emerald-900/8 bg-white p-5">
                <p className="text-sm text-ink/62">Aged balances</p>
                <p className="mt-2 text-4xl font-semibold text-ink">{formatGHS(intelligence.agedBalanceAmount)}</p>
                <p className="mt-2 text-sm text-ink/60">{intelligence.agedBalanceBookings} bookings have been carrying balances for at least 7 days.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-emerald-900/8 bg-white p-5">
                  <p className="text-sm text-ink/62">Request resolution</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{formatMetric(intelligence.avgResolutionHours)} hrs</p>
                  <p className="mt-2 text-sm text-ink/60">{formatPercent(intelligence.requestCompletionRate)} of last-30-day requests are already completed.</p>
                </div>
                <div className="rounded-[1.5rem] border border-emerald-900/8 bg-white p-5">
                  <p className="text-sm text-ink/62">Access failure rate</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{formatPercent(intelligence.accessFailureRate)}</p>
                  <p className="mt-2 text-sm text-ink/60">Across {accessMetrics.length} recent access attempts.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-emerald-900/8 bg-white p-5">
                  <p className="text-sm text-ink/62">Open request load</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{intelligence.openRequests}</p>
                  <p className="mt-2 text-sm text-ink/60">{intelligence.urgentUnassignedRequests} urgent or high-priority requests are still unassigned.</p>
                </div>
                <div className="rounded-[1.5rem] border border-emerald-900/8 bg-white p-5">
                  <p className="text-sm text-ink/62">Team workload</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{formatMetric(intelligence.requestsPerShift)} / shift</p>
                  <p className="mt-2 text-sm text-ink/60">{openShifts.length} active shifts are carrying the current open-request queue.</p>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-3">
          <TrendCard
            accentClassName="bg-[#ddeee7] text-[#1f5e4b]"
            description="Daily occupancy signal based on in-house room coverage across the last week."
            helper={renderTrendDelta(intelligence.occupancyDelta, (value) => `${Math.round(value)} pts`, 'higher occupancy', 'lower occupancy')}
            lineClassName="text-[#1f5e4b]"
            linkHref="/admin/reports?mode=outlook&preset=last-30-days&groupBy=day&category=front_office"
            points={intelligence.occupancyTrend}
            title="Occupancy trend"
            value={formatPercent(intelligence.latestOccupancy)}
          />
          <TrendCard
            accentClassName="bg-[#e8f5ed] text-[#1f6a4c]"
            description="Cash intake trend from payments posted each day over the last week."
            helper={renderTrendDelta(intelligence.revenueDelta, (value) => `GHS ${formatCurrencyCompact(value)}`, 'more intake', 'less intake')}
            lineClassName="text-[#1f6a4c]"
            linkHref="/admin/reports?mode=outlook&preset=last-30-days&groupBy=day&category=payments"
            points={intelligence.revenueTrend}
            title="Payments trend"
            value={formatGHS(intelligence.latestRevenue)}
          />
          <TrendCard
            accentClassName="bg-[#eef4df] text-[#53672b]"
            description="New guest-request volume created each day so pressure becomes visible before SLA drift."
            helper={renderTrendDelta(intelligence.requestDelta, (value) => `${Math.round(value)}`, 'more requests', 'fewer requests')}
            lineClassName="text-[#53672b]"
            linkHref="/admin/reports?mode=outlook&preset=last-30-days&groupBy=day&category=services"
            points={intelligence.requestTrend}
            title="Request trend"
            value={`${intelligence.latestRequestVolume} new`}
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-emerald-900/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(235,246,240,0.96))] p-7 text-ink shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Financial pulse</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {paymentShares.slice(0, 2).map((share) => (
                <div key={share.label} className="rounded-3xl border border-emerald-900/8 bg-white p-5">
                  <p className="text-sm text-ink/60">{share.label} share</p>
                  <p className="mt-2 text-4xl font-semibold text-ink">{formatPercent(share.value)}</p>
                  <p className="mt-2 text-sm text-ink/55">{formatGHS(share.total)}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {paymentShares.slice(2).map((share) => (
                <div key={share.label} className="rounded-2xl border border-emerald-900/8 bg-white/80 px-4 py-3 text-sm text-ink/75">
                  <div className="flex items-center justify-between gap-3">
                    <span>{share.label}</span>
                    <span>{formatPercent(share.value)}</span>
                  </div>
                  <div className="mt-2 text-ink/55">{formatGHS(share.total)}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-3xl border border-emerald-900/8 bg-white/85 p-5 text-sm text-ink/70">
              Payments are live from Supabase. `received_by` is session-driven, and booking balances are derived from `paid_ghs` against the booking total.
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Security watch</p>
            <div className="mt-5 space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/80">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{alert.label}</p>
                  <p className="mt-2">{alert.message}</p>
                </div>
              ))}
              {alerts.length === 0 ? <div className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/70">No recent notifications or access events yet.</div> : null}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Room readiness</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {([
                ['Vacant', roomSummary.vacant],
                ['Occupied', roomSummary.occupied],
                ['Reserved', roomSummary.reserved],
                ['Cleaning', roomSummary.cleaning],
                ['Maintenance', roomSummary.maintenance]
              ] as const).map(([label, count]) => (
                <div key={label} className="ui-panel-soft rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Booking exposure</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="ui-panel-soft rounded-3xl p-5">
                <p className="text-sm text-ink/55">Paid so far</p>
                <p className="mt-2 text-4xl font-semibold text-ink">{formatGHS(bookings.reduce((sum, booking) => sum + booking.paid_ghs, 0))}</p>
              </div>
              <div className="ui-panel-soft rounded-3xl p-5">
                <p className="text-sm text-ink/55">Booked total</p>
                <p className="mt-2 text-4xl font-semibold text-ink">{formatGHS(bookings.reduce((sum, booking) => sum + booking.total_ghs, 0))}</p>
              </div>
            </div>
            <div className="ui-panel-soft mt-5 rounded-3xl p-5 text-sm text-ink/70">
              {openBalances} bookings still carry balances totaling {formatGHS(outstandingBalances)}.
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Access device watch</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {([
                ['Online', accessInfrastructureSummary.online],
                ['Degraded', accessInfrastructureSummary.degraded],
                ['Offline', accessInfrastructureSummary.offline]
              ] as const).map(([label, count]) => (
                <div key={label} className="ui-panel-soft rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{label}</p>
                  <p className="mt-2 text-3xl font-semibold text-ink">{count}</p>
                </div>
              ))}
            </div>
            <div className="ui-panel-soft mt-5 rounded-3xl p-5 text-sm text-ink/70">
              Seam-mapped devices are checked live on page load. Offline means Seam reported the device as unavailable or the device state could not be fetched.
            </div>
          </article>

          <article className="rounded-[2rem] border border-ink/10 bg-white p-7 shadow-card">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/45">Latest access device status</p>
            <div className="mt-5 space-y-3">
              {seamDeviceCards.map((device) => (
                <div key={device.deviceId} className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/80">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold text-ink">{device.roomNumber ? `Room ${device.roomNumber}` : device.displayName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink/45">{device.displayName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink/35">{device.deviceId}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                        device.status === 'online'
                          ? 'bg-green-50 text-green-800'
                          : device.status === 'degraded'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-red-50 text-red-800'
                      }`}
                    >
                      {device.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <p>Synced: <span className="font-semibold text-ink">{formatDateTime(device.syncTime)}</span></p>
                    <p>Model: <span className="font-semibold text-ink">{device.model ?? 'Unknown'}</span></p>
                    <p>Manufacturer: <span className="font-semibold text-ink">{device.manufacturer ?? 'Unknown'}</span></p>
                    <p>Online codes: <span className="font-semibold text-ink">{device.onlineAccessCodesEnabled === null ? 'Unknown' : device.onlineAccessCodesEnabled ? 'Enabled' : 'Unavailable'}</span></p>
                  </div>
                  {device.warningMessage ? <p className="mt-3 text-sm text-amber-800">{device.warningMessage}</p> : null}
                  {device.errorMessage ? <p className="mt-2 text-sm text-red-700">{device.errorMessage}</p> : null}
                </div>
              ))}
              {seamDeviceCards.length === 0 ? (
                <div className="ui-panel-soft rounded-2xl p-4 text-sm text-ink/70">
                  No Seam device mappings have been synced yet.
                </div>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}