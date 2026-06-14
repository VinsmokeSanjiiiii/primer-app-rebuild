/**
 * Firebase client singleton.
 *
 * Uses the original `primer3` Firebase project configuration that was
 * extracted from the legacy `google-services.json`.  The same config is
 * safe to embed in the web client because Firebase Realtime Database
 * security rules (not API keys) gate data access.
 *
 * Paths and key naming follow the original app's structure exactly —
 * see repository.ts for the field-level mapping.
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Default Firebase project configuration.
 *
 * Matches the original `primerdb2` Android client provided in the brief:
 *
 *   project_id: primerdb2
 *   databaseURL: https://primerdb2-default-rtdb.firebaseio.com
 *   storageBucket: primerdb2.firebasestorage.app
 *
 * Each value can be overridden at build time by setting the matching
 * `VITE_FB_*` environment variable (see `.env.example`).  This is
 * useful for pointing the web client at a staging or development
 * database without editing source code.
 */
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCBgMvM6xAnoHN_l6PSIclIBkml_vVercY",
  authDomain: "primerdb2.firebaseapp.com",
  databaseURL: "https://primerdb2-default-rtdb.firebaseio.com",
  projectId: "primerdb2",
  storageBucket: "primerdb2.firebasestorage.app",
  messagingSenderId: "1055563458097",
  appId: "1:1055563458097:android:47c55567f67d29f2415710",
} as const;

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FB_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain:
    import.meta.env.VITE_FB_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  databaseURL:
    import.meta.env.VITE_FB_DATABASE_URL ||
    DEFAULT_FIREBASE_CONFIG.databaseURL,
  projectId:
    import.meta.env.VITE_FB_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket:
    import.meta.env.VITE_FB_STORAGE_BUCKET ||
    DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FB_MESSAGING_SENDER_ID ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FB_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
} as const;

let _app: FirebaseApp | null = null;
let _db: Database | null = null;
let _storage: FirebaseStorage | null = null;

/**
 * Initializes (or returns) the Firebase app.
 *
 * Multiple `initializeApp` calls would throw because the modular SDK
 * uses static config keys; guard with `getApps().length`.
 */
function ensureApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
  } else {
    _app = initializeApp(FIREBASE_CONFIG);
  }
  return _app;
}

export function getFirebaseApp(): FirebaseApp {
  return ensureApp();
}

export function getDb(): Database {
  if (!_db) _db = getDatabase(ensureApp());
  return _db;
}

export function getBucket(): FirebaseStorage {
  if (!_storage) _storage = getStorage(ensureApp());
  return _storage;
}

/**
 * Returns true once the Firebase client is initialized.  The current
 * implementation always returns true (the RTDB project config is
 * embedded), so the data layer is always Firebase-backed.
 */
export function isFirebaseConfigured(): boolean {
  try {
    ensureApp();
    return true;
  } catch {
    return false;
  }
}
