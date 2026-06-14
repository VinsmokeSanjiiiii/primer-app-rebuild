# PrimerHR — Employee Self-Service Portal

An employee self-service web application for managing attendance, leave/OT
requests, coverage workflows, profiles, and infractions.

The persistence layer talks to the **original `primer3` Firebase Realtime
Database** (project `primerdb-ef158`).  Paths and field names match the legacy
Android client's `google-services.json` exactly — see the [Database
section](#database--backend-setup-firebase) below for the full mapping.

---

## Features

| Area | Screen | Key capabilities |
|------|--------|-----------------|
| Onboarding | **Splash** | Connection check, device-binding verification, session detection, progress animation |
| Auth | **Login** | Email/password, password visibility toggle, remember-me, biometric-style quick access, real error feedback against `Users` |
| Home | **Dashboard** | Profile greeting + avatar, clock status card, leave credit chips (VL/SL/BL), quick-action grid, notification badge, pending-request timeline, request-type chooser dialog |
| Time | **Clock** | Live server-time display (1 s tick, anchored to Firebase `/.info/serverTimeOffset`), device-time safety check, clock in/out with verification, active session card, scheduled-reminder info, link to attendance |
| Time | **Attendance** | Date-range filter, total-hours summary, per-record cards with time-in/out, notes with edit/lock rules (6 h after clock-out, server-time validated), locked-note dialog, expandable note text |
| Requests | **Leave Request** | 4 leave types (Vacation/Sick/Bereavement/Birthday), calendar with day-off + holiday + already-requested restrictions, max 3 consecutive days, birthday-leave rules, credit warning, review dialog |
| Requests | **OT Request** | OverTime / RestDay OverTime toggle, Pre-Shift / Post-Shift for normal OT, future-date calendar, 1–6 h duration picker, review dialog, PREOT/POSTOT/RDOT type codes |
| Requests | **Tech Coverage** | Past-date calendar, time-range inputs, hours-lost field, reason, review dialog |
| Requests | **Requests** | Leave/OT tabs with counts, search filter, cancellation flow with reason (future-dated only), credit return, cancellation-reason display, link to change-date screen |
| Requests | **Change Leave Date** | Approved/Declined leave & OT list, confirm selection, date picker, "Change Pending" status |
| Coverage | **Coverage Board** | Available / Taken tabs, month + status filters, take-over with own-request guard, cancel coverage, request metadata cards |
| Coverage | **Coverage Records** | Personal coverage history, date-descending, empty state |
| Records | **Infractions** | Infraction list with type/date/minutes/notes, total-minutes-lost banner, empty state |
| Account | **Profile** | Photo upload, credit summary, employment fields, contact fields, notes editor, government-ID editor, password change dialog, dark-mode toggle, shortcuts, logout dialog |
| Inbox | **Notifications** | Sorted list, unread/read state, tap-to-read |

### Business rules preserved

- Date format: `M/d/yyyy`, time: `HH:mm`, timezone: `Asia/Manila`
- Server time is always trusted over device time
- Attendance note lock: 6 hours after clock-out (validated against server time), or when `note_locked` is true
- Leave cancellation returns the correct credit type (VL / SL / BL)
- Leave requests: max 3 consecutive days per request
- Birthday Leave: single day, must be the birthday date, blocked if already passed, cannot be requested within 15 days
- OT duration: minimum 1 hour, maximum 6 hours
- Coverage takeover: own-request guard prevents taking over your own coverage
- Coverage cancellation: returns the coverage to "Available" and clears `Coveredby`
- Cancellation of leave/OT: only future-dated requests (not same-day or past)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 (class-based dark mode via `@custom-variant`) |
| State | React Context + `useReducer`-style callbacks |
| Persistence | Repository interface → `FirebaseRepository` (RTDB) or `LocalOfflineRepository` (read-only seed) |
| Backend | Firebase Realtime Database (project `primerdb-ef158`), Firebase Storage |
| Utilities | clsx, tailwind-merge |

---

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- A browser that supports the modern Firebase JS SDK (v12)
- (No auth provider is required because the legacy app's auth model is
  email+password compared against the `Password` field of each `Users`
  record.  If you migrate to Firebase Auth later, you can add an
  `onAuthStateChanged` guard on top of the same `/Users` tree.)

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/VinsmokeSanjiiiii/primer-app-rebuild.git
cd primer-app

# 2. Install dependencies
npm install

# 3. (Optional) override the default project
cp .env.example .env
# Edit .env to point at a different Firebase project if needed.
```

The app is pre-wired to the original `primer3` Firebase project.  You do
**not** need to set any environment variables for it to work against
that database.  Override the env vars only if you want to point at a
development sandbox or a different RTDB instance.

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
├── .env.example              # Firebase env var template
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
│   │   └── date.ts           # Date/time utilities (server-anchored via .info/serverTimeOffset)
│   ├── data/
│   │   ├── seed.ts           # Seed/demo data (read-only offline fallback)
│   │   ├── firebase.ts       # Firebase client singleton (embedded primer3 project)
│   │   └── repository.ts     # Repository interface + FirebaseRepository + LocalOfflineRepository
│   ├── components/
│   │   ├── Icon.tsx           # SVG icon library
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

## Database / Backend Setup (Firebase)

### Project identity

The app embeds the original `primer3` Firebase project config in
`src/data/firebase.ts`:

```json
{
  "project_id": "primerdb-ef158",
  "databaseURL": "https://primerdb-ef158-default-rtdb.firebaseio.com",
  "storageBucket": "primerdb-ef158.firebasestorage.app"
}
```

You can override any of the `VITE_FB_*` env vars (see `.env.example`) to
point at a different project without editing source code.

### Realtime Database paths

These are the exact RTDB paths the app reads and writes, including the
original key casing.

| App-facing model | RTDB path | Notes |
|------------------|-----------|-------|
| `Profile` | `/Users/{Employee_ID_Number}` | one record per employee; keyed by `Employee_ID_Number` |
| `AttendanceRecord` | `/Attendance/{attendanceKey}` | one record per clock-in session |
| Attendance counter | `/AttendanceID/ID` | legacy helper counter |
| `LeaveRequest` | `/LeaveRequests/{requestId}_{date}` | one record per leave **date** (legacy convention; the current app calls these with the same `requestId` to group) |
| `OtRequest` | `/OTRequests/{requestId}` and `/OverTime/{requestId}` | writes both roots for legacy compatibility |
| `CoverageRequest` | `/CoverageList/{coverageId}` + companion `/Coveredby/{id}` | companion node is cleared when coverage transitions away from `Ongoing` |
| `Infraction` | `/InfractionList/{id}` | per employee |
| `Holiday` | `/Holidays/{holidayId}` | global |
| `AppNotification` | `/Notifications/{employeeId}/{pushId}` | nested per user |
| Server time | `/.info/serverTimeOffset` | read once on hydrate, cached for the session |

Legacy compatibility roots (read-only fallbacks for hydration if they
exist in your database):

- `/Primer_Users/{uid}` — legacy user node
- `/Leave_Requests/{uid}/{pushId}` — legacy per-user leave tree
- `/Coverage/{uid}/{pushId}` — legacy per-user coverage tree

### Field naming

Field names are kept exactly as written in the original `primer3`
database.  The repository layer (`src/data/repository.ts`) maps between
the app-facing camelCase model and the legacy PascalCase + snake_case
keys at the database boundary.  No field is renamed at the database
boundary; the conversion is local to that file.

For example, a profile record under `/Users/EMP-2041` looks like:

```json
{
  "Employee_ID_Number": "EMP-2041",
  "Primer_Email": "alex.rivera@primer.com",
  "Full_Name": "Alex Rivera",
  "VL_Credits": 6,
  "SL_Credits": 4,
  "BL_Credit": 1,
  "SL_Conversion_Credits": 2,
  "Profile_Image": "https://...",
  "isClockedIn": false
}
```

### Login flow (preserved)

1. The login screen calls `repo.signIn(email, password)`.
2. The repository reads every user under `/Users` (legacy convention;
   the original app did not use Firebase Auth and the only "auth" was
   a linear scan of this node).
3. It matches on `Primer_Email` (case-insensitive).
4. It compares the entered password against the `Password` field of
   the matched record.
5. On success it caches the `Employee_ID_Number` in localStorage
   (`primer_local_session_employee`) — never the password.
6. The store hydrates the matching profile from `/Users/{Employee_ID_Number}`.

### Clock behavior (preserved)

- The app reads `/.info/serverTimeOffset` once on hydrate and caches
  the offset in `lib/date.ts`.  All `serverNow()` calls are anchored
  to that offset so clock-in/out timestamps match the server even
  when the device clock is wrong.
- Clock in creates an `Attendance` record with `isClockedIn: true`,
  sets the `Status` to `"Open"`, and writes `date_in` / `time_in` /
  `clock_out_ts: null`.
- Clock out updates the same record with `date_out` / `time_out`,
  `clock_out_ts`, `total_hours`, `Status: "Complete"`, and
  `isClockedIn: false`.

### Note lock behavior (preserved)

- The Attendance screen checks `note_locked` and the elapsed time
  between `serverNow()` and `clock_out_ts` against `NOTE_LOCK_HOURS = 6`.
- If the note is locked, the edit button is replaced with a "Locked"
  label and a dialog explains the rule.

### Leave storage convention (preserved)

The original Android app stored **one record per leave date** under
`/LeaveRequests/{requestId}_{date}`.  The current app's model carries
`leaveDate: string[]`, so the repository fans out one write per date
on create and merges them back into a single grouped record (keyed by
`requestId`) on read.  This matches the legacy read pattern.

### Coverage behavior (preserved)

- `requesterId` and `requesterName` are required for the takeover
  dialog and for the own-request guard.
- Taking over a coverage transitions `CoverageStatus` to `"Ongoing"`
  and sets `CoveredbyID` and `TakenBy`.
- Cancelling transitions back to `"Available"` and removes the
  companion node at `/Coveredby/{id}`.

### Recommended Realtime Database rules

Below is a minimum set of rules that lets the app's reads and writes
succeed.  Tighten these for production.  The `primer3` rules only
need to permit the operations the app actually performs.

```json
{
  "rules": {
    "Users": {
      ".read": true,
      "$uid": {
        ".write": "auth == null || auth.uid == $uid"
      }
    },
    "Attendance": {
      ".indexOn": ["Employee_ID_Number", "isClockedIn"],
      ".read": true,
      "$key": {
        ".write": true
      }
    },
    "AttendanceID": {
      ".read": true,
      ".write": true
    },
    "LeaveRequests": {
      ".indexOn": ["Employee_ID_Number", "requestId"],
      ".read": true,
      ".write": true
    },
    "OTRequests": {
      ".indexOn": ["Employee_ID_Number"],
      ".read": true,
      ".write": true
    },
    "OverTime": {
      ".read": true,
      ".write": true
    },
    "CoverageList": {
      ".indexOn": ["CoverageStatus", "CoverageDate", "requesterId"],
      ".read": true,
      ".write": true
    },
    "Coveredby": {
      ".read": true,
      ".write": true
    },
    "InfractionList": {
      ".indexOn": ["Employee_ID_Number"],
      ".read": true,
      ".write": true
    },
    "Holidays": {
      ".read": true,
      ".write": "auth != null"
    },
    "Notifications": {
      ".indexOn": ["read"],
      "$uid": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> **Authentication caveat:** the original app did not use Firebase
> Auth.  The rules above permit anonymous reads and writes so the
> web client can operate against the same database.  For production
> you should switch to Firebase Auth, add `auth != null` checks,
> and lock writes so a user can only mutate their own records.

### Storage buckets

- `profile-images` — per-user path prefix (`/{Employee_ID_Number}/...`)
- `proofs` — leave/OT proof attachments

The current web build stores profile images as data URLs on the
`Profile_Image` field, but the storage client is wired up
(`getBucket()` in `src/data/firebase.ts`) so the migration to
uploaded images is a one-line change.

---

## Architecture Decisions

### Repository pattern

All data access goes through the `Repository` interface
(`src/data/repository.ts`).  Two implementations exist:

- **`FirebaseRepository`** — the active implementation.  Reads and
  writes the original `primer3` RTDB tree.  Field-level mapping
  happens inside explicit `map*()` functions, never inside React
  components.
- **`LocalOfflineRepository`** — read-only seed data used only when
  Firebase cannot be reached.  This is **not** an auth path; it only
  hydrates the UI so the screens remain visible during an outage.

The store (`src/store.tsx`) calls the repository in fire-and-forget
mode for writes (optimistic UI) and hydrates from the repository on
mount.

### Server time anchor

`lib/date.ts` exposes `setServerTimeOffsetMs()` which the store calls
once on hydrate with the value of `/.info/serverTimeOffset`.  After
that, `serverNow()` and `serverNowMs()` return server-anchored
timestamps.  The clock screen, the attendance note lock, and any
other server-anchored logic all use these helpers.

### Navigation

The app uses a custom screen stack instead of React Router.  Four
root screens (Home, Attendance, Requests, Profile) are shown in the
bottom nav.  Switching between them **clears the stack** to prevent
infinite growth.  Sub-screens (Clock, LeaveRequest, Coverage, etc.)
push onto the stack and support back navigation.

### Dark mode

Tailwind 4 class-based dark mode via
`@custom-variant dark (&:where(.dark, .dark *))`.  The `.dark` class
is toggled on `<html>` and on the root wrapper div.  Preference is
persisted to localStorage.

---

## UNKNOWN Behaviors

- **UNKNOWN:** Whether the original app had a multi-step "onboarding"
  flow beyond the splash screen.  The current splash checks
  connection state and session presence, then routes to login or
  dashboard.  If a richer onboarding existed, it is not represented
  in the current source.

- **UNKNOWN:** Whether the original app called `Profile_Image` from
  Firebase Storage or accepted arbitrary URLs.  The web build
  currently accepts arbitrary URLs (and data URLs from the device
  gallery) and writes them straight to the field.  Migrating to
  storage uploads is a one-line change inside `Profile.tsx` +
  `repository.ts`.

- **UNKNOWN:** Whether the original `CoverageList` allowed
  cancellation from any state or only from `Ongoing`.  The current
  repository cancels to `Available` from any non-`Available` state
  to mirror the legacy `Coveredby` companion-node cleanup.

- **UNKNOWN:** Whether the `HealthCard` and `proofUrl` legacy fields
  are still in active use.  The repository preserves them on read
  but does not currently write to them.

---

## License

MIT (placeholder).  Replace with your organization's preferred license.
