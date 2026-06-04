-- Happi Riders Database Schema
-- This migration creates all tables for the onboarding and KYC process

-- 1. Drivers table - main driver information
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Authentication
  phone VARCHAR(20) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE,
  password VARCHAR(255),
  account_status VARCHAR(50) DEFAULT 'inactive',
  
  -- Personal Information
  full_name VARCHAR(255),
  email VARCHAR(255),
  gender VARCHAR(10),
  dob DATE,
  address TEXT,
  city VARCHAR(100),
  pincode VARCHAR(10),
  emergency_contact VARCHAR(255),
  emergency_contact_relationship VARCHAR(50),
  referral_code VARCHAR(50),
  
  -- Service Selection
  selected_service VARCHAR(50),
  sub_service VARCHAR(50),
  
  -- Onboarding Status
  onboarding_status VARCHAR(100) DEFAULT 'started',
  onboarding_completed_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT drivers_phone_key UNIQUE (phone),
  CONSTRAINT drivers_email_key UNIQUE (email) DEFERRABLE INITIALLY DEFERRED
);

-- 2. Driver KYC table - KYC documents and verification
CREATE TABLE IF NOT EXISTS public.driver_kyc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  
  -- Document Numbers
  aadhaar_number VARCHAR(12) UNIQUE,
  pan_number VARCHAR(10) UNIQUE,
  license_number VARCHAR(50) UNIQUE,
  
  -- Document URIs (file paths/URLs)
  profile_photo_doc_uri TEXT,
  profile_photo_doc_status VARCHAR(50) DEFAULT 'empty',
  profile_photo_doc_uploaded_at TIMESTAMP,
  
  aadhaar_doc_uri TEXT,
  aadhaar_doc_status VARCHAR(50) DEFAULT 'empty',
  aadhaar_doc_uploaded_at TIMESTAMP,
  
  pan_doc_uri TEXT,
  pan_doc_status VARCHAR(50) DEFAULT 'empty',
  pan_doc_uploaded_at TIMESTAMP,
  
  license_doc_uri TEXT,
  license_doc_status VARCHAR(50) DEFAULT 'empty',
  license_doc_uploaded_at TIMESTAMP,
  
  faceScan_doc_uri TEXT,
  faceScan_doc_status VARCHAR(50) DEFAULT 'empty',
  faceScan_doc_uploaded_at TIMESTAMP,
  
  -- Insurance
  insurance_consent BOOLEAN DEFAULT FALSE,
  
  -- Verification Status
  kyc_status VARCHAR(50) DEFAULT 'pending',
  verified_at TIMESTAMP,
  verified_by UUID,
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT driver_kyc_driver_id_fk UNIQUE (driver_id)
);

-- 3. Vehicles table - vehicle information
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  
  -- Vehicle Details
  company VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  purchase_date DATE,
  fuel_type VARCHAR(50),
  ownership_type VARCHAR(50),
  
  -- Owner Information
  owner_name VARCHAR(255),
  owner_relationship VARCHAR(50),
  owner_aadhaar_number VARCHAR(12),
  
  -- Registration Details
  rc_number VARCHAR(50) UNIQUE,
  chassis_number VARCHAR(100),
  
  -- Insurance Details
  insurance_name VARCHAR(255),
  insurance_number VARCHAR(50),
  pucc_expiry_date DATE,
  
  -- Document URIs
  rc_doc_uri TEXT,
  rc_doc_status VARCHAR(50) DEFAULT 'empty',
  rc_doc_uploaded_at TIMESTAMP,
  
  insurance_doc_uri TEXT,
  insurance_doc_status VARCHAR(50) DEFAULT 'empty',
  insurance_doc_uploaded_at TIMESTAMP,
  
  pucc_doc_uri TEXT,
  pucc_doc_status VARCHAR(50) DEFAULT 'empty',
  pucc_doc_uploaded_at TIMESTAMP,
  
  fitness_doc_uri TEXT,
  fitness_doc_status VARCHAR(50) DEFAULT 'empty',
  fitness_doc_uploaded_at TIMESTAMP,
  
  -- Verification Status
  verification_status VARCHAR(50) DEFAULT 'pending',
  verified_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Audit Log table - track all changes
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
  action VARCHAR(255) NOT NULL,
  table_name VARCHAR(100),
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_drivers_phone ON public.drivers(phone);
CREATE INDEX IF NOT EXISTS idx_drivers_email ON public.drivers(email);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_driver_kyc_driver_id ON public.driver_kyc(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_kyc_status ON public.driver_kyc(kyc_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON public.vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_rc ON public.vehicles(rc_number);
CREATE INDEX IF NOT EXISTS idx_audit_log_driver_id ON public.audit_log(driver_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_kyc ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
