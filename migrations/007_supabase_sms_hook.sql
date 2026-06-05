/**
 * backend/migrations/007_supabase_sms_hook.sql
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MSG91 SMS Hook for Supabase Auth
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Supabase Auth generates the OTP internally. When it needs to send an SMS,
 * it calls this Postgres function via the "Send SMS" Auth Hook.
 * This function dispatches the OTP via MSG91's API using pg_net.
 *
 * SETUP STEPS (run in this order in Supabase SQL Editor):
 *
 *   1. Enable pg_net extension (below)
 *   2. Create the hook function (below)
 *   3. Go to Supabase Dashboard → Authentication → Hooks
 *   4. Enable "Send SMS" hook
 *   5. Select function: public.send_sms_via_msg91
 *
 * ALSO REQUIRED:
 *   - Enable Phone provider: Dashboard → Authentication → Providers → Phone → Enable
 *   - Set MSG91 credentials below (replace the placeholder values)
 */

-- Step 1: Enable pg_net extension for HTTP requests from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Step 2: Create the SMS hook function
CREATE OR REPLACE FUNCTION public.send_sms_via_msg91(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  phone_number text;
  otp_code text;
  -- ⚠️  REPLACE THESE with your actual MSG91 credentials
  msg91_auth_key text := '477020Ar1akYIiKX6a226defP1';
  msg91_template_id text := '6a226eb356e3d641080fcd62';
  request_id bigint;
BEGIN
  -- Extract phone and OTP from the Supabase Auth event
  phone_number := event->'user'->>'phone';
  otp_code := event->'sms'->>'otp';

  -- MSG91 expects digits only (no + prefix)
  phone_number := replace(phone_number, '+', '');

  -- Dispatch SMS via MSG91 OTP API (async — pg_net fires and forgets)
  SELECT net.http_post(
    url := 'https://control.msg91.com/api/v5/otp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'authkey', msg91_auth_key
    ),
    body := jsonb_build_object(
      'template_id', msg91_template_id,
      'mobile', phone_number,
      'otp', otp_code
    )
  ) INTO request_id;

  RAISE LOG '[MSG91 Hook] Dispatched OTP to % (pg_net request_id=%)', phone_number, request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permission to supabase_auth_admin (required for auth hooks)
GRANT EXECUTE ON FUNCTION public.send_sms_via_msg91 TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.send_sms_via_msg91 FROM public;
REVOKE EXECUTE ON FUNCTION public.send_sms_via_msg91 FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_sms_via_msg91 FROM authenticated;
