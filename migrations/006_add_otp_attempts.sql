-- Migration 006: Add OTP brute-force protection columns
--
-- WHY:
--   A 6-digit OTP has 1,000,000 combinations.
--   Without an attempt counter, an attacker can brute-force the code
--   by calling /verify-otp in a loop.
--
-- HOW:
--   otp_attempts    — incremented on each failed verify, reset on success or new OTP send
--   otp_locked_until — if attempts >= 5, set to NOW + 30 minutes; checked before verify

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMP;

COMMENT ON COLUMN public.drivers.otp_attempts IS 'Number of consecutive failed OTP verification attempts';
COMMENT ON COLUMN public.drivers.otp_locked_until IS 'Timestamp until which OTP verification is locked (brute-force protection)';
