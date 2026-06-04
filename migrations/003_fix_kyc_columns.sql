-- Migration 003: Fix KYC column naming inconsistencies
-- Problem: The initial schema used mixed-case column `faceScan_doc_uri`
-- which Postgres lowercases to `facescan_doc_uri`, but backend code
-- uses `faceScan_doc_uri` causing NULL inserts.
-- Fix: Rename to lowercase snake_case for all doc columns.

-- Step 1: Rename faceScan columns to lowercase snake_case
DO $$
BEGIN
  -- Rename faceScan_doc_uri -> face_scan_doc_uri (if old name exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'driver_kyc' AND column_name = 'facescan_doc_uri'
  ) THEN
    ALTER TABLE public.driver_kyc
      RENAME COLUMN "facescan_doc_uri" TO face_scan_doc_uri;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'driver_kyc' AND column_name = 'facescan_doc_status'
  ) THEN
    ALTER TABLE public.driver_kyc
      RENAME COLUMN "facescan_doc_status" TO face_scan_doc_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'driver_kyc' AND column_name = 'facescan_doc_uploaded_at'
  ) THEN
    ALTER TABLE public.driver_kyc
      RENAME COLUMN "facescan_doc_uploaded_at" TO face_scan_doc_uploaded_at;
  END IF;
END $$;

-- Step 2: Ensure all new columns exist (idempotent)
ALTER TABLE public.driver_kyc
  ADD COLUMN IF NOT EXISTS face_scan_doc_uri TEXT,
  ADD COLUMN IF NOT EXISTS face_scan_doc_status VARCHAR(50) DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS face_scan_doc_uploaded_at TIMESTAMP;

-- Step 3: Add vehicle document columns to vehicles table (if not present)
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS owner_aadhaar_doc_uri TEXT,
  ADD COLUMN IF NOT EXISTS owner_aadhaar_doc_status VARCHAR(50) DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS owner_aadhaar_doc_uploaded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS lease_agreement_doc_uri TEXT,
  ADD COLUMN IF NOT EXISTS lease_agreement_doc_status VARCHAR(50) DEFAULT 'empty',
  ADD COLUMN IF NOT EXISTS lease_agreement_doc_uploaded_at TIMESTAMP;

-- Step 4: Index for fast lookup by kyc status
CREATE INDEX IF NOT EXISTS idx_driver_kyc_face_scan_status
  ON public.driver_kyc(face_scan_doc_status);
