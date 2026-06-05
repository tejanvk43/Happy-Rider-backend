-- Migration 005: Add OTP fields to drivers table
--
-- WHY:
--   To support custom server-side OTP generation and verification via MSG91,
--   we need columns to temporarily store the generated OTP and its expiry timestamp.
--
-- HOW:
--   Add otp_code (6 chars) and otp_expiry (timestamp) columns.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS otp_code VARCHAR(6),
  ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP;

COMMENT ON COLUMN public.drivers.otp_code IS 'Temporary 6-digit OTP code for phone verification';
COMMENT ON COLUMN public.drivers.otp_expiry IS 'Timestamp when the current OTP code expires';
