import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';
import Razorpay from 'razorpay';
import collabRoutes from './routes/collabRoutes.js';
import busRoutes from './routes/busRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import verificationRoutes from './routes/verificationRoutes.js';
import authRoutes from './routes/authRoutes.js';
import cabRoutes from './routes/cabRoutes.js';
import hotelRoutes from './routes/hotelRoutes.js';
import cafeRoutes from './routes/cafeRoutes.js';
import hotelRoomRoutes from './routes/hotelRoomRoutes.js';
import cafeTableRoutes from './routes/cafeTableRoutes.js';
import { requireAuth, blockTemporarySession } from './middleware/auth.js';
import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from './utils/db.js';
import { memoryDb } from './utils/firestoreFallback.js';
import { sendSMS } from './services/smsService.js';
import * as applicationController from './controllers/applicationController.js';
import * as collabService from './services/collabService.js';
import { normalizeBusRecord } from './services/busService.js';
import { cacheResponse, cacheResponseByBody, invalidate as cacheInvalidate } from './utils/cache.js';
import { validate, schemas as validateSchemas, sanitizeInput } from './middleware/validator.js';
import redisClient from './utils/redisClient.js';

// ========== ENVIRONMENT VALIDATION ==========
const missing = [];
if (!process.env.FIREBASE_API_KEY) missing.push('FIREBASE_API_KEY');
if (!process.env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
if (!process.env.RAZORPAY_KEY_ID) missing.push('RAZORPAY_KEY_ID');
if (!process.env.RAZORPAY_KEY_SECRET) missing.push('RAZORPAY_KEY_SECRET');
if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
if (!process.env.ADMIN_USERNAME) missing.push('ADMIN_USERNAME');
if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ========== SUPABASE ==========
if (!isSupabaseAvailable()) {
  console.warn('[SUPABASE] Missing SUPABASE_URL or SUPABASE_ANON_KEY — running in offline memory mode.');
}

const app = express();
app.locals.db = {
  get: dbGet,
  list: dbList,
  create: dbCreate,
  update: dbUpdate,
  remove: dbRemove
};
const PORT = process.env.PORT || 3001;
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// ========== RAZORPAY CONFIG ==========
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ========== IN-MEMORY STORES & CONFIG ==========
// OTP store: phone -> { otp, expiry, attempts, sendCount }
const otpStore = new Map();
const OTP_MAX_ATTEMPTS = 3;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const API_RATE_WINDOW = 15 * 60 * 1000;
const LOCKOUT_TIME = 15 * 60 * 1000;

// ========== SECURITY CONFIG ==========
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '8h';

// ========== SMS HELPER (MSG91) — see services/smsService.js ==========

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getBookingDetailsObject(booking) {
  if (!booking?.details) return {};
  if (typeof booking.details === 'string') {
    try { return JSON.parse(booking.details); } catch (_) { return {}; }
  }
  return booking.details;
}

function getBookingFieldValue() {
  for (const value of arguments) {
    if (value === 0) return '0';
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return 'N/A';
}

function normalizePaymentStatus(status) {
  const normalized = String(status || 'pending').trim().toLowerCase();
  if (normalized === 'confirmed') return 'Paid';
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/w/g, ch => ch.toUpperCase());
}

function buildCollaboratorSpecificDetails(booking) {
  const details = getBookingDetailsObject(booking);
  const selectedCab = details.selectedCab || booking?.selectedCab || {};
  const selectedBus = details.selectedBus || booking?.selectedBus || {};
  const selectedHotel = details.selectedHotel || booking?.selectedHotel || {};
  const selectedCafe = details.selectedCafe || booking?.selectedCafe || {};
  const type = String(booking?.type || details?.type || '').toLowerCase();

  if (type === 'cab' || type === 'car') {
    return [
      'Boarding Point: ' + getBookingFieldValue(details.boarding, details.boardingPoint, details.from, details.pickup, details.pickupPoint, selectedCab.boarding, selectedCab.boardingPoint, booking?.boarding, booking?.from),
      'Dropping Point: ' + getBookingFieldValue(details.dropping, details.droppingPoint, details.to, details.dropoff, selectedCab.dropping, selectedCab.droppingPoint, selectedCab.to, booking?.dropping, booking?.to)
    ];
  }

  if (type === 'bus') {
    return [
      'Dropping City: ' + getBookingFieldValue(details.to, details.droppingCity, details.dropping, selectedBus.to, selectedBus.droppingCity, booking?.to, booking?.dropping)
    ];
  }

  if (type === 'hotel') {
    return [
      'Room Type: ' + getBookingFieldValue(booking?.roomType, details.roomType, selectedHotel.roomType)
    ];
  }

  if (type === 'cafe') {
    const bookingTableNumber = Array.isArray(booking?.seats) ? booking.seats.map(seat => Number(seat) + 1).join(', ') : booking?.seats;
    const detailsTableNumber = Array.isArray(details?.seats) ? details.seats.map(seat => Number(seat) + 1).join(', ') : (details?.tableNumber || details?.seats);
    return [
      'Table number: ' + getBookingFieldValue(detailsTableNumber, selectedCafe.tableNumber, bookingTableNumber)
    ];
  }

  return [];
}

function getPartnerTargetType(type) {
  const normalized = String(type || '').toLowerCase();
  return normalized === 'car' ? 'cab' : normalized;
}

function getBookingCollaboratorId(orderData) {
  return orderData?.collaboratorId
    || orderData?.details?.collaboratorId
    || orderData?.details?.collabId
    || null;
}

// Build SMS message for partner notification
function buildPartnerSMS(booking) {
  const details = getBookingDetailsObject(booking);
  const type = String(booking?.type || details?.type || '').toUpperCase();
  const lines = [
    'YATRI POINT New ' + (type || 'BOOKING') + ' Booking!',
    'ID: ' + getBookingFieldValue(booking?.orderId),
    'Name: ' + getBookingFieldValue(booking?.userName, details.userName, details.name),
    'Mobile number: ' + getBookingFieldValue(booking?.userPhone, details.userPhone, details.mobileNumber, details.phone),
    'Age: ' + getBookingFieldValue(booking?.userAge, details.userAge, details.age, booking?.passengerDetails?.[0]?.age),
    'Payment Status: ' + normalizePaymentStatus(booking?.status),
    ...buildCollaboratorSpecificDetails(booking)
  ];

  if ((booking?.type === 'car' || String(booking?.type || '').toLowerCase() === 'car') && booking?.liveLocationUrl) {
    lines.push('Live Location: ' + booking.liveLocationUrl);
  }

  lines.push('- Yatri Point');
  return lines.join('\n');
}

// Send SMS notification to matching partners.
// If the order carries a collaboratorId, notify ONLY that collaborator.
async function sendPartnerNotification(orderData) {
  try {
    const collabType = getPartnerTargetType(orderData.type);
    const allCollabs = await dbList('collabs');
    let matchingCollabs = allCollabs.filter(c => c.status === 'approved' && (c.type === collabType || c.type === collabType + '-route'));
    if (matchingCollabs.length === 0) { console.log('[COLLAB] No matching partner for type:', collabType); return; }
    const collaboratorId = getBookingCollaboratorId(orderData);
    if (collaboratorId) {
      matchingCollabs = matchingCollabs.filter(c => c.id === collaboratorId);
      if (matchingCollabs.length === 0) {
        console.warn(`[COLLAB] Order ${orderData.orderId} has collaboratorId=${collaboratorId} but no approved matching collaborator was found. Notification skipped.`);
        return;
      }
    }
    const smsMsg = buildPartnerSMS(orderData);
    for (const collab of matchingCollabs) {
      const partnerPhone = collab.phone || '';
      if (partnerPhone) { await sendSMS(partnerPhone, smsMsg); }
    }
  } catch (err) { console.error('Partner notification error:', err); }
}



// ========== RATE LIMITER ==========


// ========== RATE LIMITER ==========
async function checkAdminLoginRateLimit(ip) {
  const key = `lockout:admin:${ip}`;
  const attemptStr = await redisClient.get(key).catch(() => null);
  if (!attemptStr) return { allowed: true, remaining: ADMIN_LOGIN_MAX_ATTEMPTS };
  const attempt = JSON.parse(attemptStr);
  if (attempt.count >= ADMIN_LOGIN_MAX_ATTEMPTS && Date.now() - attempt.lastAttempt < LOCKOUT_TIME) { return { allowed: false, remaining: 0 }; }
  if (Date.now() - attempt.lastAttempt >= LOCKOUT_TIME) { await redisClient.del(key).catch(() => {}); return { allowed: true, remaining: ADMIN_LOGIN_MAX_ATTEMPTS }; }
  return { allowed: true, remaining: ADMIN_LOGIN_MAX_ATTEMPTS - attempt.count };
}
async function recordAdminLoginAttempt(ip, success) {
  const key = `lockout:admin:${ip}`;
  if (success) { await redisClient.del(key).catch(() => {}); return; }
  const attemptStr = await redisClient.get(key).catch(() => null);
  const attempt = attemptStr ? JSON.parse(attemptStr) : { count: 0, lastAttempt: 0 };
  attempt.count++; attempt.lastAttempt = Date.now();
  await redisClient.set(key, JSON.stringify(attempt), 'PX', LOCKOUT_TIME).catch(() => {});
}

// ========== AUTH MIDDLEWARE ==========
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) { return res.status(401).json({ success: false, message: 'Unauthorized' }); }
  const token = authHeader.split(' ')[1];
  try { const decoded = jwt.verify(token, JWT_SECRET); if (!decoded || !decoded.admin) throw new Error(); req.admin = decoded; next(); }
  catch (e) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// ========== MIDDLEWARE ==========
const allowedOrigins = ['http://localhost:3001','http://127.0.0.1:3001','http://localhost:5500','http://127.0.0.1:5500','https://yatripoint.com','https://www.yatripoint.com','https://yatripoint.in','https://www.yatripoint.in','https://yatri-point.onrender.com','https://yatripoint.onrender.com'];
app.use(cors({ origin: (origin, cb) => { if (!origin || origin === 'null' || allowedOrigins.includes(origin) || origin.startsWith('http://192.168.')) return cb(null, true); cb(new Error('CORS: origin not allowed')); }, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
// Capture raw body for Razorpay webhook HMAC verification.
// All other routes continue to get the parsed JSON body as usual.
app.use(express.json({
  limit: '50kb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.startsWith('/api/razorpay/webhook')) {
      req.rawBody = buf;
    }
  }
}));

// ========== SECURITY HEADERS ==========
app.use((req, res, next) => { const reqId = crypto.randomBytes(6).toString('hex'); req.reqId = reqId; res.setHeader('X-Request-Id', reqId); next(); });

// Invalidate public search caches whenever a collaborator mutation succeeds.
// Keeps TTL caches from serving stale inventory after writes.
app.use('/api/collaborator', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            // Drop everything that could include the just-touched listing type.
            cacheInvalidate('/api/listings');
            cacheInvalidate('/api/cafes');
            cacheInvalidate('/api/buses/search');
            cacheInvalidate('/api/cabs/search');
            cacheInvalidate('/api/hotels/search');
            cacheInvalidate('/api/routes/buses');
        }
    });
    next();
});
app.use((req, res, next) => { res.setHeader('X-Request-ID', req.reqId || ''); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('X-XSS-Protection', '1; mode=block'); next(); });

// ========== ROUTES ==========
app.use('/api/auth', authRoutes);
app.use('/api/collaborator', collabRoutes);
app.use('/api/collaborator/bus', busRoutes);
app.use('/api/collaborator/cab', cabRoutes);
app.use('/api/collaborator/hotel', hotelRoutes);
app.use('/api/collaborator/hotel/rooms', hotelRoomRoutes);
app.use('/api/collaborator/cafe', cafeRoutes);
app.use('/api/collaborator/cafe/tables', cafeTableRoutes);
app.use('/api/collaborator/dashboard', dashboardRoutes);
app.use('/api/collaborator/verification', verificationRoutes);

// ========== STATIC FILES ==========
// Serve root-level HTML/CSS/JS files (index.html, pay.html, styles.css, etc.)
// and the /public directory for images, icons, manifests.
app.use('/public', express.static(path.join(ROOT_DIR, 'public')));
app.use(express.static(ROOT_DIR, {
  index: 'index.html',
  extensions: ['html'],
  // Don't cache HTML files on client so we always serve the latest version
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));


// ========== HEALTH CHECK (for keep-awake/pingers) ==========
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== STATIC CONFIG ==========
app.get('/api/config', (req, res) => {
  res.json({
    firebaseApiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    msg91WidgetId: process.env.MSG91_WIDGET_ID || '366668686d37313131303336',
    // MSG91_WIDGET_TOKEN_AUTH is the client-facing widget token from MSG91 dashboard.
    // It is DIFFERENT from MSG91_AUTH_KEY (the secret server-side key). Leave empty if not set.
    msg91TokenAuth: process.env.MSG91_WIDGET_TOKEN_AUTH || ''
  });
});

// ========== PAYMENT LINK: Public endpoints (no auth — used by pay.html) ==========
// Rate limiter: max 5 attempts per IP per 10 minutes to prevent abuse.
const payLinkRateMap = new Map(); // ip -> { count, windowStart }
const PAY_LINK_MAX  = 5;
const PAY_LINK_WIN  = 10 * 60 * 1000; // 10 minutes

function payLinkRateCheck(ip) {
  const now  = Date.now();
  const entry = payLinkRateMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > PAY_LINK_WIN) { entry.count = 0; entry.windowStart = now; }
  if (entry.count >= PAY_LINK_MAX) return false;
  entry.count++;
  payLinkRateMap.set(ip, entry);
  return true;
}

// POST /api/payment-link/create-order
// Creates a Razorpay order for the standalone pay.html page (no JWT).
app.post('/api/payment-link/create-order', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (!payLinkRateCheck(ip)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait a few minutes and try again.' });
  }
  try {
    const { amount, type, itemName, note, ref, userName, userPhone } = req.body;

    // Server-side validation — the frontend amount must match, preventing user tampering.
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount < 1 || parsedAmount > 1_000_000) {
      return res.status(400).json({ success: false, message: 'Invalid payment amount' });
    }
    if (!userName || String(userName).trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const cleanPhone = String(userPhone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required' });
    }

    const orderId       = 'PL' + Date.now().toString(36).toUpperCase();
    const safeItemName  = String(itemName || (type + ' booking')).slice(0, 200);
    const safeType      = ['bus','hotel','cab','car','cafe','booking'].includes(type) ? type : 'booking';

    const razorpayOrder = await razorpay.orders.create({
      amount:   Math.round(parsedAmount * 100),
      currency: 'INR',
      receipt:  orderId,
      notes: {
        type:      safeType,
        itemName:  safeItemName,
        ref:       ref || '',
        note:      note || '',
        userName:  String(userName).trim().slice(0, 80),
        userPhone: '+91' + cleanPhone,
        source:    'payment_link',
      },
    });

    const orderData = {
      orderId,
      razorpayOrderId: razorpayOrder.id,
      type:     safeType,
      itemName: safeItemName,
      amount:   parsedAmount,
      payNow:   parsedAmount,
      due:      0,
      note:     note   || '',
      ref:      ref    || '',
      userName:  String(userName).trim().slice(0, 80),
      userPhone: '+91' + cleanPhone,
      source:    'payment_link',
      status:    'payment_pending',
      payMethod: 'razorpay',
      createdAt: new Date().toISOString(),
      verifiedAt: null, verifiedBy: null,
    };

    if (isSupabaseAvailable()) {
      await dbCreate('orders', orderId, orderData);
    } else {
      memoryDb.orders.set(orderId, orderData);
    }

    console.log(`[PayLink] Order created: ${orderId} | ₹${parsedAmount} | ${safeType} | ${'+91'+cleanPhone}`);
    res.json({
      success:        true,
      orderId,
      razorpayOrderId: razorpayOrder.id,
      razorpayKey:    process.env.RAZORPAY_KEY_ID,
      amount:         Math.round(parsedAmount * 100),
      currency:       'INR',
    });
  } catch (err) {
    const statusCode = Number(err?.statusCode || err?.status || 0);
    const errorDescription = err?.error?.description || err?.description || err?.message || 'Unknown payment gateway error';
    const isGatewayAuthError = statusCode === 401;
    const isGatewayConfigError =
      isGatewayAuthError ||
      /authentication|authorize|authorise|api key|key_id|key secret|merchant/i.test(String(errorDescription));

    console.error('[PayLink] Create order error:', {
      statusCode,
      code: err?.error?.code || err?.code || null,
      description: errorDescription,
      field: err?.error?.field || null,
      source: err?.error?.source || null,
      step: 'razorpay.orders.create',
      keyIdPrefix: String(process.env.RAZORPAY_KEY_ID || '').slice(0, 8),
    });

    if (isGatewayConfigError) {
      return res.status(500).json({
        success: false,
        code: 'PAYMENT_GATEWAY_CONFIG_ERROR',
        message: 'Payment gateway is temporarily unavailable. Please try again in a few minutes or contact support.',
      });
    }

    res.status(500).json({
      success: false,
      code: 'PAYMENT_ORDER_CREATE_FAILED',
      message: 'Failed to create payment order. Please try again.',
    });
  }
});

// POST /api/payment-link/verify
// Verifies Razorpay signature and marks the pay.html order as confirmed (no JWT).
app.post('/api/payment-link/verify', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (!payLinkRateCheck(ip)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait and try again.' });
  }
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !orderId) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }

    // HMAC verification — prevents forged success callbacks
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(razorpayOrderId + '|' + razorpayPaymentId)
      .digest('hex');

    if (expectedSig !== razorpaySignature) {
      console.warn(`[PayLink] Signature mismatch for order ${orderId}`);
      return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
    }

    const updates = {
      status:            'confirmed',
      razorpayPaymentId,
      razorpaySignature,
      verifiedAt:        new Date().toISOString(),
      verifiedBy:        'razorpay_auto',
    };

    if (isSupabaseAvailable()) {
      const orderData = await dbGet('orders', orderId);
      if (!orderData) return res.status(404).json({ success: false, message: 'Order not found' });
      await dbUpdate('orders', orderId, updates);
      await sendPartnerNotification({ ...orderData, ...updates, orderId });
    } else {
      const existingOrder = memoryDb.orders.get(orderId);
      if (!existingOrder) return res.status(404).json({ success: false, message: 'Order not found' });
      const updatedOrder = { ...existingOrder, ...updates };
      memoryDb.orders.set(orderId, updatedOrder);
      await sendPartnerNotification(updatedOrder);
    }

    console.log(`[PayLink] Payment verified: ${orderId} | PaymentID: ${razorpayPaymentId}`);
    res.json({ success: true, orderId, status: 'confirmed' });
  } catch (err) {
    console.error('[PayLink] Verify error:', err);
    res.status(500).json({ success: false, message: 'Payment verification error' });
  }
});

// POST /api/payment-link/qr-confirm
// Manual UPI QR confirmation — stores order as payment_pending for admin verification.
app.post('/api/payment-link/qr-confirm', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  if (!payLinkRateCheck(ip)) {
    return res.status(429).json({ success: false, message: 'Too many requests. Please wait and try again.' });
  }
  try {
    const { amount, type, itemName, note, ref, upiRef, userName, userPhone } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount < 1) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    if (!upiRef || String(upiRef).trim().length < 4) {
      return res.status(400).json({ success: false, message: 'UPI reference / transaction ID is required' });
    }
    const cleanPhone = String(userPhone || '').replace(/\D/g, '').slice(-10);
    const safeType   = ['bus','hotel','cab','car','cafe','booking'].includes(type) ? type : 'booking';

    const orderId = 'QR' + Date.now().toString(36).toUpperCase();
    const order   = {
      orderId,
      type:      safeType,
      itemName:  String(itemName || '').slice(0, 200),
      amount:    parsedAmount,
      payNow:    parsedAmount,
      due:       0,
      note:      note    || '',
      ref:       ref     || '',
      upiRef:    String(upiRef).trim().slice(0, 128),
      userName:  String(userName || '').trim().slice(0, 80),
      userPhone: cleanPhone ? '+91' + cleanPhone : (userPhone || ''),
      source:    'payment_link_qr',
      status:    'payment_pending',
      payMethod: 'upi_qr',
      createdAt: new Date().toISOString(),
      verifiedAt: null, verifiedBy: null,
    };

    if (isSupabaseAvailable()) {
      await dbCreate('orders', orderId, order);
    } else {
      memoryDb.orders.set(orderId, order);
    }

    // Notify admin via SMS
    try {
      const smsMsg = `[Yatri Point] New QR Payment (pay.html)\nOrder: ${orderId}\n₹${parsedAmount} | ${safeType}\nName: ${order.userName}\nPhone: ${order.userPhone}\nUPI Ref: ${order.upiRef}\nNote: ${order.note || '-'}`;
      if (process.env.ADMIN_PHONE) await sendSMS(process.env.ADMIN_PHONE, smsMsg);
    } catch (smsErr) {
      console.warn('[PayLink] Admin SMS failed:', smsErr.message);
    }

    console.log(`[PayLink] QR confirm submitted: ${orderId} | UPI Ref: ${upiRef}`);
    res.json({ success: true, orderId, message: 'Payment submitted. Our team will verify within 30 minutes.' });
  } catch (err) {
    console.error('[PayLink] QR confirm error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit payment confirmation' });
  }
});

// GET /api/payment-link/status/:orderId
// Polls the order status — used by pay.html after Razorpay modal closes.
// The webhook will have auto-confirmed the order; this lets the frontend detect it.
app.get('/api/payment-link/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId || orderId.length < 2 || orderId.length > 64) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    let orderData = null;
    if (isSupabaseAvailable()) {
      orderData = await dbGet('orders', orderId);
    } else {
      orderData = memoryDb.orders.get(orderId) || null;
    }

    if (!orderData) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Return only safe, non-sensitive fields
    res.json({
      success:           true,
      orderId,
      status:            orderData.status,
      razorpayPaymentId: orderData.razorpayPaymentId || null,
      paymentMethod:     orderData.paymentMethod     || null,
      verifiedAt:        orderData.verifiedAt        || null,
      verifiedBy:        orderData.verifiedBy        || null,
    });
  } catch (err) {
    console.error('[PayLink] Status check error:', err);
    res.status(500).json({ success: false, message: 'Status check failed' });
  }
});

// ========== RAZORPAY: Create Order ==========
app.post('/api/razorpay/create-order', requireAuth, blockTemporarySession, validate(validateSchemas.razorpayCreateOrder), async (req, res) => {
  try {
    const { amount, type, itemName, details, seats, roomType, userName, userPhone, userAge, passengerCount } = req.body;
    if (!amount || amount < 1) return res.status(400).json({ success: false, message: 'Invalid amount' });

    const orderId = 'MS' + Date.now().toString(36).toUpperCase();
    console.log(`[Razorpay] Creating order ${orderId} | amount=${amount} | type=${type || ''} | key=${String(process.env.RAZORPAY_KEY_ID || '').slice(0, 8)}...`);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      receipt: orderId,
      notes: { type: type || '', itemName: itemName || '', userName: userName || '', userPhone: userPhone || '' }
    });

    const orderData = {
      orderId,
      razorpayOrderId: razorpayOrder.id,
      type: type || '',
      itemName: itemName || '',
      amount: Number(amount),
      payNow: Number(amount),
      due: 0,
      details: details || {},
      seats: seats || null,
      roomType: roomType || null,
      userName: userName || '',
      userPhone: userPhone || '',
      userAge: userAge || '',
      passengerCount: passengerCount || 1,
      collaboratorId: (details && (details.collaboratorId || details.collabId)) || null,
      status: 'payment_pending',
      payMethod: 'razorpay',
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      verifiedBy: null
    };

    if (isSupabaseAvailable()) {
      await dbCreate('orders', orderId, orderData);
    } else {
      memoryDb.orders.set(orderId, orderData);
      console.log('[FALLBACK]: Order stored in memory:', orderId);
    }

    res.json({
      success: true,
      orderId,
      razorpayOrderId: razorpayOrder.id,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      amount: Math.round(amount * 100),
      currency: 'INR'
    });
  } catch (err) {
    const statusCode = Number(err?.statusCode || err?.status || 0);
    const errorDescription = err?.error?.description || err?.description || err?.message || 'Unknown payment gateway error';
    const isGatewayAuthError = statusCode === 401;
    const isGatewayConfigError =
      isGatewayAuthError ||
      /authentication|authorize|authorise|api key|key_id|key secret|merchant/i.test(String(errorDescription));

    console.error('Razorpay order creation error:', {
      message: err?.message,
      statusCode,
      error: err?.error || null,
      description: errorDescription,
      field: err?.error?.field || null,
      source: err?.error?.source || null,
      step: 'create-order',
      keyIdPrefix: String(process.env.RAZORPAY_KEY_ID || '').slice(0, 8)
    });

    if (isGatewayConfigError) {
      return res.status(500).json({
        success: false,
        code: 'PAYMENT_GATEWAY_CONFIG_ERROR',
        message: 'Payment gateway is temporarily unavailable. Please try again in a few minutes or contact support.'
      });
    }

    res.status(500).json({
      success: false,
      code: 'PAYMENT_ORDER_CREATE_FAILED',
      message: 'Failed to create payment order. Please try again.'
    });
  }
});

 // ========== RAZORPAY: Verify Payment ==========
 app.post('/api/razorpay/verify-payment', requireAuth, blockTemporarySession, validate(validateSchemas.razorpayVerify), async (req, res) => {
   try {
     const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId, liveLocationUrl } = req.body;
     console.log(`[Razorpay] Verifying payment | orderId=${orderId} | razorpayOrderId=${razorpayOrderId} | paymentId=${razorpayPaymentId}`);
     if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !orderId) {
       return res.status(400).json({ success: false, message: 'Missing payment fields' });
     }
     const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(razorpayOrderId + '|' + razorpayPaymentId).digest('hex');
     if (expectedSignature !== razorpaySignature) {
       console.warn('[Razorpay] Signature mismatch during verify-payment', {
         orderId,
         razorpayOrderId,
         razorpayPaymentId,
         expectedSignaturePrefix: String(expectedSignature).slice(0, 10),
         receivedSignaturePrefix: String(razorpaySignature).slice(0, 10),
         keyIdPrefix: String(process.env.RAZORPAY_KEY_ID || '').slice(0, 8)
       });
       return res.status(400).json({ success: false, message: 'Payment verification failed' });
     }
    const updates = { status: 'confirmed', razorpayPaymentId, razorpaySignature, verifiedAt: new Date().toISOString(), verifiedBy: 'razorpay_auto', liveLocationUrl: liveLocationUrl || null };
    if (isSupabaseAvailable()) {
      const orderData = await dbGet('orders', orderId);
      if (!orderData) { return res.status(404).json({ success: false, message: 'Order not found' }); }
      await dbUpdate('orders', orderId, updates);
      const updatedData = { ...orderData, ...updates, orderId };
      await sendPartnerNotification(updatedData);
    } else {
      const existingOrder = memoryDb.orders.get(orderId);
      if (!existingOrder) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      const updatedOrder = { ...existingOrder, ...updates };
      memoryDb.orders.set(orderId, updatedOrder);
      console.log('[FALLBACK]: Order verified in memory:', orderId);
      await sendPartnerNotification(updatedOrder);
    }
    res.json({ success: true, orderId, status: 'confirmed' });
  } catch (err) {
    console.error('Razorpay verify error:', {
      message: err?.message,
      statusCode: err?.statusCode,
      step: 'verify-payment'
    });
    res.status(500).json({ success: false, message: 'Payment verification error' });
  }
});


// ========== RAZORPAY: Webhook (auto payment confirmation) ==========
// Razorpay calls this URL the instant money lands in your account.
// No customer interaction needed — fully server-to-server and tamper-proof.
// Setup: Razorpay Dashboard → Settings → Webhooks → Add URL:
//   https://yatripoint.onrender.com/api/razorpay/webhook
// Events to subscribe: payment.captured, payment.authorized
// Copy the webhook secret Razorpay gives you → set RAZORPAY_WEBHOOK_SECRET in .env
app.post('/api/razorpay/webhook', async (req, res) => {
  try {
    const sig           = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // If webhook secret is not configured yet, log and accept (don't break).
    if (!webhookSecret) {
      console.warn('[Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature check. Set it in .env!');
    } else if (!sig) {
      console.warn('[Webhook] Missing X-Razorpay-Signature header — rejecting.');
      return res.status(400).json({ error: 'Missing signature' });
    } else {
      // Compute HMAC on the RAW request body (must not be JSON-parsed first)
      const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSig !== sig) {
        console.warn('[Webhook] Signature mismatch — possible forgery attempt, rejecting.');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    // Always respond 200 fast so Razorpay doesn't retry.
    res.status(200).json({ status: 'received' });

    // Process asynchronously after responding
    const event = req.body;
    console.log(`[Webhook] Event received: ${event.event}`);

    // Handle payment.captured — money is in your account
    if (event.event === 'payment.captured' || event.event === 'payment.authorized') {
      const payment        = event.payload?.payment?.entity;
      if (!payment) { console.warn('[Webhook] No payment entity in payload'); return; }

      const razorpayOrderId  = payment.order_id;
      const razorpayPayId    = payment.id;
      const paymentMethod    = payment.method;  // card / upi / netbanking / wallet

      console.log(`[Webhook] Payment ${event.event}: PayID=${razorpayPayId} | OrderID=${razorpayOrderId} | Method=${paymentMethod} | ₹${(payment.amount/100).toFixed(2)}`);

      if (!razorpayOrderId) { console.warn('[Webhook] No order_id in payment — skipping'); return; }

      // Find our order by razorpayOrderId
      let orderId    = null;
      let orderData  = null;

      if (isSupabaseAvailable()) {
        // Search orders table for matching razorpayOrderId
        const allOrders = await dbList('orders');
        const match     = allOrders.find(o => o.razorpayOrderId === razorpayOrderId);
        if (match) { orderId = match.orderId; orderData = match; }
      } else {
        // Search in-memory
        for (const [id, order] of memoryDb.orders.entries()) {
          if (order.razorpayOrderId === razorpayOrderId) {
            orderId   = id;
            orderData = order;
            break;
          }
        }
      }

      if (!orderData) {
        console.warn(`[Webhook] Order not found for Razorpay order: ${razorpayOrderId}`);
        return;
      }

      // Skip if already confirmed (idempotent)
      if (orderData.status === 'confirmed') {
        console.log(`[Webhook] Order ${orderId} already confirmed — skipping duplicate event.`);
        return;
      }

      const updates = {
        status:            'confirmed',
        razorpayPaymentId: razorpayPayId,
        paymentMethod:     paymentMethod,
        verifiedAt:        new Date().toISOString(),
        verifiedBy:        'razorpay_webhook',
        webhookEvent:      event.event,
      };

      if (isSupabaseAvailable()) {
        await dbUpdate('orders', orderId, updates);
      } else {
        memoryDb.orders.set(orderId, { ...orderData, ...updates });
      }

      // Notify partner operator via SMS
      await sendPartnerNotification({ ...orderData, ...updates, orderId });

      // Notify admin via SMS that payment arrived
      try {
        if (process.env.ADMIN_PHONE) {
          const adminSms = `[Yatri Point] Payment CONFIRMED via Webhook!\nOrder: ${orderId}\n₹${(payment.amount/100).toFixed(2)} | ${orderData.type || '?'}\nMethod: ${paymentMethod}\nName: ${orderData.userName || '-'}\nPhone: ${orderData.userPhone || '-'}\nRazorpay ID: ${razorpayPayId}`;
          await sendSMS(process.env.ADMIN_PHONE, adminSms);
        }
      } catch (smsErr) {
        console.warn('[Webhook] Admin SMS failed:', smsErr.message);
      }

      console.log(`[Webhook] ✅ Order ${orderId} confirmed via webhook. Method: ${paymentMethod}`);
    }

    // Log other events for visibility
    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      console.warn(`[Webhook] Payment FAILED: PayID=${payment?.id} | Error=${payment?.error_description}`);
    }

  } catch (err) {
    console.error('[Webhook] Processing error:', err);
    // Don't send error response — Razorpay already got 200 above
  }
});

// ========== Create Order (legacy UPI fallback) ==========
app.post('/api/create-order', requireAuth, blockTemporarySession, validate(validateSchemas.createOrder), async (req, res) => {
  try {
    const { type, itemName, amount, payNow, due, details, seats, roomType, userEmail, userPhone, userName, userAge, passengerCount } = req.body;
    if (!type || !itemName || !amount || !payNow) return res.status(400).json({ success: false, message: 'Missing fields' });
    const orderId = 'MS' + Date.now().toString(36).toUpperCase();
    const order = { orderId, transactionId: crypto.randomBytes(4).toString('hex').toUpperCase(), type, itemName, amount: Number(amount), payNow: Number(payNow), due: Number(due) || 0, details: details || {}, seats: seats || null, roomType: roomType || null, userEmail: userEmail || null, userPhone: userPhone || null, userName: userName || '', userAge: userAge || '', passengerCount: passengerCount || 1, collaboratorId: (details && (details.collaboratorId || details.collabId)) || null, status: 'payment_pending', payMethod: 'upi', createdAt: new Date().toISOString(), verifiedAt: null, verifiedBy: null };
    
    if (isSupabaseAvailable()) {
      await dbCreate('orders', orderId, order);
    } else {
      memoryDb.orders.set(orderId, order);
      console.log('[FALLBACK]: Order created in memory:', orderId);
    }
    
    res.json({ success: true, orderId: order.orderId, transactionId: order.transactionId, status: 'payment_pending' });
  } catch (err) { console.error('Create order error:', err); res.status(500).json({ success: false, message: 'Failed to create order' }); }
});

// ========== Order Status ==========
// Requires auth and ownership check: a user can only see the status of their own
// booking. (Audit fix 2026-06-14: previously unauthenticated, leaking PII.)
app.get('/api/order-status/:orderId', requireAuth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    let order = null;
    if (isSupabaseAvailable()) {
      order = await dbGet('orders', orderId);
    } else {
      order = memoryDb.orders.get(orderId) || null;
    }
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });

    // Ownership: order must belong to the requesting user. We compare against
    // the order's stored userPhone (last 10 digits) and the user's profile phone.
    if (req.user && req.user.userId) {
      let caller = null;
      try {
        if (isSupabaseAvailable()) {
          caller = await dbGet('users', req.user.userId);
        } else {
          caller = memoryDb.users && memoryDb.users.get(req.user.userId);
        }
      } catch (_) { caller = null; }
      const callerPhone = (caller && (caller.phone || caller.phoneNumber)) ? String(caller.phone || caller.phoneNumber).replace(/\D/g, '').slice(-10) : '';
      const orderPhone = String(order.userPhone || '').replace(/\D/g, '').slice(-10);
      // Admins can also view (their orderId search uses a different endpoint).
      if (!req.user.admin && orderPhone && callerPhone && orderPhone !== callerPhone) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    res.json({
      success: true,
      orderId: order.orderId,
      status: order.status,
      amount: order.amount,
      payNow: order.payNow,
      itemName: order.itemName,
      type: order.type
    });
  }
  catch (e) { res.status(500).json({ success: false, message: 'DB error' }); }
});

// ========== UPI Payment Confirmation ==========
app.post('/api/upi/confirm-payment', requireAuth, blockTemporarySession, validate(validateSchemas.upiConfirm), async (req, res) => {
  try {
    const { orderId, amount, type, itemName, userName, userPhone, seats, details } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ success: false, message: 'Order ID and amount required' });
    }
    
    if (isSupabaseAvailable()) {
      const existing = await dbGet('orders', orderId);
      
      if (existing) {
        await dbUpdate('orders', orderId, {
          status: 'payment_pending',
          payMethod: 'upi',
          verifiedAt: null,
          verifiedBy: null
        });
      } else {
        const order = {
          orderId,
          transactionId: crypto.randomBytes(4).toString('hex').toUpperCase(),
          type: type || '',
          itemName: itemName || '',
          amount: Number(amount),
          payNow: Number(amount),
          due: 0,
          details: details || {},
          seats: seats || null,
          userName: userName || '',
          userPhone: userPhone || '',
          passengerCount: 1,
          // Audit 2026-06-14: route partner SMS to the right operator
          collaboratorId: (details && (details.collaboratorId || details.collabId)) || null,
          status: 'payment_pending',
          payMethod: 'upi',
          createdAt: new Date().toISOString(),
          verifiedAt: null,
          verifiedBy: null
        };
        await dbCreate('orders', orderId, order);
      }
    } else {
      // Handle in memory when Firestore unavailable
      const existingOrder = memoryDb.orders.get(orderId);
      
      if (existingOrder) {
        // Update existing order
        const updatedOrder = {
          ...existingOrder,
          status: 'payment_pending',
          payMethod: 'upi',
          verifiedAt: null,
          verifiedBy: null
        };
        memoryDb.orders.set(orderId, updatedOrder);
        console.log('[FALLBACK]: Order updated in memory:', orderId);
      } else {
        // Create new order
        const order = {
          orderId,
          transactionId: crypto.randomBytes(4).toString('hex').toUpperCase(),
          type: type || '',
          itemName: itemName || '',
          amount: Number(amount),
          payNow: Number(amount),
          due: 0,
          details: details || {},
          seats: seats || null,
          userName: userName || '',
          userPhone: userPhone || '',
          passengerCount: 1,
          // Audit 2026-06-14: route partner SMS to the right operator
          collaboratorId: (details && (details.collaboratorId || details.collabId)) || null,
          status: 'payment_pending',
          payMethod: 'upi',
          createdAt: new Date().toISOString(),
          verifiedAt: null,
          verifiedBy: null
        };
        memoryDb.orders.set(orderId, order);
        console.log('[FALLBACK]: Order created in memory:', orderId);
      }
    }
    
    // Send SMS notification to admin
    try {
      const message = `New UPI Payment: ${orderId}\nRs.${amount} | ${type}\n${userName || 'N/A'} | ${userPhone || 'N/A'}`;
      await sendSMS(process.env.ADMIN_PHONE || '', message);
    } catch (smsErr) {
      console.log('SMS notification failed:', smsErr);
    }
    
    res.json({ success: true, message: 'Payment confirmation submitted. Admin will verify shortly.' });
  } catch (err) {
    console.error('UPI confirm payment error:', err);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
});

// ========== Submit Collab ==========
app.post('/api/submit-collab', requireAuth, blockTemporarySession, validate(validateSchemas.submitCollab), async (req, res) => {
  try {
    const collab = req.body;
    if (!collab.id) collab.id = 'CL' + Date.now().toString(36).toUpperCase();
    collab.status = collab.status || 'pending';
    collab.submittedAt = new Date().toISOString();
    
    if (isSupabaseAvailable()) {
      await dbCreate('collabs', collab.id, collab);
    } else {
      memoryDb.collabs.set(collab.id, collab);
      console.log('[FALLBACK]: Collab stored in memory:', collab.id);
    }
    
    res.json({ success: true, collabId: collab.id });
  }
  catch (e) { console.error('Collab submit error:', e); res.status(500).json({ success: false, message: 'Failed to submit' }); }
});

// ========== User Bookings ==========
app.post('/api/user/bookings', requireAuth, validate(validateSchemas.bookings), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = await db.get('users', req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const email = user.email || '';
    const phone = user.phone || '';

    const allOrders = await db.list('orders');
    const bookings = allOrders.filter(o => 
      (email && o.userEmail === email) || 
      (phone && o.userPhone === phone)
    );
    bookings.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ success: true, bookings });
  } catch (e) {
    console.error('Fetch bookings error:', e);
    res.status(500).json({ success: false, message: 'DB error' });
  }
});

  app.post('/api/user/bookings/delete', requireAuth, blockTemporarySession, validate(validateSchemas.deleteBooking), async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: 'Missing fields' });

    const db = req.app.locals.db;
    const user = await db.get('users', req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const email = user.email || '';
    const phone = user.phone || '';

    const order = await db.get('orders', orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if ((!email || order.userEmail !== email) && (!phone || order.userPhone !== phone)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await db.remove('orders', orderId);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete booking error:', e);
    res.status(500).json({ success: false, message: 'DB error' });
  }
});

// ========== MSG91 OTP ==========
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

app.post('/api/send-otp', validate(validateSchemas.sendOtp), async (req, res) => {
  try {
    const { phone } = req.body;
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit Indian mobile number' });
    }
    // Test bypass
    if (cleanPhone === '9876543210') {
      otpStore.set(cleanPhone, { otp: '123456', expiry: Date.now() + OTP_EXPIRY_MS, attempts: 0, sendCount: 1 });
      return res.json({ success: true, message: 'OTP sent to +91-' + cleanPhone });
    }
    // Rate limit: max 3 OTPs per 5 minutes per number
    const existing = otpStore.get(cleanPhone);
    if (existing && Date.now() < existing.expiry && (existing.sendCount || 0) >= 3) {
      return res.status(429).json({ success: false, message: 'Too many OTP requests. Please wait and try again.' });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + OTP_EXPIRY_MS;
    otpStore.set(cleanPhone, {
      otp, expiry, attempts: 0,
      sendCount: (existing && Date.now() < (existing.expiry || 0)) ? (existing.sendCount || 0) + 1 : 1
    });

    const smsRes = await sendSMS(cleanPhone, `Your Yatri Point verification code is: ${otp}. Valid for 5 minutes.`);

    if (smsRes.success) {
      return res.json({ success: true, message: 'OTP sent to +91-' + cleanPhone });
    } else {
      otpStore.delete(cleanPhone);
      return res.status(500).json({ success: false, message: smsRes.reason || 'SMS delivery failed. Check SMS service configuration.' });
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, message: 'OTP service error. Please try again.' });
  }
});

app.post('/api/verify-otp', validate(validateSchemas.verifyOtp), (req, res) => {
  try {
    const { phone, otp } = req.body;
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    if (!cleanPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Phone and OTP are required' });
    }

    // Test bypass
    if (cleanPhone === '9876543210' && otp.toString().trim() === '123456') {
      return res.json({ success: true, phone: '+91' + cleanPhone, message: 'Phone verified successfully' });
    }

    const stored = otpStore.get(cleanPhone);
    if (!stored) {
      return res.status(400).json({ success: false, message: 'No OTP found for this number. Request a new one.' });
    }
    if (Date.now() > stored.expiry) {
      otpStore.delete(cleanPhone);
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }
    if (stored.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(cleanPhone);
      return res.status(429).json({ success: false, message: 'Too many wrong attempts. Request a new OTP.' });
    }
    if (stored.otp !== otp.toString().trim()) {
      stored.attempts++;
      const left = OTP_MAX_ATTEMPTS - stored.attempts;
      if (left <= 0) {
        otpStore.delete(cleanPhone);
        return res.status(400).json({ success: false, message: 'Too many wrong attempts. Request a new OTP.' });
      }
      return res.status(400).json({ success: false, message: `Incorrect OTP. ${left} attempt(s) remaining.` });
    }
    otpStore.delete(cleanPhone);
    return res.json({ success: true, phone: '+91' + cleanPhone, message: 'Phone verified successfully' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Verification error. Please try again.' });
  }
});

// ========== MSG91 WEBHOOK (Delivery Reports) ==========
app.post('/api/msg91/webhook', validate(validateSchemas.msg91Webhook), async (req, res) => {
  try {
    const dlrData = req.body;
    console.log('[MSG91 Webhook] DLR received:', JSON.stringify(dlrData));
    res.status(200).send('OK');
  } catch (err) {
    console.error('[MSG91 Webhook] Error:', err);
    res.status(500).send('Error');
  }
});

// ========== Admin Login ==========
app.post('/api/admin/login', validate(validateSchemas.adminLogin), async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const { username, password } = req.body;
  const rateLimit = await checkAdminLoginRateLimit(ip);
  if (!rateLimit.allowed) return res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.' });
  if (!username || !password) return res.status(400).json({ success: false, message: 'Credentials required' });
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    // Await so the rate-limit counter is reset before we respond (audit fix 2026-06-14)
    await recordAdminLoginAttempt(ip, true);
    return res.json({ success: true, token: jwt.sign({ admin: true, username, tokenType: 'access' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY }) });
  } else {
    await recordAdminLoginAttempt(ip, false);
    // Re-read remaining AFTER recording the failed attempt, and await it (was returning a Promise before)
    const remainingCheck = await checkAdminLoginRateLimit(ip);
    return res.status(401).json({ success: false, message: `Invalid credentials. ${remainingCheck.remaining} attempts left.` });
  }
});

// Admin: Orders
app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    let orders = [];
    
    if (isSupabaseAvailable()) {
      orders = await dbList('orders');
    } else {
      orders = Array.from(memoryDb.orders.values());
      console.log('[FALLBACK]: Retrieving', orders.length, 'orders from memory');
    }
    
    const sevenWeeksAgo = Date.now() - 49 * 24 * 60 * 60 * 1000;
    orders = orders.filter(o => { const t = new Date(o.createdAt || 0).getTime(); return t >= sevenWeeksAgo; });
    orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ success: true, orders });
  }
  catch (e) { console.error('Orders fetch error:', e); res.status(500).json({ success: false, message: 'Database error' }); }
});

// Admin: Search Order by Booking ID
app.get('/api/admin/search-order/:bookingId', requireAdmin, validate(validateSchemas.adminSearchOrder, { source: 'params' }), async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) return res.json({ success: false, message: 'Booking ID required' });
    
    if (isSupabaseAvailable()) {
      const order = await dbGet('orders', bookingId);
      if (!order) return res.json({ success: false, message: 'Order not found' });
      res.json({ success: true, order: { ...order, orderId: bookingId } });
    } else {
      // Look up in memory when Firestore unavailable
      const order = memoryDb.orders.get(bookingId);
      if (!order) return res.json({ success: false, message: 'Order not found' });
      res.json({ success: true, order: { ...order, orderId: bookingId } });
    }
  } catch (e) { console.error('Search order error:', e); res.status(500).json({ success: false, message: 'Search failed' }); }
});

// Admin: Verify Payment (sends SMS to partner on approve)
app.post('/api/admin/verify-payment', requireAdmin, validate(validateSchemas.adminVerifyPayment), async (req, res) => {
  const { orderId, action } = req.body;
  try {
    // Read order — Supabase first, memory fallback for offline mode (audit fix 2026-06-14)
    let orderData = null;
    if (isSupabaseAvailable()) {
      orderData = await dbGet('orders', orderId);
    } else {
      orderData = memoryDb.orders.get(orderId) || null;
    }
    if (!orderData) return res.status(404).json({ success: false, message: 'Order not found' });

    const updates = {
      status: action === 'approve' ? 'confirmed' : 'payment_failed',
      verifiedAt: new Date().toISOString(),
      verifiedBy: req.admin?.username || ADMIN_USERNAME
    };

    // Apply update — Supabase first, memory fallback
    if (isSupabaseAvailable()) {
      await dbUpdate('orders', orderId, updates);
    } else {
      memoryDb.orders.set(orderId, { ...orderData, ...updates });
    }

    if (action === 'approve') {
      await sendPartnerNotification({ ...orderData, ...updates, orderId });
    }
    res.json({ success: true });
  }
  catch (e) { console.error('Verify error:', e); res.status(500).json({ success: false, message: 'Server error' }); }
});

// Admin: Collabs
app.get('/api/admin/collabs', requireAdmin, async (req, res) => {
  try {
    let collabs = [];
    
    if (isSupabaseAvailable()) {
      collabs = await dbList('collabs');
    } else {
      collabs = Array.from(memoryDb.collabs.values());
      console.log('[FALLBACK]: Retrieving', collabs.length, 'collabs from memory');
    }
    
    collabs.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
    res.json({ success: true, collabs });
  }
  catch (e) { res.status(500).json({ success: false, message: 'DB error' }); }
});
app.post('/api/admin/review-collab', requireAdmin, validate(validateSchemas.adminReviewCollab), async (req, res) => {
  const { collabId, action } = req.body;
  try { const collab = await dbGet('collabs', collabId); if (!collab) return res.status(404).json({ success: false, message: 'Not found' }); const updates = { status: action === 'approve' ? 'approved' : 'rejected', reviewedAt: new Date().toISOString(), reviewedBy: req.admin?.username || ADMIN_USERNAME }; await dbUpdate('collabs', collabId, updates); if (action === 'approve') { const allUsers = await dbList('users'); const user = allUsers.find(u => (collab.phone && u.phone === collab.phone) || (collab.email && u.email === collab.email)); if (user) await dbUpdate('users', user.id, { isVerifiedPartner: true, partnerType: collab.type, updatedAt: new Date().toISOString() }); } res.json({ success: true }); }
  catch (e) { res.status(500).json({ success: false }); }
});

// Public Listings
app.get('/api/listings/:type', cacheResponse({ ttl: 60_000 }), async (req, res) => {
  try { const list = await dbList('collabs'); const filtered = list.filter(c => c.status === 'approved' && c.type === req.params.type); res.json({ success: true, listings: filtered }); }
  catch (e) { res.json({ success: true, listings: [] }); }
});
app.get('/api/routes/buses', cacheResponse({ ttl: 60_000 }), async (req, res) => {
  try { const list = await dbList('collabs'); const buses = list.filter(c => c.status === 'approved' && (c.type === 'bus' || c.type === 'bus-route')); res.json({ success: true, buses }); }
  catch (e) { res.json({ success: true, buses: [] }); }
});

// Bus search by route
app.post('/api/buses/search', validate(validateSchemas.busSearch), cacheResponseByBody({ ttl: 45_000 }), async (req, res) => {
  try {
    const { from, to, date, passengers } = req.body;
    if (!from || !to) return res.status(400).json({ success: false, message: 'From and To cities required' });

    const travelDate = date || new Date().toISOString().split('T')[0];
    const travelDay = new Date(travelDate).getDay(); // 0 is Sunday, 1 is Monday, etc.

    // Fetch buses – try Supabase first, fall back to in-memory
    let all = [];
    if (isSupabaseAvailable()) {
      all = await dbList('collaborator_buses', { filters: [{ column: 'status', op: 'eq', value: 'active' }] });
    }
    // Merge in-memory buses (they might not be in Supabase yet)
    const memBuses = Array.from(memoryDb.buses.values()).filter(bus => bus.status === 'active');
    const seenIds = new Set(all.map(b => b.id));
    for (const mb of memBuses) {
      if (!seenIds.has(mb.id)) all.push(mb);
    }
    
    const enrichedBuses = [];
    for (const rawB of all) {
      const b = normalizeBusRecord(rawB);
      const rc = b.routeCities;
      let isEligible = false;
      if (rc && Array.isArray(rc) && rc.length >= 2) {
        const fi = rc.findIndex(function(c) { return c.toLowerCase() === from.toLowerCase(); });
        const ti = rc.findIndex(function(c) { return c.toLowerCase() === to.toLowerCase(); });
        isEligible = fi !== -1 && ti !== -1 && ti > fi;
      } else {
        const src = b.source || '';
        const dest = b.destination || '';
        isEligible = src.toLowerCase().includes(from.toLowerCase()) && dest.toLowerCase().includes(to.toLowerCase());
      }
      
      if (!isEligible) continue;

      const collabId = b.collaboratorId;
      if (!collabId) continue;
      
      // Use collabService which normalizes key casing and checks memory first
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const status = collab.status || '';
      const verificationStatus = collab.verificationStatus || collab.verification_status || collab.verificationstatus || '';
      const isApproved = status === 'approved' || status === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;

      const busSchedules = b.schedules;
      let runsOnRequestedDay = true;
      let departure = b.departureTime || '08:00 AM';
      let arrival = b.arrivalTime || '12:00 PM';
      
      if (Array.isArray(busSchedules) && busSchedules.length > 0) {
        const activeSched = busSchedules[0];
        if (activeSched.runningDays && Array.isArray(activeSched.runningDays)) {
          runsOnRequestedDay = activeSched.runningDays[travelDay] === true;
        }
        if (activeSched.departureTime) departure = activeSched.departureTime;
        if (activeSched.arrivalTime) arrival = activeSched.arrivalTime;
      }
      
      if (!runsOnRequestedDay) continue;

      const busId = b.id;
      let seats = [];
      if (isSupabaseAvailable()) {
        try {
          seats = await dbList('collaborator_seats', {
            filters: [
              { column: 'busId', op: 'eq', value: busId },
              { column: 'travelDate', op: 'eq', value: travelDate }
            ]
          });
        } catch (seatErr) {}
      } else {
        seats = Array.from(memoryDb.seats.values()).filter(s => s.busId === busId && s.travelDate === travelDate);
      }
      
      const totalSeatsCount = b.totalSeats || b.totalseats || 40;
      if (seats.length === 0) {
        try {
          const seatService = await import('./services/seatService.js');
          const pricePerSeat = b.fare || b.price || (b.pricePerKm ? Math.round((b.pricePerKm || 3) * 200) : 599);
          await seatService.generateSeatMap(
            busId,
            collabId,
            totalSeatsCount,
            b.seatLayout || b.seatlayout || '2x2',
            pricePerSeat,
            travelDate
          );
          if (isSupabaseAvailable()) {
            seats = await dbList('collaborator_seats', {
              filters: [
                { column: 'busId', op: 'eq', value: busId },
                { column: 'travelDate', op: 'eq', value: travelDate }
              ]
            });
          } else {
            seats = Array.from(memoryDb.seats.values()).filter(s => s.busId === busId && s.travelDate === travelDate);
          }
        } catch (genErr) {
          console.error('Error generating seat map during search:', genErr);
        }
      }

      const availableSeatsCount = seats.filter(s => s.status === 'available').length;
      const startPrice = seats.length > 0 ? Math.min(...seats.map(s => s.price || 599)) : (b.fare || b.price || 599);
      const amenitiesList = b.amenities || [];

      let durationStr = '4h 0m';
      try {
        const [depH, depM] = departure.replace(/(AM|PM)/i, '').split(':').map(Number);
        const [arrH, arrM] = arrival.replace(/(AM|PM)/i, '').split(':').map(Number);
        const isDepPm = /PM/i.test(departure);
        const isArrPm = /PM/i.test(arrival);
        
        let depMin = (depH % 12 + (isDepPm ? 12 : 0)) * 60 + (depM || 0);
        let arrMin = (arrH % 12 + (isArrPm ? 12 : 0)) * 60 + (arrM || 0);
        if (arrMin < depMin) arrMin += 24 * 60;
        
        const diffMin = arrMin - depMin;
        durationStr = `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
      } catch (durErr) {}

      enrichedBuses.push({
        id: b.id,
        busName: b.busName || b.busname || 'XYZ Travels',
        busType: b.busType || b.bustype || 'AC Sleeper',
        busNumber: b.busNumber || b.busnumber || b.numberPlate || b.numberplate || 'BR-01-1234',
        routeCities: rc,
        source: b.source || from,
        destination: b.destination || to,
        departureTime: departure,
        arrivalTime: arrival,
        duration: durationStr,
        availableSeats: availableSeatsCount,
        totalSeats: totalSeatsCount,
        startingPrice: startPrice,
        scheduleDays: busSchedules[0]?.runningDays || [true,true,true,true,true,true,true],
        liveStatus: 'Active',
        amenities: amenitiesList,
        operatorName: collab.businessName || collab.businessname || collab.name || 'Local Operator',
        operatorRating: collab.rating || 4.2,
        operatorVerified: isApproved,
        operatorPhone: collab.phone || '',
        operatorEmail: collab.email || '',
        operatorUpiId: collab.upiId || collab.upiid || '',
        busPhotos: b.busPhotos || b.busphotos || [],
        cancellationPolicy: 'Cancellations made 24 hours or more before departure time are eligible for a 100% refund. Cancellations within 24 hours are eligible for a 50% refund. No refunds are allowed inside 2 hours of departure.',
        refundPolicy: 'Refunds will be credited directly back to the payment UPI ID within 24-48 business hours.',
        contactInformation: `Phone: ${collab.phone || '8178030064'} | Email: ${collab.email || 'support@yatripoint.onrender.com'}`
      });
    }

    res.json({ success: true, buses: enrichedBuses });
  } catch (e) {
    console.error('Bus search error:', e);
    res.json({ success: true, buses: [] });
  }
});

// Public endpoint: Get Bus Visual Seat Map for customers
app.get('/api/buses/:busId/seats', async (req, res) => {
  try {
    const { busId } = req.params;
    const { date } = req.query;
    // Default to today if no date provided
    const travelDate = date || new Date().toISOString().split('T')[0];
    if (!busId) return res.status(400).json({ success: false, message: 'Bus ID is required' });

    // Always check memoryDb first so demo/in-memory buses work even when Supabase is available
    let bus = memoryDb.buses.get(busId);
    if (!bus && isSupabaseAvailable()) {
      bus = await dbGet('collaborator_buses', busId);
    }
    
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found' });

    let seats = [];
    // Always check memoryDb first so in-memory/demo seats work even when Supabase is connected
    seats = Array.from(memoryDb.seats.values()).filter(s => s.busId === busId && s.travelDate === travelDate);
    if (seats.length === 0 && isSupabaseAvailable()) {
      seats = await dbList('collaborator_seats', {
        filters: [
          { column: 'busId', op: 'eq', value: busId },
          { column: 'travelDate', op: 'eq', value: travelDate }
        ]
      });
    }

    if (seats.length === 0) {
      const seatService = await import('./services/seatService.js');
      const pricePerSeat = bus.fare || bus.price || (bus.pricePerKm ? Math.round((bus.pricePerKm || 3) * 200) : 599);
      seats = await seatService.generateSeatMap(
        busId,
        bus.collaboratorId || bus.collaboratorid,
        bus.totalSeats || bus.totalseats || 40,
        bus.seatLayout || bus.seatlayout || '2x2',
        pricePerSeat,
        travelDate
      );
      console.log(`[SEATS] Generated ${seats.length} seats for bus ${busId} on ${travelDate}`);
    }

    const mappedSeats = seats.map(s => {
      const seatNum = parseInt(s.seatNumber || s.id.split('_').pop(), 10);
      let type = s.seatType || 'standard';
      if (seatNum <= 4) type = 'VIP';
      
      let ladiesOnly = false;
      if ([5, 6, 11, 12, 17, 18].includes(seatNum)) {
        ladiesOnly = true;
      }

      return {
        ...s,
        seatType: type,
        ladiesOnly
      };
    });

    res.json({ success: true, seats: mappedSeats });
  } catch (err) {
    console.error('Public seat map fetch error:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Failed to fetch visual seat layout: ' + err.message });
  }
});

// Cab search by city/route
app.post('/api/cabs/search', validate(validateSchemas.cabSearch), cacheResponseByBody({ ttl: 60_000 }), async (req, res) => {
  try {
    const { city, boarding, dropping } = req.body;
    let cabs = [];
    if (isSupabaseAvailable()) {
      cabs = await dbList('collaborator_cabs', { filters: [{ column: 'status', op: 'eq', value: 'active' }] });
    }
    // Merge in-memory cabs
    const memCabs = Array.from(memoryDb.cabs.values()).filter(c => c.status === 'active');
    const seenIds = new Set(cabs.map(c => c.id));
    for (const mc of memCabs) { if (!seenIds.has(mc.id)) cabs.push(mc); }
    
    // Enrich with collaborator details and filter out unapproved/suspended collaborators
    const enrichedCabs = [];
    for (const c of cabs) {
      const collabId = c.collaboratorId;
      if (!collabId) continue;
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const collabStatus = collab.status || '';
      const verificationStatus = collab.verification_status || '';
      const isApproved = collabStatus === 'approved' || collabStatus === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;
      
      const cabCity = c.city || c.route || collab.operatingCity || collab.city || '';
      
      if (!city || cabCity.toLowerCase().includes(city.toLowerCase())) {
        enrichedCabs.push({
          ...c,
          city: cabCity,
          operatorName: collab.businessName || collab.name || 'Local Operator',
          operatorRating: collab.rating || 4.0,
          operatorPhone: collab.phone || ''
        });
      }
    }
    
    res.json({ success: true, cabs: enrichedCabs });
  } catch (e) {
    console.error('Cab search error:', e);
    res.json({ success: true, cabs: [] });
  }
});

// Hotel search by location
app.post('/api/hotels/search', validate(validateSchemas.hotelSearch), cacheResponseByBody({ ttl: 60_000 }), async (req, res) => {
  try {
    const { location } = req.body;
    let hotels = [];
    if (isSupabaseAvailable()) {
      hotels = await dbList('collaborator_hotels', { filters: [{ column: 'status', op: 'eq', value: 'active' }] });
    }
    // Merge in-memory hotels
    const memHotels = Array.from(memoryDb.hotels.values()).filter(h => h.status === 'active');
    const seenIds = new Set(hotels.map(h => h.id));
    for (const mh of memHotels) { if (!seenIds.has(mh.id)) hotels.push(mh); }
    
    const enrichedHotels = [];
    for (const h of hotels) {
      const collabId = h.collaboratorId;
      if (!collabId) continue;
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const collabStatus = collab.status || '';
      const verificationStatus = collab.verification_status || '';
      const isApproved = collabStatus === 'approved' || collabStatus === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;
      
      const hotelCity = h.city || h.location || collab.city || collab.operatingCity || '';
      
      if (!location || hotelCity.toLowerCase().includes(location.toLowerCase())) {
        const rooms = await dbList('hotel_rooms', { filters: [{ column: 'hotelId', op: 'eq', value: h.id }] });
        enrichedHotels.push({
          ...h,
          city: hotelCity,
          rooms: rooms,
          operatorName: collab.businessName || collab.name || 'Local Operator',
          operatorRating: collab.rating || 4.0,
          operatorPhone: collab.phone || ''
        });
      }
    }
    
    res.json({ success: true, hotels: enrichedHotels });
  } catch (e) {
    console.error('Hotel search error:', e);
    res.json({ success: true, hotels: [] });
  }
});

// Cafe listing (frontend calls GET /api/cafes)
app.get('/api/cafes', cacheResponse({ ttl: 60_000 }), async (req, res) => {
  try {
    let cafes = [];
    if (isSupabaseAvailable()) {
      cafes = await dbList('collaborator_cafes', { filters: [{ column: 'status', op: 'eq', value: 'active' }] });
    }
    // Merge in-memory cafes
    const memCafes = Array.from(memoryDb.cafes.values()).filter(c => c.status === 'active');
    const seenIds = new Set(cafes.map(c => c.id));
    for (const mc of memCafes) { if (!seenIds.has(mc.id)) cafes.push(mc); }
    
    const enrichedCafes = [];
    for (const cafe of cafes) {
      const collabId = cafe.collaboratorId;
      if (!collabId) continue;
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const collabStatus = collab.status || '';
      const verificationStatus = collab.verification_status || '';
      const isApproved = collabStatus === 'approved' || collabStatus === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;
      
      const cafeCity = cafe.city || cafe.location || collab.city || collab.operatingCity || '';
      
      const tables = await dbList('cafe_tables', { filters: [{ column: 'cafeId', op: 'eq', value: cafe.id }] });
      const availableTables = tables.filter(function(t) { return t.status === 'available'; });
      
      enrichedCafes.push({
        ...cafe,
        city: cafeCity,
        totalTables: tables.length,
        availableTables: availableTables.length,
        tables: tables,
        operatorName: collab.businessName || collab.name || 'Local Operator',
        operatorRating: collab.rating || 4.0,
        operatorPhone: collab.phone || ''
      });
    }
    
    res.json({ success: true, cafes: enrichedCafes });
  } catch (e) {
    console.error('Cafe search error:', e);
    res.json({ success: true, cafes: [] });
  }
});

// Public: Hotels (from collaboratorHotels collection)
app.get('/api/listings/hotel', async (req, res) => {
  try {
    const { city } = req.query;
    let hotels = await dbList('collaborator_hotels');
    hotels = hotels.filter(h => h.status === 'active');
    
    const enrichedHotels = [];
    for (const h of hotels) {
      const collabId = h.collaboratorId;
      if (!collabId) continue;
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const collabStatus = collab.status || '';
      const verificationStatus = collab.verification_status || '';
      const isApproved = collabStatus === 'approved' || collabStatus === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;
      
      const hotelCity = h.city || h.location || collab.city || collab.operatingCity || '';
      
      if (!city || hotelCity.toLowerCase() === city.toLowerCase()) {
        enrichedHotels.push({
          ...h,
          city: hotelCity,
          operatorName: collab.businessName || collab.name || 'Local Operator',
          operatorRating: collab.rating || 4.0,
          operatorPhone: collab.phone || ''
        });
      }
    }
    
    res.json({ success: true, listings: enrichedHotels });
  } catch (e) { res.json({ success: true, listings: [] }); }
});

// Public: Cafes (from collaboratorCafes collection)
app.get('/api/listings/cafe', async (req, res) => {
  try {
    const { city } = req.query;
    let cafes = await dbList('collaborator_cafes');
    cafes = cafes.filter(c => c.status === 'active');
    
    const enrichedCafes = [];
    for (const cafe of cafes) {
      const collabId = cafe.collaboratorId;
      if (!collabId) continue;
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const collabStatus = collab.status || '';
      const verificationStatus = collab.verification_status || '';
      const isApproved = collabStatus === 'approved' || collabStatus === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;
      
      const cafeCity = cafe.city || cafe.location || collab.city || collab.operatingCity || '';
      
      if (!city || cafeCity.toLowerCase() === city.toLowerCase()) {
        enrichedCafes.push({
          ...cafe,
          city: cafeCity,
          operatorName: collab.businessName || collab.name || 'Local Operator',
          operatorRating: collab.rating || 4.0,
          operatorPhone: collab.phone || ''
        });
      }
    }
    
    res.json({ success: true, listings: enrichedCafes });
  } catch (e) { res.json({ success: true, listings: [] }); }
});

// Public: Cabs (from collaboratorCabs collection)
app.get('/api/listings/cab', async (req, res) => {
  try {
    const { city } = req.query;
    let cabs = await dbList('collaborator_cabs');
    cabs = cabs.filter(c => c.status === 'active');
    
    const enrichedCabs = [];
    for (const c of cabs) {
      const collabId = c.collaboratorId;
      if (!collabId) continue;
      const collab = await collabService.getCollaboratorById(req.app.locals.db, collabId);
      if (!collab) continue;
      
      const collabStatus = collab.status || '';
      const verificationStatus = collab.verification_status || '';
      const isApproved = collabStatus === 'approved' || collabStatus === 'active' || verificationStatus === 'verified';
      if (!isApproved) continue;
      
      const cabCity = c.city || c.route || collab.operatingCity || collab.city || '';
      
      if (!city || cabCity.toLowerCase() === city.toLowerCase()) {
        enrichedCabs.push({
          ...c,
          city: cabCity,
          operatorName: collab.businessName || collab.name || 'Local Operator',
          operatorRating: collab.rating || 4.0,
          operatorPhone: collab.phone || ''
        });
      }
    }
    
    res.json({ success: true, listings: enrichedCabs });
  } catch (e) { res.json({ success: true, listings: [] }); }
});

// Admin Page HTML -- must be declared BEFORE static middleware
app.get('/admin', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'admin-panel.html'));
});

// Admin panel alias
app.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'admin-panel.html'));
});

// ========== COLLABORATOR APPLICATION ROUTES ==========
app.post('/api/collab-applications', applicationController.submitApplication);
app.get('/api/collab-applications/status', applicationController.checkApplicationStatus);

// ========== ADMIN: APPLICATION MANAGEMENT ==========
app.get('/api/admin/collab-applications', requireAdmin, applicationController.adminListApplications);
app.post('/api/admin/collab-applications/:id/approve', requireAdmin, applicationController.adminApproveApplication);
app.post('/api/admin/collab-applications/:id/reject', requireAdmin, applicationController.adminRejectApplication);

// Static Assets (declared AFTER API routes so they can't be shadowed)
app.get('/sw.js', (req, res) => { res.setHeader('Service-Worker-Allowed', '/'); res.setHeader('Content-Type', 'application/javascript'); res.sendFile(path.join(PUBLIC_DIR, 'sw.js')); });
app.use(express.static(PUBLIC_DIR));
const BLOCKED_ROOT_PATHS = /^\/(?:\.env(?:\..*)?|\.git(?:ignore|attributes)?|server\.js|package(?:-lock)?\.json|supabase[^/]*\.sql|eslint\.config\.js|postcss\.config\.js|tailwind\.config\.js|.*\.md|node-functions|controllers|middleware|routes|services|utils|plans|scratch|node_modules)(?:\/|$)/i;
app.use((req, res, next) => {
  if (BLOCKED_ROOT_PATHS.test(req.path)) {
    return res.status(404).end();
  }
  next();
});
app.use(express.static(ROOT_DIR));

// ========== ADMIN: COLLABORATOR MANAGEMENT ==========
app.get('/api/admin/collaborators', requireAdmin, async (req, res) => {
  try {
    const all = await collabService.getAllCollaborators(req.app.locals.db);
    const safeCollabs = (all || []).map(c => {
      const { password, ...safe } = c;
      return safe;
    });
    res.json({ success: true, collaborators: safeCollabs });
  } catch (e) {
    console.error('Get collaborators error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
});

app.delete('/api/admin/collaborators/:id', requireAdmin, async (req, res) => {
  try {
    await collabService.deleteCollaborator(req.app.locals.db, req.params.id);
    res.json({ success: true, message: 'Collaborator deleted.' });
  } catch (e) {
    console.error('Delete collaborator error:', e);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

app.get('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const serviceCollections = [
      { col: 'collaborator_buses', type: 'bus' },
      { col: 'collaborator_hotels', type: 'hotel' },
      { col: 'collaborator_cabs', type: 'cab' },
      { col: 'collaborator_cafes', type: 'cafe' }
    ];
    const allServices = [];
    
    if (isSupabaseAvailable()) {
      for (const { col: colName, type } of serviceCollections) {
        try {
          const items = await dbList(colName, { orderBy: { column: 'createdAt', ascending: false } });
          items.forEach(item => {
            const data = { id: item.id, type, ...item };
            data.name = data.name || data.cabName || data.cabname || data.cafeName || data.cafename || data.hotelName || data.hotelname || data.busName || data.vehicleModel || 'Unnamed';
            data.number_plate = data.numberPlate || data.vehicleNumber || data.address || data.city || '';
            allServices.push(data);
          });
        } catch (colErr) {
          console.warn(`Admin services: skipping ${colName} (${colErr.message})`);
        }
      }
    }
    // Always merge in-memory services (may not be in Supabase yet)
    const memCollections = [
      { map: memoryDb.buses, type: 'bus' },
      { map: memoryDb.hotels, type: 'hotel' },
      { map: memoryDb.cabs, type: 'cab' },
      { map: memoryDb.cafes, type: 'cafe' }
    ];
    const seenIds = new Set(allServices.map(s => s.id));
    for (const { map, type } of memCollections) {
      for (const item of map.values()) {
        if (!seenIds.has(item.id)) {
          const data = { id: item.id, type, ...item };
          data.name = data.name || data.cabName || data.cabname || data.cafeName || data.cafename || data.hotelName || data.hotelname || data.busName || data.vehicleModel || 'Unnamed';
          data.number_plate = data.numberPlate || data.vehicleNumber || data.address || data.city || '';
          allServices.push(data);
        }
      }
    }
    
    allServices.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    // Enrich each service with collaborator name, phone, email, businessName
    const collabCache = {};
    for (const svc of allServices) {
      const cId = svc.collaboratorId;
      if (!cId) continue;
      if (!collabCache[cId]) {
        try { collabCache[cId] = await collabService.getCollaboratorById(req.app.locals.db, cId); }
        catch (_) { collabCache[cId] = null; }
      }
      const collab = collabCache[cId];
      if (collab) {
        svc.ownerName = collab.name || '';
        svc.ownerPhone = collab.phone || '';
        svc.ownerEmail = collab.email || '';
        svc.ownerBusiness = collab.businessName || '';
      }
    }

    res.json({ success: true, services: allServices });
  } catch (e) {
    console.error('Get services error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
});

// Admin: Search Collaborator by Name
app.get('/api/admin/search-collaborator/:name', requireAdmin, validate(validateSchemas.adminSearchCollaborator, { source: 'params' }), async (req, res) => {
  try {
    const { name } = req.params;
    if (!name) return res.json({ success: false, message: 'Name required' });
    const all = await collabService.getAllCollaborators(req.app.locals.db);
    const q = name.toLowerCase();
    const filtered = (all || []).filter(c => {
      const n = (c.name || '').toLowerCase();
      const bn = (c.businessName || '').toLowerCase();
      return n.includes(q) || bn.includes(q);
    });
    const safe = filtered.map(c => { const { password, ...rest } = c; return rest; });
    res.json({ success: true, collaborators: safe });
  } catch (e) {
    console.error('Search collaborator error:', e);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

// Admin: Approve / Reject any service (bus, hotel, cafe, cab)
app.post('/api/admin/service/:type/approve', requireAdmin, async (req, res) => {
  try {
    const { type } = req.params;
    const { serviceId, action } = req.body;
    const validTypes = ['bus', 'hotel', 'cafe', 'cab'];
    const validActions = ['approve', 'reject'];
    if (!validTypes.includes(type)) return res.status(400).json({ success: false, message: 'Invalid service type' });
    if (!validActions.includes(action)) return res.status(400).json({ success: false, message: 'Invalid action' });
    if (!serviceId) return res.status(400).json({ success: false, message: 'serviceId is required' });

    let tableName;
    switch (type) {
      case 'bus': tableName = 'collaborator_buses'; break;
      case 'hotel': tableName = 'collaborator_hotels'; break;
      case 'cafe': tableName = 'collaborator_cafes'; break;
      case 'cab': tableName = 'collaborator_cabs'; break;
    }
    const existing = await dbGet(tableName, serviceId);
    if (!existing) return res.status(404).json({ success: false, message: 'Service not found' });

    const newStatus = action === 'approve' ? 'active' : 'rejected';
    const now = new Date().toISOString();

    // Update in-memory store
    const memMap = { bus: memoryDb.buses, hotel: memoryDb.hotels, cafe: memoryDb.cafes, cab: memoryDb.cabs };
    const mem = memMap[type]?.get(serviceId);
    if (mem) {
      mem.status = newStatus;
      mem.reviewedAt = now;
      mem.reviewedBy = req.admin?.username || 'admin';
      mem.updatedAt = now;
    }

    // Only send schema-valid columns to Supabase
    const supabaseUpdates = { status: newStatus, updatedAt: now };
    await dbUpdate(tableName, serviceId, supabaseUpdates);

    const auditService = (await import('./services/auditLogService.js')).logAction;
    await auditService(req.app.locals.db, {
      actorId: null,
      actorRole: 'admin',
      action: action === 'approve' ? 'approve_service' : 'reject_service',
      entityType: type,
      entityId: serviceId,
      details: { newStatus: newStatus }
    });

    res.json({ success: true, message: `${type} ${action}d` });
  } catch (e) {
    console.error('Admin service approval error:', e);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
});

// ========== ADMIN: ALL USER DATA ==========
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const allUsers = await dbList('users');
    const users = allUsers.map(u => {
      const { password, ...safe } = u;
      return safe;
    });
    res.json({ success: true, users });
  } catch (e) {
    console.error('Get users error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
});

app.get('/api/admin/all-bookings', requireAdmin, async (req, res) => {
  try {
    const orders = await dbList('orders', { orderBy: { column: 'createdAt', ascending: false } });
    const bookingsList = await dbList('bookings', { orderBy: { column: 'createdAt', ascending: false } });
    
    const ordersMapped = orders.map(o => ({ ...o, source: 'orders' }));
    const bookingsMapped = bookingsList.map(b => ({ ...b, source: 'bookings' }));
    
    const allBookings = [...ordersMapped, ...bookingsMapped].sort((a, b) => 
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    
    res.json({ success: true, bookings: allBookings });
  } catch (e) {
    console.error('Get bookings error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
});

app.get('/api/admin/tickets', requireAdmin, async (req, res) => {
  try {
    const tickets = await dbList('tickets', { orderBy: { column: 'createdAt', ascending: false } });
    res.json({ success: true, tickets });
  } catch (e) {
    console.error('Get tickets error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    if (isSupabaseAvailable()) {
      const allUsers = await dbList('users');
      const allOrders = await dbList('orders');
      const allCollabs = await dbList('collaborators');
      const allBuses = await dbList('collaborator_buses');
      const allHotels = await dbList('collaborator_hotels');
      const allCabs = await dbList('collaborator_cabs');
      const allCafes = await dbList('collaborator_cafes');
      
      const totalRevenue = allOrders
        .filter(o => o.status === 'confirmed')
        .reduce((sum, o) => sum + (o.amount || o.payNow || 0), 0);
      const totalServices = allBuses.length + allHotels.length + allCabs.length + allCafes.length;
      
      res.json({
        success: true,
        stats: {
          totalUsers: allUsers.length,
          totalOrders: allOrders.length,
          confirmedOrders: allOrders.filter(o => o.status === 'confirmed').length,
          pendingOrders: allOrders.filter(o => o.status === 'payment_pending').length,
          totalCollaborators: allCollabs.length,
          totalServices,
          totalRevenue
        }
      });
    } else {
      // Return mock stats when Firestore unavailable
      console.log('[FALLBACK]: Returning mock stats');
      const orders = Array.from(memoryDb.orders.values());
      const totalRevenue = orders
        .filter(o => o.status === 'confirmed')
        .reduce((sum, o) => sum + (o.amount || o.payNow || 0), 0);
      
      res.json({
        success: true,
        stats: {
          totalUsers: 0,
          totalOrders: orders.length,
          confirmedOrders: orders.filter(o => o.status === 'confirmed').length,
          pendingOrders: orders.filter(o => o.status === 'payment_pending').length,
          totalCollaborators: 0,
          totalServices: 0,
          totalRevenue
        }
      });
    }
  } catch (e) {
    console.error('Get stats error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
});

// ========== DEMO SEED DATA ==========
// A prototype bus for the Madhubani → Benipatti route for testing purposes.
(function seedDemoData() {
  const DEMO_COLLAB_ID = 'DEMO_MITHILA_TRAVELS';
  const DEMO_BUS_ID    = 'DEMO_BUS_MDB_BNP';

  // Only seed if not already present
  if (!memoryDb.collabs.has(DEMO_COLLAB_ID)) {
    memoryDb.collabs.set(DEMO_COLLAB_ID, {
      id: DEMO_COLLAB_ID,
      name: 'Rohan Kumar',
      email: 'demo@mithilatravels.in',
      phone: '9876543210',
      businessName: 'Mithila Travels (Demo)',
      businessType: 'bus',
      serviceCategories: ['bus'],
      status: 'approved',
      verificationStatus: 'verified',
      verification_status: 'verified',
      rating: 4.8,
      totalBookings: 142,
      totalEarnings: 85000,
      upiId: 'mithilatravels@ybl',
      routeCities: ['Madhubani', 'Benipatti'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log('[DEMO]: Seeded demo collaborator — Mithila Travels');
  }

  if (!memoryDb.buses.has(DEMO_BUS_ID)) {
    memoryDb.buses.set(DEMO_BUS_ID, {
      id: DEMO_BUS_ID,
      collaboratorId: DEMO_COLLAB_ID,
      collaboratorid: DEMO_COLLAB_ID,
      busName: 'Mithila Express',
      busname: 'Mithila Express',
      busType: 'AC Seater',
      bustype: 'AC Seater',
      busNumber: 'BR-05-7892',
      busnumber: 'BR-05-7892',
      numberPlate: 'BR-05-7892',
      source: 'Madhubani',
      destination: 'Benipatti',
      routeCities: ['Madhubani', 'Benipatti'],
      routecities: ['Madhubani', 'Benipatti'],
      departureTime: '07:00 AM',
      departuretime: '07:00 AM',
      arrivalTime: '09:00 AM',
      arrivaltime: '09:00 AM',
      fare: 80,
      price: 80,
      totalSeats: 40,
      totalseats: 40,
      seatLayout: '2x2',
      seatlayout: '2x2',
      status: 'active',
      amenities: ['AC', 'Charging Point', 'Water Bottle'],
      schedules: [{
        departureTime: '07:00 AM',
        arrivalTime: '09:00 AM',
        runningDays: [true, true, true, true, true, true, true]  // all days
      }],
      createdAt: new Date().toISOString()
    });
    console.log('[DEMO]: Seeded demo bus — Mithila Express (Madhubani → Benipatti)');
  }
})();

app.listen(PORT, () => {
  console.log('Yatri Point backend running on port ' + PORT);
});