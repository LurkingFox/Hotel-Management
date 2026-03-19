import { formatGHS } from '@/lib/utils/format'

export type ReportPreset = 'today' | 'this-week' | 'this-month' | 'last-30-days' | 'custom'
export type ReportGroupBy = 'day' | 'week' | 'month'
export type ReportScope = 'overview' | 'staff'
export type ReportCategory = 'front_office' | 'payments' | 'services' | 'access' | 'staffing'

export type ReportFilters = {
  categories: ReportCategory[]
  endDate: string
  groupBy: ReportGroupBy
  preset: ReportPreset
  scope: ReportScope
  staffId: string | null
  staffName: string | null
  startDate: string
}

export type ReportOperation = {
  actorName: string | null
  actorStaffId: string | null
  amountGhs: number | null
  category: ReportCategory
  detail: string
  id: string
  occurredAt: string
  roomLabel: string | null
  status: string | null
  title: string
}

export type ReportOperationGroup = {
  key: string
  label: string
  operations: ReportOperation[]
}

export type ReportSummary = {
  accessDeniedCount: number
  accessGrantedCount: number
  operationsCount: number
  paymentsTotal: number
  serviceChargesTotal: number
  staffInvolvedCount: number
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function startOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function startOfWeek(value: Date) {
  const next = startOfDay(value)
  const day = next.getDay()
  const offset = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + offset)
  return next
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(value: Date, months: number) {
  const next = new Date(value)
  next.setMonth(next.getMonth() + months)
  return next
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateTimeLabel(value: string) {
  return new Date(value).toLocaleString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function resolveDateRange(preset: ReportPreset, startDate?: string | null, endDate?: string | null) {
  const today = startOfDay(new Date())

  if (preset === 'custom' && startDate && endDate) {
    const customStart = startOfDay(new Date(`${startDate}T00:00:00`))
    const customEnd = startOfDay(new Date(`${endDate}T00:00:00`))
    const safeEnd = customEnd >= customStart ? customEnd : customStart

    return {
      startDate: toDateOnly(customStart),
      endDate: toDateOnly(safeEnd),
      startIso: customStart.toISOString(),
      endExclusiveIso: addDays(safeEnd, 1).toISOString(),
      label: `${formatDateLabel(customStart)} - ${formatDateLabel(safeEnd)}`
    }
  }

  let rangeStart = today
  let rangeEnd = today

  if (preset === 'this-week') {
    rangeStart = startOfWeek(today)
  } else if (preset === 'this-month') {
    rangeStart = startOfMonth(today)
  } else if (preset === 'last-30-days') {
    rangeStart = addDays(today, -29)
  }

  return {
    startDate: toDateOnly(rangeStart),
    endDate: toDateOnly(rangeEnd),
    startIso: rangeStart.toISOString(),
    endExclusiveIso: addDays(rangeEnd, 1).toISOString(),
    label: `${formatDateLabel(rangeStart)} - ${formatDateLabel(rangeEnd)}`
  }
}

function getWeekKey(date: Date) {
  const weekStart = startOfWeek(date)
  return toDateOnly(weekStart)
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getGroupKey(value: string, groupBy: ReportGroupBy) {
  const date = new Date(value)

  if (groupBy === 'month') {
    return getMonthKey(date)
  }

  if (groupBy === 'week') {
    return getWeekKey(date)
  }

  return toDateOnly(date)
}

export function getGroupLabel(key: string, groupBy: ReportGroupBy) {
  if (groupBy === 'month') {
    const [year, month] = key.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })
  }

  if (groupBy === 'week') {
    const start = new Date(`${key}T00:00:00`)
    const end = addDays(start, 6)
    return `${formatDateLabel(start)} - ${formatDateLabel(end)}`
  }

  return formatDateLabel(new Date(`${key}T00:00:00`))
}

export function groupOperations(operations: ReportOperation[], groupBy: ReportGroupBy): ReportOperationGroup[] {
  const groups = new Map<string, ReportOperation[]>()

  for (const operation of operations) {
    const key = getGroupKey(operation.occurredAt, groupBy)
    const existing = groups.get(key) ?? []
    existing.push(operation)
    groups.set(key, existing)
  }

  return [...groups.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([key, entries]) => ({
      key,
      label: getGroupLabel(key, groupBy),
      operations: [...entries].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    }))
}

export function buildReportSummary(operations: ReportOperation[], serviceChargesTotal: number): ReportSummary {
  const paymentsTotal = operations.reduce((sum, operation) => sum + (operation.category === 'payments' ? operation.amountGhs ?? 0 : 0), 0)
  const accessGrantedCount = operations.filter((operation) => operation.category === 'access' && operation.status === 'granted').length
  const accessDeniedCount = operations.filter((operation) => operation.category === 'access' && operation.status !== 'granted').length
  const staffInvolved = new Set(
    operations
      .map((operation) => operation.actorStaffId ?? operation.actorName)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  )

  return {
    accessDeniedCount,
    accessGrantedCount,
    operationsCount: operations.length,
    paymentsTotal,
    serviceChargesTotal,
    staffInvolvedCount: staffInvolved.size
  }
}

export function getCategoryLabel(category: ReportCategory) {
  if (category === 'front_office') {
    return 'Front office'
  }

  if (category === 'payments') {
    return 'Payments'
  }

  if (category === 'services') {
    return 'Services'
  }

  if (category === 'access') {
    return 'Door access'
  }

  return 'Staffing'
}

export function formatAmount(value: number | null) {
  if (typeof value !== 'number') {
    return null
  }

  return formatGHS(value)
}

export function defaultReportCategories(): ReportCategory[] {
  return ['front_office', 'payments', 'services', 'access', 'staffing']
}

export function buildReportTitle(filters: ReportFilters) {
  return filters.scope === 'staff' && filters.staffName ? `${filters.staffName} performance report` : 'Hotel operations report'
}

export function getRangeDescription(filters: ReportFilters) {
  return `${filters.startDate} to ${filters.endDate}`
}

export function getPresetLabel(preset: ReportPreset) {
  if (preset === 'today') {
    return 'Today'
  }

  if (preset === 'this-week') {
    return 'This week'
  }

  if (preset === 'this-month') {
    return 'This month'
  }

  if (preset === 'last-30-days') {
    return 'Last 30 days'
  }

  return 'Custom range'
}