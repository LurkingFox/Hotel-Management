'use client'

import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

type AdminSessionActionsProps = {
  currentUser: string
  inverted?: boolean
}

export function AdminSessionActions({ currentUser, inverted = false }: AdminSessionActionsProps) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const shellTone = inverted ? 'border-white/15 bg-white/10 text-white/80 backdrop-blur' : 'border-ink/10 bg-white/75 text-ink/70 backdrop-blur'
  const buttonTone = inverted ? 'border-white/30 text-white hover:bg-white/10' : 'border-ink/15 text-ink hover:bg-parchment'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className={`rounded-full border px-4 py-2 text-sm ${shellTone}`}>Signed in as {currentUser}</div>
      <button className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${buttonTone}`} onClick={handleSignOut} type="button">
        Sign out
      </button>
    </div>
  )
}