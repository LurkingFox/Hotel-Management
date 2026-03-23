type BookingStatus = 'active' | 'cancelled' | 'checked_out' | 'reserved'
type ServiceRequestPriority = 'high' | 'low' | 'normal' | 'urgent'
type ServiceRequestStatus = 'acknowledged' | 'assigned' | 'cancelled' | 'completed' | 'in_progress' | 'new'
type AccessResult = 'denied' | 'expired' | 'granted'

export type DashboardIntelligenceBooking = {
  balance_ghs: number | null
  check_in: string
  check_out_expected: string
  nights: number
  status: BookingStatus
  total_ghs: number
}

export type DashboardIntelligencePayment = {
  amount_ghs: number
  paid_at: string | null
}

export type DashboardIntelligenceServiceRequest = {
  assigned_staff_id: string | null
  completed_at: string | null
  created_at: string
  priority: ServiceRequestPriority
  status: ServiceRequestStatus
}

export type DashboardTrendPoint = {
  label: string
  value: number
}

export type DashboardIntelligenceMetrics = {
  accessFailureRate: number
  adr: number
  agedBalanceAmount: number
  agedBalanceBookings: number
  avgResolutionHours: number
  avgStayLength: number
  cancellationRate: number
  extensionRate: number
  latestOccupancy: number
  latestRequestVolume: number
  latestRevenue: number
  occupancyDelta: number
  occupancyRate: number
  occupancyTrend: DashboardTrendPoint[]
  openRequests: number
  requestCompletionRate: number
  requestDelta: number
  requestTrend: DashboardTrendPoint[]
  requestsPerShift: number
  revenueDelta: number
  revenueTrend: DashboardTrendPoint[]
  revpar: number
  urgentUnassignedRequests: number
}

function startOfDay(value: Date) {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function toDateValue(value: string) {
  return new Date(`${value}T00:00:00`)
}

function formatShortDayLabel(value: Date) {
  return value.toLocaleDateString('en-GH', { weekday: 'short' })
}

function getOverlapNights(checkIn: string, checkOut: string, windowStart: Date, windowEndExclusive: Date) {
  const stayStart = toDateValue(checkIn)
  const stayEnd = toDateValue(checkOut)
  const overlapStart = Math.max(stayStart.getTime(), windowStart.getTime())
  const overlapEnd = Math.min(stayEnd.getTime(), windowEndExclusive.getTime())

  if (overlapEnd <= overlapStart) {
    return 0
  }

  return Math.ceil((overlapEnd - overlapStart) / 86400000)
}

function isOpenRequest(status: ServiceRequestStatus) {
  return status !== 'completed' && status !== 'cancelled'
}

function buildRecentTrend(days: number, endDate: Date, getValue: (dayStart: Date, dayEnd: Date) => number) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = addDays(endDate, index - (days - 1))
    const dayEnd = addDays(dayStart, 1)

    return {
      label: formatShortDayLabel(dayStart),
      value: getValue(dayStart, dayEnd)
    }
  })
}

export function getTrendDelta(points: DashboardTrendPoint[]) {
  if (points.length < 2) {
    return 0
  }

  return points[points.length - 1].value - points[0].value
}

export function buildDashboardIntelligence(input: {
  accessResults: AccessResult[]
  bookings: DashboardIntelligenceBooking[]
  extensionAuditCount: number
  openShiftCount: number
  payments: DashboardIntelligencePayment[]
  rangeEndExclusive?: Date
  rangeStart?: Date
  serviceRequests: DashboardIntelligenceServiceRequest[]
  totalRooms: number
  trendDays?: number
  today?: Date
}) {
  const today = startOfDay(input.today ?? new Date())
  const defaultRangeStart = addDays(today, -29)
  const rangeStart = startOfDay(input.rangeStart ?? defaultRangeStart)
  const rangeEndExclusive = startOfDay(input.rangeEndExclusive ?? addDays(today, 1))
  const rangeDays = Math.max(1, Math.ceil((rangeEndExclusive.getTime() - rangeStart.getTime()) / 86400000))
  const trendEndDate = addDays(rangeEndExclusive, -1)
  const trendDays = Math.max(1, Math.min(input.trendDays ?? 7, rangeDays))
  const agedBalanceCutoff = addDays(rangeEndExclusive, -7)
  const availableRoomNights = input.totalRooms * rangeDays

  const bookingsOverlappingWindow = input.bookings.filter(
    (booking) => booking.status !== 'cancelled' && getOverlapNights(booking.check_in, booking.check_out_expected, rangeStart, rangeEndExclusive) > 0
  )
  const soldRoomNights = bookingsOverlappingWindow.reduce(
    (sum, booking) => sum + getOverlapNights(booking.check_in, booking.check_out_expected, rangeStart, rangeEndExclusive),
    0
  )
  const intelligenceRevenue = bookingsOverlappingWindow.reduce((sum, booking) => {
    const overlapNights = getOverlapNights(booking.check_in, booking.check_out_expected, rangeStart, rangeEndExclusive)
    const nightlyRate = booking.total_ghs / Math.max(booking.nights, 1)
    return sum + nightlyRate * overlapNights
  }, 0)
  const occupancyRate = availableRoomNights === 0 ? 0 : (soldRoomNights / availableRoomNights) * 100
  const adr = soldRoomNights === 0 ? 0 : intelligenceRevenue / soldRoomNights
  const revpar = availableRoomNights === 0 ? 0 : intelligenceRevenue / availableRoomNights

  const bookingsStartedInWindow = input.bookings.filter((booking) => {
    const checkIn = toDateValue(booking.check_in)
    return checkIn >= rangeStart && checkIn < rangeEndExclusive
  })
  const avgStayLength =
    bookingsStartedInWindow.length === 0
      ? 0
      : bookingsStartedInWindow.reduce((sum, booking) => sum + Math.max(booking.nights, 1), 0) / bookingsStartedInWindow.length
  const cancellationRate =
    bookingsStartedInWindow.length === 0
      ? 0
      : (bookingsStartedInWindow.filter((booking) => booking.status === 'cancelled').length / bookingsStartedInWindow.length) * 100
  const extensionRate = bookingsStartedInWindow.length === 0 ? 0 : (input.extensionAuditCount / bookingsStartedInWindow.length) * 100

  const completedRequests = input.serviceRequests.filter((request) => request.status === 'completed' && request.completed_at)
  const avgResolutionHours =
    completedRequests.length === 0
      ? 0
      : completedRequests.reduce((sum, request) => {
          return sum + (new Date(request.completed_at as string).getTime() - new Date(request.created_at).getTime()) / 3600000
        }, 0) / completedRequests.length
  const requestCompletionRate = input.serviceRequests.length === 0 ? 0 : (completedRequests.length / input.serviceRequests.length) * 100

  const openRequests = input.serviceRequests.filter((request) => isOpenRequest(request.status))
  const urgentUnassignedRequests = openRequests.filter(
    (request) => (request.priority === 'high' || request.priority === 'urgent') && !request.assigned_staff_id
  ).length
  const accessFailureRate = input.accessResults.length === 0 ? 0 : (input.accessResults.filter((result) => result !== 'granted').length / input.accessResults.length) * 100
  const agedBalanceBookings = input.bookings.filter(
    (booking) => (booking.balance_ghs ?? 0) > 0 && booking.status !== 'cancelled' && toDateValue(booking.check_in) <= agedBalanceCutoff
  )
  const agedBalanceAmount = agedBalanceBookings.reduce((sum, booking) => sum + (booking.balance_ghs ?? 0), 0)
  const requestsPerShift = input.openShiftCount === 0 ? openRequests.length : openRequests.length / input.openShiftCount

  const occupancyTrend = buildRecentTrend(trendDays, trendEndDate, (dayStart, dayEnd) => {
    const soldRooms = input.bookings.reduce((sum, booking) => {
      if (booking.status === 'cancelled') {
        return sum
      }

      return sum + getOverlapNights(booking.check_in, booking.check_out_expected, dayStart, dayEnd)
    }, 0)

    return input.totalRooms === 0 ? 0 : (soldRooms / input.totalRooms) * 100
  })
  const revenueTrend = buildRecentTrend(trendDays, trendEndDate, (dayStart, dayEnd) => {
    return input.payments.reduce((sum, payment) => {
      if (!payment.paid_at) {
        return sum
      }

      const paidAt = new Date(payment.paid_at)
      return paidAt >= dayStart && paidAt < dayEnd ? sum + payment.amount_ghs : sum
    }, 0)
  })
  const requestTrend = buildRecentTrend(trendDays, trendEndDate, (dayStart, dayEnd) => {
    return input.serviceRequests.reduce((sum, request) => {
      const createdAt = new Date(request.created_at)
      return createdAt >= dayStart && createdAt < dayEnd ? sum + 1 : sum
    }, 0)
  })

  return {
    accessFailureRate,
    adr,
    agedBalanceAmount,
    agedBalanceBookings: agedBalanceBookings.length,
    avgResolutionHours,
    avgStayLength,
    cancellationRate,
    extensionRate,
    latestOccupancy: occupancyTrend[occupancyTrend.length - 1]?.value ?? 0,
    latestRequestVolume: requestTrend[requestTrend.length - 1]?.value ?? 0,
    latestRevenue: revenueTrend[revenueTrend.length - 1]?.value ?? 0,
    occupancyDelta: getTrendDelta(occupancyTrend),
    occupancyRate,
    occupancyTrend,
    openRequests: openRequests.length,
    requestCompletionRate,
    requestDelta: getTrendDelta(requestTrend),
    requestTrend,
    requestsPerShift,
    revenueDelta: getTrendDelta(revenueTrend),
    revenueTrend,
    revpar,
    urgentUnassignedRequests
  } satisfies DashboardIntelligenceMetrics
}