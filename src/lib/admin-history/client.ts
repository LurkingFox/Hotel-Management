type ExportParamValue = string | undefined

export function triggerHistoryExport(view: string, params: Record<string, ExportParamValue>) {
  const url = new URL('/api/history-export', window.location.origin)
  url.searchParams.set('view', view)

  for (const [key, value] of Object.entries(params)) {
    if (!value) {
      continue
    }

    url.searchParams.set(key, value)
  }

  const link = document.createElement('a')
  link.href = url.toString()
  link.rel = 'noopener'
  link.click()
}