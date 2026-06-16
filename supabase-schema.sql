-- =============================================
-- BookNow Supabase Schema Migration (FINAL)
-- Run this in Supabase SQL Editor
-- Uses quoted identifiers to preserve camelCase
-- =============================================

DROP TABLE IF EXISTS email_otps CASCADE;
DROP TABLE IF EXISTS collaborator_seats CASCADE;
DROP TABLE IF EXISTS cafe_tables CASCADE;
DROP TABLE IF EXISTS hotel_rooms CASCADE;
DROP TABLE IF EXISTS collaborator_cafes CASCADE;
DROP TABLE IF EXISTS collaborator_cabs CASCADE;
DROP TABLE IF EXISTS collaborator_hotels CASCADE;
DROP TABLE IF EXISTS collaborator_buses CASCADE;
DROP TABLE IF EXISTS collaborators CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "phone" TEXT DEFAULT '',
  "password" TEXT,
  "authProvider" TEXT DEFAULT 'email',
  "role" TEXT DEFAULT 'user',
  "phoneVerified" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  "googleId" TEXT,
  "picture" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_users_email ON users("email");
CREATE INDEX idx_users_phone ON users("phone");

CREATE TABLE orders (
  "id" TEXT PRIMARY KEY,
  "transactionId" TEXT,
  "type" TEXT DEFAULT '',
  "itemName" TEXT DEFAULT '',
  "amount" NUMERIC DEFAULT 0,
  "payNow" NUMERIC DEFAULT 0,
  "due" NUMERIC DEFAULT 0,
  "details" JSONB DEFAULT '{}',
  "seats" JSONB,
  "roomType" TEXT,
  "userEmail" TEXT,
  "userPhone" TEXT,
  "userName" TEXT DEFAULT '',
  "userAge" TEXT,
  "passengerCount" INTEGER DEFAULT 1,
  "status" TEXT DEFAULT 'payment_pending',
  "payMethod" TEXT DEFAULT 'upi',
  "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT,
  "razorpaySignature" TEXT,
  "liveLocationUrl" TEXT,
  "verifiedAt" TIMESTAMPTZ,
  "verifiedBy" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_status ON orders("status");
CREATE INDEX idx_orders_type ON orders("type");
CREATE INDEX idx_orders_created ON orders("createdAt" DESC);

CREATE TABLE collaborators (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "phoneVerified" BOOLEAN DEFAULT false,
  "password" TEXT,
  "businessName" TEXT,
  "businessType" TEXT,
  "businessDescription" TEXT DEFAULT '',
  "serviceCategories" JSONB DEFAULT '[]',
  "address" TEXT DEFAULT '',
  "city" TEXT,
  "state" TEXT DEFAULT '',
  "aadhaarUrl" TEXT DEFAULT '',
  "panUrl" TEXT DEFAULT '',
  "bankDetails" JSONB DEFAULT '{}',
  "documents" JSONB DEFAULT '{}',
  "verificationStatus" TEXT DEFAULT 'pending',
  "verifiedAt" TIMESTAMPTZ,
  "verifiedBy" TEXT,
  "status" TEXT DEFAULT 'pending',
  "rating" NUMERIC DEFAULT 0,
  "totalBookings" INTEGER DEFAULT 0,
  "totalEarnings" NUMERIC DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_collabs_email ON collaborators("email");
CREATE INDEX idx_collabs_phone ON collaborators("phone");
CREATE INDEX idx_collabs_status ON collaborators("status");

CREATE TABLE collaborator_buses (
  "id" TEXT PRIMARY KEY,
  "collaboratorId" TEXT REFERENCES collaborators("id"),
  "busName" TEXT,
  "busNumber" TEXT,
  "route" TEXT,
  "source" TEXT,
  "destination" TEXT,
  "departureTime" TEXT,
  "arrivalTime" TEXT,
  "totalSeats" INTEGER DEFAULT 0,
  "fare" NUMERIC DEFAULT 0,
  "amenities" JSONB DEFAULT '[]',
  "schedule" JSONB DEFAULT '{}',
  "status" TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collaborator_buses ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_buses_collab ON collaborator_buses("collaboratorId");
CREATE INDEX idx_buses_route ON collaborator_buses("route");

CREATE TABLE collaborator_hotels (
  "id" TEXT PRIMARY KEY,
  "collaboratorId" TEXT REFERENCES collaborators("id"),
  "hotelName" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT DEFAULT '',
  "totalRooms" INTEGER DEFAULT 0,
  "ownerAadhaarId" TEXT DEFAULT '',
  "phone" TEXT DEFAULT '',
  "amenities" JSONB DEFAULT '[]',
  "status" TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collaborator_hotels ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hotels_collab ON collaborator_hotels("collaboratorId");
CREATE INDEX idx_hotels_city ON collaborator_hotels("city");

CREATE TABLE hotel_rooms (
  "id" TEXT PRIMARY KEY,
  "hotelId" TEXT REFERENCES collaborator_hotels("id"),
  "roomType" TEXT,
  "price" NUMERIC DEFAULT 0,
  "totalRooms" INTEGER DEFAULT 0,
  "availableRooms" INTEGER DEFAULT 0,
  "amenities" JSONB DEFAULT '[]',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE hotel_rooms ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rooms_hotel ON hotel_rooms("hotelId");

CREATE TABLE collaborator_cabs (
  "id" TEXT PRIMARY KEY,
  "collaboratorId" TEXT REFERENCES collaborators("id"),
  "cabName" TEXT,
  "cabNumber" TEXT,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "cabType" TEXT,
  "fare" NUMERIC DEFAULT 0,
  "route" TEXT,
  "totalSeats" INTEGER DEFAULT 4,
  "ownerAadhaarId" TEXT DEFAULT '',
  "status" TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collaborator_cabs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cabs_collab ON collaborator_cabs("collaboratorId");

CREATE TABLE collaborator_cafes (
  "id" TEXT PRIMARY KEY,
  "collaboratorId" TEXT REFERENCES collaborators("id"),
  "cafeName" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT DEFAULT '',
  "capacity" INTEGER DEFAULT 0,
  "location" TEXT DEFAULT '',
  "price" INTEGER DEFAULT 0,
  "ownerAadhaarId" TEXT DEFAULT '',
  "phone" TEXT DEFAULT '',
  "status" TEXT DEFAULT 'active',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collaborator_cafes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cafes_collab ON collaborator_cafes("collaboratorId");

CREATE TABLE cafe_tables (
  "id" TEXT PRIMARY KEY,
  "cafeId" TEXT REFERENCES collaborator_cafes("id"),
  "tableNumber" TEXT,
  "capacity" INTEGER DEFAULT 2,
  "status" TEXT DEFAULT 'available',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cafe_tables ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cafe_tables_cafe ON cafe_tables("cafeId");

CREATE TABLE collaborator_seats (
  "id" TEXT PRIMARY KEY,
  "busId" TEXT REFERENCES collaborator_buses("id"),
  "seatNumber" TEXT,
  "travelDate" DATE,
  "status" TEXT DEFAULT 'available',
  "price" NUMERIC DEFAULT 0,
  "bookedBy" TEXT,
  "collaboratorId" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE collaborator_seats ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_seats_bus ON collaborator_seats("busId");
CREATE INDEX idx_seats_date ON collaborator_seats("travelDate");

CREATE TABLE email_otps (
  "email" TEXT PRIMARY KEY,
  "otpCode" TEXT NOT NULL,
  "attemptsCount" INTEGER DEFAULT 0,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE email_otps ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_otps_email ON email_otps("email");

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
