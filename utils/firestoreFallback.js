import crypto from 'crypto';

let FIRESTORE_AVAILABLE = false;

export function isFirestoreAvailable() {
  return FIRESTORE_AVAILABLE;
}

export function setFirestoreAvailable(value) {
  FIRESTORE_AVAILABLE = value;
}

// In-memory collections for fallback mode
export const memoryDb = {
  users: new Map(),
  collabs: new Map(),
  buses: new Map(),
  hotels: new Map(),
  cabs: new Map(),
  cafes: new Map(),
  seats: new Map(),
  orders: new Map(),
  bookings: new Map(),
  email_otps: new Map(),
  collab_applications: new Map(),
  room_layouts: new Map(),
  table_layouts: new Map(),
  audit_logs: new Map()
};

console.log('[FIRESTORE FALLBACK]: In-memory fallback database initialized.');
