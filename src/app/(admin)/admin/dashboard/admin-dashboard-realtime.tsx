'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

export function AdminDashboardRealtime() {
  const router = useRouter()
  const [, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('admin-dashboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        startTransition(() => router.refresh())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        startTransition(() => router.refresh())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        startTransition(() => router.refresh())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'access_log' }, () => {
        startTransition(() => router.refresh())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        startTransition(() => router.refresh())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'door_controllers' }, () => {
        startTransition(() => router.refresh())
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router, startTransition])

  return null
}