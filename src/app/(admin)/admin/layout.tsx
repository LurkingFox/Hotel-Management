import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const currentUser = typeof user.user_metadata?.name === 'string' && user.user_metadata.name.length > 0 ? user.user_metadata.name : user.email ?? 'Admin User'

  const [approvalsCountResult, requestsCountResult, handoffItemsCountResult, activeBookingsCountResult, guestAttentionCountResult, activeCredentialCountResult, openShiftCountResult, roomIssueCountResult, accessExceptionCountResult] = await Promise.all([
    supabase.from('manager_approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', ['new', 'acknowledged', 'assigned', 'in_progress']),
    supabase.from('operational_handoff_items').select('id', { count: 'exact', head: true }).eq('resolved', false),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('guest_profiles').select('id', { count: 'exact', head: true }).in('kyc_status', ['not_started', 'pending', 'rejected']),
    supabase.from('booking_access_credentials').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('shifts').select('id', { count: 'exact', head: true }).is('ended_at', null),
    supabase.from('rooms').select('id', { count: 'exact', head: true }).in('status', ['cleaning', 'maintenance']),
    supabase.from('access_log').select('id', { count: 'exact', head: true }).in('result', ['denied', 'expired'])
  ])

  if (approvalsCountResult.error) {
    throw new Error(approvalsCountResult.error.message)
  }

  if (requestsCountResult.error) {
    throw new Error(requestsCountResult.error.message)
  }

  if (handoffItemsCountResult.error) {
    throw new Error(handoffItemsCountResult.error.message)
  }

  if (activeBookingsCountResult.error) {
    throw new Error(activeBookingsCountResult.error.message)
  }

  if (guestAttentionCountResult.error) {
    throw new Error(guestAttentionCountResult.error.message)
  }

  if (activeCredentialCountResult.error) {
    throw new Error(activeCredentialCountResult.error.message)
  }

  if (openShiftCountResult.error) {
    throw new Error(openShiftCountResult.error.message)
  }

  if (roomIssueCountResult.error) {
    throw new Error(roomIssueCountResult.error.message)
  }

  if (accessExceptionCountResult.error) {
    throw new Error(accessExceptionCountResult.error.message)
  }

  return (
    <AppShell
      actionCounts={{
        '/admin/approvals': approvalsCountResult.count ?? 0,
        '/admin/bookings': activeBookingsCountResult.count ?? 0,
        '/admin/guest-access': activeCredentialCountResult.count ?? 0,
        '/admin/guests': guestAttentionCountResult.count ?? 0,
        '/admin/handoffs': handoffItemsCountResult.count ?? 0,
        '/admin/rooms': roomIssueCountResult.count ?? 0,
        '/admin/service-desk': requestsCountResult.count ?? 0,
        '/admin/staff': openShiftCountResult.count ?? 0,
        '/admin/access-log': accessExceptionCountResult.count ?? 0,
        '/admin/today': (approvalsCountResult.count ?? 0) + (requestsCountResult.count ?? 0) + (handoffItemsCountResult.count ?? 0)
      }}
      currentRole="admin"
      currentUser={currentUser}
      shell="admin"
      summary={{
        title: 'Command watch',
        description: 'These counts mirror the live queues that usually need manager action before anything else.',
        items: [
          {
            caption: 'Manager decisions waiting in the approval queue.',
            count: approvalsCountResult.count ?? 0,
            href: '/admin/approvals',
            label: 'Approvals'
          },
          {
            caption: 'Guest-facing requests still active across the hotel.',
            count: requestsCountResult.count ?? 0,
            href: '/admin/service-desk',
            label: 'Open requests'
          },
          {
            caption: 'Carryover items still unresolved in shift handoffs.',
            count: handoffItemsCountResult.count ?? 0,
            href: '/admin/handoffs',
            label: 'Carryover'
          }
        ]
      }}
    >
      {children}
    </AppShell>
  )
}