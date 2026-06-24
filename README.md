# Primer Communications — Employee Self-Service Portal

A React + Vite + Capacitor rebuild of the original Primer Android app.
The web client and the Android wrapper share a single TypeScript codebase
and talk to the **`primerdb2` Firebase Realtime Database** that powers the
legacy Android app — the field names, node names, and casing in the
database are preserved exactly.

> Branding: this is the **Primer Communications** employee portal.
> The internal package id (`com.primer.app`) is kept stable for the
> Android build so existing installs keep working.

---

## Stack

| Layer            | Choice                                                |
| ---------------- | ----------------------------------------------------- |
| UI               | React 19 + Vite 8 + Tailwind CSS 4 + TypeScript 5     |
| Typography       | `@fontsource-variable/inter`, `plus-jakarta-sans`     |
| State            | Custom React context (`src/store.tsx`)                |
| Data             | Firebase Realtime Database (`primerdb2`)              |
| Auth (passwords) | `/Users` lookup in RTDB, password compared in-app     |
| Auth (reset)     | Supabase Edge Function OTP (6-digit code)             |
| Biometrics       | WebAuthn / Passkeys (platform authenticator)          |
| Mobile           | Capacitor 7 (Android wrapper in `android/`, iOS in `ios/`) |
| Offline cache    | Per-user snapshot in `localStorage` for instant load  |

---

## Project structure

```
src/
  App.tsx              Shell, bottom-nav, theme + toast wiring
  store.tsx            Auth, navigation, data state, snapshot cache
  types.ts             Domain models
  components/          UI primitives (AppBar, Calendar, PullToRefresh, …)
  screens/             One file per route (Dashboard, Clock, LeaveRequest, …)
  data/                Repository layer (Firebase RTDB + Supabase OTP)
  lib/                 Pure helpers (date, leaveRules, reminders, biometric, …)
android/               Capacitor Android wrapper
ios/                   Capacitor iOS wrapper
supabase/functions/    Edge function for password-reset OTP
scripts/               Release version bump / rollback helpers
```

---

## Prerequisites

- [pnpm](https://pnpm.io) 9+ (preferred; lockfile is `pnpm-lock.yaml`)
  Bun / npm also work but pnpm is the supported workflow.
- Node 20+ for Capacitor tooling
- A modern browser for development
- Android Studio if you intend to rebuild the Android wrapper
- Xcode (macOS) if you intend to rebuild the iOS wrapper

## Install

```bash
pnpm install
```

## Run the web app

```bash
pnpm dev
# vite preview opens on http://localhost:8080
# also boots the local Express helper on port 3000 (see server/index.js)
```

## Production build

```bash
pnpm build
pnpm preview
```

The build uses `vite-plugin-singlefile`, so `dist/index.html` is a fully
inlined bundle that can be served from any static host (or copied into
the Capacitor `assets/public/` folder).

## Tests

```bash
pnpm test          # one-shot run
pnpm test:watch    # watch mode
```



---

## Firebase configuration

The default Firebase project is hardcoded in `src/data/firebase.ts`
and matches the canonical Primer Communications project:

| Field                | Value                                              |
| -------------------- | -------------------------------------------------- |
| `projectId`          | `primerdb2`                                        |
| `databaseURL`        | `https://primerdb2-default-rtdb.firebaseio.com`    |
| `storageBucket`      | `primerdb2.firebasestorage.app`                    |
| `messagingSenderId`  | `1055563458097`                                    |
| `apiKey` (web SDK)   | embedded (RTDB access is gated by security rules)  |

To target a staging / sandbox project, set any of the `VITE_FB_*`
variables documented in `.env.example` — they override the embedded
config at build time.

### Realtime Database nodes

The repository layer (`src/data/repository.ts`) reads and writes the
**exact legacy nodes and field casing** used by the Android app:

```
/Users/{Employee_ID_Number}     profile + account record
/Attendance/{key}               clock-in / clock-out
/AttendanceID/ID                attendance counter
/LeaveRequests/{key}            one record per leave date
/OTRequests/{key}               overtime requests
/OverTime/{key}                 legacy OT mirror
/CoverageList/{key}             coverage board
/Coveredby/{key}                coverage companion
/InfractionList/{key}           infractions
/Holidays/{key}                 holiday calendar
/Notifications/{uid}/{pushId}   per-user inbox
/.info/serverTimeOffset         server-time skew helper
```

The UI works with camelCase domain models; **mapping to the legacy
PascalCase / snake_case keys happens only inside the repository**.
No field is renamed at the database boundary.

---

## Authentication

### Sign-in

Looks up the entered email in `/Users` by `Primer_Email`, then compares
the entered password against the stored `Password` field.

### Forgot password (OTP-based)

Uses a Supabase Edge Function (`supabase/functions/password-reset-otp/`)
for secure 6-digit OTP verification:

1. The user enters their Primer email.
2. We confirm the email exists in `/Users`.
3. The edge function generates a 6-digit OTP (expires in 10 minutes).
4. The user enters the OTP to verify identity.
5. The user creates a new password.
6. The password is updated in Firebase RTDB `/Users/{id}/Password`.

> **Note:** The OTP is stored in Supabase (not Firebase) with a 10-minute
> expiration and 5-attempt limit. In development mode, the OTP is returned
> in the response for testing convenience.

### Biometric unlock

Real platform biometrics via WebAuthn (`src/lib/biometric.ts`):

- Capability check uses `PublicKeyCredential.isUserVerifyingPlatform
  AuthenticatorAvailable()`. The button only appears on supported
  devices.
- After the first successful sign-in, the user is offered enrollment.
  Enrollment registers a platform authenticator (Face ID, Touch ID,
  fingerprint, Windows Hello, etc.).
- Subsequent visits show **Unlock as <email>**, which triggers the
  ceremony and signs the user back in by `Employee_ID_Number`.
- Cancellation, lockout, and unsupported-hardware are all surfaced
  with explicit error messages.
- Flextime users are supported — `Work_Setup: "Flextime"` is detected
  and stored in the profile for appropriate clock-in/out handling.

For the Android Capacitor build the WebView exposes the same
WebAuthn surface, so no extra plugin is needed. To use a fully
native ceremony instead, install
[`@capgo/capacitor-native-biometric`](https://github.com/Cap-go/capacitor-native-biometric)
and adapt `src/lib/biometric.ts` to delegate to it on Android.

---

## Leave request logic

- **Vacation Leave (VL):** Auto-approved immediately. Credits are deducted
  with a floor of -12 (allowing up to 12 hours of negative credit).
- **Sick Leave (SL):** Stays Pending for supervisor approval.
- **Other leave types:** Pending approval.
- **Date changes:** Creates "Change Pending" status for re-approval.

---

## Coverage board

Team-based grabbing rules are enforced:

| Team                | Can grab from                       |
| ------------------- | ----------------------------------- |
| Delta-Expert        | Delta-Expert only                   |
| Lima-Delta-Expert   | Lima-Delta-Expert only              |
| Inbound             | Inbound only                        |
| Supervisor/Lead     | Any team                            |
| Other               | Same team only                      |

Additional features:
- Month and year filters for viewing historical requests
- Past dates are grayed out and cannot be grabbed
- "Different team" and "Past date" status messages for unavailable requests

---

## Maintenance mode

The following features are currently disabled with maintenance warnings:

- **OT Request** — overtime and rest-day overtime submissions
- **Tech Issue Coverage** — technical issue coverage requests

These screens display a maintenance banner and a dialog explaining the
feature is temporarily unavailable. Users are directed to check back
later or contact their supervisor.

---

## Infractions

The Infractions page loads all fields from `/InfractionList`:

- `Infraction_ID` — unique identifier
- `InfractionType` — type of infraction
- `Lost_Minutes` — minutes lost
- `InfractionDate` — date of infraction
- `Days_Off` — scheduled days off
- `Phone_Name` — device/phone identifier
- `Schedule` — work schedule
- `Notes` — additional notes
- `DriveLink` — clickable attachment link
- `Month` / `Year` — time period

---

## Android build

```bash
pnpm build
pnpm exec cap sync android
cd android && ./gradlew assembleDebug
# or, on Windows with Android Studio installed:
pnpm build:apk
```

The wrapper lives under `android/`. The display name is
**Primer Communications** (`capacitor.config.ts > appName`); the
package id stays `com.primer.app` so existing installs upgrade
in place.

## iOS build

```bash
pnpm build
pnpm exec cap sync ios
open ios/App/App.xcworkspace
```


---

## Troubleshooting

| Symptom                                             | Fix                                                         |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Dashboard shows blank fields after login            | Confirm `/Users/{Employee_ID_Number}` exists in `primerdb2` |
| `Account not found.` on sign-in                     | Email must match `Primer_Email` exactly in `/Users`         |
| Biometric button missing                            | Device has no platform authenticator, or WebAuthn unsupported |
| OTP not received                                    | Check email spam folder; contact admin for OTP delivery issues |
| Clock-in toast says "You're already clocked in"     | There is already an open attendance record — clock out first |
| OT/Tech Issue button shows "Under maintenance"      | Feature is temporarily disabled; contact supervisor        |
| Coverage "Grab" button disabled                     | Past date, different team, or already your own request      |

If RTDB reads fail entirely, the app falls back to a **read-only**
in-memory empty state so the UI does not crash — writes are disabled
in that mode.

---

## Known limitations / UNKNOWN

- **Password mirror sync**: Password resets update `/Users/{id}/Password`
  directly. Legacy Android apps may cache credentials separately.
- **Calendar rules**: Holiday + day-off blocking are enforced per
  screen. A future refactor should centralize them under
  `src/lib/calendar.ts` (helper file present in the original).
- **Profile photo upload**: Works through the existing Profile screen
  but compression / size limits are not yet enforced.
- **Push notifications**: Web push not implemented; relies on in-app
  notification center only.
