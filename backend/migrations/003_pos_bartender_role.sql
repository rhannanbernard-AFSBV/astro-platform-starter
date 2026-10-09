-- ============================================================================
-- Add bartender to pos_staff.role CHECK (Postgres)
-- Migration: 003_pos_bartender_role.sql
-- Safe to run after 002_pos_ledger.sql when the original CHECK omitted bartender.
-- ============================================================================

ALTER TABLE pos_staff DROP CONSTRAINT IF EXISTS pos_staff_role_check;

ALTER TABLE pos_staff
    ADD CONSTRAINT pos_staff_role_check
    CHECK (role IN ('kitchen', 'bartender', 'server', 'admin', 'manager'));
