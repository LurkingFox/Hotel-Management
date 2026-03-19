import { redirect } from 'next/navigation'

import { AppShell } from '@/components/app-shell'
import { createAuthenticatedServerSupabaseClient } from '@/lib/supabase/server'

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await createAuthenticatedServerSupabaseClient()

  if (!user) {
    redirect('/login')
  }

  const currentUser = typeof user.user_metadata?.name === 'string' && user.user_metadata.name.length > 0 ? user.user_metadata.name : user.email ?? 'Admin User'

  return <AppShell currentRole="admin" currentUser={currentUser} shell="admin">{children}</AppShell>
}