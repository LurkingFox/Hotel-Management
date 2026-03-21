'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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
  operations: ReportOperation[]
  staffOptions: StaffOption[]
  summary: ReportSummary
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

const categoryOptions: Array<{ label: string; value: ReportCategory }> = [
  { label: 'Front office', value: 'front_office' },
  { label: 'Payments', value: 'payments' },
  { label: 'Services', value: 'services' },
  { label: 'Access events', value: 'access' },
  { label: 'Staffing', value: 'staffing' }
]

const categoryMeta: Record<ReportCategory, { accent: string; description: string; eyebrow: string }> = {
  access: {
    accent: 'from-[#1f3b52] via-[#2d5877] to-[#ebf1f5]',
    description: 'Access control is isolated into a security sheet so granted entries, denials, credential activity, and room patterns are readable without payment noise.',
    eyebrow: 'Security sheet'
  },
  front_office: {
    accent: 'from-[#4d2f22] via-[#8c5b3f] to-[#f6ece2]',
    description: 'Front office activity stays together as a guest-movement report covering reservations, arrivals, departures, extensions, and access credential lifecycle events.',
    eyebrow: 'Guest movement sheet'
  },
  payments: {
    accent: 'from-[#274336] via-[#52785e] to-[#edf5ef]',
    description: 'Payments are broken out as their own report page with collection totals, method mix, staff handling, and receipt flow by period.',
    eyebrow: 'Finance sheet'
  },
  services: {
    accent: 'from-[#59491f] via-[#93783f] to-[#f7f0de]',
    description: 'Service revenue gets a dedicated view for posted value, open versus resolved items, staff touchpoints, and room concentration.',
    eyebrow: 'Revenue sheet'
  },
  staffing: {
    accent: 'from-[#342c59] via-[#5f5491] to-[#f0eef9]',
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

export function AdminReportsClient({ filters, hotelProfile, operations, staffOptions, summary }: AdminReportsClientProps) {
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

  function toggleCategory(value: ReportCategory) {
    setDraftCategories((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
  }

  function applyFilters() {
    const params = new URLSearchParams()
    params.set('preset', draftPreset)
    params.set('groupBy', draftGroupBy)
    params.set('scope', draftScope)

    if (draftPreset === 'custom') {
      params.set('startDate', draftStartDate)
      params.set('endDate', draftEndDate)
    }

    if (draftScope === 'staff' && draftStaffId) {
      params.set('staffId', draftStaffId)
    }

    for (const category of draftCategories) {
      params.append('category', category)
    }

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
      drawText('Pack notes', margin, cursorY, 12, ink, titleFont)
      cursorY -= 20
      drawWrappedParagraph(
        'Each sheet in this export starts a new report page so finance, services, guest movement, security, and staffing can be reviewed independently while keeping dense detail inside each section.',
        margin,
        90,
        10
      )

      for (const categoryPage of categoryPages) {
        addNewPage()

        page.drawRectangle({ color: ink, height: 92, width: pageWidth, x: 0, y: pageHeight - 92 })
        drawText(categoryPage.eyebrow, margin, pageHeight - 34, 10, rgb(0.88, 0.86, 0.82), bodyFont)
        drawText(getCategoryLabel(categoryPage.category), margin, pageHeight - 60, 22, white, titleFont)
        drawText(`${categoryPage.operations.length} items in range`, pageWidth - margin - 110, pageHeight - 58, 10, white, bodyFont)

        cursorY = pageHeight - 122
        drawWrappedParagraph(categoryPage.description, margin, 90, 10)
        cursorY -= 10

        const sectionCardWidth = (pageWidth - margin * 2 - 24) / 4
        for (let index = 0; index < Math.min(categoryPage.pageSummary.length, 4); index += 1) {
          const card = categoryPage.pageSummary[index]
          const x = margin + index * (sectionCardWidth + 8)
          page.drawRectangle({ borderColor: gold, borderWidth: 1, color: palePaper, height: 60, width: sectionCardWidth, x, y: cursorY - 60 })
          drawText(card.label.slice(0, 24), x + 10, cursorY - 18, 8, muted, bodyFont)
          drawText(card.value.slice(0, 18), x + 10, cursorY - 40, 12, ink, titleFont)
        }

        cursorY -= 78
        const tableWidth = (pageWidth - margin * 2 - 16) / 3
        drawMiniTable('Period flow', categoryPage.periodRows, margin, tableWidth, cursorY)
        drawMiniTable('Status mix', categoryPage.mixRows, margin + tableWidth + 8, tableWidth, cursorY)
        drawMiniTable('Staff or room leaders', categoryPage.staffRows[0]?.label === 'No staff attribution' ? categoryPage.roomRows : categoryPage.staffRows, margin + (tableWidth + 8) * 2, tableWidth, cursorY)
        cursorY -= 168

        if (categoryPage.operations.length === 0) {
          drawText('No activity matched this sheet in the selected range.', margin, cursorY, 12, muted, bodyFont)
          continue
        }

        for (const group of categoryPage.groupedOperations) {
          ensureSpace(42)
          drawText(group.label, margin, cursorY, 12, ink, titleFont)
          drawText(`${group.operations.length} items`, pageWidth - margin - 60, cursorY, 9, muted, bodyFont)
          cursorY -= 14
          page.drawLine({ color: gold, start: { x: margin, y: cursorY }, end: { x: pageWidth - margin, y: cursorY }, thickness: 1 })
          cursorY -= 16

          for (const operation of group.operations) {
            const detailLines = wrapText(operation.detail, 76)
            const requiredHeight = 44 + detailLines.length * 12
            ensureSpace(requiredHeight)
            page.drawRectangle({ color: palePaper, height: requiredHeight - 6, width: pageWidth - margin * 2, x: margin, y: cursorY - requiredHeight + 8 })

            drawText(operation.title.slice(0, 58), margin + 12, cursorY - 16, 11, ink, titleFont)
            drawText(formatDateTimeLabel(operation.occurredAt), margin + 12, cursorY - 30, 8, muted, bodyFont)

            if (operation.amountGhs) {
              const amount = formatGHS(operation.amountGhs)
              drawText(amount, pageWidth - margin - 12 - Math.min(amount.length * 5.2, 90), cursorY - 18, 10, ink, titleFont)
            }

            let detailY = cursorY - 44
            for (const line of detailLines) {
              drawText(line, margin + 12, detailY, 8.5, ink, bodyFont)
              detailY -= 11
            }

            const footer = [operation.actorName ? `Handled by ${operation.actorName}` : null, operation.roomLabel, formatStatusLabel(operation.status)]
              .filter(Boolean)
              .join(' · ')
            drawText(footer.slice(0, 90), margin + 12, detailY - 2, 8, muted, bodyFont)
            cursorY -= requiredHeight + 4
          }

          cursorY -= 8
        }
      }

      const bytes = await pdf.save()
      triggerDownload(bytes, `${filenameFromTitle(reportTitle)}-${filters.startDate}-to-${filters.endDate}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_24%,_#f7f1e8_24%,_#f7f1e8_100%)] px-6 py-10 text-ink md:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="overflow-hidden rounded-[2.4rem] border border-ink/10 bg-white/82 shadow-card backdrop-blur">
          <div className="grid gap-0 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-[linear-gradient(135deg,_rgba(30,45,57,0.98)_0%,_rgba(48,71,88,0.95)_52%,_rgba(244,236,225,0.15)_100%)] px-7 py-8 text-white md:px-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/60">University Hotel reporting</p>
                  <div className="space-y-3">
                    <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-none">Operational report pack</h1>
                    <p className="max-w-3xl text-sm leading-6 text-white/78">
                      This page now reads like a report book instead of one long activity dump. Finance, services, guest movement, security, and staffing each get their own sheet while still showing several data views per page.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-white/62">
                    <span>{filterSummary}</span>
                    <span>•</span>
                    <span>{getRangeDescription(filters)}</span>
                    <span>•</span>
                    <span>{selectedCategoryLabels}</span>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 xl:items-end">
                  <button
                    className="rounded-full border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#f5ecde] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isExporting || operations.length === 0}
                    onClick={exportPdf}
                    type="button"
                  >
                    {isExporting ? 'Generating PDF pack...' : 'Download PDF pack'}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-7 py-8 md:px-8">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Executive board</p>
              <h2 className="font-[family-name:var(--font-display)] text-3xl">At-a-glance totals</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {executiveCards.map((card) => (
                  <div key={card.label} className="rounded-[1.4rem] border border-ink/10 bg-[#fbf7f1] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{card.label}</p>
                    <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[0.74fr_0.26fr]">
          <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Report composition</p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl">Separated sheets, denser pages</h2>
              </div>
              <div className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-ink">{categoryPages.length} report pages</div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {categoryPages.map((page) => (
                <div key={page.category} className="overflow-hidden rounded-[1.6rem] border border-ink/10 bg-[#fcfaf6]">
                  <div className={`bg-gradient-to-r ${page.accent} px-5 py-5`}>
                    <p className="text-xs uppercase tracking-[0.22em] text-white/70">{page.eyebrow}</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">{getCategoryLabel(page.category)}</h3>
                    <p className="mt-3 max-w-sm text-sm leading-6 text-white/82">{page.description}</p>
                  </div>
                  <div className="grid gap-3 p-5">
                    {page.pageSummary.slice(0, 3).map((item) => (
                      <div key={item.label} className="rounded-[1.1rem] bg-white p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/45">{item.label}</p>
                        <p className="mt-3 text-xl font-semibold text-ink">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-[2.1rem] border border-ink/10 bg-ink p-6 text-white shadow-card">
              <p className="text-xs uppercase tracking-[0.24em] text-white/55">Filter builder</p>
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-sm font-semibold text-white/80">Scope</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {[
                      { label: 'Overview', value: 'overview' },
                      { label: 'Staff specific', value: 'staff' }
                    ].map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftScope === option.value ? 'border-white bg-white text-ink' : 'border-white/20 text-white/75 hover:border-white/40 hover:bg-white/10'}`}
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
                    <span className="text-sm font-semibold text-white/80">Staff member</span>
                    <select
                      className="mt-2 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40"
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
                  <p className="text-sm font-semibold text-white/80">Date preset</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {presetOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftPreset === option.value ? 'border-white bg-white text-ink' : 'border-white/20 text-white/75 hover:border-white/40 hover:bg-white/10'}`}
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
                      <span className="text-sm font-semibold text-white/80">Start date</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40"
                        onChange={(event) => setDraftStartDate(event.target.value)}
                        type="date"
                        value={draftStartDate}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-white/80">End date</span>
                      <input
                        className="mt-2 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40"
                        onChange={(event) => setDraftEndDate(event.target.value)}
                        type="date"
                        value={draftEndDate}
                      />
                    </label>
                  </div>
                ) : null}

                <div>
                  <p className="text-sm font-semibold text-white/80">Group rows</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {groupOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftGroupBy === option.value ? 'border-white bg-white text-ink' : 'border-white/20 text-white/75 hover:border-white/40 hover:bg-white/10'}`}
                        onClick={() => setDraftGroupBy(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white/80">Included sheets</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {categoryOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${draftCategories.includes(option.value) ? 'border-[#d8c191] bg-[#d8c191] text-ink' : 'border-white/20 text-white/75 hover:border-white/40 hover:bg-white/10'}`}
                        onClick={() => toggleCategory(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  className="rounded-full border border-[#d8c191] bg-[#d8c191] px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#e2cfaa] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isPending || draftCategories.length === 0 || (draftScope === 'staff' && !draftStaffId)}
                  onClick={applyFilters}
                  type="button"
                >
                  {isPending ? 'Refreshing report pack...' : 'Apply report filters'}
                </button>
              </div>
            </article>

            <article className="rounded-[2.1rem] border border-ink/10 bg-white p-6 shadow-card">
              <p className="text-xs uppercase tracking-[0.24em] text-ink/45">Print identity</p>
              {hotelProfile.logoUrl ? (
                <div className="relative mt-4 h-24 w-24 overflow-hidden rounded-3xl border border-ink/10 bg-[#fcfaf6]">
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
              <p className="mt-5 text-sm leading-6 text-ink/65">
                Branding now stays on the dedicated settings page so report generation remains focused on analysis and output quality.
              </p>
              <Link
                className="mt-5 inline-flex rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 hover:bg-parchment"
                href="/admin/settings"
              >
                Open hotel settings
              </Link>
            </article>
          </div>
        </section>

        <section className="space-y-8">
          {categoryPages.map((page) => (
            <article key={page.category} className="overflow-hidden rounded-[2.3rem] border border-ink/10 bg-white shadow-card print:break-after-page">
              <div className={`bg-gradient-to-r ${page.accent} px-7 py-7 text-white md:px-8`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.26em] text-white/62">{page.eyebrow}</p>
                    <div>
                      <h2 className="font-[family-name:var(--font-display)] text-5xl">{getCategoryLabel(page.category)}</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/82">{page.description}</p>
                    </div>
                  </div>
                  <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                    {page.operations.length} records
                  </div>
                </div>
              </div>

              <div className="space-y-6 px-7 py-7 md:px-8">
                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {page.pageSummary.map((card) => (
                    <div key={card.label} className="rounded-[1.5rem] border border-ink/10 bg-[#fbf7f1] p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-ink/45">{card.label}</p>
                      <p className="mt-3 text-2xl font-semibold text-ink">{card.value}</p>
                    </div>
                  ))}
                </section>

                <section className="grid gap-4 xl:grid-cols-[0.95fr_0.95fr_1.1fr]">
                  <article className="rounded-[1.6rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Period flow</p>
                    <div className="mt-4">{renderInsightRows(page.periodRows)}</div>
                  </article>
                  <article className="rounded-[1.6rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Status mix</p>
                    <div className="mt-4">{renderInsightRows(page.mixRows)}</div>
                  </article>
                  <article className="rounded-[1.6rem] border border-ink/10 bg-[#fcfaf6] p-5">
                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Staff coverage</p>
                        <div className="mt-4">{renderInsightRows(page.staffRows)}</div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Room concentration</p>
                        <div className="mt-4">{renderInsightRows(page.roomRows)}</div>
                      </div>
                    </div>
                  </article>
                </section>

                <section className="space-y-5">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Detailed timeline</p>
                      <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl">{getCategoryLabel(page.category)} activity ledger</h3>
                    </div>
                    {page.operations.length > 0 ? (
                      <p className="text-sm text-ink/55">Grouped {filters.groupBy} and ordered newest first inside each period.</p>
                    ) : null}
                  </div>

                  {page.groupedOperations.length === 0 ? (
                    <div className="rounded-[1.6rem] border border-dashed border-ink/15 bg-[#fcfaf6] p-8 text-sm text-ink/65">
                      No {getCategoryLabel(page.category).toLowerCase()} activity matched the current report filters.
                    </div>
                  ) : null}

                  {page.groupedOperations.map((group) => (
                    <div key={group.key} className="rounded-[1.6rem] border border-ink/10 bg-[#fcfaf6] p-5">
                      <div className="flex flex-col gap-3 border-b border-ink/10 pb-4 md:flex-row md:items-end md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-ink/45">Report period</p>
                          <h4 className="mt-2 text-2xl font-semibold text-ink">{group.label}</h4>
                        </div>
                        <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">{group.operations.length} entries</div>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="hidden rounded-[1.1rem] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-ink/45 lg:grid lg:grid-cols-[1.35fr_2.3fr_1.1fr_1fr_1fr] lg:gap-4">
                          <span>Timestamp</span>
                          <span>Activity</span>
                          <span>Handled by</span>
                          <span>Room / status</span>
                          <span className="text-right">Value</span>
                        </div>

                        {group.operations.map((operation) => (
                          <div key={operation.id} className="rounded-[1.2rem] border border-ink/10 bg-white px-4 py-4 lg:grid lg:grid-cols-[1.35fr_2.3fr_1.1fr_1fr_1fr] lg:gap-4 lg:items-start">
                            <div className="text-sm text-ink/62">{formatDateTimeLabel(operation.occurredAt)}</div>
                            <div className="mt-3 space-y-2 lg:mt-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">{getCategoryLabel(operation.category)}</span>
                                {operation.status ? <span className="rounded-full bg-parchment px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/70">{formatStatusLabel(operation.status)}</span> : null}
                              </div>
                              <div>
                                <p className="text-base font-semibold text-ink">{operation.title}</p>
                                <p className="mt-1 text-sm leading-6 text-ink/70">{operation.detail}</p>
                              </div>
                            </div>
                            <div className="mt-3 text-sm text-ink/62 lg:mt-0">{operation.actorName ?? 'System or legacy record'}</div>
                            <div className="mt-3 text-sm text-ink/62 lg:mt-0">
                              <p>{operation.roomLabel ?? 'No room link'}</p>
                              {operation.status ? <p className="mt-1 uppercase tracking-[0.14em] text-ink/45">{formatStatusLabel(operation.status)}</p> : null}
                            </div>
                            <div className="mt-3 text-left text-sm font-semibold text-ink lg:mt-0 lg:text-right">{formatAmount(operation.amountGhs) ?? 'No direct value'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}