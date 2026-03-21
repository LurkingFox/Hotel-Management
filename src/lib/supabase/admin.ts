import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/types'

function getAdminSupabaseEnv() {
  return {
    key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  }
}

export function hasAdminSupabaseCredentials() {
  const { key, url } = getAdminSupabaseEnv()
  return Boolean(url && key)
}

export function createAdminSupabaseClient() {
  const { key, url } = getAdminSupabaseEnv()

  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for server-side webhook persistence.')
  }

  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}