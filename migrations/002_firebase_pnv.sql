-- Migration 002: Firebase Phone Number Verification columns
-- Adds firebase_uid and phone_verified to the drivers table
-- to support proper Firebase Admin SDK token verification on the backend.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128) UNIQUE,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- Index for fast lookup by Firebase UID
CREATE INDEX IF NOT EXISTS idx_drivers_firebase_uid ON public.drivers(firebase_uid);

COMMENT ON COLUMN public.drivers.firebase_uid IS
  'UID from Firebase Auth — set after /firebase-verify succeeds';

COMMENT ON COLUMN public.drivers.phone_verified IS
  'Set to TRUE once the Firebase ID token has been verified server-side';
