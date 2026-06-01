# PrimerHR — Employee Self-Service Portal

A modern rebuild of a legacy Android employee self-service app. This repository ships
two complementary deliverables:

1. **An interactive, production-quality web prototype** (this repo, React + Vite +
   Tailwind) that faithfully recreates every screen, rule, and workflow of the legacy
   app — usable in any browser as a clickable reference implementation and design spec.
2. **A documented target architecture** for the native rebuild (Kotlin, Jetpack
   Compose, Material 3, Hilt, Coroutines/Flow, DataStore, WorkManager, Supabase),
   described below so the Android team can implement screen-for-screen against the
   prototype's behavior.

> **Why a web prototype?** The build environment for this deliverable compiles a
> React/Vite app. Rather than ship an un-compilable Kotlin tree, the prototype encodes
> the exact business rules (credit math, calendar restrictions, note-lock windows,
> coverage state machine, OT duration limits, etc.) as living, testable behavior. The
> Android implementation maps 1:1 onto the modules described here.

---

## Project overview

PrimerHR is an employee self-service system. Employees can clock in/out against secure
server time, view attendance, file and manage leave / overtime / tech-issue coverage
requests, take over or release coverage from teammates, change approved request dates,
review infractions, and manage their profile, credits, and government IDs.

It is built for individual contributors (the "employee" role). Admin/approver views are
intentionally out of scope and are gated behind row-level security in the backend design.

---

## Features

| Area | Screen | Highlights |
|------|--------|-----------|
| Onboarding | **Splash** | Internet check, device-binding verification, progress animation, session probe |
| Auth | **Login** | Email/password, password visibility toggle, remember-me, retry on network failure, loading state, biometric unlock, device binding + RSA SHA-256 secondary check |
| Home | **Dashboard** | Profile summary, clock status, credit chips, quick actions, merged request timeline, infraction shortcut, notifications, bottom nav |
| Time | **Clock** | Live server time, device-skew rejection, clock in/out, active session, reminder schedule (WorkManager), boot rescheduling note |
| Time | **Attendance** | Date-range filter, total hours, per-record details, expandable notes, 6-hour note lock against server time, locked-note dialog |
| Requests | **Leave Request** | Vacation/Sick/Bereavement/Birthday types, calendar with disabled days-off/holidays/already-requested, max-3 consecutive days, birthday rules (single day, must be birthday, blocked if passed, ≥15 days out), credit warnings, review dialog |
| Requests | **OT Request** | OverTime / RestDay OverTime, Pre/Post shift, calendar date, 1–6h duration picker, review dialog, PREOT/POSTOT/RDOT type codes |
| Requests | **Tech Issue Coverage** | Issue date, time range, hours lost, reason, review, stored as "Tech Issue" coverage |
| Requests | **Requests** | Leave/OT tabs, search, cancel-with-reason (future-dated only), credit return, cancellation reason display |
| Requests | **Change Leave Date** | Approved/declined leave & OT, confirm selection, new-date picker, "Change Pending" status |
| Coverage | **Coverage Board** | Available/Taken tabs, month + status filters, take over, cancel, own-request guard, full coverage state machine |
| Coverage | **Coverage Records** | Personal coverage history, date-descending, empty state |
| Records | **Infractions** | Current-employee infractions, type/date/lost-minutes/notes, totals, empty state |
| Account | **Profile** | All employee fields, photo upload, password change, notes editor, government IDs, credits, clock status, shortcuts, logout, dark mode |
| Inbox | **Notifications** | Read/unread state, mark-as-read |

---

## Tech stack

### Web prototype (this repo)
- React 19 + TypeScript
- Vite 7
- Tailwind CSS 4 (class-based dark mode)
- Context-based state store (single source of truth), localStorage/sessionStorage as a
  DataStore analogue

### Target native stack (documented design)
- **Kotlin**, **Jetpack Compose + Material 3**
- **Navigation Compose**, **MVVM**
- **Hilt** dependency injection
- **Coroutines + Flow**
- **DataStore** for non-sensitive session metadata
- **WorkManager** for shift reminders and boot rescheduling
- **Supabase**: Auth, Postgres, Storage, Realtime (only for coverage board live updates)

---

## Prerequisites

### Web prototype
- Node.js 18+ and npm

### Native build
- Android Studio (Ladybug or newer)
- JDK 17
- Kotlin 2.0+, Android Gradle Plugin 8.5+, Gradle 8.7+
- A Supabase project (free tier is fine)

---

## Setup instructions

### Run the web prototype
```bash
npm install
npm run dev      # local dev server
npm run build    # production build (single-file dist/index.html)
npm run preview  # preview the production build
```

Demo credentials are pre-filled on the login screen. Any valid-looking email and a
6+ character password will sign you in (the auth call is simulated; ~12% of attempts
intentionally fail to demonstrate retry/error handling).

### Configure the native app
1. Clone the repository.
2. Copy `.env.example` to `local.properties` (or `secrets.properties`) and fill in:
   ```
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```
3. In Supabase: enable **Email** auth, create the tables and RLS policies (below), and
   create two Storage buckets: `profile-images` and `proofs`.
4. Run on an emulator or device from Android Studio.

---

## Commands

### Web
- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run preview` — preview the build

### Native (target)
- `./gradlew clean`
- `./gradlew assembleDebug`
- `./gradlew test`
- `./gradlew connectedAndroidTest`
- `./gradlew lint`

---

## Backend setup (Supabase)

Tables (normalized from the legacy Firebase branches; see `src/types.ts` for the exact
TypeScript models that mirror them):

- `profiles` — one row per employee; keyed by `employee_id`, linked to `auth_user_id`.
- `attendance_records` — clock sessions; `note_locked`, `clock_out_ts`,
  `note_last_edited_ts` drive the 6-hour note lock.
- `leave_requests` — leave with `leave_date[]`, `status`, `cancellation_reason`.
- `ot_requests` — overtime with `ot_type`, type code (PREOT/POSTOT/RDOT), duration.
- `coverage_requests` — coverage board + tech-issue + OT-style coverage with a status
  machine (Available → Ongoing → For Approval → Completed/Disapproved).
- `infractions`, `holidays`, `notifications`, and an optional `request_changes` audit log.

### RLS approach
- Enable RLS on every table.
- Policy template: `auth.uid()` maps to `profiles.auth_user_id`; users may
  `SELECT/INSERT/UPDATE/DELETE` only rows where `employee_id` equals their own — **except**
  `coverage_requests`, where `Available` rows are readable by all and the takeover action
  is an `UPDATE` constrained so a user cannot take over their own request
  (`requester_id <> own employee_id`).
- `holidays` is read-only to all authenticated users.
- Storage buckets use per-user path prefixes (`/{employee_id}/...`) enforced by policies.

### Security
- **No plaintext passwords** anywhere. Supabase Auth owns credentials.
- Device binding (Android device ID) and an Android Keystore public key are a **secondary**
  challenge/response layer (RSA SHA-256), never the only gate.
- DataStore holds only non-sensitive session metadata (employee id, email, remember-me,
  device-bound flag, login timestamp).
- All dates normalized to **Asia/Manila**; server time is always trusted over device time.

---

## Folder structure

```
src/
  types.ts            # single source of truth for all domain models (mirrors Supabase schema)
  lib/date.ts         # centralized date/time utilities (M/d/yyyy, HH:mm, server time, note lock)
  data/seed.ts        # seed data simulating the backend
  store.tsx           # app store: session, navigation, theme, repositories + mutations
  components/         # design system: Icon, ui primitives, Calendar, AppBar
  screens/            # one file per feature screen
  App.tsx             # phone-frame shell, splash/auth gates, router, bottom nav, toasts
```

Mapping to the requested native layout:
- `domain/` → `src/types.ts` (models) + business rules in `src/lib` and screen logic
- `data/` → `src/data/seed.ts` + `src/store.tsx` (repository implementations)
- `core/` → `src/lib`, `src/components`
- `ui/` + `features/` → `src/components`, `src/screens`

---

## Legacy rules preserved

- Date format `M/d/yyyy`, time `HH:mm`.
- Server time > device time; clock blocked when device skew > 5 minutes.
- Attendance note lock = 6 hours after clock-out (validated against server time).
- Reminders are conceptually scheduled via WorkManager and re-scheduled after reboot.
- Cancellations return the correct credit type (VL/SL/BL).
- Leave: max 3 consecutive days; days-off, holidays, and already-requested dates disabled.
- Birthday Leave: single day, must be the birthday, blocked if passed, cannot be within
  15 days of the birthday.
- OT duration clamped to 1–6 hours.
- Coverage: own-request takeover guard; cancel returns to Available and clears takeover data.
- Explicit, readable review dialogs before every submission.

---

## Troubleshooting

- **Auth failures** — verify Supabase URL/anon key; confirm Email provider is enabled;
  check that `profiles.auth_user_id` is linked. In the prototype, retry if you hit the
  simulated network error.
- **Image upload issues** — confirm Storage buckets exist and the path-prefix RLS policy
  matches `employee_id`; check file size limits.
- **Reminder scheduling** — ensure exact-alarm/`POST_NOTIFICATIONS` permissions are granted
  on Android 13+; verify the `BOOT_COMPLETED` receiver reschedules work.
- **Date parsing** — always parse with the `M/d/yyyy` helpers and the Asia/Manila zone;
  never rely on locale defaults.
- **Notification permission** — request `POST_NOTIFICATIONS` at runtime on Android 13+.

---

## Contributing

- Keep `src/types.ts` the single source of truth — never duplicate model shapes.
- Put new business rules in `src/lib` (or a use-case/repository in the native app), not in
  components, so they stay testable.
- Add new screens under `src/screens` and register them in `App.tsx`'s `SCREENS` map and
  `ScreenId` union.
- Preserve existing flows; new features must remain useful to employees and must not break
  the request/coverage state machines.

---

## License

MIT
