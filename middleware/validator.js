/**
 * Schema-based request validation for Yatri Point.
 * =================================================
 *
 * Two layers:
 *   1. `sanitizeInput(obj)` — strip XSS-ish characters and trim strings. Kept
 *      from the original implementation; still applied to incoming bodies.
 *   2. `validate(schema)`  — Express middleware that:
 *        - runs `sanitizeInput` on `req.body`
 *        - checks each field in `schema` against a set of built-in rules
 *        - returns 400 with `{ success: false, errors: [{ field, message }] }`
 *
 * Why schema-based: a single source of truth per route, no more `if (!foo)
 * return 400` scattered across the codebase. Easy to extend, easy to test.
 *
 * Example
 * -------
 *   import { validate, schemas } from '../middleware/validator.js';
 *
 *   app.post('/api/buses/search',
 *       validate(schemas.busSearch),
 *       cacheResponseByBody({ ttl: 45_000 }),
 *       async (req, res) => { ... });
 *
 *   // Custom field rule:
 *   const mySchema = {
 *     name:   { type: 'string', required: true, minLength: 2, maxLength: 50 },
 *     age:    { type: 'number', required: true, min: 0, max: 120, integer: true },
 *     role:   { type: 'enum', values: ['admin','user'], default: 'user' },
 *     tags:   { type: 'string[]', max: 5 },
 *     joined: { type: 'date', before: 'now' },
 *   };
 */

export function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Preserve arrays as arrays (previous implementation converted arrays to plain objects)
  if (Array.isArray(obj)) {
    return obj.map(v => sanitizeInput(v));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = value.trim().replace(/[<>]/g, '');
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(v => sanitizeInput(v));
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/* ----------------------------------------------------------------------
 * Field-level type rules
 * ---------------------------------------------------------------------- */

const RULES = {
  string(value, rule) {
    if (typeof value !== 'string') return `${rule.label || rule.field} must be a string`;
    if (rule.minLength != null && value.length < rule.minLength)
      return `${rule.label || rule.field} must be at least ${rule.minLength} characters`;
    if (rule.maxLength != null && value.length > rule.maxLength)
      return `${rule.label || rule.field} must be at most ${rule.maxLength} characters`;
    if (rule.pattern && !rule.pattern.test(value))
      return rule.patternMessage || `${rule.label || rule.field} has an invalid format`;
    if (rule.choices && !rule.choices.includes(value))
      return `${rule.label || rule.field} must be one of: ${rule.choices.join(', ')}`;
    return null;
  },

  number(value, rule) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof n !== 'number' || Number.isNaN(n))
      return `${rule.label || rule.field} must be a number`;
    if (!Number.isFinite(n))
      return `${rule.label || rule.field} must be a finite number`;
    if (rule.integer && !Number.isInteger(n))
      return `${rule.label || rule.field} must be a whole number`;
    if (rule.min != null && n < rule.min)
      return `${rule.label || rule.field} must be ≥ ${rule.min}`;
    if (rule.max != null && n > rule.max)
      return `${rule.label || rule.field} must be ≤ ${rule.max}`;
    return null;
  },

  boolean(value, rule) {
    if (typeof value === 'boolean') return null;
    if (value === 'true' || value === 'false' || value === 1 || value === 0) return null;
    return `${rule.label || rule.field} must be a boolean`;
  },

  enum(value, rule) {
    if (!Array.isArray(rule.values) || rule.values.length === 0)
      throw new Error(`enum rule for "${rule.field}" needs a non-empty values[]`);
    if (!rule.values.includes(value))
      return `${rule.label || rule.field} must be one of: ${rule.values.join(', ')}`;
    return null;
  },

  date(value, rule) {
    // Accept ISO yyyy-mm-dd or full ISO datetime
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime()))
      return `${rule.label || rule.field} must be a valid date`;
    if (rule.after) {
      const ref = rule.after === 'now' ? new Date() : new Date(rule.after);
      if (d <= ref) return `${rule.label || rule.field} must be after ${rule.after}`;
    }
    if (rule.before) {
      const ref = rule.before === 'now' ? new Date() : new Date(rule.before);
      if (d >= ref) return `${rule.label || rule.field} must be before ${rule.before}`;
    }
    if (rule.future && d.getTime() <= Date.now())
      return `${rule.label || rule.field} must be in the future`;
    if (rule.past && d.getTime() >= Date.now())
      return `${rule.label || rule.field} must be in the past`;
    return null;
  },

  email(value, rule) {
    if (typeof value !== 'string') return `${rule.label || rule.field} must be a string`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      return rule.message || `${rule.label || rule.field} must be a valid email`;
    return null;
  },

  phone(value, rule) {
    if (typeof value !== 'string') return `${rule.label || rule.field} must be a string`;
    const digits = value.replace(/\D/g, '');
    const phone = digits.slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone))
      return rule.message || `${rule.label || rule.field} must be a valid 10-digit Indian mobile`;
    return null;
  },

  object(value, rule) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return `${rule.label || rule.field} must be an object`;
    if (rule.fields) {
      // Recurse into nested schema
      const nested = validateSchema(value, rule.fields);
      // Prefix field names with parent path
      for (const e of nested) e.field = `${rule.field}.${e.field}`;
      return nested;
    }
    return null;
  },

  array(value, rule) {
    if (!Array.isArray(value))
      return `${rule.label || rule.field} must be an array`;
    if (rule.min != null && value.length < rule.min)
      return `${rule.label || rule.field} must have at least ${rule.min} items`;
    if (rule.max != null && value.length > rule.max)
      return `${rule.label || rule.field} must have at most ${rule.max} items`;
    if (rule.itemType && rule.fields) {
      const errors = [];
      value.forEach((item, i) => {
        const itemErrors = validateSchema(item, rule.fields);
        for (const e of itemErrors) e.field = `${rule.field}[${i}].${e.field}`;
        errors.push(...itemErrors);
      });
      if (errors.length) return errors;
    }
    return null;
  },

  // Composite types
  'string[]'(value, rule) {
    if (!Array.isArray(value))
      return `${rule.label || rule.field} must be an array of strings`;
    if (rule.max != null && value.length > rule.max)
      return `${rule.label || rule.field} must have at most ${rule.max} items`;
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string')
        return `${rule.label || rule.field}[${i}] must be a string`;
      if (rule.maxLength != null && value[i].length > rule.maxLength)
        return `${rule.label || rule.field}[${i}] must be at most ${rule.maxLength} characters`;
    }
    return null;
  },

  'number[]'(value, rule) {
    if (!Array.isArray(value))
      return `${rule.label || rule.field} must be an array of numbers`;
    if (rule.max != null && value.length > rule.max)
      return `${rule.label || rule.field} must have at most ${rule.max} items`;
    for (let i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'number' || Number.isNaN(value[i]))
        return `${rule.label || rule.field}[${i}] must be a number`;
    }
    return null;
  },

  url(value, rule) {
    if (typeof value !== 'string') return `${rule.label || rule.field} must be a string`;
    try { new URL(value); return null; }
    catch { return rule.message || `${rule.label || rule.field} must be a valid URL`; }
  },

  uuid(value, rule) {
    if (typeof value !== 'string') return `${rule.label || rule.field} must be a string`;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
      return rule.message || `${rule.label || rule.field} must be a valid UUID`;
    return null;
  },
};

/* ----------------------------------------------------------------------
 * Internal: run a schema against an object, returning [{ field, message }]
 * ---------------------------------------------------------------------- */
function validateSchema(data, schema) {
  const errors = [];
  if (data == null) data = {};

  for (const [field, rawRule] of Object.entries(schema)) {
    const rule = { field, ...rawRule };
    const label = rule.label || field;
    const present = data[field] !== undefined && data[field] !== null && data[field] !== '';

    // Required
    if (rule.required && !present) {
      errors.push({ field, message: `${label} is required` });
      continue;
    }

    // Skip non-required missing fields
    if (!present) {
      if ('default' in rule) data[field] = rule.default;
      continue;
    }

    // Type check
    const type = rule.type;
    const ruleFn = RULES[type];
    if (!ruleFn) {
      // unknown rule — programmer error, not a user error
      console.warn(`[validator] unknown type "${type}" for field "${field}"`);
      continue;
    }

    const result = ruleFn(data[field], rule);
    if (result) {
      if (Array.isArray(result)) errors.push(...result);
      else errors.push({ field, message: result });
    }
  }
  return errors;
}

/* ----------------------------------------------------------------------
 * Express middleware factory
 * ---------------------------------------------------------------------- */
export function validate(schema, opts = {}) {
  const source = opts.source || 'body'; // 'body' | 'query' | 'params'

  return function validateMw(req, res, next) {
    // Always sanitize body (in case caller didn't)
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeInput(req.body);
    }

    const target = req[source] || {};
    const errors = validateSchema(target, schema);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
        errorCount: errors.length,
      });
    }
    next();
  };
}

/* ----------------------------------------------------------------------
 * Reusable schemas for common endpoints
 * ---------------------------------------------------------------------- */
const phoneRule = {
  type: 'phone',
  label: 'Phone',
  message: 'Enter a valid 10-digit Indian mobile number',
};
const emailRule = {
  type: 'email',
  label: 'Email',
  message: 'Enter a valid email address',
};
const passwordRule = {
  type: 'string',
  required: true,
  minLength: 6,
  maxLength: 128,
  label: 'Password',
  message: 'Password must be 6-128 characters',
};
const nameRule = {
  type: 'string',
  required: true,
  minLength: 2,
  maxLength: 80,
  label: 'Name',
};
const cityRule = {
  type: 'string',
  required: true,
  minLength: 2,
  maxLength: 50,
  label: 'City',
  pattern: /^[\p{L}][\p{L}\s\-'.]*$/u,
  patternMessage: 'City name contains invalid characters',
};
const aadhaarRule = {
  type: 'string',
  required: true,
  minLength: 12,
  maxLength: 12,
  label: 'Aadhaar ID',
  pattern: /^\d{12}$/,
  patternMessage: 'Aadhaar ID must be exactly 12 digits',
};

const ownerPhoneRule = {
  type: 'phone',
  required: true,
  label: 'Owner/Manager Mobile',
  message: 'Enter a valid 10-digit Indian mobile number for owner/manager',
};

const ownerEmailRule = {
  type: 'email',
  required: true,
  label: 'Owner/Manager Email',
  message: 'Enter a valid email for owner/manager',
};

const totalCountRule = (label) => ({
  type: 'number',
  required: true,
  min: 1,
  max: 500,
  integer: true,
  label,
});

const dateRule = (label = 'Date') => ({
  type: 'date',
  required: false,
  label,
});

export const schemas = {
  // ---- Auth ----
  signup: {
    name: { ...nameRule },
    email: { ...emailRule, required: true },
    phone: { ...phoneRule, required: true },
    password: { ...passwordRule },
  },
  login: {
    email: {
      type: 'string', required: true, minLength: 6, maxLength: 120, label: 'Email or Phone',
      // accept either an email or an Indian phone
      pattern: /^([^\s@]+@[^\s@]+\.[^\s@]+|[6-9]\d{9})$/,
      patternMessage: 'Enter a valid email or 10-digit mobile number',
    },
    password: { ...passwordRule },
  },
  googleAuth: {
    credential: { type: 'string', required: true, minLength: 10, maxLength: 4096, label: 'Google credential' },
  },
  refresh: {
    refreshToken: { type: 'string', required: true, minLength: 10, maxLength: 4096, label: 'Refresh token' },
  },
  emailOtp: {
    email: { ...emailRule, required: true },
    otp: { type: 'string', required: true, pattern: /^\d{6}$/, label: 'OTP' },
  },
  sendEmailOtp: {
    email: { ...emailRule, required: true },
  },
  profileUpdate: {
    name: { ...nameRule, required: false },
    phone: { ...phoneRule, required: false },
    email: { ...emailRule, required: false },
  },

  // ---- OTP (MSG91) ----
  sendOtp: {
    phone: { ...phoneRule, required: true },
  },
  verifyOtp: {
    phone: { ...phoneRule, required: true },
    otp: { type: 'string', required: true, pattern: /^\d{4,8}$/, label: 'OTP' },
  },
  msg91Webhook: {
    // Shape varies; intentionally permissive — just require an object
    requestId: { type: 'string', required: false, maxLength: 128 },
    status: { type: 'string', required: false, maxLength: 32 },
  },

  // ---- Public search ----
  busSearch: {
    from: { ...cityRule },
    to: { ...cityRule },
    date: { type: 'date', required: false, label: 'Date' },
    passengers: { type: 'number', required: false, min: 1, max: 10, integer: true, label: 'Passengers' },
  },
  cabSearch: {
    city: { ...cityRule, required: false },
    boarding: { type: 'string', required: false, maxLength: 100, label: 'Boarding point' },
    dropping: { type: 'string', required: false, maxLength: 100, label: 'Dropping point' },
    date: { type: 'date', required: false, label: 'Date' },
    time: { type: 'string', required: false, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, label: 'Time' },
    passengers: { type: 'number', required: false, min: 1, max: 8, integer: true, label: 'Passengers' },
  },
  hotelSearch: {
    location: { ...cityRule, required: false },
    checkin: { type: 'date', required: false, label: 'Check-in date' },
    checkout: { type: 'date', required: false, label: 'Check-out date' },
    guests: { type: 'number', required: false, min: 1, max: 12, integer: true, label: 'Guests' },
  },
  // ---- Bookings & payments ----
  razorpayCreateOrder: {
    amount: { type: 'number', required: true, min: 1, max: 1_000_000, label: 'Amount' },
    type: { type: 'enum', values: ['bus', 'hotel', 'cab', 'cafe', 'car'], required: true, label: 'Type' },
    itemName: { type: 'string', required: true, minLength: 1, maxLength: 200, label: 'Item name' },
    userName: { type: 'string', required: false, maxLength: 80, label: 'User name' },
    userPhone: { ...phoneRule, required: false },
    userAge: { type: 'number', required: false, min: 0, max: 120, integer: true, label: 'Age' },
    passengerCount: { type: 'number', required: false, min: 1, max: 20, integer: true, label: 'Passenger count' },
    seats: { type: 'string[]', required: false, max: 20, maxLength: 8, label: 'Seats' },
    roomType: { type: 'string', required: false, maxLength: 60, label: 'Room type' },
  },
  razorpayVerify: {
    razorpayOrderId: { type: 'string', required: true, minLength: 5, maxLength: 64, label: 'Razorpay order id' },
    razorpayPaymentId: { type: 'string', required: true, minLength: 5, maxLength: 64, label: 'Razorpay payment id' },
    razorpaySignature: { type: 'string', required: true, minLength: 10, maxLength: 512, label: 'Razorpay signature' },
    orderId: { type: 'string', required: true, minLength: 2, maxLength: 64, label: 'Order id' },
    liveLocationUrl: { type: 'url', required: false, maxLength: 2048, label: 'Live location URL' },
  },
  upiConfirm: {
    orderId: { type: 'string', required: true, minLength: 2, maxLength: 64, label: 'Order id' },
    upiTransactionId: { type: 'string', required: true, minLength: 4, maxLength: 128, label: 'UPI transaction id' },
  },
  createOrder: {
    type: { type: 'enum', values: ['bus', 'hotel', 'cab', 'cafe', 'car'], required: true, label: 'Type' },
    itemName: { type: 'string', required: true, minLength: 1, maxLength: 200, label: 'Item name' },
    amount: { type: 'number', required: true, min: 1, max: 1_000_000, label: 'Amount' },
    userName: { type: 'string', required: false, maxLength: 80, label: 'User name' },
    userPhone: { ...phoneRule, required: false },
  },
  bookings: {
    type: { type: 'enum', values: ['bus', 'hotel', 'cab', 'cafe', 'car'], required: true, label: 'Type' },
  },
  deleteBooking: {
    orderId: { type: 'string', required: true, minLength: 2, maxLength: 64, label: 'Order id' },
    email: { ...emailRule, required: false },
    phone: { ...phoneRule, required: false },
  },

  // ---- Collab ----
  submitCollab: {
    name: { ...nameRule },
    email: { ...emailRule, required: true },
    phone: { ...phoneRule, required: true },
    businessName: { type: 'string', required: true, minLength: 2, maxLength: 120, label: 'Business name' },
    businessType: { type: 'enum', values: ['bus', 'hotel', 'cab', 'cafe'], required: true, label: 'Business type' },
    city: { ...cityRule },
    upiId: { type: 'string', required: true, minLength: 3, maxLength: 100, label: 'UPI ID', pattern: /^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/, patternMessage: 'UPI ID must look like name@bank' },
    serviceCategories: { type: 'string[]', required: true, min: 1, max: 10, maxLength: 60, label: 'Service categories' },
  },

  // ---- Admin ----
  adminLogin: {
    username: { type: 'string', required: true, minLength: 1, maxLength: 80, label: 'Username' },
    password: { ...passwordRule },
  },
  adminReviewCollab: {
    collabId: { type: 'string', required: true, minLength: 1, maxLength: 64, label: 'Collab id' },
    action: { type: 'enum', values: ['approve', 'reject'], required: true, label: 'Action' },
  },
  adminVerifyPayment: {
    orderId: { type: 'string', required: true, minLength: 2, maxLength: 64, label: 'Order id' },
    status: { type: 'enum', values: ['paid', 'rejected'], required: true, label: 'Status' },
  },
  adminServiceAction: {
    type: { type: 'enum', values: ['bus', 'hotel', 'cab', 'cafe'], required: true, label: 'Service type' },
    action: { type: 'enum', values: ['approve', 'reject'], required: true, label: 'Action' },
  },

  // ---- Hotel ----
  hotelCreate: {
    hotelName: { type: 'string', required: true, minLength: 2, maxLength: 120, label: 'Hotel name' },
    address: { type: 'string', required: true, minLength: 5, maxLength: 300, label: 'Address' },
    city: { ...cityRule },
    state: { type: 'string', required: true, minLength: 2, maxLength: 50, label: 'State' },
    totalRooms: totalCountRule('Total rooms'),
    ownerAadhaarId: aadhaarRule,
    phone: ownerPhoneRule,
    email: ownerEmailRule,
    amenities: { type: 'string[]', required: false, max: 20, maxLength: 50, label: 'Amenities' },
  },

  // ---- Cafe ----
  cafeCreate: {
    cafeName: { type: 'string', required: true, minLength: 2, maxLength: 120, label: 'Cafe name' },
    address: { type: 'string', required: true, minLength: 5, maxLength: 300, label: 'Address' },
    city: { ...cityRule },
    state: { type: 'string', required: true, minLength: 2, maxLength: 50, label: 'State' },
    capacity: totalCountRule('Total tables'),
    ownerAadhaarId: aadhaarRule,
    phone: ownerPhoneRule,
    email: ownerEmailRule,
    schedule: { type: 'object', required: false, fields: {} },
    price: { type: 'number', required: false, min: 0, label: 'Price per table' },
  },

  // ---- Buses ----
  busCreate: {
    busName: { type: 'string', required: true, minLength: 2, maxLength: 80, label: 'Bus name' },
    busType: { type: 'enum', values: ['ac', 'non-ac', 'sleeper', 'semi-sleeper', 'volvo', 'luxury'], required: true, label: 'Bus type' },
    numberPlate: { type: 'string', required: true, minLength: 4, maxLength: 20, label: 'Number plate', pattern: /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,2}[0-9]{1,4}$/i, patternMessage: 'Number plate looks invalid' },
    totalSeats: { type: 'number', required: true, min: 1, max: 80, integer: true, label: 'Total seats' },
    routeCities: { type: 'string[]', required: true, min: 2, max: 20, maxLength: 50, label: 'Route cities' },
    pricePerKm: { type: 'number', required: true, min: 1, max: 100, label: 'Price per km' },
  },
  busIdParam: {
    id: { type: 'string', required: true, minLength: 1, maxLength: 64, label: 'Bus id' },
  },

  // ---- Search-as-you-type ----
  adminSearchCollaborator: {
    name: { type: 'string', required: true, minLength: 2, maxLength: 80, label: 'Name' },
  },
  adminSearchOrder: {
    bookingId: { type: 'string', required: true, minLength: 2, maxLength: 64, label: 'Booking id' },
  },
};

/* ----------------------------------------------------------------------
 * Legacy per-flow validators (kept for back-compat with auth & bus ctrls)
 * ---------------------------------------------------------------------- */

export function validateCollaboratorRegistration(data) {
  const errors = [];
  if (!data.name || data.name.trim().length < 2) errors.push('Full name is required (min 2 characters)');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Valid email is required');
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.replace(/\D/g, '').slice(-10))) errors.push('Valid 10-digit Indian mobile is required');
  if (!data.password || data.password.length < 6) errors.push('Password must be at least 6 characters');
  if (!data.businessName || data.businessName.trim().length < 2) errors.push('Business name is required');
  if (!data.businessType) errors.push('Business type is required');
  if (!data.serviceCategories || !Array.isArray(data.serviceCategories) || data.serviceCategories.length === 0) errors.push('At least one service category is required');
  if (!data.city) errors.push('City is required');
  if (!data.upiId || !data.upiId.includes('@')) errors.push('Valid UPI ID is required');
  return errors;
}

export function validateBusCreation(data) {
  const errors = [];
  if (!data.busName || data.busName.trim().length < 2) errors.push('Bus name is required');
  if (!data.busType) errors.push('Bus type is required');
  if (!data.numberPlate) errors.push('Number plate is required');
  if (!data.totalSeats || data.totalSeats < 1 || data.totalSeats > 80) errors.push('Valid seat count (1-80) is required');
  if (!data.routeCities || !Array.isArray(data.routeCities) || data.routeCities.length < 2) errors.push('At least 2 route cities are required');
  if (!data.pricePerKm || data.pricePerKm < 1) errors.push('Valid price per km is required');
  return errors;
}

export function validateSeatUpdate(data) {
  const validStatuses = ['available', 'booked', 'reserved', 'blocked', 'maintenance'];
  if (!data.seatId) return ['Seat ID is required'];
  if (!data.status || !validStatuses.includes(data.status)) return ['Invalid status. Must be one of: ' + validStatuses.join(', ')];
  return [];
}

export function validateUserRegistration(data) {
  const errors = [];
  if (!data.name || data.name.trim().length < 2) errors.push('Full name is required (min 2 characters)');
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) errors.push('Valid email is required');
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.replace(/\D/g, '').slice(-10))) errors.push('Valid 10-digit Indian mobile number is required');
  if (!data.password || data.password.length < 6) errors.push('Password must be at least 6 characters');
  return errors;
}

export function validateUserLogin(data) {
  const errors = [];
  const username = (data.email || '').trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  const cleanPhone = username.replace(/\D/g, '').slice(-10);
  const isPhone = /^[6-9]\d{9}$/.test(cleanPhone);

  if (!username) {
    errors.push('Email or Phone Number is required');
  } else if (!isEmail && !isPhone) {
    errors.push('Valid email or 10-digit mobile number is required');
  }

  if (!data.password || data.password.length < 6) {
    errors.push('Password must be at least 6 characters');
  }
  return errors;
}
