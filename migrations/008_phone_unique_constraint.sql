-- 008_phone_unique_constraint.sql
--
-- Makes the phone column UNIQUE in the drivers table.
-- Prevents duplicate registrations for the same phone number.
--
-- Run this in Supabase Dashboard → SQL Editor → New Query

ALTER TABLE public.drivers
  ADD CONSTRAINT drivers_phone_unique UNIQUE (phone);
