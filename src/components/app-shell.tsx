'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { AdminSessionActions } from '@/app/(admin)/admin/admin-session-actions'
import { getNavigationSections, type AppNavItem, type AppShellKind } from '@/lib/app-navigation'

type AppShellProps = {
  children: React.ReactNode
  currentRole?: string | null
  currentUser: string
  shell: AppShellKind
}

function isActive(pathname: string, href: string) {
  if (href === '/attendance') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

function renderNavLink(pathname: string, item: AppNavItem) {
  const active = isActive(pathname, item.href)

  return (
    <Link
      key={item.href}
      className={`block rounded-[1.35rem] border px-4 py-4 transition ${
        active
          ? 'border-white/20 bg-white text-ink shadow-[0_18px_38px_-24px_rgba(17,32,47,0.72)]'
          : 'border-white/10 bg-white/6 text-white/82 hover:border-white/18 hover:bg-white/10'
      }`}
      href={item.href}
    >
      <p className={`text-sm font-semibold ${active ? 'text-ink' : 'text-white'}`}>{item.label}</p>
      <p className={`mt-2 text-sm leading-6 ${active ? 'text-ink/66' : 'text-white/62'}`}>{item.description}</p>
    </Link>
  )
}

export function AppShell({ children, currentRole, currentUser, shell }: AppShellProps) {
  const pathname = usePathname()
  const navigationSections = getNavigationSections(shell, currentRole)
  const shellLabel = shell === 'admin' ? 'Admin suite' : 'Reception flow'

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#11202f_0%,_#11202f_22%,_#f7f1e8_22%,_#f7f1e8_100%)] text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1720px]">
        <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 border-r border-white/10 bg-[radial-gradient(circle_at_top,_rgba(169,124,80,0.22),_transparent_42%),linear-gradient(180deg,_#11202f_0%,_#16293a_100%)] text-white xl:flex xl:flex-col">
          <div className="border-b border-white/10 px-6 py-8">
            <p className="text-xs uppercase tracking-[0.34em] text-white/54">University Hotel</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-none">Operations shell</h1>
            <p className="mt-4 text-sm leading-6 text-white/70">
              The app now uses one consistent frame based on the reception desk and login experience.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6">
            <div className="rounded-[1.6rem] border border-white/12 bg-white/6 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.26em] text-white/54">Current area</p>
              <p className="mt-3 text-lg font-semibold text-white">{shellLabel}</p>
              <p className="mt-2 text-sm text-white/66">Left-side navigation stays fixed while the right side carries the working screen.</p>
            </div>

            <div className="mt-6 space-y-6">
              {navigationSections.map((section) => (
                <section key={section.title} className="space-y-3">
                  <p className="px-2 text-xs uppercase tracking-[0.28em] text-white/46">{section.title}</p>
                  <div className="space-y-3">{section.items.map((item) => renderNavLink(pathname, item))}</div>
                </section>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 px-5 py-5">
            <AdminSessionActions currentUser={currentUser} inverted />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-ink/10 bg-[rgba(247,241,232,0.88)] backdrop-blur xl:hidden">
            <div className="px-4 py-4 md:px-6">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/45">University Hotel</p>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                {navigationSections.flatMap((section) => section.items).map((item) => {
                  const active = isActive(pathname, item.href)
                  return (
                    <Link
                      key={item.href}
                      className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        active ? 'border-ink bg-ink text-white' : 'border-ink/12 bg-white text-ink hover:bg-parchment'
                      }`}
                      href={item.href}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
              <div className="mt-4">
                <AdminSessionActions currentUser={currentUser} />
              </div>
            </div>
          </div>

          <div className="min-h-screen">{children}</div>
        </div>
      </div>
    </div>
  )
}