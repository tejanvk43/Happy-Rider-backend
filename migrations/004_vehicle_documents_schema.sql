-- Migration 004: Normalized vehicle documents schema
-- 
-- WHY:
--   The old `vehicles` table had 20+ nullable columns (rc_doc_uri, insurance_doc_uri, etc.)
--   Adding any new doc type required a new column + migration.
--   Instead we use a vehicle_documents table: (vehicle_id, doc_type, public_url)
--   Zero schema changes needed when adding new document types in the future.
--
-- HOW:
--   vehicle_documents: one row per document, keyed by doc_type string
--   vehicle_photos:    one row per photo angle, keyed by photo_type string

-- ─── vehicle_documents table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  -- doc_type is a free string like 'rc_doc', 'insurance_doc', 'permit_doc', etc.
  -- New doc types need ZERO migrations — just add to vehicleConfig.ts
  doc_type     VARCHAR(80) NOT NULL,

  public_url   TEXT NOT NULL,
  storage_path TEXT NOT NULL,          -- stored for future server-side deletion
  status       VARCHAR(30) DEFAULT 'uploaded',
  uploaded_at  TIMESTAMP DEFAULT NOW(),

  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW(),

  -- One document per type per vehicle (overwrite allowed via upsert)
  CONSTRAINT vehicle_documents_vehicle_doc_key UNIQUE (vehicle_id, doc_type)
);

-- ─── vehicle_photos table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id   UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  -- photo_type: 'number_plate', 'front', 'rear', 'left_side', 'right_side'
  photo_type   VARCHAR(30) NOT NULL,

  public_url   TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at  TIMESTAMP DEFAULT NOW(),

  created_at   TIMESTAMP DEFAULT NOW(),

  CONSTRAINT vehicle_photos_vehicle_photo_key UNIQUE (vehicle_id, photo_type)
);

-- ─── Add extra columns to vehicles table ─────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_category  VARCHAR(20),   -- '3_wheeler' | '4_wheeler'
  ADD COLUMN IF NOT EXISTS registration_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS vehicle_color     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS permit_number     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS permit_expiry_date DATE,

  -- Lease-specific fields
  ADD COLUMN IF NOT EXISTS lessor_name       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lessor_type       VARCHAR(20),   -- 'individual' | 'organisation'
  ADD COLUMN IF NOT EXISTS lease_manager_name  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lease_manager_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS lease_consent       BOOLEAN DEFAULT FALSE,

  -- Friends & Family
  ADD COLUMN IF NOT EXISTS owner_consent     BOOLEAN DEFAULT FALSE;

-- ─── RLS: enable on new tables ───────────────────────────────────────────────
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_photos    ENABLE ROW LEVEL SECURITY;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle_id
  ON public.vehicle_documents(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_doc_type
  ON public.vehicle_documents(doc_type);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_status
  ON public.vehicle_documents(status);

CREATE INDEX IF NOT EXISTS idx_vehicle_photos_vehicle_id
  ON public.vehicle_photos(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_vehicles_category
  ON public.vehicles(vehicle_category);
