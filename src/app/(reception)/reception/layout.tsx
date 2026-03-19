import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

export default async function ReceptionAppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const currentUser = typeof user.user_metadata?.name === 'string' && user.user_metadata.name.length > 0 ? user.user_metadata.name : user.email ?? 'Reception User'
  const currentRole = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : null

  return <AppShell currentRole={currentRole} currentUser={currentUser} shell="reception">{children}</AppShell>
}