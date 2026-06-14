# Primer Communications — Employee Self-Service Portal

An employee self-service web application for managing attendance, leave/OT
requests, coverage workflows, profiles, and infractions.

The persistence layer talks to the **Firebase Realtime Database** (project `primerdb2`).
Paths and field names match the legacy Android client's database structure exactly.

---

## Features

| Area | Screen | Key capabilities |
|------|--------|------------------|
| Onboarding | **Splash** | Connection check, session detection, progress animation |
| Auth | **Login** | Email/password authentication, password visibility toggle, remember-me, biometric (WebAuthn), forgot password with Firebase reset email |
| Home | **Dashboard** | Profile greeting + avatar, clock status card, leave credit chips (VL/SL/BL), quick-action grid, notification badge, pending-request timeline, request-type chooser dialog |
| Time | **Clock** | Live server-time display, device-time safety check, clock in/out with verification, active session card, scheduled-reminder info |
| Time | **Attendance** | Date-range filter, total-hours summary, per-record cards with time-in/out, notes with edit/lock rules (6h after clock-out) |
| Requests | **Leave Request** | 4 leave types (Vacation/Sick/Bereavement/Birthday), calendar with day-off + holiday + already-requested restrictions, max 3 consecutive days, birthday-leave rules, credit warning, review dialog |
| Requests | **OT Request** | OverTime / RestDay OverTime toggle, Pre-Shift / Post-Shift for normal OT, future-date calendar, 1–6h duration picker, review dialog |
| Requests | **Tech Coverage** | Past-date calendar, time-range inputs, hours-lost field, reason, review dialog |
| Requests | **Requests** | Leave/OT tabs with counts, search filter, cancellation flow with reason (future-dated only), credit return |
| Requests | **Change Leave Date** | Approved/Declined leave & OT list, confirm selection, date picker, "Change Pending" status |
| Coverage | **Coverage Board** | Available / Taken tabs, month + status filters, take-over with own-request guard, cancel coverage |
| Coverage | **Coverage Records** | Personal coverage history, date-descending |
| Records | **Infractions** | Infraction list with type/date/minutes/notes, total-minutes-lost banner |
| Account | **Profile** | Photo upload, credit summary, employment fields, contact fields, notes editor, government-ID editor, password change dialog, dark-mode toggle |
| Inbox | **Notifications** | Sorted list, unread/read state, tap-to-read, persistence to Firebase |

### Business Rules

- Date format: `M/d/yyyy`, time: `HH:mm`, timezone: `Asia/Manila`
- Server time is always trusted over device time
- Attendance note lock: 6 hours after clock-out (validated against server time)
- Leave cancellation returns the correct credit type (VL / SL / BL)
- Leave requests: max 3 consecutive days per request
- Birthday Leave: single day, must be the birthday date, blocked if within 15 days
- OT duration: minimum 1 hour, maximum 6 hours
- Coverage takeover: own-request guard prevents taking over your own coverage
- Cancellation of leave/OT: only future-dated requests (not same-day or past)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 (class-based dark mode) |
| State | React Context |
| Backend | Firebase Realtime Database (project `primerdb2`), Firebase Auth |
| Mobile | Capacitor (Android) |

---

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- A modern browser with JavaScript enabled
- Firebase account (for production deployment)

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/VinsmokeSanjiiiii/primer-app-rebuild.git
cd primer-app

# 2. Install dependencies
npm install

# 3. (Optional) Configure environment
cp .env.example .env
# Edit .env if you want to point at a different Firebase project
```

The app is pre-configured to connect to the `primerdb2` Firebase project.
No environment variables are required for default operation.

---

## Development Commands

```bash
# Start local dev server (hot reload)
npm run dev

# Production build (outputs dist/)
npm run build

# Preview the production build locally
npm run preview

# Build Android app (requires Capacitor setup)
npx cap sync android
npx cap open android
```

---

## Project Structure

```
├── .env.example              # Environment variable template
├── index.html                # Vite entry HTML
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config
├── capacitor.config.ts       # Capacitor config for mobile
├── android/                  # Android native project
├── src/
│   ├── main.tsx              # React root
│   ├── App.tsx               # App shell with routing
│   ├── index.css             # Tailwind styles
│   ├── types.ts              # TypeScript type definitions
│   ├── store.tsx             # Global state provider
│   ├── lib/
│   │   ├── date.ts           # Date/time utilities (server-anchored)
│   │   └── calendarValidation.ts  # Calendar business rules
│   ├── data/
│   │   ├── seed.ts           # Seed data for offline mode
│   │   ├── firebase.ts       # Firebase client singleton
│   │   └── repository.ts     # Repository abstraction
│   ├── components/
│   │   ├── Icon.tsx          # SVG icon library
│   │   ├── ui.tsx            # Design system components
│   │   ├── Calendar.tsx     # Calendar picker
│   │   └── AppBar.tsx        # Navigation header
│   └── screens/
│       ├── Splash.tsx        # Loading/splash screen
│       ├── Login.tsx         # Authentication
│       ├── Dashboard.tsx     # Home dashboard
│       ├── Clock.tsx         # Time clock
│       ├── Attendance.tsx     # Attendance history
│       ├── LeaveRequest.tsx   # Leave request flow
│       ├── OTRequest.tsx      # OT request flow
│       ├── TechCoverage.tsx   # Tech issue coverage
│       ├── Coverage.tsx       # Coverage board
│       ├── CoverageRecords.tsx
│       ├── Requests.tsx       # Request management
│       ├── ChangeLeave.tsx    # Date change flow
│       ├── Infractions.tsx    # Infraction records
│       ├── Profile.tsx        # Profile management
│       └── Notifications.tsx # Notification inbox
```

---

## Firebase Configuration

### Project Settings

The app connects to the `primerdb2` Firebase project. Override these by setting
environment variables in `.env`:

| Variable | Description |
|----------|-------------|
| `VITE_FB_API_KEY` | Firebase API key |
| `VITE_FB_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FB_DATABASE_URL` | Realtime Database URL |
| `VITE_FB_PROJECT_ID` | Firebase project ID |
| `VITE_FB_STORAGE_BUCKET` | Storage bucket |
| `VITE_FB_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FB_APP_ID` | Firebase app ID |
| `VITE_OFFLINE_MODE` | Set to `true` for offline development with seed data |

### Realtime Database Paths

| Model | RTDB Path | Description |
|-------|-----------|-------------|
| Profile | `/Users/{Employee_ID_Number}` | Employee records |
| Attendance | `/Attendance/{attendanceKey}` | Clock-in/out records |
| Leave Requests | `/LeaveRequests/{requestId}_{date}` | Leave entries |
| OT Requests | `/OTRequests/{requestId}` | Overtime requests |
| Coverage | `/CoverageList/{coverageId}` | Coverage board |
| Infractions | `/InfractionList/{id}` | Infraction records |
| Holidays | `/Holidays/{holidayId}` | Holiday calendar |
| Notifications | `/Notifications/{employeeId}/{pushId}` | User notifications |
| Server Time | `/.info/serverTimeOffset` | Time synchronization |

### Database Rules

```json
{
  "rules": {
    "Users": {
      ".read": true,
      "$uid": { ".write": "auth == null || auth.uid == $uid" }
    },
    "Attendance": {
      ".indexOn": ["Employee_ID_Number", "isClockedIn"],
      ".read": true,
      "$key": { ".write": true }
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
    "CoverageList": {
      ".indexOn": ["CoverageStatus", "CoverageDate", "requesterId"],
      ".read": true,
      ".write": true
    },
    "InfractionList": {
      ".indexOn": ["Employee_ID_Number"],
      ".read": true,
      ".write": true
    },
    "Holidays": { ".read": true },
    "Notifications": {
      "$uid": { ".read": true, ".write": true }
    }
  }
}
```

---

## Authentication

### Login Flow

1. User enters email and password
2. App queries `/Users` node to find matching `Primer_Email`
3. Password compared against stored `Password` field
4. On success, `Employee_ID_Number` stored in localStorage
5. All user data hydrated from Firebase

### Forgot Password

Uses Firebase Auth's `sendPasswordResetEmail()` to send a password reset link
to the user's email address.

### Biometric Login

Uses the WebAuthn API when available. Falls back gracefully on unsupported devices.

---

## Troubleshooting

### Common Issues

**App shows empty data after login:**
- Verify Firebase credentials in `.env`
- Check browser console for Firebase errors
- Ensure the user exists in the `/Users` node with correct `Employee_ID_Number`

**Clock in/out not working:**
- Check for network connectivity
- Verify device time is roughly synchronized
- Look for existing open attendance records

**Notifications not persisting:**
- Ensure Firebase write rules allow updates
- Check network connectivity
- Look for errors in browser console

### Development Mode

For offline development with seed data, set in `.env`:
```
VITE_OFFLINE_MODE=true
```

---

## KNOWN LIMITATIONS

- The original app's exact onboarding flow beyond splash is UNKNOWN
- Storage buckets for profile images use data URLs; migration to Firebase Storage is a one-line change
- Coverage cancellation from any state vs. only `Ongoing` is UNKNOWN
- `HealthCard` and `proofUrl` legacy fields are preserved on read but not written

---

## License

MIT License. See LICENSE file for details.
