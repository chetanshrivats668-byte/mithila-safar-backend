-- Migration 0009: Add schedule column to collaborator_hotels, collaborator_cafes, and collaborator_cabs
-- Created: 2026-06-11

ALTER TABLE public.collaborator_hotels ADD COLUMN IF NOT EXISTS "schedule" JSONB DEFAULT '{}';
ALTER TABLE public.collaborator_cafes ADD COLUMN IF NOT EXISTS "schedule" JSONB DEFAULT '{}';
ALTER TABLE public.collaborator_cabs ADD COLUMN IF NOT EXISTS "schedule" JSONB DEFAULT '{}';
