'use client'

import { useEffect } from 'react'

export function PrintOnLoad() {
  useEffect(() => {
    window.print()
  }, [])

  return null
}