import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function getCookieMethods(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(
      cookiesToSet: Array<{
        name: string
        value: string
        options?: Parameters<typeof cookieStore.set>[2]
      }>
    ) {
      for (const cookie of cookiesToSet) {
        cookieStore.set(cookie.name, cookie.value, cookie.options)
      }
    }
  }
}

export async function createServerSupabaseClient(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase environment variables are missing.')
  }

  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: getCookieMethods(cookieStore),
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      : undefined
  })
}

export type AuthenticatedUser = Awaited<ReturnType<Awaited<ReturnType<typeof createServerSupabaseClient>>['auth']['getUser']>>['data']['user']

export async function createAuthenticatedServerSupabaseClient() {
  const sessionClient = await createServerSupabaseClient()
  const [
    {
      data: { user },
      error: userError
    },
    {
      data: { session },
      error: sessionError
    }
  ] = await Promise.all([sessionClient.auth.getUser(), sessionClient.auth.getSession()])

  if (!user || !session?.access_token) {
    return {
      supabase: sessionClient,
      session,
      user: user ?? null,
      error: userError ?? sessionError
    }
  }

  return {
    supabase: await createServerSupabaseClient(session.access_token),
    session,
    user,
    error: userError ?? sessionError
  }
}