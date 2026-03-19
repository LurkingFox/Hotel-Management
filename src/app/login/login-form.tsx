'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'
import { getDefaultPathForRole } from '@/lib/staff-roles'

const checkpoints = [
  'Supabase project linked and schema types generated',
  'Staff accounts created in Supabase Auth with role metadata',
  'RFID Edge Function deployed and keyed with service credentials',
  'Room data seeded for the live dashboard and desk screens'
]

type LoginFormProps = {
  configError: boolean
  inactiveError?: boolean
  nextPath?: string
}

function getSafeNextPath(nextPath?: string) {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return null
  }

  return nextPath
}

function getContinueMessage(nextPath: string | null) {
  if (!nextPath) {
    return null
  }

  if (nextPath === '/attendance') {
    return 'Continue sign-in to open the staff attendance portal.'
  }

  return `Sign in to continue to ${nextPath}.`
}

export function LoginForm({ configError, inactiveError, nextPath }: LoginFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const safeNextPath = getSafeNextPath(nextPath)
  const continueMessage = getContinueMessage(safeNextPath)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)

    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setErrorMessage(error.message)
        return
      }

      if (data.user?.user_metadata?.active === false) {
        await supabase.auth.signOut()
        setErrorMessage('This staff account has been archived. Contact the hotel manager.')
        return
      }

      const role = typeof data.user?.user_metadata?.role === 'string' ? data.user.user_metadata.role : null

      router.push(safeNextPath ?? getDefaultPathForRole(role))
      router.refresh()
    })
  }

  return (
    <main className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(169,124,80,0.24),_transparent_45%),linear-gradient(135deg,_#11202f_0%,_#21384f_46%,_#f7f1e8_46%,_#f7f1e8_100%)] px-6 py-12 text-white md:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-8">
          <span className="inline-flex rounded-full border border-white/20 px-4 py-1 text-xs uppercase tracking-[0.32em] text-white/75">
            University Hotel
          </span>
          <div className="space-y-4">
            <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-none md:text-7xl">
              Sign in to the live hotel operations stack.
            </h1>
            <p className="max-w-2xl text-base text-white/80 md:text-lg">
              Staff authenticate through Supabase Auth, then land directly in the workflow permitted by their role metadata.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">Reception</p>
              <p className="mt-3 text-2xl font-semibold">Check-in, checkout, services</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">RFID</p>
              <p className="mt-3 text-2xl font-semibold">Keycards, access log, audit trail</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.28em] text-white/60">Admin</p>
              <p className="mt-3 text-2xl font-semibold">Rooms, finance, staff control</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] bg-parchment p-8 text-ink shadow-card">
          <p className="text-sm uppercase tracking-[0.24em] text-terracotta">Supabase Auth</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-tight">Login</h2>
          {continueMessage ? (
            <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800">
              {continueMessage}
            </div>
          ) : null}
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-ink/75">Email</span>
              <input
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-base outline-none transition focus:border-terracotta"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="manager@universityhotel.com"
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-ink/75">Password</span>
              <input
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-base outline-none transition focus:border-terracotta"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            {configError ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                Supabase environment variables are missing or invalid.
              </div>
            ) : null}

            {inactiveError ? (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This staff account is inactive. Contact the hotel manager for reactivation.
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
            ) : null}

            <button
              className="w-full rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isPending}
            >
              {isPending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 space-y-4">
            <Link className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-4 text-sm font-semibold text-ink transition hover:border-terracotta hover:text-terracotta" href="/attendance">
              <span>Staff attendance portal</span>
              <span>Open</span>
            </Link>
            {checkpoints.map((item) => (
              <div key={item} className="flex gap-4 rounded-2xl border border-ink/10 bg-white p-4">
                <div className="mt-1 h-3 w-3 rounded-full bg-pine" />
                <p className="text-sm text-ink/80">{item}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}