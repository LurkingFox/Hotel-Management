export function formatGHS(amount: number): string {
  return 'GHS ' + amount.toLocaleString('en-GH', { minimumFractionDigits: 0 })
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}