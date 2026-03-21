import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { isFrontDeskRole, isStaffRole } from '@/lib/staff-roles'

function createLoginRedirect(request: NextRequest, error?: 'config' | 'inactive') {
  const loginUrl = new URL('/login', request.url)
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`

  if (error) {
    loginUrl.searchParams.set('error', error)
  }

  if (nextPath !== '/login') {
    loginUrl.searchParams.set('next', nextPath)
  }

  return loginUrl
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.redirect(createLoginRedirect(request, 'config'))
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: Array<{
          name: string
          value: string
          options?: Parameters<typeof response.cookies.set>[2]
        }>
      ) {
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options)
        }
      }
    }
  })

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(createLoginRedirect(request))
  }

  const role = user.user_metadata?.role
  const active = user.user_metadata?.active

  if (active === false) {
    return NextResponse.redirect(createLoginRedirect(request, 'inactive'))
  }

  if (request.nextUrl.pathname.startsWith('/attendance')) {
    if (!isStaffRole(typeof role === 'string' ? role : null)) {
      return NextResponse.redirect(createLoginRedirect(request))
    }

    return response
  }

  if (request.nextUrl.pathname.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/reception/desk', request.url))
  }

  if (request.nextUrl.pathname.startsWith('/reception') && !isFrontDeskRole(typeof role === 'string' ? role : null)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/reception/:path*', '/attendance']
}