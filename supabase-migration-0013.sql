-- Migration 0013: Add High-Concurrency Indexes
-- Created: 2026-06-13
-- Focuses on optimization of queries under heavy user load (1,000–15,000 concurrent users)

-- Composite index for seat map lookup (massively speeds up booking search and checkins)
CREATE INDEX IF NOT EXISTS idx_seats_bus_date ON public.collaborator_seats ("busId", "travelDate");

-- Composite index for fast user booking searches on orders
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON public.orders ("userEmail");
CREATE INDEX IF NOT EXISTS idx_orders_user_phone ON public.orders ("userPhone");

-- Index for searching active buses
CREATE INDEX IF NOT EXISTS idx_buses_status ON public.collaborator_buses ("status");

-- Index for collaborator search and dashboard verification stats
CREATE INDEX IF NOT EXISTS idx_collabs_verification_status ON public.collaborators ("verificationStatus");

NOTIFY pgrst, 'reload schema';
