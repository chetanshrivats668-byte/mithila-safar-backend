# UPI QR Code Setup Instructions

## Step 1: Save the QR Code Image

1. Save the QR code image you provided as `upi-qr-code.png`
2. Place it in this folder: `C:\Users\jigar\OneDrive\Documents\BookNow\public\images\`

## Step 2: Update UPI ID (Optional)

In `index.html`, find this section (around line 910):

```html
<p style="margin-top:1rem; font-size:0.8rem; color:var(--gray);">
    <strong>UPI ID:</strong> your-upi-id@upi<br>
    <strong>Name:</strong> SUDHAKAR KUMAR MISHRA
</p>
```

Replace `your-upi-id@upi` with your actual UPI ID (e.g., `sudhakar@ybl` or `9876543210@upi`).

## Step 3: Update Admin Phone Number (Optional)

In `.env` file, add or update:

```env
ADMIN_PHONE=9876543210
```

This ensures SMS notifications are sent to the correct phone when UPI payments are confirmed.

## Step 4: Test the Integration

1. Start the server: `npm start`
2. Open `http://localhost:3001` in your browser
3. Make a booking
4. On the payment page, you'll see:
   - **Razorpay Section**: One-tap payment via UPI, Cards, Netbanking
   - **UPI QR Section**: Scan QR code with any UPI app

## Features Added:

✅ UPI QR code display with payment instructions  
✅ Payment amount shown on QR page  
✅ "I've Completed UPI Payment" button  
✅ Backend endpoint to create/update orders  
✅ SMS notification to admin on UPI payment confirmation  
✅ Integration with existing admin panel for verification  

## How It Works:

1. User scans QR code with GPay/PhonePe/Paytm
2. User enters amount and completes payment
3. User clicks "I've Completed UPI Payment" button
4. Order is created/updated in Firestore with status `payment_pending`
5. Admin receives SMS notification
6. Admin verifies payment in admin panel
7. Order status changes to `confirmed`
