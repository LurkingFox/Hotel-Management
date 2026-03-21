import fs from 'node:fs'
import path from 'node:path'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const smokeReceptionEmail = 'smoke.reception@universityhotel.com'
const smokeReceptionPassword = 'SmokeReception!2026'
const smokeReceptionName = 'Smoke Reception'
const smokeLogoPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII='
const smokeBaseUrl = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const sampleLogoRoute = '/api/sample-logos/Bespoke%20Minimalist%20Logo%20System%20for%20University%20Hotel.png'
const requireLiveBookingFlow = /^(1|true|yes)$/i.test(process.env.SMOKE_REQUIRE_LIVE_BOOKING ?? '')

function loadEnv() {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  return Object.fromEntries(
    envText
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

function createCookieClient(env) {
  const cookieJar = []
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieJar
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          const nextCookie = { name: cookie.name, value: cookie.value }
          const index = cookieJar.findIndex((entry) => entry.name === cookie.name)
          if (index >= 0) {
            cookieJar[index] = nextCookie
          } else {
            cookieJar.push(nextCookie)
          }
        }
      }
    }
  })

  return {
    supabase,
    getCookieHeader() {
      return cookieJar.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
    }
  }
}

async function signIn(env, email, password) {
  const { supabase, getCookieHeader } = createCookieClient(env)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }

  return {
    cookie: getCookieHeader(),
    session: data.session,
    user: data.user
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`${smokeBaseUrl}${pathname}`, options)
  const text = await response.text()
  return {
    headers: Object.fromEntries(response.headers.entries()),
    location: response.headers.get('location'),
    status: response.status,
    text,
    json: text ? safeJson(text) : null
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function base64ToUint8Array(value) {
  return Uint8Array.from(Buffer.from(value, 'base64'))
}

function createServiceRoleClient(env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

function createCheck(name, result, validate) {
  return {
    name,
    result,
    passed: validate(result)
  }
}

function createSkippedCheck(name, reason, details = null) {
  return {
    name,
    passed: true,
    reason,
    result: {
      headers: {},
      json: details,
      location: null,
      status: 204,
      text: reason
    },
    skipped: true
  }
}

function isJsonArrayResponse(response) {
  return response.status === 200 && Array.isArray(response.json)
}

function isInactiveRedirect(response, nextPath) {
  return [302, 303, 307, 308].includes(response.status) && response.location?.includes('/login') && response.location.includes('error=inactive') && response.location.includes(`next=${encodeURIComponent(nextPath)}`)
}

async function updateStaffActivation(adminCookie, payload) {
  return request('/api/staff', {
    method: 'DELETE',
    headers: {
      Cookie: adminCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
}

async function ensureStaffActivation(adminCookie, staffId, authUserId, active) {
  const response = await updateStaffActivation(adminCookie, { id: staffId, authUserId, active })

  if (!response.json || response.status !== 200 || response.json.active !== active) {
    throw new Error(`Could not set staff activation to ${active}. Response status: ${response.status}`)
  }

  return response
}

async function callStaffAuthFunction(env, accessToken, payload, method = 'POST') {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage_staff_auth`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'x-staff-auth-token': accessToken,
      'Content-Type': 'application/json'
    },
    body: method === 'GET' ? undefined : JSON.stringify(payload),
    cache: 'no-store'
  })

  const data = safeJson(await response.text())

  if (!response.ok) {
    throw new Error(data?.error ?? `Staff auth function request failed with status ${response.status}.`)
  }

  return data
}

async function reconcileSmokeStaffRecord(env, existingStaff, authUserId = null) {
  const supabase = createServiceRoleClient(env)

  if (!existingStaff) {
    const { data, error } = await supabase
      .from('staff')
      .insert({
        name: smokeReceptionName,
        role: 'receptionist',
        daily_rate_ghs: 1,
        on_shift: false,
        active: true,
        auth_user_id: authUserId
      })
      .select('*')
      .single()

    if (error || !data) {
      throw new Error(error?.message ?? 'Could not create the smoke staff record.')
    }

    return data
  }

  const nextAuthUserId = authUserId ?? existingStaff.auth_user_id ?? null
  const { data, error } = await supabase
    .from('staff')
    .update({
      active: existingStaff.active ?? true,
      auth_user_id: nextAuthUserId,
      daily_rate_ghs: existingStaff.daily_rate_ghs ?? 1,
      name: existingStaff.name ?? smokeReceptionName,
      on_shift: existingStaff.on_shift ?? false,
      role: existingStaff.role ?? 'receptionist'
    })
    .eq('id', existingStaff.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Could not reconcile the smoke staff record.')
  }

  return data
}

async function getLatestExtensionAudit(env, bookingId) {
  const supabase = createServiceRoleClient(env)
  const { data, error } = await supabase
    .from('booking_extension_audits')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    throw error
  }

  return Array.isArray(data) ? (data[0] ?? null) : null
}

async function ensureSmokeReceptionFixture(env, adminAuth, adminCookie) {
  const staffListResponse = await request('/api/staff', { headers: { Cookie: adminCookie } })
  const staffList = Array.isArray(staffListResponse.json) ? staffListResponse.json : []
  const staffAccounts = await callStaffAuthFunction(env, adminAuth.session.access_token, null, 'GET')
  const existingAccount = Array.isArray(staffAccounts) ? staffAccounts.find((account) => account.email === smokeReceptionEmail) : null
  const linkedStaff = existingAccount
    ? staffList.find((staffMember) => staffMember.auth_user_id === existingAccount.id || (existingAccount.staff_id && staffMember.id === existingAccount.staff_id))
    : null
  const namedStaff = staffList.find((staffMember) => staffMember.name === smokeReceptionName && staffMember.role === 'receptionist')
  let existingStaff = linkedStaff ?? namedStaff ?? null

  if (!existingAccount && !existingStaff) {
    const staff = await reconcileSmokeStaffRecord(env, null)
    const authUser = await callStaffAuthFunction(env, adminAuth.session.access_token, {
      action: 'create',
      email: smokeReceptionEmail,
      password: smokeReceptionPassword,
      name: staff.name,
      role: staff.role,
      staffId: staff.id,
      active: staff.active !== false
    })

    const linked = await reconcileSmokeStaffRecord(env, staff, authUser.id)

    return {
      created: true,
      initialActive: linked.active !== false,
      staff: linked,
      authUser: {
        email: authUser.email,
        id: authUser.id
      },
      staffAccounts,
      staffListResponse
    }
  }

  if (!existingAccount && existingStaff) {
    const authUser = await callStaffAuthFunction(env, adminAuth.session.access_token, {
      action: 'create',
      email: smokeReceptionEmail,
      password: smokeReceptionPassword,
      name: existingStaff.name,
      role: existingStaff.role,
      staffId: existingStaff.id,
      active: existingStaff.active !== false
    })

    existingStaff = await reconcileSmokeStaffRecord(env, existingStaff, authUser.id)

    return {
      created: false,
      initialActive: existingStaff.active !== false,
      staff: existingStaff,
      authUser: {
        email: authUser.email,
        id: authUser.id
      },
      staffAccounts,
      staffListResponse
    }
  }

  if (existingAccount && !existingStaff) {
    existingStaff = await reconcileSmokeStaffRecord(env, null, existingAccount.id)
  }

  existingStaff = await reconcileSmokeStaffRecord(env, existingStaff, existingAccount.id)

  await callStaffAuthFunction(env, adminAuth.session.access_token, {
    action: 'update',
    authUserId: existingAccount.id,
    email: existingAccount.email,
    password: smokeReceptionPassword,
    name: existingStaff.name,
    role: existingStaff.role,
    staffId: existingStaff.id,
    active: existingStaff.active !== false
  })

  return {
    created: false,
    initialActive: existingStaff.active !== false,
    staff: existingStaff,
    authUser: {
      email: existingAccount.email,
      id: existingAccount.id
    },
    staffListResponse,
    staffAccounts
  }
}

async function main() {
  const env = loadEnv()
  const adminAuth = await signIn(env, 'manager@universityhotel.com', 'UniversityHotelAdmin!2026')
  const adminCookie = adminAuth.cookie
  const checks = []
  const smokeReceptionFixture = await ensureSmokeReceptionFixture(env, adminAuth, adminCookie)
  let originalHotelProfile = null
  let smokeBookingId = null
  let smokeRoomId = null

  checks.push(createCheck('admin staff api', smokeReceptionFixture.staffListResponse, isJsonArrayResponse))
  checks.push(
    createCheck(
      'admin staff auth list',
      {
        json: smokeReceptionFixture.staffAccounts,
        location: null,
        status: Array.isArray(smokeReceptionFixture.staffAccounts) ? 200 : 500
      },
      (response) => response.status === 200 && Array.isArray(response.json)
    )
  )

  await ensureStaffActivation(adminCookie, smokeReceptionFixture.staff.id, smokeReceptionFixture.authUser.id, true)
  await callStaffAuthFunction(env, adminAuth.session.access_token, {
    action: 'update',
    authUserId: smokeReceptionFixture.authUser.id,
    email: smokeReceptionFixture.authUser.email,
    password: smokeReceptionPassword,
    name: smokeReceptionFixture.staff.name,
    role: smokeReceptionFixture.staff.role,
    staffId: smokeReceptionFixture.staff.id,
    active: true
  })

  const smokeReceptionAuth = await signIn(env, smokeReceptionFixture.authUser.email, smokeReceptionPassword)
  const receptionCookie = smokeReceptionAuth.cookie

  checks.push(
    createCheck(
      'admin root redirects to today',
      await request('/admin', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => [302, 303, 307, 308].includes(response.status) && response.location?.endsWith('/admin/today')
    ),
    createCheck(
      'admin today page',
      await request('/admin/today', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Pending extension confirmations')
    ),
    createCheck(
      'admin dashboard page',
      await request('/admin/dashboard', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Operational command')
    ),
    createCheck(
      'admin bookings page',
      await request('/admin/bookings', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Live bookings command board')
    ),
    createCheck(
      'admin payments page',
      await request('/admin/payments', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Payments ledger')
    ),
    createCheck(
      'admin guest access page',
      await request('/admin/guest-access', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Guest access registry')
    ),
    createCheck(
      'legacy keycards route removed',
      await request('/admin/keycards', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 404
    ),
    createCheck(
      'admin access log page',
      await request('/admin/access-log', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Access log')
    ),
    createCheck(
      'admin rooms page',
      await request('/admin/rooms', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Live status and readiness')
    ),
    createCheck(
      'admin staff page',
      await request('/admin/staff', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Live staffing board')
    ),
    createCheck(
      'admin settings page',
      await request('/admin/settings', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Hotel identity')
    ),
    createCheck(
      'sample logo route',
      await request(sampleLogoRoute, { headers: { Cookie: adminCookie } }),
      (response) => response.status === 200 && response.headers['content-type']?.includes('image/png')
    ),
    createCheck(
      'reception desk page',
      await request('/reception/desk', { headers: { Cookie: receptionCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Live arrivals, stays, and checkout flow')
    ),
    createCheck(
      'reception attendance page',
      await request('/attendance', { headers: { Cookie: receptionCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Start and end your shift from this page.')
    ),
    createCheck(
      'reception services page',
      await request('/reception/services', { headers: { Cookie: receptionCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Live service charges')
    ),
    createCheck(
      'reception rooms api',
      await request('/api/rooms', { headers: { Cookie: receptionCookie } }),
      (response) => response.status === 200 && Array.isArray(response.json)
    ),
    createCheck(
      'reception services api',
      await request('/api/services?resolved=false', { headers: { Cookie: receptionCookie } }),
      isJsonArrayResponse
    ),
    createCheck(
      'reception payments blocked',
      await request('/api/payments', { headers: { Cookie: receptionCookie } }),
      (response) => response.status === 403
    )
  )

  try {
    const hotelProfileGetResponse = await request('/api/hotel-profile', { headers: { Cookie: adminCookie } })
    checks.push(
      createCheck(
        'admin hotel profile api',
        hotelProfileGetResponse,
        (response) => response.status === 200 && typeof response.json?.name === 'string'
      )
    )

    originalHotelProfile = hotelProfileGetResponse.json

    const smokeHotelProfilePatch = {
      ...(originalHotelProfile ?? {}),
      phone: '+233000SMOKE',
      website: `${env.NEXT_PUBLIC_SITE_URL}/smoke-profile-check`
    }
    const hotelProfilePatchResponse = await request('/api/hotel-profile', {
      method: 'PATCH',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(smokeHotelProfilePatch)
    })
    checks.push(
      createCheck(
        'admin hotel profile update',
        hotelProfilePatchResponse,
        (response) => response.status === 200 && response.json?.phone === '+233000SMOKE' && response.json?.website?.includes('/smoke-profile-check')
      )
    )

    const logoFormData = new FormData()
    logoFormData.append('file', new Blob([base64ToUint8Array(smokeLogoPngBase64)], { type: 'image/png' }), 'smoke-logo.png')
    const hotelLogoUploadResponse = await request('/api/hotel-profile/logo', {
      method: 'POST',
      headers: {
        Cookie: adminCookie
      },
      body: logoFormData
    })
    checks.push(
      createCheck(
        'admin hotel logo upload',
        hotelLogoUploadResponse,
        (response) => response.status === 200 && typeof response.json?.logoUrl === 'string' && response.json.logoUrl.includes('hotel-assets')
      )
    )

    const baselineDeskResponse = await request('/reception/desk', { headers: { Cookie: receptionCookie }, redirect: 'manual' })
    checks.push(
      createCheck('reception desk baseline access', baselineDeskResponse, (response) => response.status === 200 && response.text.includes('Live arrivals, stays, and checkout flow'))
    )

    const syncMappingsResponse = await request('/api/seam/room-access-devices', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'sync_from_env' })
    })
    checks.push(
      createCheck(
        'admin syncs Seam room mappings',
        syncMappingsResponse,
        (response) => response.status === 200 && Array.isArray(response.json?.mappings)
      )
    )

    const mappingsResponse = await request('/api/seam/room-access-devices', { headers: { Cookie: adminCookie } })
    const roomMappings = Array.isArray(mappingsResponse.json?.mappings) ? mappingsResponse.json.mappings : []
    checks.push(
      createCheck(
        'admin seam room mappings api',
        mappingsResponse,
        (response) => response.status === 200 && Array.isArray(response.json?.mappings)
      )
    )

    const roomsResponse = await request('/api/rooms', { headers: { Cookie: adminCookie } })
    const rooms = Array.isArray(roomsResponse.json) ? roomsResponse.json : []
    const mappedVacantRoomId = roomMappings.find((mapping) => mapping.externalDeviceId && mapping.room?.status === 'vacant')?.room?.id ?? null
    const smokeRoom = mappedVacantRoomId ? rooms.find((room) => room.id === mappedVacantRoomId) ?? null : null

    checks.push(createCheck('admin rooms api', roomsResponse, (response) => response.status === 200 && Array.isArray(response.json) && response.json.length > 0))

    const today = new Date().toISOString().split('T')[0]
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const dayAfterTomorrow = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]
    const removedKeycardsApiResponse = await request('/api/keycards', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        issuedTo: 'Smoke Legacy Request',
        validFrom: today,
        validUntil: nextMonth
      })
    })
    checks.push(
      createCheck(
        'legacy keycards api removed',
        removedKeycardsApiResponse,
        (response) => response.status === 404
      )
    )

    if (!smokeRoom?.id) {
      const skipReason = 'No vacant Seam-mapped room is available for live smoke booking tests.'

      if (requireLiveBookingFlow) {
        throw new Error(skipReason)
      }

      checks.push(
        createSkippedCheck('live Seam booking flow', skipReason, {
          mappedRoomCount: roomMappings.filter((mapping) => mapping.externalDeviceId).length,
          vacantRoomCount: rooms.filter((room) => room.status === 'vacant').length
        })
      )
    } else {
      smokeRoomId = smokeRoom.id

      const createBookingResponse = await request('/api/bookings', {
        method: 'POST',
        headers: {
          Cookie: receptionCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId: smokeRoom.id,
          guestName: `Smoke Guest ${Date.now().toString().slice(-6)}`,
          guestPhone: '0200000000',
          checkIn: today,
          checkOutExpected: tomorrow,
          totalGhs: Number(smokeRoom.rate_ghs ?? 250),
          status: 'active',
          payment: {
            amountGhs: Number(smokeRoom.rate_ghs ?? 250),
            method: 'cash'
          }
        })
      })
      checks.push(
        createCheck(
          'reception creates active booking with Seam access issuance',
          createBookingResponse,
          (response) =>
            response.status === 201
            && response.json?.booking?.status === 'active'
            && response.json?.booking?.room_id === smokeRoom.id
            && response.json?.access?.provider === 'seam'
        )
      )

      if (!createBookingResponse.json?.booking?.id) {
        throw new Error(
          `Could not create the smoke Seam booking. Status: ${createBookingResponse.status}. `
          + `Body: ${createBookingResponse.text || JSON.stringify(createBookingResponse.json)}`
        )
      }

      smokeBookingId = createBookingResponse.json.booking.id

      const extendBookingResponse = await request('/api/bookings', {
        method: 'PATCH',
        headers: {
          Cookie: receptionCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'extend',
          bookingId: smokeBookingId,
          extensionAcknowledged: true,
          extensionAuthorization: {
            reason: 'Smoke extension accountability flow.'
          },
          extensionPayment: {
            amountGhs: Number(smokeRoom.rate_ghs ?? 250),
            method: 'cash'
          },
          newCheckOutExpected: dayAfterTomorrow
        })
      })
      checks.push(
        createCheck(
          'reception extends booking pending confirmation',
          extendBookingResponse,
          (response) => response.status === 200 && response.json?.success === true
        )
      )

      const pendingExtensionAudit = await getLatestExtensionAudit(env, smokeBookingId)
      checks.push(
        createCheck(
          'pending extension audit recorded',
          {
            headers: {},
            json: pendingExtensionAudit,
            location: null,
            status: pendingExtensionAudit ? 200 : 404,
            text: pendingExtensionAudit ? JSON.stringify(pendingExtensionAudit) : ''
          },
          (response) => response.status === 200 && response.json?.confirmation_status === 'pending'
        )
      )

      if (!pendingExtensionAudit?.id) {
        throw new Error('The smoke extension audit was not recorded as pending manager confirmation.')
      }

      const confirmExtensionResponse = await request('/api/bookings', {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'confirm_extension',
          confirmationNote: 'Smoke manager confirmation.',
          extensionAuditId: pendingExtensionAudit.id
        })
      })
      checks.push(
        createCheck(
          'admin confirms pending extension',
          confirmExtensionResponse,
          (response) => response.status === 200 && response.json?.success === true
        )
      )

      const confirmedExtensionAudit = await getLatestExtensionAudit(env, smokeBookingId)
      checks.push(
        createCheck(
          'extension audit marked confirmed',
          {
            headers: {},
            json: confirmedExtensionAudit,
            location: null,
            status: confirmedExtensionAudit ? 200 : 404,
            text: confirmedExtensionAudit ? JSON.stringify(confirmedExtensionAudit) : ''
          },
          (response) => response.status === 200 && response.json?.confirmation_status === 'confirmed'
        )
      )

      const checkoutResponse = await request('/api/bookings', {
        method: 'PATCH',
        headers: {
          Cookie: receptionCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookingId: smokeBookingId,
          action: 'checkout'
        })
      })
      checks.push(createCheck('reception checks out smoke booking', checkoutResponse, (response) => response.status === 200 && response.json?.success === true))
      smokeBookingId = null

      const resetRoomResponse = await request('/api/rooms', {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: smokeRoom.id, status: 'vacant' })
      })
      checks.push(createCheck('admin resets smoke room to vacant', resetRoomResponse, (response) => response.status === 200 && response.json?.status === 'vacant'))
      smokeRoomId = null
    }

    const archiveResponse = await ensureStaffActivation(adminCookie, smokeReceptionFixture.staff.id, smokeReceptionFixture.authUser.id, false)
    checks.push(createCheck('admin archives receptionist', archiveResponse, (response) => response.status === 200 && response.json?.active === false))

    const blockedDeskResponse = await request('/reception/desk', { headers: { Cookie: receptionCookie }, redirect: 'manual' })
    checks.push(createCheck('inactive receptionist redirect', blockedDeskResponse, (response) => isInactiveRedirect(response, '/reception/desk')))

    const blockedAttendanceResponse = await request('/api/staff/attendance', {
      method: 'POST',
      headers: {
        Cookie: receptionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'start_shift' })
    })
    checks.push(
      createCheck(
        'inactive receptionist attendance blocked',
        blockedAttendanceResponse,
        (response) => response.status === 403 && response.json?.error === 'This staff profile is inactive.'
      )
    )

    const reactivateResponse = await ensureStaffActivation(adminCookie, smokeReceptionFixture.staff.id, smokeReceptionFixture.authUser.id, true)
    checks.push(createCheck('admin reactivates receptionist', reactivateResponse, (response) => response.status === 200 && response.json?.active === true))

    const restoredDeskResponse = await request('/reception/desk', { headers: { Cookie: receptionCookie }, redirect: 'manual' })
    checks.push(
      createCheck('reactivated receptionist access restored', restoredDeskResponse, (response) => response.status === 200 && response.text.includes('Live arrivals, stays, and checkout flow'))
    )
  } finally {
    if (smokeBookingId) {
      await request('/api/bookings', {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookingId: smokeBookingId,
          action: 'checkout'
        })
      }).catch(() => null)
    }

    if (smokeRoomId) {
      await request('/api/rooms', {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: smokeRoomId, status: 'vacant' })
      }).catch(() => null)
    }

    if (originalHotelProfile) {
      await request('/api/hotel-profile', {
        method: 'PATCH',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(originalHotelProfile)
      })
    }

    if (smokeReceptionFixture.initialActive === false) {
      await ensureStaffActivation(adminCookie, smokeReceptionFixture.staff.id, smokeReceptionFixture.authUser.id, false)
    }
  }

  const report = checks.map((check) => ({
    name: check.name,
    location: check.result.location ?? null,
    reason: check.reason ?? null,
    skipped: check.skipped ?? false,
    status: check.result.status,
    passed: check.passed
  }))

  console.log(JSON.stringify(report, null, 2))

  if (report.some((entry) => !entry.passed)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})