import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

export default async function ReceptionAppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const currentUser = typeof user.user_metadata?.name === 'string' && user.user_metadata.name.length > 0 ? user.user_metadata.name : user.email ?? 'Reception User'
  const currentRole = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null

  const [activeStaysCountResult, requestsCountResult, handoffItemsCountResult, guestAttentionCountResult, openServiceChargesCountResult, openShiftCountResult] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', ['new', 'acknowledged', 'assigned', 'in_progress']),
    supabase.from('operational_handoff_items').select('id', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('guest_profiles').select('id', { count: 'exact', head: true }).in('kyc_status', ['not_started', 'pending', 'rejected']),
    supabase.from('service_charges').select('id', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('shifts').select('id', { count: 'exact', head: true }).is('ended_at', null)
  ])

  if (activeStaysCountResult.error) {
    throw new Error(activeStaysCountResult.error.message)
  }

  if (requestsCountResult.error) {
    throw new Error(requestsCountResult.error.message)
  }

  if (handoffItemsCountResult.error) {
    throw new Error(handoffItemsCountResult.error.message)
  }

  if (guestAttentionCountResult.error) {
    throw new Error(guestAttentionCountResult.error.message)
  }

  if (openServiceChargesCountResult.error) {
    throw new Error(openServiceChargesCountResult.error.message)
  }

  if (openShiftCountResult.error) {
    throw new Error(openShiftCountResult.error.message)
  }

  return (
    <AppShell
      actionCounts={{
        '/reception/desk': activeStaysCountResult.count ?? 0,
        '/reception/guests': guestAttentionCountResult.count ?? 0,
        '/reception/requests': requestsCountResult.count ?? 0,
        '/reception/services': openServiceChargesCountResult.count ?? 0,
        '/reception/handoffs': handoffItemsCountResult.count ?? 0,
        '/attendance': openShiftCountResult.count ?? 0
      }}
      currentRole={currentRole}
      currentUser={currentUser}
      shell="reception"
      summary={{
        title: 'Desk watch',
        description: 'These counts keep the front desk anchored on live stays, guest follow-up, and carryover work.',
        items: [
          {
            caption: 'Currently active stays that can require desk action.',
            count: activeStaysCountResult.count ?? 0,
            href: '/reception/desk',
            label: 'Active stays'
          },
          {
            caption: 'Guest requests still open across the hotel.',
            count: requestsCountResult.count ?? 0,
            href: '/reception/requests',
            label: 'Open requests'
          },
          {
            caption: 'Unresolved handoff items still waiting on the next shift.',
            count: handoffItemsCountResult.count ?? 0,
            href: '/reception/handoffs',
            label: 'Carryover'
          }
        ]
      }}
    >
      {children}
    </AppShell>
  )
}