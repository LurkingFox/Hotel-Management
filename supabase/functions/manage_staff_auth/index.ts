import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

type StaffAuthPayload = {
  action?: 'list' | 'create' | 'update' | 'delete'
  authUserId?: string
  email?: string
  password?: string
  name?: string
  role?: 'admin' | 'receptionist' | 'housekeeping' | 'security' | 'maintenance'
  staffId?: string
  active?: boolean
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

serve(async (request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('PROJECT_URL')
    const anonKey = request.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY')
    const authHeader = request.headers.get('Authorization')
    const forwardedToken = request.headers.get('x-staff-auth-token')?.trim()
    const authorizationToken = authHeader?.replace('Bearer ', '').trim()
    const token = forwardedToken || (authorizationToken && authorizationToken !== anonKey ? authorizationToken : null)

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Supabase secrets are missing.' }, 500)
    }

    if (!token) {
      return jsonResponse({ error: 'Authorization token is required.' }, 401)
    }

    const authClient = createClient(supabaseUrl, anonKey)
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser(token)

    if (userError || !user) {
      return jsonResponse({ error: userError?.message ?? 'Authentication required.' }, 401)
    }

    if (user.user_metadata?.role !== 'admin') {
      return jsonResponse({ error: 'Admin access required.' }, 403)
    }

    const body = request.method === 'GET' ? ({ action: 'list' } satisfies StaffAuthPayload) : ((await request.json()) as StaffAuthPayload)
    const action = body.action ?? 'list'

    if (action === 'list') {
      const users: Array<Record<string, unknown>> = []
      let page = 1
      const validRoles = ['admin', 'receptionist', 'housekeeping', 'security', 'maintenance']

      while (true) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })

        if (error) {
          return jsonResponse({ error: error.message }, 500)
        }

        const batch = data.users
          .filter((entry) => entry.user_metadata?.staff_id || validRoles.includes(String(entry.user_metadata?.role ?? '')))
          .map((entry) => ({
            id: entry.id,
            email: entry.email ?? null,
            created_at: entry.created_at,
            staff_id: typeof entry.user_metadata?.staff_id === 'string' ? entry.user_metadata.staff_id : null,
            role: typeof entry.user_metadata?.role === 'string' ? entry.user_metadata.role : null,
            name: typeof entry.user_metadata?.name === 'string' ? entry.user_metadata.name : null,
            active: typeof entry.user_metadata?.active === 'boolean' ? entry.user_metadata.active : true
          }))

        users.push(...batch)

        if (data.users.length < 100) {
          break
        }

        page += 1
      }

      return jsonResponse(users)
    }

    if (action === 'create') {
      if (!body.email || !body.password || !body.name || !body.role || !body.staffId) {
        return jsonResponse({ error: 'Email, password, name, role, and staffId are required.' }, 400)
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          name: body.name,
          role: body.role,
          staff_id: body.staffId,
          active: body.active ?? true
        }
      })

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ id: data.user.id, email: data.user.email ?? null }, 201)
    }

    if (action === 'update') {
      if (!body.authUserId) {
        return jsonResponse({ error: 'authUserId is required.' }, 400)
      }

      const attributes: {
        email?: string
        password?: string
        user_metadata?: {
          name?: string
          role?: 'admin' | 'receptionist' | 'housekeeping' | 'security' | 'maintenance'
          staff_id?: string
          active?: boolean
        }
      } = {}

      if (body.email) {
        attributes.email = body.email
      }

      if (body.password) {
        attributes.password = body.password
      }

      if (body.name || body.role || body.staffId || typeof body.active === 'boolean') {
        attributes.user_metadata = {}

        if (body.name) {
          attributes.user_metadata.name = body.name
        }

        if (body.role) {
          attributes.user_metadata.role = body.role
        }

        if (body.staffId) {
          attributes.user_metadata.staff_id = body.staffId
        }

        if (typeof body.active === 'boolean') {
          attributes.user_metadata.active = body.active
        }
      }

      const { data, error } = await supabase.auth.admin.updateUserById(body.authUserId, attributes)

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ id: data.user.id, email: data.user.email ?? null })
    }

    if (action === 'delete') {
      if (!body.authUserId) {
        return jsonResponse({ error: 'authUserId is required.' }, 400)
      }

      const { error } = await supabase.auth.admin.deleteUser(body.authUserId)

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }

      return jsonResponse({ success: true })
    }

    return jsonResponse({ error: 'Unsupported action.' }, 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected edge function error.'
    return jsonResponse({ error: message }, 500)
  }
})