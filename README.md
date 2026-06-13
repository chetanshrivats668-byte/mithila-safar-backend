# Yatri Point

Bihar's #1 travel booking platform — Book Bus, Hotel, Cab & Café in one place.

## Features

- **Bus Booking:** Search routes, view seat maps, book and pay online
- **Hotel Booking:** Browse hotels, select room types, and book instantly
- **Cab / Taxi:** Book rapid cars for local travel with GPS live location sharing
- **Café Reservations:** Reserve seats at partner cafés
- **Collaborator Portal:** Business dashboard for partner operators (buses, hotels, cabs, cafés)
- **Secure Payments:** Razorpay integration (card/netbanking/UPI) with UPI QR fallback
- **Admin Panel:** Full admin control over orders, collabs & verifications
- **PWA:** Offline-capable Progressive Web App with service worker caching

## Tech Stack

- **Backend:** Node.js, Express.js (ESM)
- **Database:** Supabase (PostgreSQL) with in-memory fallback for resilience
- **Auth:** Custom JWT + Google OAuth via Firebase Auth (Google sign-in only)
- **OTP Verification:** MSG91 OTP Widget (phone verification for bookings & partner registration)
- **Payments:** Razorpay (card, netbanking, UPI ID, UPI QR)
- **Email:** Nodemailer (SMTP)

## Collaborator Onboarding

Partners apply via two entry points:

1. **`collaborator-dashboard.html`** → submits to `POST /api/collab-applications` (canonical flow, visible in admin panel)
2. **`collab-routes.html`** → also submits to `POST /api/collab-applications`

Admin reviews applications at `/api/admin/collab-applications`.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Setup environment variables:**
   ```bash
   cp .env.example .env
   # Fill in your keys (see .env.example for required vars)
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

## Required Environment Variables

Key variables that must be set (app exits with an error if missing):

- `JWT_SECRET` — Secret for signing JWTs
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — Admin panel credentials
- `GOOGLE_CLIENT_ID` — For Google OAuth
- `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID` — Firebase project config
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — Payment gateway

See `.env.example` for the full list including Supabase, MSG91, and email config.

## Folder Structure

- `controllers/`: Route controller logic
- `routes/`: Express route definitions
- `services/`: Business logic & external service integrations
- `middleware/`: Auth & validation middleware
- `utils/`: Database client, JWT helpers, cache utilities
- `public/`: Static assets (PWA service worker, manifest, robots.txt, sitemap)
