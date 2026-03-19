# University Hotel — HMS Copilot Workspace Instructions

You are building the **University Hotel Management System (HMS)** — a full-stack web application
with an RFID keycard security layer. Read every instruction in this file before writing any code.

---

## 1. Project identity

- **Hotel name:** University Hotel
- **Purpose:** Hotel management — rooms, bookings, payments, RFID keycards, staff, finances
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
| RFID bridge | Python (Raspberry Pi) + Supabase Edge Function (Deno) | Door controller calls `validate_keycard` Edge Function via HTTPS. |
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

For RFID / keycard tasks, also read:
```
6. supabase/functions/validate_keycard/index.ts   ← Edge Function
7. rfid-controller/main.py                        ← Raspberry Pi controller
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
      keycards/page.tsx
      access-log/page.tsx
      payments/page.tsx
      staff/page.tsx
    (reception)/              ← Reception desk — role = receptionist | admin
      desk/page.tsx
      services/page.tsx
    api/
      rooms/route.ts
      bookings/route.ts
      keycards/route.ts
      payments/route.ts
      services/route.ts
      notifications/route.ts
      staff/route.ts
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
    validate_keycard/
      index.ts
rfid-controller/
  main.py
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
| `keycards` | `id`, `card_uid`, `room_id`, `booking_id`, `issued_to`, `issued_by`, `issued_at`, `valid_from`, `valid_until`, `status` (active/revoked), `access_count` |
| `access_log` | `id`, `room_id`, `card_uid`, `keycard_id`, `guest_name`, `issued_by`, `result` (granted/denied/expired), `note`, `accessed_at` |
| `staff` | `id`, `name`, `role`, `daily_rate_ghs`, `on_shift` |
| `shifts` | `id`, `staff_id`, `started_at`, `ended_at` |
| `notifications` | `id`, `type`, `message`, `triggered_by`, `booking_id`, `keycard_id`, `read` |

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
ACTIVE    →  stay extended            →  ACTIVE  (update check_out_expected + keycard valid_until)
RESERVED  →  cancelled               →  CANCELLED  (record cancel_note)
```

On **RESERVED → ACTIVE:**
1. Set `bookings.status = active`
2. Set `rooms.status = occupied`
3. Issue keycard (insert into `keycards`)
4. Insert row into `notifications` (type = `keycard_issued`)

On **ACTIVE → CHECKED_OUT:**
1. If `balance_ghs > 0`, open payment settlement modal first
2. Set `bookings.status = checked_out`, record `check_out_actual = today`
3. Set `rooms.status = cleaning`
4. Set `keycards.status = revoked` where `booking_id = this booking`
5. Insert row into `notifications` (type = `keycard_revoked`)

On **extend stay:**
1. Update `bookings.check_out_expected`, `nights`, `total_ghs`
2. Update `keycards.valid_until` to new check-out date — no new card needed
3. Insert row into `notifications` (type = `keycard_extended`)

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

## 10. RFID keycard rules — follow these exactly

- Every keycard row has: `card_uid` (hex UID from MIFARE card), `room_id`, `booking_id`,
  `valid_from` (check-in date), `valid_until` (check-out date), `status`, `access_count`
- `card_uid` format: `A3:F2:91:BC` — four uppercase hex bytes separated by colons
- Door validation logic lives **only** in `supabase/functions/validate_keycard/index.ts`
  — never replicate validation logic in the Next.js app
- The Raspberry Pi controller (`rfid-controller/main.py`) only reads the UID and POSTs to the
  Edge Function — it contains no business logic
- Every door tap (granted AND denied) must be logged to `access_log` — never skip denied entries
- On revoke: set `keycards.status = revoked` — do not delete the row
- On extend: update `valid_until` only — do not insert a new keycard row

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
- `supabase/functions/validate_keycard/index.ts` (Edge Function)
- Any server-side seed or migration scripts

Never import or reference `SUPABASE_SERVICE_ROLE_KEY` in any Next.js page, component, or route handler.

---

## 14. Running the project

```bash
npm run dev                          # start local dev server
supabase gen types typescript --linked > src/lib/supabase/types.ts   # regenerate types after schema changes
supabase functions deploy validate_keycard                            # deploy Edge Function
supabase db push                     # apply new migration files
```

---

*This file is the single source of truth for all Copilot suggestions in this workspace.
When in doubt, re-read this file before writing code.*
