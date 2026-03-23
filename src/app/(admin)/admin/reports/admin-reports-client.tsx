'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { DashboardIntelligenceMetrics, DashboardTrendPoint } from '@/lib/dashboard-intelligence'
import { getHotelAddressLines, getHotelContactLines, type HotelProfile } from '@/lib/hotel-info'
import {
  buildReportTitle,
  formatAmount,
  formatDateTimeLabel,
  getCategoryLabel,
  getPresetLabel,
  getRangeDescription,
  groupOperations,
  type ReportCategory,
  type ReportFilters,
  type ReportOperation,
  type ReportSummary
} from '@/lib/reporting'
import { formatGHS } from '@/lib/utils/format'

type StaffOption = {
  active: boolean
  id: string
  name: string
  role: string
}

type AdminReportsClientProps = {
  filters: ReportFilters
  hotelProfile: HotelProfile
  intelligence: DashboardIntelligenceMetrics | null
  operations: ReportOperation[]
  staffOptions: StaffOption[]
  summary: ReportSummary
  workspaceMode: ReportsWorkspaceMode
}

type InsightRow = {
  label: string
  meta?: string
  value: string
}

type CategoryPageModel = {
  accent: string
  category: ReportCategory
  description: string
  groupedOperations: ReturnType<typeof groupOperations>
  eyebrow: string
  mixRows: InsightRow[]
  operations: ReportOperation[]
  pageSummary: InsightRow[]
  periodRows: InsightRow[]
  roomRows: InsightRow[]
  staffRows: InsightRow[]
}

type ReportsWorkspaceMode = 'export' | 'outlook'

const categoryOptions: Array<{ label: string; value: ReportCategory }> = [
  { label: 'Front office', value: 'front_office' },
  { label: 'Payments', value: 'payments' },
  { label: 'Services', value: 'services' },
  { label: 'Access events', value: 'access' },
  { label: 'Staffing', value: 'staffing' }
]

const categoryMeta: Record<ReportCategory, { accent: string; description: string; eyebrow: string }> = {
  access: {
    accent: 'from-[#1f5a59] via-[#3d8477] to-[#edf8f5]',
    description: 'Access control is isolated into a security sheet so granted entries, denials, credential activity, and room patterns are readable without payment noise.',
    eyebrow: 'Security sheet'
  },
  front_office: {
    accent: 'from-[#1f5f50] via-[#4f8d78] to-[#edf8f2]',
    description: 'Front office activity stays together as a guest-movement report covering reservations, arrivals, departures, extensions, and access credential lifecycle events.',
    eyebrow: 'Guest movement sheet'
  },
  payments: {
    accent: 'from-[#245d46] via-[#4a8e6f] to-[#edf7f0]',
    description: 'Payments are broken out as their own report page with collection totals, method mix, staff handling, and receipt flow by period.',
    eyebrow: 'Finance sheet'
  },
  services: {
    accent: 'from-[#49652a] via-[#7b9950] to-[#f3f8e8]',
    description: 'Service revenue gets a dedicated view for posted value, open versus resolved items, staff touchpoints, and room concentration.',
    eyebrow: 'Revenue sheet'
  },
  staffing: {
    accent: 'from-[#2d5860] via-[#5a8790] to-[#edf5f6]',
    description: 'Staffing is separated into an operations sheet that shows shift coverage, open shifts, and who is carrying the reporting load.',
    eyebrow: 'Workforce sheet'
  }
}

const presetOptions = [
  { label: 'Today', value: 'today' },
  { label: 'This week', value: 'this-week' },
  { label: 'This month', value: 'this-month' },
  { label: 'Last 30 days', value: 'last-30-days' },
  { label: 'Custom', value: 'custom' }
] as const

const groupOptions = [
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' }
] as const

function filenameFromTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'hotel-report'
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  const normalizedBytes = Uint8Array.from(bytes)
  const blob = new Blob([normalizedBytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function wrapText(text: string, maxCharacters: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word

    if (candidate.length <= maxCharacters) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
    }

    current = word
  }

  if (current) {
    lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) {
    return 'Unspecified'
  }

  return value.replaceAll('_', ' ')
}

function countUnique(values: Array<string | null | undefined>) {
  return new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)).size
}

function sumAmounts(operations: ReportOperation[]) {
  return operations.reduce((sum, operation) => sum + (operation.amountGhs ?? 0), 0)
}

function formatCountLabel(count: number, label: string) {
  const normalized = label.trim()

  if (normalized.length === 0) {
    return String(count)
  }

  if (count === 1) {
    return `${count} ${normalized.endsWith('s') ? normalized.slice(0, -1) : normalized}`
  }

  return `${count} ${normalized.endsWith('s') ? normalized : `${normalized}s`}`
}

function topRows(
  values: Array<{ amount?: number | null; key: string | null | undefined }>,
  emptyLabel: string,
  quantityLabel: string,
  limit = 5
) {
  const totals = new Map<string, { amount: number; count: number }>()

  for (const value of values) {
    if (!value.key || value.key.trim().length === 0) {
      continue
    }

    const existing = totals.get(value.key) ?? { amount: 0, count: 0 }
    existing.count += 1
    existing.amount += value.amount ?? 0
    totals.set(value.key, existing)
  }

  const rows = [...totals.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count
      }

      return right[1].amount - left[1].amount
    })
    .slice(0, limit)
    .map(([label, totalsForLabel]) => ({
      label,
      meta: totalsForLabel.amount > 0 ? formatGHS(totalsForLabel.amount) : undefined,
      value: formatCountLabel(totalsForLabel.count, quantityLabel)
    }))

  return rows.length > 0 ? rows : [{ label: emptyLabel, value: 'No recorded activity' }]
}

function buildMixRows(category: ReportCategory, operations: ReportOperation[]): InsightRow[] {
  const totals = new Map<string, { amount: number; count: number }>()

  for (const operation of operations) {
    const key = formatStatusLabel(operation.status)
    const existing = totals.get(key) ?? { amount: 0, count: 0 }
    existing.count += 1
    existing.amount += operation.amountGhs ?? 0
    totals.set(key, existing)
  }

  const rows = [...totals.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count
      }

      return right[1].amount - left[1].amount
    })
    .slice(0, 6)
    .map(([label, totalsForLabel]) => ({
      label,
      meta: totalsForLabel.amount > 0 ? formatGHS(totalsForLabel.amount) : undefined,
      value: `${totalsForLabel.count} ${category === 'payments' ? 'receipts' : 'events'}`
    }))

  return rows.length > 0 ? rows : [{ label: 'No status mix yet', value: 'No activity in range' }]
}

function buildPageSummary(category: ReportCategory, operations: ReportOperation[]): InsightRow[] {
  const amountTotal = sumAmounts(operations)
  const openCount = operations.filter((operation) => operation.status === 'open').length
  const resolvedCount = operations.filter((operation) => operation.status === 'resolved').length
  const deniedCount = operations.filter((operation) => operation.status !== 'granted').length
  const grantedCount = operations.filter((operation) => operation.status === 'granted').length
  const averageReceipt = operations.length > 0 ? amountTotal / operations.length : 0

  if (category === 'payments') {
    return [
      { label: 'Total collected', value: formatGHS(amountTotal) },
      { label: 'Receipts logged', value: String(operations.length) },
      { label: 'Average receipt', value: formatGHS(averageReceipt) },
      { label: 'Collectors involved', value: String(countUnique(operations.map((operation) => operation.actorName))) }
    ]
  }

  if (category === 'services') {
    return [
      { label: 'Service value', value: formatGHS(amountTotal) },
      { label: 'Open items', value: String(openCount) },
      { label: 'Resolved items', value: String(resolvedCount) },
      { label: 'Rooms served', value: String(countUnique(operations.map((operation) => operation.roomLabel))) }
    ]
  }

  if (category === 'access') {
    const total = operations.length || 1
    return [
      { label: 'Granted entries', value: String(grantedCount) },
      { label: 'Denied entries', value: String(deniedCount) },
      { label: 'Denial rate', value: `${Math.round((deniedCount / total) * 100)}%` },
      { label: 'Rooms touched', value: String(countUnique(operations.map((operation) => operation.roomLabel))) }
    ]
  }

  if (category === 'staffing') {
    return [
      { label: 'Shifts logged', value: String(operations.length) },
      { label: 'Open shifts', value: String(openCount) },
      { label: 'Closed shifts', value: String(resolvedCount + operations.filter((operation) => operation.status === 'closed').length) },
      { label: 'Staff covered', value: String(countUnique(operations.map((operation) => operation.actorName))) }
    ]
  }

  const reservations = operations.filter((operation) => operation.status === 'reservation_created').length
  const arrivals = operations.filter((operation) => operation.status === 'booking_checked_in' || operation.status === 'walk_in_checked_in').length
  const departures = operations.filter((operation) => operation.status === 'booking_checked_out').length
  const credentials = operations.filter(
    (operation) => operation.status?.includes('keycard') || operation.status?.includes('master_key') || operation.status?.includes('access_credential')
  ).length

  return [
    { label: 'Front-office events', value: String(operations.length) },
    { label: 'Reservations created', value: String(reservations) },
    { label: 'Arrivals and departures', value: String(arrivals + departures) },
    { label: 'Credential actions', value: String(credentials) }
  ]
}

function buildPeriodRows(groupedOperations: ReturnType<typeof groupOperations>): InsightRow[] {
  const rows = groupedOperations.slice(0, 6).map((group) => {
    const valueTotal = sumAmounts(group.operations)

    return {
      label: group.label,
      meta: valueTotal > 0 ? formatGHS(valueTotal) : undefined,
      value: `${group.operations.length} items`
    }
  })

  return rows.length > 0 ? rows : [{ label: 'No grouped periods yet', value: 'Adjust the range or categories' }]
}

function renderInsightRows(rows: InsightRow[]) {
  return rows.map((row) => (
    <div key={`${row.label}-${row.value}`} className="flex items-start justify-between gap-4 border-t border-ink/10 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div>
        <p className="text-sm font-semibold text-ink">{row.label}</p>
        {row.meta ? <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/45">{row.meta}</p> : null}
      </div>
      <p className="text-sm font-semibold text-ink/75">{row.value}</p>
    </div>
  ))
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function formatMetric(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat('en-GH', {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits
  }).format(value)
}

function buildSparklinePath(points: DashboardTrendPoint[], width = 200, height = 56, padding = 8) {
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

function ReportsTrendCard({
  accentClassName,
  description,
  lineClassName,
  points,
  title,
  value
}: {
  accentClassName: string
  description: string
  lineClassName: string
  points: DashboardTrendPoint[]
  title: string
  value: string
}) {
  const path = buildSparklinePath(points)

  return (
    <div className="ui-panel rounded-[1.5rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${accentClassName}`}>signal</div>
      </div>
      <div className="ui-panel-soft mt-4 rounded-[1.2rem] px-3 py-3">
        <svg aria-hidden="true" className="h-[56px] w-full" preserveAspectRatio="none" viewBox="0 0 200 56">
          <path
            className={lineClassName}
            d={path}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </svg>
        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-ink/38">
          {points.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-sm text-ink/60">{description}</p>
    </div>
  )
}

export function AdminReportsClient({ filters, hotelProfile, intelligence, operations, staffOptions, summary, workspaceMode }: AdminReportsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isExporting, setIsExporting] = useState(false)
  const [draftPreset, setDraftPreset] = useState(filters.preset)
  const [draftGroupBy, setDraftGroupBy] = useState(filters.groupBy)
  const [draftScope, setDraftScope] = useState(filters.scope)
  const [draftStaffId, setDraftStaffId] = useState(filters.staffId ?? '')
  const [draftStartDate, setDraftStartDate] = useState(filters.startDate)
  const [draftEndDate, setDraftEndDate] = useState(filters.endDate)
  const [draftCategories, setDraftCategories] = useState<ReportCategory[]>(filters.categories)

  const reportTitle = useMemo(() => buildReportTitle(filters), [filters])
  const filterSummary = useMemo(() => `${getPresetLabel(filters.preset)} · Grouped by ${filters.groupBy}`, [filters])
  const addressLines = useMemo(() => getHotelAddressLines(hotelProfile), [hotelProfile])
  const contactLines = useMemo(() => getHotelContactLines(hotelProfile), [hotelProfile])
  const selectedCategoryLabels = useMemo(() => filters.categories.map((category) => getCategoryLabel(category)).join(' · '), [filters.categories])

  const categoryPages = useMemo<CategoryPageModel[]>(() => {
    return filters.categories.map((category) => {
      const categoryOperations = operations.filter((operation) => operation.category === category)
      const grouped = groupOperations(categoryOperations, filters.groupBy)

      return {
        ...categoryMeta[category],
        category,
        groupedOperations: grouped,
        mixRows: buildMixRows(category, categoryOperations),
        operations: categoryOperations,
        pageSummary: buildPageSummary(category, categoryOperations),
        periodRows: buildPeriodRows(grouped),
        roomRows: topRows(
          categoryOperations.map((operation) => ({ amount: operation.amountGhs, key: operation.roomLabel })),
          'No room-linked activity',
          'event'
        ),
        staffRows: topRows(
          categoryOperations.map((operation) => ({ amount: operation.amountGhs, key: operation.actorName })),
          'No staff attribution',
          'event'
        )
      }
    })
  }, [filters.categories, filters.groupBy, operations])

  const executiveCards = useMemo(
    () => [
      { label: 'Operations in pack', value: String(summary.operationsCount) },
      { label: 'Payments collected', value: formatGHS(summary.paymentsTotal) },
      { label: 'Service value', value: formatGHS(summary.serviceChargesTotal) },
      { label: 'Access exceptions', value: String(summary.accessDeniedCount) },
      { label: 'Granted entries', value: String(summary.accessGrantedCount) },
      { label: 'Staff represented', value: String(summary.staffInvolvedCount) }
    ],
    [summary]
  )

  const overviewGroups = useMemo(() => groupOperations(operations, filters.groupBy), [filters.groupBy, operations])

  const categorySignals = useMemo(() => {
    return filters.categories.map((category) => {
      const categoryOperations = operations.filter((operation) => operation.category === category)
      const amountTotal = sumAmounts(categoryOperations)
      const openCount = categoryOperations.filter((operation) => {
        const status = operation.status ?? ''
        return ['open', 'new', 'acknowledged', 'assigned', 'in_progress', 'pending'].includes(status)
      }).length
      const deniedCount = categoryOperations.filter((operation) => operation.status !== 'granted').length
      const grantedCount = categoryOperations.filter((operation) => operation.status === 'granted').length
      const reservations = categoryOperations.filter((operation) => operation.status === 'reservation_created').length
      const arrivals = categoryOperations.filter(
        (operation) => operation.status === 'booking_checked_in' || operation.status === 'walk_in_checked_in'
      ).length
      const departures = categoryOperations.filter((operation) => operation.status === 'booking_checked_out').length

      if (category === 'payments') {
        return {
          category,
          description: 'Collections logged inside the active report window.',
          eyebrow: 'Collections signal',
          headline: formatGHS(amountTotal),
          support: `${categoryOperations.length} receipts recorded`,
          tone: 'bg-[#eef5ef] text-[#274336]',
          valueLabel: 'Collected'
        }
      }

      if (category === 'services') {
        return {
          category,
          description: 'Service work and value still moving through the hotel.',
          eyebrow: 'Service pressure',
          headline: String(openCount),
          support: `${formatGHS(amountTotal)} posted value`,
          tone: 'bg-[#f7f0de] text-[#59491f]',
          valueLabel: 'Open or unresolved'
        }
      }

      if (category === 'access') {
        return {
          category,
          description: 'Security friction and successful entry activity.',
          eyebrow: 'Access control',
          headline: String(deniedCount),
          support: `${grantedCount} granted entries`,
          tone: 'bg-[#e5eef5] text-[#1f3b52]',
          valueLabel: 'Exceptions'
        }
      }

      if (category === 'staffing') {
        return {
          category,
          description: 'Shift logging and workforce handling inside the range.',
          eyebrow: 'Coverage signal',
          headline: String(categoryOperations.length),
          support: `${openCount} open shifts still visible`,
          tone: 'bg-[#f0eef9] text-[#342c59]',
          valueLabel: 'Shift records'
        }
      }

      return {
        category,
        description: 'Guest movement, arrivals, departures, and booking changes.',
        eyebrow: 'Guest movement',
        headline: String(categoryOperations.length),
        support: `${reservations} reservations · ${arrivals + departures} arrivals and departures`,
        tone: 'bg-[#f6ece2] text-[#4d2f22]',
        valueLabel: 'Front-office events'
      }
    })
  }, [filters.categories, operations])

  const activityLeaders = useMemo(
    () => ({
      rooms: topRows(
        operations.map((operation) => ({ amount: operation.amountGhs, key: operation.roomLabel })),
        'No room-linked activity',
        'event',
        4
      ),
      staff: topRows(
        operations.map((operation) => ({ amount: operation.amountGhs, key: operation.actorName })),
        'No staff attribution',
        'event',
        4
      )
    }),
    [operations]
  )

  const watchlistRows = useMemo<InsightRow[]>(() => {
    if (!intelligence) {
      return [
        { label: 'Access exceptions', value: String(summary.accessDeniedCount) },
        { label: 'Recorded operations', value: String(summary.operationsCount) },
        { label: 'Staff represented', value: String(summary.staffInvolvedCount) }
      ]
    }

    return [
      {
        label: 'Aged balances',
        meta: `${intelligence.agedBalanceBookings} bookings aging beyond 7 days`,
        value: formatGHS(intelligence.agedBalanceAmount)
      },
      {
        label: 'Urgent unassigned requests',
        meta: `${intelligence.openRequests} open requests in the period`,
        value: String(intelligence.urgentUnassignedRequests)
      },
      {
        label: 'Access failure rate',
        meta: 'Door access denials and expired attempts in range',
        value: formatPercent(intelligence.accessFailureRate)
      },
      {
        label: 'Average request resolution',
        meta: `${formatPercent(intelligence.requestCompletionRate)} completed in range`,
        value: `${formatMetric(intelligence.avgResolutionHours)} hrs`
      }
    ]
  }, [intelligence, summary.accessDeniedCount, summary.operationsCount, summary.staffInvolvedCount])

  const isOutlookMode = workspaceMode === 'outlook'
  const workspaceHeroTitle = isOutlookMode ? 'Reports' : 'Export studio'
  const workspaceHeroDescription = isOutlookMode
    ? 'Live operational review across finance, service, guest movement, access, and staffing.'
    : 'Print setup and preview for the management PDF pack.'
  const workspaceFilterLabel = isOutlookMode ? 'Outlook filters' : 'Export filters'
  const workspaceCategoryLabel = isOutlookMode ? 'Included lanes' : 'Included sheets'
  const applyFiltersLabel = isPending ? (isOutlookMode ? 'Refreshing outlook...' : 'Refreshing export pack...') : isOutlookMode ? 'Apply outlook filters' : 'Apply export filters'

  function buildReportParams(values?: {
    categories?: ReportCategory[]
    endDate?: string
    groupBy?: ReportFilters['groupBy']
    mode?: ReportsWorkspaceMode
    preset?: ReportFilters['preset']
    scope?: ReportFilters['scope']
    staffId?: string
    startDate?: string
  }) {
    const nextPreset = values?.preset ?? filters.preset
    const nextGroupBy = values?.groupBy ?? filters.groupBy
    const nextScope = values?.scope ?? filters.scope
    const nextMode = values?.mode ?? workspaceMode
    const nextCategories = values?.categories ?? filters.categories
    const nextStaffId = values?.staffId ?? filters.staffId ?? ''
    const nextStartDate = values?.startDate ?? filters.startDate
    const nextEndDate = values?.endDate ?? filters.endDate
    const params = new URLSearchParams()

    params.set('mode', nextMode)
    params.set('preset', nextPreset)
    params.set('groupBy', nextGroupBy)
    params.set('scope', nextScope)

    if (nextPreset === 'custom') {
      params.set('startDate', nextStartDate)
      params.set('endDate', nextEndDate)
    }

    if (nextScope === 'staff' && nextStaffId) {
      params.set('staffId', nextStaffId)
    }

    for (const category of nextCategories) {
      params.append('category', category)
    }

    return params
  }

  function switchWorkspaceMode(nextMode: ReportsWorkspaceMode) {
    if (nextMode === workspaceMode) {
      return
    }

    startTransition(() => {
      router.push(`/admin/reports?${buildReportParams({ mode: nextMode }).toString()}`)
    })
  }

  function toggleCategory(value: ReportCategory) {
    setDraftCategories((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
  }

  function applyFilters() {
    const params = buildReportParams({
      categories: draftCategories,
      endDate: draftEndDate,
      groupBy: draftGroupBy,
      mode: workspaceMode,
      preset: draftPreset,
      scope: draftScope,
      staffId: draftStaffId,
      startDate: draftStartDate
    })

    startTransition(() => {
      router.push(`/admin/reports?${params.toString()}`)
    })
  }

  async function exportPdf() {
    setIsExporting(true)

    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const pdf = await PDFDocument.create()
      const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold)
      const bodyFont = await pdf.embedFont(StandardFonts.Helvetica)
      const ink = rgb(0.15, 0.14, 0.12)
      const muted = rgb(0.42, 0.4, 0.37)
      const gold = rgb(0.79, 0.68, 0.48)
      const parchment = rgb(0.96, 0.93, 0.88)
      const palePaper = rgb(0.985, 0.975, 0.955)
      const white = rgb(1, 1, 1)
      const pageWidth = 595
      const pageHeight = 842
      const margin = 42
      let page = pdf.addPage([pageWidth, pageHeight])
      let cursorY = pageHeight - margin

      const drawText = (text: string, x: number, y: number, size: number, color = ink, font = bodyFont) => {
        page.drawText(text, { color, font, size, x, y })
      }

      const addNewPage = () => {
        page = pdf.addPage([pageWidth, pageHeight])
        cursorY = pageHeight - margin
      }

      const ensureSpace = (required: number) => {
        if (cursorY - required > margin) {
          return
        }

        addNewPage()
      }

      const drawWrappedParagraph = (text: string, x: number, maxCharacters: number, size: number, color = muted) => {
        const lines = wrapText(text, maxCharacters)

        for (const line of lines) {
          drawText(line, x, cursorY, size, color, bodyFont)
          cursorY -= size + 4
        }
      }

      const drawMiniTable = (title: string, rows: InsightRow[], x: number, width: number, topY: number) => {
        page.drawRectangle({ borderColor: gold, borderWidth: 1, color: palePaper, height: 146, width, x, y: topY - 146 })
        drawText(title, x + 14, topY - 20, 10, muted, titleFont)
        let localY = topY - 40

        for (const row of rows.slice(0, 4)) {
          drawText(row.label.slice(0, 28), x + 14, localY, 9, ink, bodyFont)
          drawText(row.value.slice(0, 20), x + width - 14 - Math.min(row.value.length * 4.4, width / 2), localY, 9, ink, titleFont)
          localY -= 18

          if (row.meta) {
            drawText(row.meta.slice(0, 26), x + 14, localY, 8, muted, bodyFont)
            localY -= 14
          }
        }
      }

      let embeddedLogo: { height: number; image: Awaited<ReturnType<typeof pdf.embedPng>>; width: number } | null = null

      if (hotelProfile.logoUrl) {
        try {
          const logoResponse = await fetch(hotelProfile.logoUrl)

          if (logoResponse.ok) {
            const contentType = logoResponse.headers.get('content-type') ?? ''
            const logoBytes = await logoResponse.arrayBuffer()
            const logoImage = contentType.includes('png') ? await pdf.embedPng(logoBytes) : await pdf.embedJpg(logoBytes)
            const logoScale = Math.min(72 / logoImage.width, 72 / logoImage.height)
            embeddedLogo = {
              height: logoImage.height * logoScale,
              image: logoImage,
              width: logoImage.width * logoScale
            }
          }
        } catch {
          // Continue PDF generation even if the logo cannot be fetched.
        }
      }

      page.drawRectangle({ color: ink, height: 128, width: pageWidth, x: 0, y: pageHeight - 128 })
      page.drawRectangle({ color: gold, height: 10, width: pageWidth, x: 0, y: pageHeight - 138 })

      if (embeddedLogo) {
        page.drawRectangle({ color: white, height: 84, width: 84, x: pageWidth - margin - 84, y: pageHeight - 102 })
        page.drawImage(embeddedLogo.image, {
          x: pageWidth - margin - 42 - embeddedLogo.width / 2,
          y: pageHeight - 60 - embeddedLogo.height / 2,
          width: embeddedLogo.width,
          height: embeddedLogo.height
        })
      }

      drawText(hotelProfile.name, margin, pageHeight - 58, 24, white, titleFont)
      drawText(reportTitle, margin, pageHeight - 88, 16, white, bodyFont)
      drawText('Management report pack', margin, pageHeight - 108, 10, rgb(0.88, 0.86, 0.82), bodyFont)

      let contactY = pageHeight - 58
      for (const line of [...addressLines, ...contactLines]) {
        drawText(line, pageWidth - margin - Math.min(line.length * 4.4, 220), contactY, 9, white, bodyFont)
        contactY -= 12
      }

      cursorY = pageHeight - 176
      drawText(`Prepared ${new Date().toLocaleString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, cursorY, 10, muted, bodyFont)
      cursorY -= 18
      drawText(`Range: ${getRangeDescription(filters)}`, margin, cursorY, 10, muted, bodyFont)
      cursorY -= 18
      drawText(`Scope: ${filters.scope === 'staff' ? filters.staffName ?? 'Staff specific report' : 'Operations overview'}`, margin, cursorY, 10, muted, bodyFont)
      cursorY -= 18
      drawText(`Sheets: ${selectedCategoryLabels}`, margin, cursorY, 10, muted, bodyFont)
      cursorY -= 28

      const coverCards = executiveCards
      const coverCardWidth = (pageWidth - margin * 2 - 16) / 2
      for (let index = 0; index < coverCards.length; index += 1) {
        ensureSpace(72)
        const row = Math.floor(index / 2)
        const column = index % 2
        const x = margin + column * (coverCardWidth + 16)
        const y = cursorY - row * 80

        page.drawRectangle({ borderColor: gold, borderWidth: 1, color: parchment, height: 64, width: coverCardWidth, x, y: y - 52 })
        drawText(coverCards[index].label, x + 14, y - 20, 9, muted, bodyFont)
        drawText(coverCards[index].value, x + 14, y - 42, 16, ink, titleFont)

        if (column === 1) {
          cursorY -= 80
        }
      }

      if (coverCards.length % 2 === 1) {
        cursorY -= 80
      }

      cursorY -= 10
      drawText('Export notes', margin, cursorY, 12, ink, titleFont)
      cursorY -= 20
      drawWrappedParagraph(
        'This export mirrors the new operations outlook: a summary cover, decision-support metrics, category signals, and one unified activity ledger instead of repeating dense sheets in the working view.',
        margin,
        90,
        10
      )

      const decisionRows = intelligence
        ? [
            { label: 'Occupancy', value: formatPercent(intelligence.occupancyRate) },
            { label: 'ADR', value: formatGHS(intelligence.adr) },
            { label: 'RevPAR', value: formatGHS(intelligence.revpar) },
            { label: 'Average stay', value: `${formatMetric(intelligence.avgStayLength)} nights` },
            { label: 'Extension rate', value: formatPercent(intelligence.extensionRate) },
            { label: 'Cancellation rate', value: formatPercent(intelligence.cancellationRate) }
          ]
        : executiveCards

      cursorY -= 12
      ensureSpace(208)
      drawText('Decision support', margin, cursorY, 12, ink, titleFont)
      cursorY -= 16

      const metricCardWidth = (pageWidth - margin * 2 - 12) / 2
      for (let index = 0; index < Math.min(decisionRows.length, 6); index += 1) {
        const card = decisionRows[index]
        const row = Math.floor(index / 2)
        const column = index % 2
        const x = margin + column * (metricCardWidth + 12)
        const y = cursorY - row * 76

        page.drawRectangle({ borderColor: gold, borderWidth: 1, color: palePaper, height: 60, width: metricCardWidth, x, y: y - 52 })
        drawText(card.label.slice(0, 28), x + 12, y - 18, 8.5, muted, bodyFont)
        drawText(card.value.slice(0, 26), x + 12, y - 40, 14, ink, titleFont)
      }

      cursorY -= Math.ceil(Math.min(decisionRows.length, 6) / 2) * 76
      cursorY -= 8

      const summaryTableWidth = (pageWidth - margin * 2 - 12) / 2
      ensureSpace(172)
      drawMiniTable('Pressure watch', watchlistRows, margin, summaryTableWidth, cursorY)
      drawMiniTable('Activity concentration', activityLeaders.rooms, margin + summaryTableWidth + 12, summaryTableWidth, cursorY)
      cursorY -= 172

      addNewPage()
      page.drawRectangle({ color: ink, height: 92, width: pageWidth, x: 0, y: pageHeight - 92 })
      drawText('Export studio', margin, pageHeight - 34, 10, rgb(0.88, 0.86, 0.82), bodyFont)
      drawText('Category outlook', margin, pageHeight - 60, 22, white, titleFont)
      drawText(`${categorySignals.length} lanes selected`, pageWidth - margin - 95, pageHeight - 58, 10, white, bodyFont)

      cursorY = pageHeight - 122
      drawWrappedParagraph('Each selected lane is summarized once so the reader can understand where work clusters before scanning the detailed activity ledger.', margin, 90, 10)
      cursorY -= 10

      const signalCardWidth = (pageWidth - margin * 2 - 12) / 2
      for (let index = 0; index < categorySignals.length; index += 1) {
        const signal = categorySignals[index]
        const row = Math.floor(index / 2)
        const column = index % 2
        const requiredHeight = 116
        const projectedBottom = cursorY - row * (requiredHeight + 12) - requiredHeight

        if (projectedBottom <= margin) {
          addNewPage()
          page.drawRectangle({ color: ink, height: 92, width: pageWidth, x: 0, y: pageHeight - 92 })
          drawText('Export studio', margin, pageHeight - 34, 10, rgb(0.88, 0.86, 0.82), bodyFont)
          drawText('Category outlook', margin, pageHeight - 60, 22, white, titleFont)
          cursorY = pageHeight - 122
        }

        const baseY = cursorY - row * (requiredHeight + 12)
        const x = margin + column * (signalCardWidth + 12)
        page.drawRectangle({ borderColor: gold, borderWidth: 1, color: palePaper, height: requiredHeight, width: signalCardWidth, x, y: baseY - requiredHeight })
        drawText(signal.eyebrow.slice(0, 28), x + 12, baseY - 18, 8, muted, bodyFont)
        drawText(getCategoryLabel(signal.category).slice(0, 26), x + 12, baseY - 38, 14, ink, titleFont)
        drawText(signal.headline.slice(0, 20), x + 12, baseY - 60, 18, ink, titleFont)
        drawText(signal.support.slice(0, 36), x + 12, baseY - 78, 8.5, muted, bodyFont)

        const detailLines = wrapText(signal.description, 38)
        let detailY = baseY - 94
        for (const line of detailLines.slice(0, 2)) {
          drawText(line, x + 12, detailY, 8, muted, bodyFont)
          detailY -= 10
        }

        if (column === 1 || index === categorySignals.length - 1) {
          cursorY = baseY - requiredHeight - 12
        }
      }

      addNewPage()
      page.drawRectangle({ color: ink, height: 92, width: pageWidth, x: 0, y: pageHeight - 92 })
      drawText('Unified ledger', margin, pageHeight - 34, 10, rgb(0.88, 0.86, 0.82), bodyFont)
      drawText('Operations timeline', margin, pageHeight - 60, 22, white, titleFont)
      drawText(`${overviewGroups.length} grouped periods`, pageWidth - margin - 110, pageHeight - 58, 10, white, bodyFont)

      cursorY = pageHeight - 122
      drawWrappedParagraph('Activity is grouped by the selected reporting interval and ordered newest first inside each period, regardless of category.', margin, 90, 10)
      cursorY -= 8

      if (overviewGroups.length === 0) {
        drawText('No activity matched the selected filters.', margin, cursorY, 12, muted, bodyFont)
      }

      for (const group of overviewGroups) {
        ensureSpace(44)
        drawText(group.label, margin, cursorY, 12, ink, titleFont)
        drawText(`${group.operations.length} items`, pageWidth - margin - 60, cursorY, 9, muted, bodyFont)
        cursorY -= 14
        page.drawLine({ color: gold, start: { x: margin, y: cursorY }, end: { x: pageWidth - margin, y: cursorY }, thickness: 1 })
        cursorY -= 16

        for (const operation of group.operations) {
          const detailLines = wrapText(operation.detail, 76)
          const requiredHeight = 48 + detailLines.length * 12
          ensureSpace(requiredHeight)
          page.drawRectangle({ color: palePaper, height: requiredHeight - 6, width: pageWidth - margin * 2, x: margin, y: cursorY - requiredHeight + 8 })

          drawText(operation.title.slice(0, 58), margin + 12, cursorY - 16, 11, ink, titleFont)
          drawText(`${getCategoryLabel(operation.category)} · ${formatDateTimeLabel(operation.occurredAt)}`.slice(0, 88), margin + 12, cursorY - 30, 8, muted, bodyFont)

          if (operation.amountGhs) {
            const amount = formatGHS(operation.amountGhs)
            drawText(amount, pageWidth - margin - 12 - Math.min(amount.length * 5.2, 90), cursorY - 18, 10, ink, titleFont)
          }

          let detailY = cursorY - 46
          for (const line of detailLines) {
            drawText(line, margin + 12, detailY, 8.5, ink, bodyFont)
            detailY -= 11
          }

          const footer = [operation.actorName ? `Handled by ${operation.actorName}` : null, operation.roomLabel, formatStatusLabel(operation.status)]
            .filter(Boolean)
            .join(' · ')
          drawText(footer.slice(0, 90), margin + 12, detailY - 1, 8, muted, bodyFont)
          cursorY -= requiredHeight + 4
        }

        cursorY -= 8
      }

      const bytes = await pdf.save()
      triggerDownload(bytes, `${filenameFromTitle(reportTitle)}-${filters.startDate}-to-${filters.endDate}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#eaf6ef_0%,_#f9fffc_22%,_#f9fffc_100%)] px-6 py-10 text-ink md:px-10">
      <span className="sr-only">smoke:admin-reports</span>
      <span className="sr-only">{workspaceMode === 'outlook' ? 'smoke:admin-reports-outlook' : 'smoke:admin-reports-export'}</span>
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-ink/10 bg-white p-5 shadow-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-[2.2rem]">{workspaceHeroTitle}</h1>
              <p className="max-w-3xl text-sm leading-6 text-ink/68">{workspaceHeroDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${workspaceMode === 'outlook' ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50'}`}
                onClick={() => switchWorkspaceMode('outlook')}
                type="button"
              >
                Outlook
              </button>
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${workspaceMode === 'export' ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50'}`}
                onClick={() => switchWorkspaceMode('export')}
                type="button"
              >
                Export studio
              </button>
              {workspaceMode === 'export' ? (
                <button
                  className="rounded-full border border-emerald-900/10 bg-white px-5 py-2 text-sm font-semibold text-ink transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isExporting || operations.length === 0}
                  onClick={exportPdf}
                  type="button"
                >
                  {isExporting ? 'Generating PDF pack...' : 'Download PDF pack'}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {workspaceMode === 'outlook' ? (
          <section className="grid gap-4 xl:grid-cols-[0.74fr_0.26fr]">
            <div className="space-y-4">
                {intelligence ? (
              <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
                <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Decision support</p>
                      <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Manager outlook for the selected range</h2>
                    </div>
                    <div className="ui-pill px-4 py-2 text-sm font-semibold">Shared with dashboard intelligence</div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Occupancy</p>
                      <p className="mt-3 text-3xl font-semibold text-ink">{formatPercent(intelligence.occupancyRate)}</p>
                    </div>
                    <div className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">ADR</p>
                      <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(intelligence.adr)}</p>
                    </div>
                    <div className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">RevPAR</p>
                      <p className="mt-3 text-3xl font-semibold text-ink">{formatGHS(intelligence.revpar)}</p>
                    </div>
                    <div className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Average stay</p>
                      <p className="mt-3 text-3xl font-semibold text-ink">{formatMetric(intelligence.avgStayLength)} nights</p>
                    </div>
                    <div className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Extension rate</p>
                      <p className="mt-3 text-3xl font-semibold text-ink">{formatPercent(intelligence.extensionRate)}</p>
                    </div>
                    <div className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Cancellation rate</p>
                      <p className="mt-3 text-3xl font-semibold text-ink">{formatPercent(intelligence.cancellationRate)}</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Pressure watch</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Where operations can slip</h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {watchlistRows.map((row) => (
                      <div key={row.label} className="ui-panel-soft rounded-[1.4rem] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{row.label}</p>
                        <p className="mt-3 text-2xl font-semibold text-ink">{row.value}</p>
                        {row.meta ? <p className="mt-2 text-sm text-ink/60">{row.meta}</p> : null}
                      </div>
                    ))}
                  </div>
                </article>
              </section>
                ) : (
              <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Operations outlook</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Summary before drilling into activity</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {watchlistRows.map((row) => (
                    <div key={row.label} className="ui-panel-soft rounded-[1.4rem] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{row.label}</p>
                      <p className="mt-3 text-2xl font-semibold text-ink">{row.value}</p>
                    </div>
                  ))}
                </div>
              </article>
            )}
            

            {intelligence ? (
              <section className="grid gap-4 xl:grid-cols-3">
                <ReportsTrendCard
                  accentClassName="bg-[#ddeee7] text-[#1f5e4b]"
                  description="Occupancy movement inside the selected reporting range."
                  lineClassName="text-[#1f5e4b]"
                  points={intelligence.occupancyTrend}
                  title="Occupancy signal"
                  value={formatPercent(intelligence.latestOccupancy)}
                />
                <ReportsTrendCard
                  accentClassName="bg-[#e8f5ed] text-[#1f6a4c]"
                  description="Payments posted each day across the active report window."
                  lineClassName="text-[#1f6a4c]"
                  points={intelligence.revenueTrend}
                  title="Payment signal"
                  value={formatGHS(intelligence.latestRevenue)}
                />
                <ReportsTrendCard
                  accentClassName="bg-[#eef4df] text-[#53672b]"
                  description="New request creation volume across the same range."
                  lineClassName="text-[#53672b]"
                  points={intelligence.requestTrend}
                  title="Request signal"
                  value={`${intelligence.latestRequestVolume} new`}
                />
              </section>
            ) : null}

                <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Category signals</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Separate lanes, one readable outlook</h2>
                </div>
                <div className="ui-pill px-4 py-2 text-sm font-semibold">{categorySignals.length} active lanes</div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {categorySignals.map((signal) => (
                  <div key={signal.category} className="ui-panel-soft rounded-[1.6rem] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{signal.eyebrow}</p>
                        <h3 className="mt-2 text-2xl font-semibold text-ink">{getCategoryLabel(signal.category)}</h3>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${signal.tone}`}>{signal.valueLabel}</span>
                    </div>
                    <p className="mt-5 text-4xl font-semibold text-ink">{signal.headline}</p>
                    <p className="mt-2 text-sm font-semibold text-ink/70">{signal.support}</p>
                    <p className="mt-3 text-sm leading-6 text-ink/62">{signal.description}</p>
                  </div>
                ))}
              </div>
            </article>

                <section className="grid gap-4 xl:grid-cols-[0.72fr_0.28fr]">
              <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Unified ledger</p>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Operations timeline</h2>
                  </div>
                  <p className="text-sm text-ink/55">Grouped {filters.groupBy} and ordered newest first.</p>
                </div>

                <div className="mt-6 space-y-5">
                  {overviewGroups.length === 0 ? (
                    <div className="ui-panel-muted rounded-[1.6rem] border-dashed p-8 text-sm text-ink/65">
                      No activity matched the current report filters.
                    </div>
                  ) : null}

                  {overviewGroups.map((group) => (
                    <div key={group.key} className="ui-panel-soft rounded-[1.6rem] p-5">
                      <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 md:flex-row md:items-end md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Report period</p>
                          <h3 className="mt-2 text-2xl font-semibold text-ink">{group.label}</h3>
                        </div>
                        <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">{group.operations.length} entries</div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {group.operations.map((operation) => (
                          <div key={operation.id} className="rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 lg:grid lg:grid-cols-[1.25fr_2.4fr_1fr_1fr] lg:gap-4 lg:items-start">
                            <div className="text-sm text-ink/62">{formatDateTimeLabel(operation.occurredAt)}</div>
                            <div className="mt-3 space-y-2 lg:mt-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-emerald-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">{getCategoryLabel(operation.category)}</span>
                                {operation.status ? <span className="ui-pill px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/70">{formatStatusLabel(operation.status)}</span> : null}
                              </div>
                              <div>
                                <p className="text-base font-semibold text-ink">{operation.title}</p>
                                <p className="mt-1 text-sm leading-6 text-ink/70">{operation.detail}</p>
                              </div>
                            </div>
                            <div className="mt-3 text-sm text-ink/62 lg:mt-0">
                              <p>{operation.actorName ?? 'System or legacy record'}</p>
                              {operation.roomLabel ? <p className="mt-1 uppercase tracking-[0.14em] text-ink/45">{operation.roomLabel}</p> : null}
                            </div>
                            <div className="mt-3 text-left text-sm font-semibold text-ink lg:mt-0 lg:text-right">{formatAmount(operation.amountGhs) ?? 'No direct value'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <div className="space-y-4">
                <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Activity concentration</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl">Where work clusters</h2>
                  <div className="mt-5 space-y-5">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Rooms</p>
                      <div className="mt-3">{renderInsightRows(activityLeaders.rooms)}</div>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Staff</p>
                      <div className="mt-3">{renderInsightRows(activityLeaders.staff)}</div>
                    </div>
                  </div>
                </article>
              </div>
                </section>
            </div>

            <div className="space-y-4">
            <article className="rounded-[2.1rem] border border-emerald-900/8 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(233,245,238,0.96))] p-6 text-ink shadow-card">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">{workspaceFilterLabel}</p>
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-sm font-semibold text-ink/80">Scope</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {[
                      { label: 'Overview', value: 'overview' },
                      { label: 'Staff specific', value: 'staff' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftScope === option.value ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                        onClick={() => setDraftScope(option.value as ReportFilters['scope'])}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {draftScope === 'staff' ? (
                  <label className="block">
                    <span className="text-sm font-semibold text-ink/80">Staff member</span>
                    <select
                      className="ui-input mt-2 w-full"
                      onChange={(event) => setDraftStaffId(event.target.value)}
                      value={draftStaffId}
                    >
                      <option value="">Select a staff member</option>
                      {staffOptions.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name} · {staff.role}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <div>
                  <p className="text-sm font-semibold text-ink/80">Date preset</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {presetOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftPreset === option.value ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                        onClick={() => setDraftPreset(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {draftPreset === 'custom' ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-semibold text-ink/80">Start date</span>
                      <input
                        className="ui-input mt-2 w-full"
                        onChange={(event) => setDraftStartDate(event.target.value)}
                        type="date"
                        value={draftStartDate}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-ink/80">End date</span>
                      <input
                        className="ui-input mt-2 w-full"
                        onChange={(event) => setDraftEndDate(event.target.value)}
                        type="date"
                        value={draftEndDate}
                      />
                    </label>
                  </div>
                ) : null}

                <div>
                  <p className="text-sm font-semibold text-ink/80">Group rows</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {groupOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftGroupBy === option.value ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                        onClick={() => setDraftGroupBy(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-ink/80">{workspaceCategoryLabel}</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {categoryOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftCategories.includes(option.value) ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                        onClick={() => toggleCategory(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="ui-button-soft border border-transparent disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending || draftCategories.length === 0 || (draftScope === 'staff' && !draftStaffId)}
                  onClick={applyFilters}
                  type="button"
                >
                  {applyFiltersLabel}
                </button>
              </div>
            </article>

            <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Report identity</p>
              {hotelProfile.logoUrl ? (
                <div className="ui-panel-soft relative mt-4 h-24 w-24 overflow-hidden rounded-3xl">
                  <Image alt={`${hotelProfile.name} logo`} className="object-contain p-3" fill sizes="96px" src={hotelProfile.logoUrl} />
                </div>
              ) : null}
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl">{hotelProfile.name}</h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-ink/72">
                {addressLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {contactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-ink/65">Branding stays on the dedicated settings page so the working report surface remains focused on operations.</p>
              <Link
                className="ui-button-secondary mt-5 inline-flex px-4 py-2 text-sm"
                href="/admin/settings"
              >
                Open hotel settings
              </Link>
            </article>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <article className="rounded-[2rem] border border-emerald-900/8 bg-white p-5 shadow-card">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-ink">Export filters</p>
                  <p className="text-sm leading-6 text-ink/62">Adjust scope, date range, grouping, and included sheets before reviewing the print preview below.</p>
                </div>

                <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr_0.9fr_1.35fr_auto] xl:items-start">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Scope</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { label: 'Overview', value: 'overview' },
                        { label: 'Staff specific', value: 'staff' }
                      ].map((option) => (
                        <button
                          key={option.value}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftScope === option.value ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                          onClick={() => setDraftScope(option.value as ReportFilters['scope'])}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {draftScope === 'staff' ? (
                      <label className="mt-3 block">
                        <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Staff member</span>
                        <select
                          className="ui-input mt-2 w-full"
                          onChange={(event) => setDraftStaffId(event.target.value)}
                          value={draftStaffId}
                        >
                          <option value="">Select a staff member</option>
                          {staffOptions.map((staff) => (
                            <option key={staff.id} value={staff.id}>
                              {staff.name} · {staff.role}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Date preset</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {presetOptions.map((option) => (
                        <button
                          key={option.value}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftPreset === option.value ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                          onClick={() => setDraftPreset(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {draftPreset === 'custom' ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">Start date</span>
                          <input
                            className="ui-input mt-2 w-full"
                            onChange={(event) => setDraftStartDate(event.target.value)}
                            type="date"
                            value={draftStartDate}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs uppercase tracking-[0.18em] text-ink/45">End date</span>
                          <input
                            className="ui-input mt-2 w-full"
                            onChange={(event) => setDraftEndDate(event.target.value)}
                            type="date"
                            value={draftEndDate}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Group rows</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {groupOptions.map((option) => (
                        <button
                          key={option.value}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftGroupBy === option.value ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                          onClick={() => setDraftGroupBy(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-ink/45">{workspaceCategoryLabel}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {categoryOptions.map((option) => (
                        <button
                          key={option.value}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftCategories.includes(option.value) ? 'border-emerald-700 bg-emerald-700 text-white shadow-[0_16px_30px_-24px_rgba(15,95,70,0.6)]' : 'border-emerald-900/10 bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/80'}`}
                          onClick={() => toggleCategory(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 xl:w-[220px]">
                    <div className="rounded-[1.2rem] border border-ink/8 bg-emerald-50/60 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-ink/45">Print preview</p>
                      <div className="mt-3 space-y-1.5 text-sm text-ink/72">
                        <p>{categoryPages.length} sheets selected</p>
                        <p>{summary.operationsCount} rows in export</p>
                        <p>{hotelProfile.logoUrl ? 'Branding ready' : 'Text-only branding'}</p>
                      </div>
                    </div>
                    <button
                      className="ui-button-soft w-full border border-transparent disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isPending || draftCategories.length === 0 || (draftScope === 'staff' && !draftStaffId)}
                      onClick={applyFilters}
                      type="button"
                    >
                      {applyFiltersLabel}
                    </button>
                  </div>
                </div>
              </div>
            </article>

            <section className="grid gap-4 xl:grid-cols-[0.72fr_0.28fr]">
              <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
                <div className="space-y-1.5">
                  <h2 className="font-[family-name:var(--font-display)] text-3xl">Print preview</h2>
                  <p className="text-sm leading-6 text-ink/62">Each selected lane becomes its own sheet in the pack.</p>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {categoryPages.map((page) => (
                    <div key={page.category} className="ui-panel-soft overflow-hidden rounded-[1.6rem]">
                      <div className={`bg-gradient-to-r ${page.accent} px-5 py-5`}>
                        <p className="text-xs uppercase tracking-[0.22em] text-white/70">{page.eyebrow}</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">{getCategoryLabel(page.category)}</h3>
                        <p className="mt-3 max-w-sm text-sm leading-6 text-white/82">{page.description}</p>
                      </div>
                      <div className="space-y-4 p-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {page.pageSummary.slice(0, 4).map((item) => (
                            <div key={item.label} className="rounded-[1.1rem] bg-white p-4">
                              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{item.label}</p>
                              <p className="mt-3 text-xl font-semibold text-ink">{item.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-[1.1rem] bg-white p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Lead period flow</p>
                          <div className="mt-3">{renderInsightRows(page.periodRows.slice(0, 3))}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <div className="space-y-4">
                <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
                  <p className="text-sm font-semibold text-ink">Print identity</p>
                  {hotelProfile.logoUrl ? (
                    <div className="ui-panel-soft relative mt-4 h-24 w-24 overflow-hidden rounded-3xl">
                      <Image alt={`${hotelProfile.name} logo`} className="object-contain p-3" fill sizes="96px" src={hotelProfile.logoUrl} />
                    </div>
                  ) : null}
                  <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl">{hotelProfile.name}</h2>
                  <div className="mt-4 space-y-2 text-sm leading-6 text-ink/72">
                    {addressLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                    {contactLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-col gap-3">
                    <button
                      className="ui-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isExporting || operations.length === 0}
                      onClick={exportPdf}
                      type="button"
                    >
                      {isExporting ? 'Generating PDF pack...' : 'Generate PDF pack'}
                    </button>
                    <Link className="ui-button-secondary inline-flex justify-center px-4 py-2 text-sm" href="/admin/settings">
                      Open hotel settings
                    </Link>
                  </div>
                </article>

                <article className="rounded-[2rem] border border-ink/10 bg-white p-6 shadow-card">
                  <p className="text-sm font-semibold text-ink">Preview coverage</p>
                  <div className="mt-4">{renderInsightRows(activityLeaders.rooms.slice(0, 3))}</div>
                </article>
              </div>
            </section>
          </section>
        )}
      </div>
    </main>
  )
}