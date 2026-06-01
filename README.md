# PrimerHR — Employee Self-Service Portal

An employee self-service web application for managing attendance, leave/OT
requests, coverage workflows, profiles, and infractions. Built with React,
TypeScript, Vite, and Tailwind CSS, with a pluggable persistence layer that can
run locally (seed data + localStorage) or against a Supabase backend.

---

## Features

| Area | Screen | Key capabilities |
|------|--------|-----------------|
| Onboarding | **Splash** | Connection check, device-binding verification, session detection, progress animation |
| Auth | **Login** | Email/password, password visibility toggle, remember-me (localStorage vs sessionStorage), biometric-style quick access button, simulated network failure with retry, error feedback |
| Home | **Dashboard** | Profile greeting + avatar, clock status card, leave credit chips (VL/SL/BL), quick-action grid, notification badge, pending-request timeline, request-type chooser dialog |
| Time | **Clock** | Live server-time display (1 s tick), device-time safety check, clock in/out with server-time verification delay, active session card, scheduled-reminder info, link to attendance |
| Time | **Attendance** | Date-range filter, total-hours summary, per-record cards with time-in/out, notes with edit/lock rules (6 h after clock-out via server time), locked-note dialog, expandable note text |
| Requests | **Leave Request** | 4 leave types (Vacation/Sick/Bereavement/Birthday), calendar with day-off + holiday + already-requested restrictions, max 3 consecutive days, birthday-leave rules (single day, must be birthday, blocked if passed, ≥ 15 days out), credit warning, review dialog |
| Requests | **OT Request** | OverTime / RestDay OverTime toggle, Pre-Shift / Post-Shift for normal OT, future-date calendar, 1–6 h duration picker, review dialog, PREOT/POSTOT/RDOT type codes |
| Requests | **Tech Coverage** | Past-date calendar, time-range inputs, hours-lost field, reason, review dialog |
| Requests | **Requests** | Leave/OT tabs with counts, search filter, cancellation flow with reason (future-dated only), credit return, cancellation-reason display, link to change-date screen |
| Requests | **Change Leave Date** | Approved/Declined leave & OT list, confirm selection, date picker, "Change Pending" status |
| Coverage | **Coverage Board** | Available / Taken tabs, month + status filters, take-over with own-request guard, cancel coverage, request metadata cards |
| Coverage | **Coverage Records** | Personal coverage history, date-descending, empty state |
| Records | **Infractions** | Infraction list with type/date/minutes/notes, total-minutes-lost banner, empty state |
| Account | **Profile** | Photo upload (FileReader → data URL), credit summary, employment fields, contact fields, notes editor, government-ID editor, password change dialog, dark-mode toggle, shortcuts to secondary screens, logout dialog |
| Inbox | **Notifications** | Sorted list, unread/read state, tap-to-read |

### Business rules preserved

- Date format: `M/d/yyyy`, time: `HH:mm`, timezone: `Asia/Manila`
- Server time is always trusted over device time
- Attendance note lock: 6 hours after clock-out (validated against server time), or when `noteLocked` is true
- Leave cancellation returns the correct credit type (VL / SL / BL)
- Leave requests: max 3 consecutive days per request
- Birthday Leave: single day, must be the birthday date, blocked if already passed, cannot be requested within 15 days
- OT duration: minimum 1 hour, maximum 6 hours
- Coverage takeover: own-request guard prevents taking over your own coverage
- Coverage cancellation: returns the coverage to "Available" and clears takeover data
- Cancellation of leave/OT: only future-dated requests (not same-day or past)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 (class-based dark mode via `@custom-variant`) |
| State | React Context + `useReducer`-style callbacks |
| Persistence | Repository interface → `LocalRepository` (seed + localStorage) or `SupabaseRepository` |
| Backend (optional) | Supabase (Auth, Postgres, Storage) via `@supabase/supabase-js` |
| Utilities | clsx, tailwind-merge |

---

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- **(Optional)** A Supabase project if you want real backend persistence

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/VinsmokeSanjiiiii/primer-app-rebuild.git
cd primer-app

# 2. Install dependencies
npm install

# 3. Configure environment (optional — app works without it using seed data)
cp .env.example .env
# Edit .env and add your Supabase URL and anon key
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | No | Supabase project URL (e.g. `https://xyzcompany.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | No | Supabase anonymous/public key |

When **both** variables are set, the app connects to Supabase. When either is
missing, the app falls back to the local seed-data repository with
localStorage persistence. No build errors occur either way.

---

## Development Commands

```bash
# Start local dev server (hot reload)
npm run dev

# Production build (outputs dist/index.html as a single file)
npm run build

# Preview the production build locally
npm run preview
```

---

## Project Structure

```
├── .env.example              # Environment variable template
├── index.html                # Vite entry HTML
├── tsconfig.json             # TypeScript config (bundler mode, path aliases)
├── vite.config.ts            # Vite config (React, Tailwind, singlefile plugin)
├── src/
│   ├── vite-env.d.ts         # Vite client types + ImportMetaEnv declaration
│   ├── main.tsx              # React root
│   ├── App.tsx               # App shell: splash gate, auth gate, router, bottom nav, toasts
│   ├── index.css             # Tailwind imports + dark mode variant + base styles
│   ├── types.ts              # Domain model types (single source of truth)
│   ├── store.tsx             # Global state provider: session, navigation, data, mutations
│   ├── utils/
│   │   └── cn.ts             # clsx + tailwind-merge utility
│   ├── lib/
│   │   └── date.ts           # Date/time utilities (format, parse, calendar grid, note lock)
│   ├── data/
│   │   ├── seed.ts           # Seed/demo data for all entities
│   │   ├── supabase.ts       # Supabase client singleton (env-aware)
│   │   └── repository.ts     # Repository interface + LocalRepository + SupabaseRepository
│   ├── components/
│   │   ├── Icon.tsx           # SVG icon library (34 icons)
│   │   ├── ui.tsx             # Design system: Card, Button, TextField, TextArea, Badge, Dialog, etc.
│   │   ├── Calendar.tsx       # Calendar picker with holiday/day-off/requested markers
│   │   └── AppBar.tsx         # Sticky app bar with back navigation
│   └── screens/
│       ├── Splash.tsx         # Onboarding splash with progress
│       ├── Login.tsx          # Authentication screen
│       ├── Dashboard.tsx      # Home dashboard
│       ├── Clock.tsx          # Time clock
│       ├── Attendance.tsx     # Attendance history
│       ├── LeaveRequest.tsx   # Leave request flow
│       ├── OTRequest.tsx      # OT request flow
│       ├── TechCoverage.tsx   # Tech issue coverage flow
│       ├── Coverage.tsx       # Coverage board
│       ├── CoverageRecords.tsx # Coverage history
│       ├── Requests.tsx       # Request management (leave + OT tabs)
│       ├── ChangeLeave.tsx    # Change leave/OT date
│       ├── Infractions.tsx    # Infraction records
│       ├── Profile.tsx        # Profile management
│       └── Notifications.tsx  # Notification inbox
```

---

## Database / Backend Setup (Supabase)

### Tables

The app expects these Supabase Postgres tables (snake_case columns). The
`src/data/repository.ts` file contains the full mapper from DB columns to
TypeScript models.

| Table | Primary key | RLS |
|-------|-------------|-----|
| `profiles` | `id` (uuid) | Users can read/write own row only (`employee_id` match) |
| `attendance_records` | `id` (uuid) | Users can read/write own rows |
| `leave_requests` | `id` (uuid) | Users can read/write own rows |
| `ot_requests` | `id` (uuid) | Users can read/write own rows |
| `coverage_requests` | `id` (uuid) | `Available` rows readable by all; takeover requires `requester_id ≠ own` |
| `infractions` | `id` (uuid) | Users can read own rows only |
| `holidays` | `id` (uuid) | Read-only for all authenticated users |
| `notifications` | `id` (uuid) | Users can read/write own rows |

### Storage buckets

- `profile-images` — per-user path prefix (`/{employee_id}/...`)
- `proof-files` — leave/OT proof attachments

### Auth

Enable the **Email** auth provider in Supabase. The app calls
`signInWithPassword`. Device binding and public-key challenge/response are a
secondary security layer (simulated in the web prototype).

---

## Troubleshooting

### CSS import typing error

**Symptom:** TypeScript reports `Cannot find module './index.css'`.

**Fix:** The file `src/vite-env.d.ts` must contain `/// <reference types="vite/client" />`.
This project already includes it. If you recreated tsconfig, make sure the
`include` array contains `"src"` (which covers `vite-env.d.ts`).

### Alias resolution (`@/*`)

**Symptom:** Imports like `@/components/ui` fail to resolve.

**Fix:** Both `tsconfig.json` and `vite.config.ts` must agree on the alias:
- tsconfig: `"paths": { "@/*": ["src/*"] }` with `"baseUrl": "."`
- vite: `resolve.alias: { "@": path.resolve(__dirname, "src") }`

This project uses relative imports (`../components/ui`) so the alias is
available but not required for existing code.

### TypeScript baseUrl deprecation warning

**Symptom:** `TS5107: Option 'baseUrl' is deprecated`.

**Context:** TypeScript 5.9+ emits this warning when `baseUrl` is set alongside
the `"bundler"` module resolution. The project retains `baseUrl` because it is
required for `paths` aliases to resolve. The build still succeeds. When a future
TypeScript version breaks this, migrate to fully-qualified path prefixes or
use `tsconfig` project references.

### Missing environment variables

**Symptom:** The app loads but only shows demo data.

**Fix:** This is expected. Without `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`, the app uses the `LocalRepository` backed by
in-memory seed data and localStorage. Set both variables in `.env` to connect
to a real backend.

### Backend connectivity

**Symptom:** Data doesn't persist across page reloads when Supabase is configured.

**Check:**
1. Verify the Supabase URL and anon key are correct
2. Verify the tables exist with the expected column names
3. Verify RLS policies allow the authenticated user to read/write
4. Check the browser console for Supabase error messages

---

## Architecture Decisions

### Repository pattern

All data access goes through the `Repository` interface (`src/data/repository.ts`).
Two implementations exist:

- **`LocalRepository`** — uses seed data on first run, then persists mutations
  to localStorage. No network required.
- **`SupabaseRepository`** — maps every operation to Supabase REST calls. Column
  name mapping (snake_case ↔ camelCase) is handled by explicit mapper functions.

The store (`src/store.tsx`) calls the repository in fire-and-forget mode for
writes (optimistic UI) and hydrates from the repository on mount.

### Navigation

The app uses a custom screen stack instead of React Router. Four root screens
(Home, Attendance, Requests, Profile) are shown in the bottom nav. Switching
between them **clears the stack** to prevent infinite growth. Sub-screens
(Clock, LeaveRequest, Coverage, etc.) push onto the stack and support back
navigation.

### Dark mode

Tailwind 4 class-based dark mode via `@custom-variant dark (&:where(.dark, .dark *))`.
The `.dark` class is toggled on `<html>` and on the root wrapper div. Preference
is persisted to localStorage.

---

## UNKNOWN Behaviors

The following behaviors could not be verified from the current source and are
implemented with reasonable defaults:

- **UNKNOWN:** Exact Supabase column names for the production schema. The
  mappers in `repository.ts` assume the snake_case schema documented above.
  Adjust if the real schema differs.

- **UNKNOWN:** Exact mapping of Supabase Auth `user_id` to `profiles.employee_id`.
  The `SupabaseRepository.getSession()` assumes `employee_id` is stored in
  `user_metadata`. Adjust when the real auth flow is finalized.

- **UNKNOWN:** Whether the original app had a distinct "onboarding" flow beyond
  the splash screen. The current splash checks connection state and session
  presence, then routes to login or dashboard. If a multi-step onboarding
  existed, it is not represented in the current codebase.

- **UNKNOWN:** Original Firebase schema structure. No Firebase collections are
  preserved. The Supabase schema is a clean modern equivalent.

---

## License

MIT
