export function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export function getPage(value: string | string[] | undefined) {
  const page = Number.parseInt(getSingleParam(value), 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export function isDateInput(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function toStartOfDayIso(value: string) {
  return `${value}T00:00:00.000Z`
}

export function toExclusiveEndOfDayIso(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}

export function sanitizeSearchTerm(value: string) {
  return value.replace(/[,%()]/g, ' ').trim()
}

function toCsvCell(value: boolean | number | string | null | undefined) {
  const normalized = value == null ? '' : String(value)
  return `"${normalized.replace(/"/g, '""')}"`
}

export function buildCsvString(headers: string[], rows: Array<Array<boolean | number | string | null | undefined>>) {
  const lines = [headers.map(toCsvCell).join(',')]

  for (const row of rows) {
    lines.push(row.map(toCsvCell).join(','))
  }

  return `${lines.join('\r\n')}\r\n`
}

export function buildExportFilename(prefix: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `${prefix}_${timestamp}.csv`
}

export function formatTimestampForExport(value: string | null) {
  return value ? new Date(value).toISOString() : ''
}

export function formatDateForExport(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}