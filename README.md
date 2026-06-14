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
| UI               | React 19 + Vite 7 + Tailwind CSS 4                    |
| State            | Custom React context (`src/store.tsx`)                |
| Data             | Firebase Realtime Database (`primerdb2`)              |
| Auth (passwords) | `/Users` lookup in RTDB, password compared in-app     |
| Auth (reset)     | Firebase Authentication email reset link              |
| Biometrics       | WebAuthn / Passkeys (platform authenticator)          |
| Mobile           | Capacitor 7 (Android wrapper in `android/`)           |

---

## Prerequisites

- [Bun](https://bun.sh) 1.1+ (or npm / pnpm — Bun is what the lockfile uses)
- Node 20+ for the Capacitor tooling
- A modern browser for development (Chrome / Safari / Edge / Firefox)
- Android Studio if you intend to rebuild the Android wrapper

## Install

```bash
bun install
```

## Run the web app

```bash
bun run dev
# open http://localhost:5173
```

## Production build

```bash
bun run build
bun run preview
```

The build uses `vite-plugin-singlefile`, so `dist/index.html` is a fully
inlined bundle that can be served from any static host (or copied into
the Capacitor Android `assets/public/` folder).

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

### Forgot password

Uses Firebase Authentication's `sendPasswordResetEmail()`. This is a
real, secure email-link reset (the same primitive Google and Microsoft
use for account recovery):

1. The user enters their Primer email.
2. We confirm the email exists in `/Users`.
3. Firebase emails a one-time, time-limited reset link.
4. The user resets the password on Firebase's hosted page.
5. The user signs back in with the new password.

> **UNKNOWN (documented):** The legacy app stored passwords as plain
> strings in `/Users/{id}/Password`. After a Firebase Auth reset the
> RTDB mirror is not automatically synced — the user should also
> update `Password` via the in-app **Change password** flow so the
> attendance / coverage / OT screens keep authenticating against the
> legacy node. An admin script can be added to keep these two in
> sync if needed.

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

For the Android Capacitor build the WebView exposes the same
WebAuthn surface, so no extra plugin is needed. To use a fully
native ceremony instead, install
[`@capgo/capacitor-native-biometric`](https://github.com/Cap-go/capacitor-native-biometric)
and adapt `src/lib/biometric.ts` to delegate to it on Android.

---

## Android build

```bash
bun run build
bunx cap sync android
cd android && ./gradlew assembleDebug
```

The wrapper lives under `android/`. The display name is
**Primer Communications** (`capacitor.config.ts > appName`); the
package id stays `com.primer.app` so existing installs upgrade
in place.

---

## Troubleshooting

| Symptom                                             | Fix                                                         |
| --------------------------------------------------- | ----------------------------------------------------------- |
| Dashboard shows blank fields after login            | Confirm `/Users/{Employee_ID_Number}` exists in `primerdb2` |
| `Account not found.` on sign-in                     | Email must match `Primer_Email` exactly in `/Users`         |
| Biometric button missing                            | Device has no platform authenticator, or WebAuthn unsupported |
| Forgot-password link error `user-not-found`         | Email is in `/Users` but not enrolled in Firebase Auth      |
| Clock-in toast says "You're already clocked in"     | There is already an open attendance record — clock out first |

If RTDB reads fail entirely, the app falls back to a **read-only**
in-memory store backed by neutral seed data (no real user info) so the
UI does not crash — but writes are disabled in that mode.

---

## Known limitations / UNKNOWN

- **Password mirror sync**: see the "Forgot password" note above.
- **OTP delivery**: the original Android app used a custom HTTP OTP
  endpoint owned by the company. The web rebuild uses Firebase Auth's
  email reset link instead because there is no server runtime to host
  a Resend / Twilio relay. To switch to a 6-digit OTP, add a
  Cloudflare Worker / Firebase Cloud Function that wraps Resend and
  point `src/lib/forgot-password.ts` at it.
- **Calendar rules**: holiday + day-off blocking are enforced per
  screen. A future refactor should centralize them under
  `src/lib/calendar.ts` (helper file present in the original).
- **Profile photo upload**: works through the existing Profile screen
  but compression / size limits are not yet enforced.
