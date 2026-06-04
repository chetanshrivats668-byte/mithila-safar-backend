-- Migration 0006: Add audit_logs table, fix service status defaults, add indexes
-- Created: 2026-06-02

-- ============================================
-- 1. AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  collaborator_id VARCHAR(100),
  admin_id VARCHAR(100),
  details JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_collaborator_id ON audit_logs(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================
-- 2. FIX STATUS DEFAULTS - Change from 'active' to 'pending_approval'
-- ============================================

-- collaborator_buses: change default status to pending_approval
ALTER TABLE collaborator_buses 
  ALTER COLUMN status SET DEFAULT 'pending_approval';

-- collaborator_hotels: change default status to pending_approval
ALTER TABLE collaborator_hotels 
  ALTER COLUMN status SET DEFAULT 'pending_approval';

-- collaborator_cafes: change default status to pending_approval
ALTER TABLE collaborator_cafes 
  ALTER COLUMN status SET DEFAULT 'pending_approval';

-- ============================================
-- 3. ADD ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================

-- collaborator_buses indexes
CREATE INDEX IF NOT EXISTS idx_collab_buses_status ON collaborator_buses(status);
CREATE INDEX IF NOT EXISTS idx_collab_buses_collab_id ON collaborator_buses("collaboratorId");

-- collaborator_hotels indexes
CREATE INDEX IF NOT EXISTS idx_collab_hotels_status ON collaborator_hotels(status);
CREATE INDEX IF NOT EXISTS idx_collab_hotels_collab_id ON collaborator_hotels("collaboratorId");

-- collaborator_cafes indexes
CREATE INDEX IF NOT EXISTS idx_collab_cafes_status ON collaborator_cafes(status);
CREATE INDEX IF NOT EXISTS idx_collab_cafes_collab_id ON collaborator_cafes("collaboratorId");

-- hotel_room_layouts indexes
CREATE INDEX IF NOT EXISTS idx_hotel_room_layouts_hotel_id ON hotel_room_layouts("hotelId");
CREATE INDEX IF NOT EXISTS idx_hotel_room_layouts_status ON hotel_room_layouts(status);

-- cafe_table_layouts indexes
CREATE INDEX IF NOT EXISTS idx_cafe_table_layouts_cafe_id ON cafe_table_layouts("cafeId");
CREATE INDEX IF NOT EXISTS idx_cafe_table_layouts_status ON cafe_table_layouts(status);

-- collaborator_seats indexes for performance
CREATE INDEX IF NOT EXISTS idx_collab_seats_bus_date ON collaborator_seats("busId", "travelDate");
CREATE INDEX IF NOT EXISTS idx_collab_seats_status ON collaborator_seats(status);

-- orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_collaborator_id ON orders("collaboratorId");
CREATE INDEX IF NOT EXISTS idx_orders_partner_phone ON orders("partnerPhone");
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders("createdAt" DESC);

-- ============================================
-- 4. ADD collaborators table indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_collaborators_status ON collaborators(status);
CREATE INDEX IF NOT EXISTS idx_collaborators_email ON collaborators(email);
CREATE INDEX IF NOT EXISTS idx_collaborators_phone ON collaborators(phone);