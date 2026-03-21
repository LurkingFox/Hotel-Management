# University Hotel — HMS Copilot Workspace Instructions

You are building the **University Hotel Management System (HMS)** — a full-stack web application
with a Seam-backed guest access layer. Read every instruction in this file before writing any code.

---

## 1. Project identity

- **Hotel name:** University Hotel
- **Purpose:** Hotel management — rooms, bookings, payments, guest access, staff, finances
- **Currency:** GHS (Ghanaian Cedis) — always format as `GHS 1,200` never as `$` or `€`
- **User roles:** `admin` (manager) and `receptionist` — enforced at middleware and RLS level

---

## 2. Stack — read this before suggesting any library

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | Use `/app` directory only. Never suggest Pages Router. |
| Language | TypeScript | Strict mode. No `any`. |
| Styling | Tailwind CSS | Utility classes only. No separate CSS files. No CSS modules. |
| Database | Supabase (PostgreSQL) | No Prisma. No Drizzle. No TypeORM. Raw Supabase JS client only. |
| Auth | Supabase Auth | No NextAuth. No Auth.js. No Clerk. Roles live in `user_metadata`. |
| DB client | `@supabase/supabase-js` + `@supabase/ssr` | Use `createBrowserClient` in components, `createServerClient` in route handlers and server components. |
| Realtime | Supabase Realtime | Use `supabase.channel()` subscriptions for live dashboard updates. |
| Access provider | Seam + Supabase | Guest access is issued through Seam access codes and room-to-device mappings stored in Supabase. |
| Hosting | Vercel (web) + Supabase (DB + functions) | Free tier for both. |

**Never suggest:** Prisma, NextAuth, Clerk, Auth.js, Drizzle, TypeORM, Redux, React Query,
SWR, Axios, Express, Mongoose, Firebase, or any CSS-in-JS library.

---

## 3. File reading order — read these files before writing any feature

When starting any task, read the relevant files in this order:

```
1. src/lib/supabase/types.ts          ← generated schema types — always check column names here
2. src/lib/supabase/client.ts         ← browser Supabase client
3. src/lib/supabase/server.ts         ← server Supabase client
4. src/middleware.ts                  ← auth session + role guard logic
5. The specific page or route handler you are editing
```

For access-provider tasks, also read:
```
6. src/lib/access-provider/config.ts              ← active provider and presentation rules
7. src/lib/access-provider/booking-service.ts     ← live access issuance flow
8. src/app/api/seam/room-access-devices/route.ts  ← room-to-device mapping API
9. src/app/api/seam/webhooks/route.ts             ← verified Seam webhook intake
```

For database tasks, also read:
```
6. supabase/migrations/001_schema.sql             ← full schema — source of truth
```

---

## 4. Folder structure — never create files outside this layout

```
src/
  app/
    (admin)/                  ← Admin Tower — role = admin only
      dashboard/page.tsx
      rooms/page.tsx
      bookings/page.tsx
      guest-access/page.tsx
      access-log/page.tsx
      payments/page.tsx
      staff/page.tsx
    (reception)/              ← Reception desk — role = receptionist | admin
      desk/page.tsx
      services/page.tsx
    api/
      rooms/route.ts
      bookings/route.ts
      access-credentials/route.ts
      payments/route.ts
      services/route.ts
      notifications/route.ts
      staff/route.ts
      seam/
        room-access-devices/route.ts
        webhooks/route.ts
    login/page.tsx
    layout.tsx
  lib/
    supabase/
      client.ts
      server.ts
      types.ts               ← auto-generated — never hand-edit this file
  middleware.ts
supabase/
  migrations/
    001_schema.sql
  functions/
    manage_staff_auth/
      index.ts
.env.local
```

---

## 5. Database tables — memorise these before writing any query

Read `supabase/migrations/001_schema.sql` for the full schema.
Key tables and their primary columns:

| Table | Key columns |
|---|---|
| `rooms` | `id`, `number`, `type` (single/double/suite/family), `rate_ghs`, `status` |
| `bookings` | `id`, `room_id`, `guest_name`, `guest_phone`, `check_in`, `check_out_expected`, `check_out_actual`, `nights`, `total_ghs`, `paid_ghs`, `balance_ghs` (computed), `status` |
| `payments` | `id`, `booking_id`, `amount_ghs`, `method` (cash/momo/bank_transfer/cheque), `reference`, `received_by`, `paid_at` |
| `service_charges` | `id`, `booking_id`, `type` (laundry/food/minibar/other), `amount_ghs`, `description`, `resolved` |
| `booking_access_credentials` | `id`, `booking_id`, `provider`, `provider_reference`, `provider_device_id`, `credential_code`, `issued_to`, `issued_by`, `valid_from`, `valid_until`, `status`, `provider_status` |
| `room_access_devices` | `id`, `room_id`, `provider`, `external_device_id`, `display_name`, `updated_at` |
| `access_log` | `id`, `room_id`, `credential_identifier`, `guest_name`, `issued_by`, `result` (granted/denied/expired), `note`, `accessed_at` |
| `staff` | `id`, `name`, `role`, `daily_rate_ghs`, `on_shift` |
| `shifts` | `id`, `staff_id`, `started_at`, `ended_at` |
| `notifications` | `id`, `type`, `message`, `triggered_by`, `booking_id`, `read` |

**`balance_ghs` is a computed column** — never write to it. It is always `total_ghs - paid_ghs`.
**`access_log` is append-only** — never update or delete rows from this table.

---

## 6. Supabase client patterns — always use these exact patterns

### Browser component query
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase
  .from('bookings')
  .select('*, rooms(number, type, rate_ghs)')
  .eq('status', 'active')
  .order('check_in', { ascending: false })
```

### Route handler (API route)
```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.from('rooms').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

### Getting current user role in a route handler
```typescript
const supabase = createServerSupabaseClient()
const { data: { session } } = await supabase.auth.getSession()
const role = session?.user?.user_metadata?.role  // 'admin' | 'receptionist'
```

### Realtime subscription (admin dashboard only)
```typescript
const sub = supabase.channel('rooms')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' },
    (payload) => setRooms(prev => prev.map(r => r.id === payload.new.id ? payload.new : r))
  )
  .subscribe()

// Always clean up on unmount
return () => supabase.removeChannel(sub)
```

---

## 7. Auth and role rules — enforce these everywhere

- Roles are stored in `session.user.user_metadata.role` — always read from here
- `admin` can access all routes under `/admin/**` and `/reception/**`
- `receptionist` can access `/reception/**` only — middleware redirects to `/reception/desk` if they attempt `/admin/**`
- Never trust role from the client body or query params — always read from the server session
- Middleware is already set up in `src/middleware.ts` — do not duplicate role checks in individual pages unless adding extra logic

---

## 8. Booking lifecycle — always follow this state machine

```
RESERVED  →  check_in arrives today  →  ACTIVE
ACTIVE    →  checkout confirmed       →  CHECKED_OUT
ACTIVE    →  stay extended            →  ACTIVE  (update check_out_expected + access credential validity)
RESERVED  →  cancelled               →  CANCELLED  (record cancel_note)
```

On **RESERVED → ACTIVE:**
1. Set `bookings.status = active`
2. Set `rooms.status = occupied`
3. Issue access credential through the booking access service
4. Insert row into `notifications` (type = `access_credential_issued`)

On **ACTIVE → CHECKED_OUT:**
1. If `balance_ghs > 0`, open payment settlement modal first
2. Set `bookings.status = checked_out`, record `check_out_actual = today`
3. Set `rooms.status = cleaning`
4. Revoke the linked access credential through the booking access service
5. Insert row into `notifications` (type = `access_credential_revoked`)

On **extend stay:**
1. Update `bookings.check_out_expected`, `nights`, `total_ghs`
2. Update the linked access credential validity — no new credential needed
3. Insert row into `notifications` (type = `access_credential_extended`)

---

## 9. Payment rules — enforce these in every booking and checkout flow

- Every booking must record: `method`, `reference`, `received_by`, `paid_at`
- `method` must be one of: `cash`, `momo`, `bank_transfer`, `cheque`
- `reference` is required for `momo`, `bank_transfer`, `cheque` — warn if empty for these methods
- `received_by` must be pulled from the active session (`session.user.user_metadata.name` or email) — never let the user type this field manually
- `paid_ghs` on the booking is updated when a payment row is inserted
- Never write directly to `balance_ghs` — it is a computed PostgreSQL column

Payment method UI must use a visual button group (not a `<select>` dropdown):
```
[ 💵 Cash ]  [ 📱 MoMo ]  [ 🏦 Bank Transfer ]  [ 📋 Cheque ]
```

---

## 10. Guest access rules — follow these exactly

- Active guest access is issued through Seam-backed booking access credentials.
- Room-to-device mappings live in `room_access_devices` and are managed through `/admin/settings`
  and `/api/seam/room-access-devices`.
- Booking issuance, extension, and revocation logic lives in `src/lib/access-provider/booking-service.ts`
  — do not duplicate provider logic across pages.
- Seam webhook intake lives in `src/app/api/seam/webhooks/route.ts` and updates local credential state.
- Historical RFID references may still appear in old migrations or retired stubs; treat them as archive material, not active runtime dependencies.
- Every guest-access lifecycle event should emit provider-agnostic notification types such as
  `access_credential_issued`, `access_credential_revoked`, and `access_credential_extended`.

---

## 11. Component and code conventions

### TypeScript
- Import Supabase types: `import type { Database } from '@/lib/supabase/types'`
- Table row types: `Database['public']['Tables']['bookings']['Row']`
- Always handle `error` from every Supabase call — never silently ignore it

### React components
- Use `'use client'` only when the component needs browser APIs or event handlers
- Server components fetch data directly — no API route needed for read-only admin pages
- Never use `useEffect` for initial data fetching in server components — fetch in the component body

### Tailwind
- Status colour mapping — use these classes consistently:
  - Vacant:      `bg-green-50 border-green-200 text-green-800`
  - Occupied:    `bg-amber-50 border-amber-200 text-amber-800`
  - Reserved:    `bg-purple-50 border-purple-200 text-purple-800`
  - Cleaning:    `bg-blue-50 border-blue-200 text-blue-800`
  - Maintenance: `bg-red-50 border-red-200 text-red-800`
- Payment method colours:
  - Cash:          `bg-green-100 text-green-800`
  - MoMo:          `bg-blue-100 text-blue-800`
  - Bank Transfer: `bg-teal-100 text-teal-800`
  - Cheque:        `bg-gray-100 text-gray-700`

### Currency formatting
```typescript
// Always use this helper — never inline toLocaleString calls
export function formatGHS(amount: number): string {
  return 'GHS ' + amount.toLocaleString('en-GH', { minimumFractionDigits: 0 })
}
```

### Date formatting
```typescript
// Dates are stored as DATE (YYYY-MM-DD strings) in Supabase — never as timestamps
// For display, use:
new Date(dateString).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })
```

---

## 12. What NOT to do

- Do not use `prisma` — there is no Prisma in this project
- Do not use `next-auth` or any external auth library
- Do not use `axios` — use the Supabase client or native `fetch`
- Do not use `redux` or `zustand` — use React `useState` and `useContext`
- Do not write to `balance_ghs` — it is a computed PostgreSQL column
- Do not delete rows from `access_log` — it is an immutable audit log
- Do not put role logic in the client — always validate role from the server session
- Do not use `<select>` for payment method — use the button group pattern from Section 9
- Do not hardcode staff names — always read from the active Supabase Auth session
- Do not use `any` in TypeScript — use the generated types from `types.ts`
- Do not create new CSS files — use Tailwind utility classes only

---

## 13. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL          ← public, safe for browser
NEXT_PUBLIC_SUPABASE_ANON_KEY     ← public, safe for browser
SUPABASE_SERVICE_ROLE_KEY         ← server only, never expose to browser
NEXT_PUBLIC_SITE_URL              ← base URL for the app
```

The `SUPABASE_SERVICE_ROLE_KEY` is used **only** inside:
- Supabase Edge Functions that require admin auth operations
- Server-side seed or migration scripts
- Local tooling such as smoke scripts when explicitly needed

Never import or reference `SUPABASE_SERVICE_ROLE_KEY` in any Next.js page, component, or route handler.

---

## 14. Running the project

```bash
npm run dev                          # start local dev server
supabase gen types typescript --linked > src/lib/supabase/types.ts   # regenerate types after schema changes
supabase functions deploy manage_staff_auth                           # deploy active auth Edge Function
supabase db push                     # apply new migration files
```

---

*This file is the single source of truth for all Copilot suggestions in this workspace.
When in doubt, re-read this file before writing code.*
