/**
 * Firebase client singleton — Primer Communications.
 *
 * Uses the original `primerdb2` Firebase project configuration as the
 * canonical source of truth. The web client connects directly to the
 * Realtime Database; the embedded API key is the public Web SDK key
 * (Firebase RTDB access is gated by security rules, not by the key).
 *
 * Each value can be overridden at build time with `VITE_FB_*` env
 * variables for staging/dev sandboxes (see `.env.example`).
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getDatabase, type Database } from "firebase/database";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Canonical Primer Communications Firebase project.
 *
 *   project_id      : primerdb2
 *   databaseURL     : https://primerdb2-default-rtdb.firebaseio.com
 *   storageBucket   : primerdb2.firebasestorage.app
 *   messagingSender : 1055563458097
 */
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCBgMvM6xAnoHN_l6PSIclIBkml_vVercY",
  authDomain: "primerdb2.firebaseapp.com",
  databaseURL: "https://primerdb2-default-rtdb.firebaseio.com",
  projectId: "primerdb2",
  storageBucket: "primerdb2.firebasestorage.app",
  messagingSenderId: "1055563458097",
  appId: "1:1055563458097:android:2f7f98808f9eefa7415710",
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
let _auth: Auth | null = null;

function ensureApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps();
  _app = existing.length > 0 ? existing[0] : initializeApp(FIREBASE_CONFIG);
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

export function getFbAuth(): Auth {
  if (!_auth) _auth = getAuth(ensureApp());
  return _auth;
}

/**
 * Returns true once the Firebase client is initialized. The default
 * project config is embedded so this is effectively always true; the
 * try/catch is here to gracefully fall back to the offline repo if a
 * caller has overridden the env vars with invalid values.
 */
export function isFirebaseConfigured(): boolean {
  try {
    ensureApp();
    return true;
  } catch {
    return false;
  }
}
