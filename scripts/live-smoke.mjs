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

function createCardUid(seed) {
  const bytes = Array.from({ length: 4 }, (_, index) => ((seed >> (index * 5)) + index * 53) & 0xff)
  return bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(':')
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

async function callValidateKeycard(env, payload) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/validate_keycard`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  })

  const text = await response.text()
  return {
    status: response.status,
    text,
    json: text ? safeJson(text) : null
  }
}

async function listAccessLogEntries(env, cardUid) {
  const supabase = createServiceRoleClient(env)
  const { data, error } = await supabase.from('access_log').select('*').eq('card_uid', cardUid).order('accessed_at', { ascending: true })

  if (error) {
    throw error
  }

  return data ?? []
}

async function listDoorControllers(env, controllerId) {
  const supabase = createServiceRoleClient(env)
  const { data, error } = await supabase.from('door_controllers').select('*').eq('controller_id', controllerId).limit(1)

  if (error) {
    throw error
  }

  return data ?? []
}

async function callControllerHeartbeat(env, payload) {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report_controller_status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  })

  const text = await response.text()
  return {
    status: response.status,
    text,
    json: text ? safeJson(text) : null
  }
}

async function ensureSmokeReceptionFixture(env, adminAuth, adminCookie) {
  const staffListResponse = await request('/api/staff', { headers: { Cookie: adminCookie } })
  const staffList = Array.isArray(staffListResponse.json) ? staffListResponse.json : []
  const staffAccounts = await callStaffAuthFunction(env, adminAuth.session.access_token, null, 'GET')
  const existingAccount = Array.isArray(staffAccounts) ? staffAccounts.find((account) => account.email === smokeReceptionEmail) : null
  const existingStaff = existingAccount
    ? staffList.find((staffMember) => staffMember.auth_user_id === existingAccount.id || (existingAccount.staff_id && staffMember.id === existingAccount.staff_id))
    : null

  if (!existingAccount || !existingStaff) {
    const createResponse = await request('/api/staff', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: smokeReceptionName,
        role: 'receptionist',
        dailyRateGhs: 1,
        email: smokeReceptionEmail,
        password: smokeReceptionPassword
      })
    })

    if (createResponse.status !== 201 || !createResponse.json?.staff?.id || !createResponse.json?.authUser?.id) {
      throw new Error('Could not create the smoke receptionist fixture.')
    }

    return {
      created: true,
      initialActive: false,
      staff: createResponse.json.staff,
      authUser: {
        email: createResponse.json.authUser.email,
        id: createResponse.json.authUser.id
      },
      staffListResponse,
      staffAccounts
    }
  }

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
      'admin keycards page',
      await request('/admin/keycards', { headers: { Cookie: adminCookie }, redirect: 'manual' }),
      (response) => response.status === 200 && response.text.includes('Keycard registry')
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

    const roomsResponse = await request('/api/rooms', { headers: { Cookie: adminCookie } })
    const rooms = Array.isArray(roomsResponse.json) ? roomsResponse.json : []
    let smokeRoom = rooms.find((room) => room.status === 'vacant') ?? null

    checks.push(createCheck('admin rooms api', roomsResponse, (response) => response.status === 200 && Array.isArray(response.json) && response.json.length > 0))

    if (!smokeRoom?.id) {
      const createRoomResponse = await request('/api/rooms', {
        method: 'POST',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: `SM-${Date.now().toString().slice(-4)}`,
          type: 'single',
          rate_ghs: 250,
          status: 'vacant'
        })
      })

      checks.push(createCheck('admin creates smoke room', createRoomResponse, (response) => response.status === 201 && !!response.json?.id))
      smokeRoom = createRoomResponse.json
    }

    if (!smokeRoom?.id) {
      throw new Error('No room is available for keycard smoke tests.')
    }

    const smokeControllerId = `controller-${smokeRoom.number ?? Date.now()}`
    const heartbeatResponse = await callControllerHeartbeat(env, {
      controller_id: smokeControllerId,
      firmware_version: 'smoke-1.0.0',
      heartbeat_status: 'online',
      last_note: 'Smoke heartbeat OK.',
      room_id: smokeRoom.id
    })
    checks.push(createCheck('controller heartbeat accepted', heartbeatResponse, (response) => response.status === 200 && response.json?.controller_id === smokeControllerId))

    const controllerRows = await listDoorControllers(env, smokeControllerId)
    checks.push(
      createCheck(
        'controller heartbeat persisted',
        { json: controllerRows, location: null, status: 200 },
        (response) => Array.isArray(response.json) && response.json.length === 1 && response.json[0]?.heartbeat_status === 'online' && response.json[0]?.room_id === smokeRoom.id
      )
    )

    const smokeMasterCardUid = createCardUid(Date.now())
    const smokeRoomCardUid = createCardUid(Date.now() + 91)
    const today = new Date().toISOString().split('T')[0]
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const masterKeyResponse = await request('/api/keycards', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cardUid: smokeMasterCardUid.toLowerCase(),
        issuedTo: 'Smoke Master Key',
        validFrom: today,
        validUntil: nextMonth,
        scope: 'master'
      })
    })

    checks.push(
      createCheck(
        'admin creates master keycard',
        masterKeyResponse,
        (response) => response.status === 201 && response.json?.card_uid === smokeMasterCardUid && response.json?.scope === 'master'
      )
    )

    if (!masterKeyResponse.json?.id) {
      throw new Error('Could not create the smoke master keycard.')
    }

    const grantedValidationResponse = await callValidateKeycard(env, {
      card_uid: smokeMasterCardUid.toLowerCase(),
      room_id: smokeRoom.id
    })
    checks.push(
      createCheck(
        'master key validation granted',
        grantedValidationResponse,
        (response) => response.status === 200 && response.json?.granted === true && response.json?.result === 'granted'
      )
    )

    const revokeMasterKeyResponse = await request('/api/keycards', {
      method: 'PATCH',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: masterKeyResponse.json.id,
        action: 'revoke',
        scope: 'master'
      })
    })
    checks.push(
      createCheck(
        'admin revokes master keycard',
        revokeMasterKeyResponse,
        (response) => response.status === 200 && response.json?.status === 'revoked'
      )
    )

    const deniedValidationResponse = await callValidateKeycard(env, {
      card_uid: smokeMasterCardUid.toLowerCase(),
      room_id: smokeRoom.id
    })
    checks.push(
      createCheck(
        'revoked master key denied',
        deniedValidationResponse,
        (response) => response.status === 200 && response.json?.granted === false && response.json?.result === 'denied'
      )
    )

    const roomCardLogCountBefore = (await listAccessLogEntries(env, smokeRoomCardUid)).length
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
        cardUid: smokeRoomCardUid.toLowerCase(),
        payment: {
          amountGhs: Number(smokeRoom.rate_ghs ?? 250),
          method: 'cash'
        }
      })
    })
    checks.push(
      createCheck(
        'reception creates active booking with room card',
        createBookingResponse,
        (response) => response.status === 201 && response.json?.status === 'active' && response.json?.room_id === smokeRoom.id
      )
    )

    if (!createBookingResponse.json?.id) {
      throw new Error('Could not create the smoke room-card booking.')
    }

    const grantedRoomCardResponse = await callValidateKeycard(env, {
      card_uid: smokeRoomCardUid.toLowerCase(),
      room_id: smokeRoom.id
    })
    checks.push(
      createCheck(
        'room card validation granted',
        grantedRoomCardResponse,
        (response) => response.status === 200 && response.json?.granted === true && response.json?.result === 'granted'
      )
    )

    const roomCardLogsAfterGrant = await listAccessLogEntries(env, smokeRoomCardUid)
    checks.push(
      createCheck(
        'room card access log grant recorded',
        { json: roomCardLogsAfterGrant, location: null, status: 200 },
        (response) =>
          Array.isArray(response.json)
          && response.json.length === roomCardLogCountBefore + 1
          && response.json.at(-1)?.result === 'granted'
          && response.json.at(-1)?.room_id === smokeRoom.id
      )
    )

    const checkoutResponse = await request('/api/bookings', {
      method: 'PATCH',
      headers: {
        Cookie: receptionCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bookingId: createBookingResponse.json.id,
        action: 'checkout'
      })
    })
    checks.push(createCheck('reception checks out smoke booking', checkoutResponse, (response) => response.status === 200 && response.json?.success === true))

    const deniedRoomCardResponse = await callValidateKeycard(env, {
      card_uid: smokeRoomCardUid.toLowerCase(),
      room_id: smokeRoom.id
    })
    checks.push(
      createCheck(
        'revoked room card denied',
        deniedRoomCardResponse,
        (response) => response.status === 200 && response.json?.granted === false && response.json?.result === 'denied'
      )
    )

    const roomCardLogsAfterDeny = await listAccessLogEntries(env, smokeRoomCardUid)
    checks.push(
      createCheck(
        'room card access log denial recorded',
        { json: roomCardLogsAfterDeny, location: null, status: 200 },
        (response) =>
          Array.isArray(response.json)
          && response.json.length === roomCardLogCountBefore + 2
          && response.json.at(-1)?.result === 'denied'
          && response.json.at(-1)?.note === 'Unknown card or wrong room.'
      )
    )

    const resetRoomResponse = await request('/api/rooms', {
      method: 'PATCH',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: smokeRoom.id, status: 'vacant' })
    })
    checks.push(createCheck('admin resets smoke room to vacant', resetRoomResponse, (response) => response.status === 200 && response.json?.status === 'vacant'))

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