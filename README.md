# Yatri Point

Bihar's #1 travel booking platform — Book Bus, Hotel, Cab & Café in one place.

## Features

- **Bus Booking:** Search routes, view seat maps, book and pay online
- **Hotel Booking:** Browse hotels, select room types, and book instantly
- **Cab / Taxi:** Book rapid cars for local travel
- **Café Reservations:** Reserve tables at partner cafés
- **Collaborator Portal:** Business dashboard for partner operators
- **Secure Payments:** Razorpay integration with UPI fallback
- **Admin Panel:** Full admin control over orders, collabs & verifications

## Tech Stack

- **Backend:** Node.js, Express.js (ESM)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Firebase Auth + JWT + Google OAuth
- **Payments:** Razorpay + Fast2SMS (OTP)
- **Email:** Nodemailer (SMTP)

## Getting Started

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Setup environment variables:**
    ```bash
    cp .env.example .env
    # Fill in your keys
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

## Folder Structure

- `controllers/`: Route controller logic
- `routes/`: Express route definitions
- `services/`: Business logic & external service integrations
- `middleware/`: Auth & validation middleware
- `utils/`: Database client, JWT helpers, OTP helpers
- `public/`: Static assets (PWA manifest, robots.txt, sitemap)
