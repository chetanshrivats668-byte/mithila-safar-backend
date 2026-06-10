import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalize(c) {
  if (!c) return c;
  c.status = c.status || (c.Status || 'pending').toLowerCase();
  c.googleEmail = normalizeEmail(c.googleEmail || c.googleemail || c.email);
  c.email = normalizeEmail(c.email);
  delete c.googleemail;
  return c;
}

export async function createApplication(db, data) {
  const appId = 'APP' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const record = {
    id: appId,
    name: data.name,
    email: normalizeEmail(data.email),
    googleEmail: normalizeEmail(data.googleEmail || data.email),
    phone: data.phone || '',
    password: data.password,
    serviceCategory: data.serviceCategory,
    upiId: data.upiId || '',
    aadhaarId: data.aadhaarId || '',
    yearsOfExperience: data.yearsOfExperience || '',
    experience: data.experience || '',
    documents: data.documents || '',
    routeCities: data.routeCities || [],
    operatingCity: data.operatingCity || '',
    serviceAddress: data.serviceAddress || '',
    serviceCity: data.serviceCity || '',
    serviceState: data.serviceState || '',
    serviceLandmark: data.serviceLandmark || '',
    servicePincode: data.servicePincode || '',
    status: 'pending',
    adminNotes: '',
    createdAt: now,
    updatedAt: now
  };
  memoryDb.collab_applications.set(appId, record);
  console.log('[APP] Application stored in memory:', appId);
  if (isSupabaseAvailable()) {
    try {
      const supabaseRecord = { ...record, verificationStatus: 'pending' };
      delete supabaseRecord.verification_status;
      await dbCreate('collab_applications', appId, supabaseRecord);
      console.log('[APP] Application also saved to Supabase:', appId);
    } catch (err) {
      console.warn('[APP] Supabase write failed (data safe in memory):', err?.message || err);
    }
  }
  return record;
}

export async function getApplicationById(db, id) {
  const mem = memoryDb.collab_applications.get(id);
  if (mem) return normalize(mem);
  if (isSupabaseAvailable()) {
    return normalize(await dbGet('collab_applications', id));
  }
  return null;
}

export async function getApplicationByEmail(db, email) {
  const normalizedEmail = normalizeEmail(email);
  const found = Array.from(memoryDb.collab_applications.values()).find(a => normalizeEmail(a.email) === normalizedEmail);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collab_applications', { filters: [{ column: 'email', op: 'eq', value: normalizedEmail }] });
    return normalize(results.length > 0 ? results[0] : null);
  }
  return null;
}

export async function getApplicationByGoogleEmail(db, googleEmail) {
  const normalizedGoogleEmail = normalizeEmail(googleEmail);
  const found = Array.from(memoryDb.collab_applications.values()).find(a => normalizeEmail(a.googleEmail || a.email) === normalizedGoogleEmail);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collab_applications', { filters: [{ column: 'googleEmail', op: 'eq', value: normalizedGoogleEmail }] });
    if (results.length > 0) return normalize(results[0]);
    const fallbackResults = await dbList('collab_applications', { filters: [{ column: 'email', op: 'eq', value: normalizedGoogleEmail }] });
    return normalize(fallbackResults.length > 0 ? fallbackResults[0] : null);
  }
  return null;
}

export async function getAllApplications(db) {
  const memApps = Array.from(memoryDb.collab_applications.values()).map(normalize);
  if (isSupabaseAvailable()) {
    try {
      const supaApps = (await dbList('collab_applications', { orderBy: { column: 'createdAt', ascending: false } })).map(normalize);
      const seenIds = new Set(memApps.map(a => a.id));
      for (const app of supaApps) {
        if (!seenIds.has(app.id)) {
          memApps.push(app);
        }
      }
    } catch (err) {
      console.warn('[APP] Supabase read failed, using memory only:', err?.message || err);
    }
  }
  memApps.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return memApps;
}

export async function updateApplication(db, id, updates) {
  updates.updatedAt = new Date().toISOString();
  if (updates.email) updates.email = normalizeEmail(updates.email);
  if (updates.googleEmail) updates.googleEmail = normalizeEmail(updates.googleEmail);
  const existing = memoryDb.collab_applications.get(id);
  if (existing) Object.assign(existing, updates);
  if (isSupabaseAvailable()) {
    await dbUpdate('collab_applications', id, updates).catch(() => {});
  }
  return { id, ...updates };
}
