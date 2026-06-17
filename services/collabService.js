import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

// Normalize collaborator rows from Supabase (PostgREST returns lowercase keys)
// to include a backward-compatible `verification_status` field.
function normalize(c) {
  if (!c) return c;
  c.googleEmail = normalizeEmail(c.googleEmail || c.googleemail || c.email);
  c.email = normalizeEmail(c.email);
  c.verification_status = c.verificationStatus || c.verification_status || c.verificationstatus || 'pending';
  c.partnerCollabStatus = c.partnerCollabStatus || c.partnercollabstatus || 'pending';
  c.userId = c.userId || c.userid || null;
  if (c.submittedfrom && !c.submittedFrom) c.submittedFrom = c.submittedfrom;
  if (c.approvedat && !c.approvedAt) c.approvedAt = c.approvedat;
  if (c.approvedby && !c.approvedBy) c.approvedBy = c.approvedby;
  if (c.partnercollabrejectedat && !c.partnerCollabRejectedAt) c.partnerCollabRejectedAt = c.partnercollabrejectedat;
  if (c.verificationrequestedat && !c.verificationRequestedAt) c.verificationRequestedAt = c.verificationrequestedat;
  if (c.rejectionreason && !c.rejectionReason) c.rejectionReason = c.rejectionreason;

  if (c.partnercollabreapplyafter && !c.partnerCollabReapplyAfter) c.partnerCollabReapplyAfter = c.partnercollabreapplyafter;
  if (c.businessname && !c.businessName) c.businessName = c.businessname;
  if (c.businesstype && !c.businessType) c.businessType = c.businesstype;
  if (c.servicecategories && !c.serviceCategories) c.serviceCategories = c.servicecategories;
  if (c.upiid && !c.upiId) c.upiId = c.upiid;
  if (c.businessdescription && !c.businessDescription) c.businessDescription = c.businessdescription;
  if (c.verifiedat && !c.verifiedAt) c.verifiedAt = c.verifiedat;
  if (c.verifiedby && !c.verifiedBy) c.verifiedBy = c.verifiedby;
  if (c.bankdetails && !c.bankDetails) c.bankDetails = c.bankdetails;
  if (c.phonenumber && !c.phoneNumber) c.phoneNumber = c.phonenumber;
  if (c.phoneverified !== undefined && c.phoneVerified === undefined) c.phoneVerified = c.phoneverified;
  if (c.aadhaarurl && !c.aadhaarUrl) c.aadhaarUrl = c.aadhaarurl;
  if (c.aadhaarid && !c.aadhaarId) c.aadhaarId = c.aadhaarid;
  if (c.yearsofexperience && !c.yearsOfExperience) c.yearsOfExperience = c.yearsofexperience;
  if (c.panurl && !c.panUrl) c.panUrl = c.panurl;
  if (c.createdat && !c.createdAt) c.createdAt = c.createdat;
  if (c.updatedat && !c.updatedAt) c.updatedAt = c.updatedat;
  if (c.suspendedat && !c.suspendedAt) c.suspendedAt = c.suspendedat;
  if (c.suspendedby && !c.suspendedBy) c.suspendedBy = c.suspendedby;
  if (c.unsuspendedat && !c.unsuspendedAt) c.unsuspendedAt = c.unsuspendedat;
  if (c.unsuspendedby && !c.unsuspendedBy) c.unsuspendedBy = c.unsuspendedby;
  if (c.totalbookings != null && c.totalBookings == null) c.totalBookings = c.totalbookings;
  if (c.totalearnings != null && c.totalEarnings == null) c.totalEarnings = c.totalearnings;
  if (c.routecities && !c.routeCities) c.routeCities = c.routecities;
  if (c.operatingcity && !c.operatingCity) c.operatingCity = c.operatingcity;
  if (c.pincode && !c.pinCode) c.pinCode = c.pincode;
  delete c.businessname; delete c.businesstype; delete c.servicecategories;
  delete c.upiid; delete c.businessdescription; delete c.verifiedat;
  delete c.verifiedby; delete c.bankdetails; delete c.phonenumber;
  delete c.phoneverified; delete c.aadhaarurl; delete c.aadhaarid;
  delete c.yearsofexperience; delete c.panurl;
  delete c.createdat; delete c.updatedat; delete c.suspendedat;
  delete c.suspendedby; delete c.unsuspendedat; delete c.unsuspendedby;
  delete c.totalbookings; delete c.totalearnings;
  delete c.verificationstatus; delete c.googleemail;
  delete c.partnercollabstatus; delete c.submittedfrom; delete c.userid;
  delete c.verificationrequestedat; delete c.rejectionreason;

  delete c.approvedat; delete c.approvedby;
  delete c.partnercollabrejectedat; delete c.partnercollabreapplyafter;
  delete c.routecities; delete c.operatingcity;
  delete c.pincode;
  return c;
}

function normalizeList(arr) {
  return (arr || []).map(normalize);
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function normalizePhone(phone) {
  return typeof phone === 'string' ? phone.replace(/\D/g, '').slice(-10) : '';
}

const VALID_COLLABORATOR_COLUMNS = [
  'id', 'userId', 'name', 'email', 'googleEmail', 'phone', 'phoneVerified', 'password',
  'businessName', 'businessType', 'businessDescription', 'serviceCategories',
  'address', 'city', 'state', 'routeCities', 'operatingCity', 'landmark', 'pinCode',
  'aadhaarUrl', 'panUrl', 'aadhaarId', 'yearsOfExperience', 'upiId',
  'bankDetails', 'documents',
  'verificationStatus', 'verificationRequestedAt', 'rejectionReason',
  'partnerCollabStatus', 'submittedFrom', 'approvedAt', 'approvedBy',
  'partnerCollabRejectedAt', 'partnerCollabReapplyAfter',
  'verifiedAt', 'verifiedBy',
  'status', 'rating', 'totalBookings', 'totalEarnings',
  'suspendedAt', 'suspendedBy', 'unsuspendedAt', 'unsuspendedBy',
  'totalRooms', 'capacity', 'totalSeats', 'servicePhone', 'driverPhone',
  'createdAt', 'updatedAt'
];

function filterSupabaseColumns(data) {
  const filtered = {};
  for (const key of VALID_COLLABORATOR_COLUMNS) {
    if (data[key] !== undefined) {
      filtered[key] = data[key];
    }
  }
  return filtered;
}

export async function getCollaboratorById(db, collabId) {
  const mem = memoryDb.collabs.get(collabId);
  if (mem) return normalize(mem);
  if (isSupabaseAvailable()) {
    return normalize(await dbGet('collaborators', collabId));
  }
  return null;
}

export async function getCollaboratorByEmail(db, email) {
  const normalizedEmail = normalizeEmail(email);
  const found = Array.from(memoryDb.collabs.values()).find(c => normalizeEmail(c.email) === normalizedEmail);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collaborators', { filters: [{ column: 'email', op: 'eq', value: normalizedEmail }] });
    return normalize(results.length > 0 ? results[0] : null);
  }
  return null;
}

export async function getCollaboratorByGoogleEmail(db, googleEmail) {
  const normalizedGoogleEmail = normalizeEmail(googleEmail);
  const found = Array.from(memoryDb.collabs.values()).find(c => normalizeEmail(c.googleEmail || c.email) === normalizedGoogleEmail);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collaborators', { filters: [{ column: 'googleEmail', op: 'eq', value: normalizedGoogleEmail }] });
    if (results.length > 0) return normalize(results[0]);
    const fallbackResults = await dbList('collaborators', { filters: [{ column: 'email', op: 'eq', value: normalizedGoogleEmail }] });
    return normalize(fallbackResults.length > 0 ? fallbackResults[0] : null);
  }
  return null;
}

export async function getCollaboratorByPhone(db, phone) {
  const normalizedPhone = normalizePhone(phone);
  const found = Array.from(memoryDb.collabs.values()).find(c => normalizePhone(c.phone) === normalizedPhone);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collaborators', { filters: [{ column: 'phone', op: 'eq', value: normalizedPhone }] });
    return normalize(results.length > 0 ? results[0] : null);
  }
  return null;
}

export async function createCollaborator(db, data) {
  const collabId = data.id || 'CL' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const collabData = {
    id: collabId,
    userId: data.userId || null,
    name: data.name,
    email: normalizeEmail(data.email),
    googleEmail: normalizeEmail(data.googleEmail || data.email),
    phone: normalizePhone(data.phone),
    phoneVerified: data.phoneVerified || false,
    password: data.password,
    businessName: data.businessName,
    businessType: data.businessType,
    businessDescription: data.businessDescription || '',
    serviceCategories: data.serviceCategories || [],
    address: data.address || '',
    city: data.city || '',
    state: data.state || '',
    routeCities: data.routeCities || [],
    operatingCity: data.operatingCity || '',
    landmark: data.landmark || '',
    pinCode: data.pinCode || '',
    aadhaarUrl: data.aadhaarUrl || '',
    panUrl: data.panUrl || '',
    aadhaarId: data.aadhaarId || '',
    yearsOfExperience: data.yearsOfExperience || '',
    bankDetails: data.bankDetails || {},
    documents: data.documents || {},
    verification_status: data.verificationStatus || data.verification_status || 'pending',
    verificationRequestedAt: data.verificationRequestedAt || null,
    rejectionReason: data.rejectionReason || null,
    partnerCollabStatus: data.partnerCollabStatus || 'pending',
    submittedFrom: data.submittedFrom || data.userId || null,
    approvedAt: data.approvedAt || null,
    approvedBy: data.approvedBy || null,
    partnerCollabRejectedAt: data.partnerCollabRejectedAt || null,
    partnerCollabReapplyAfter: data.partnerCollabReapplyAfter || null,
    verifiedAt: data.verifiedAt || null,
    verifiedBy: data.verifiedBy || null,
    status: data.status || 'pending',
    rating: 0,
    totalBookings: 0,
    totalEarnings: 0,
    createdAt: now,
    updatedAt: now
  };
  memoryDb.collabs.set(collabId, collabData);
  if (isSupabaseAvailable()) {
    const record = {
      ...collabData,
      verificationStatus: data.verificationStatus || data.verification_status || 'pending',
      verificationRequestedAt: data.verificationRequestedAt || null,
      rejectionReason: data.rejectionReason || null,
      partnerCollabStatus: data.partnerCollabStatus || 'pending',
      submittedFrom: data.submittedFrom || data.userId || null,
      approvedAt: data.approvedAt || null,
      approvedBy: data.approvedBy || null,
      partnerCollabRejectedAt: data.partnerCollabRejectedAt || null,
      partnerCollabReapplyAfter: data.partnerCollabReapplyAfter || null,
      userId: data.userId || null,
      status: data.status || 'pending'
    };
    delete record.verification_status;
    const sanitizedRecord = filterSupabaseColumns(record);
    await dbCreate('collaborators', collabId, sanitizedRecord).catch((err) => console.error('[collabService] Supabase create failed:', err));
  }
  return { id: collabId, ...collabData };
}

export async function updateCollaborator(db, collabId, updates) {
  updates.updatedAt = new Date().toISOString();
  if (updates.email !== undefined) updates.email = normalizeEmail(updates.email);
  if (updates.googleEmail !== undefined) updates.googleEmail = normalizeEmail(updates.googleEmail || updates.email);
  if (updates.phone !== undefined) updates.phone = normalizePhone(updates.phone);
  const existing = memoryDb.collabs.get(collabId);
  if (existing) {
    Object.assign(existing, updates);
  }
  if (isSupabaseAvailable()) {
    const sanitizedUpdates = filterSupabaseColumns(updates);
    if (Object.keys(sanitizedUpdates).length > 0) {
      await dbUpdate('collaborators', collabId, sanitizedUpdates).catch((err) => console.error('[collabService] Supabase update failed:', err));
    }
  }
  return { id: collabId, ...updates };
}

export async function getAllCollaborators(db) {
  if (!isSupabaseAvailable()) {
    return normalizeList(Array.from(memoryDb.collabs.values()));
  }
  return normalizeList(await dbList('collaborators', { orderBy: { column: 'createdAt', ascending: false } }));
}

export async function getApprovedCollaboratorsByType(db, type) {
  if (!isSupabaseAvailable()) {
    return normalizeList(Array.from(memoryDb.collabs.values())
      .filter(c => c.status === 'approved' && c.serviceCategories && c.serviceCategories.includes(type)));
  }
  const results = await dbList('collaborators', { filters: [{ column: 'status', op: 'eq', value: 'approved' }] });
  return normalizeList(results.filter(c => c.serviceCategories && c.serviceCategories.includes(type)));
}

export async function deleteCollaborator(db, collabId) {
  memoryDb.collabs.delete(collabId);
  if (isSupabaseAvailable()) {
    await dbRemove('collaborators', collabId).catch((err) => console.error('[collabService] Supabase remove failed:', err));
  }
}

export async function getCollaboratorsByUserId(db, userId) {
  if (!userId) return [];
  const user = await dbGet('users', userId);
  if (!user) return [];
  const userEmail = user.email;
  const userPhone = user.phone;
  const cleanUserPhone = userPhone ? userPhone.replace(/\D/g, '').slice(-10) : '';

  const memoryMatches = Array.from(memoryDb.collabs.values()).filter(c => {
    const cleanCollabPhone = c.phone ? c.phone.replace(/\D/g, '').slice(-10) : '';
    return c.userId === userId ||
      c.submittedFrom === userId ||
      (userEmail && c.email === userEmail) ||
      (cleanUserPhone && cleanCollabPhone === cleanUserPhone);
  });
  if (memoryMatches.length > 0 || !isSupabaseAvailable()) {
    return normalizeList(memoryMatches);
  }

  const resultsMap = new Map();
  const mergeResults = (rows) => {
    for (const row of rows || []) {
      if (row?.id && !resultsMap.has(row.id)) resultsMap.set(row.id, row);
    }
  };

  try {
    const res = await dbList('collaborators', { filters: [{ column: 'submittedFrom', op: 'eq', value: userId }] });
    mergeResults(res);
  } catch (err) {
    console.warn('[collabService] Failed to query collaborators by submittedFrom:', err.message);
  }

  try {
    const res = await dbList('collaborators', { filters: [{ column: 'userId', op: 'eq', value: userId }] });
    mergeResults(res);
  } catch (err) {
    console.warn('[collabService] Failed to query collaborators by userId:', err.message);
  }

  if (userEmail) {
    try {
      const res = await dbList('collaborators', { filters: [{ column: 'email', op: 'eq', value: userEmail }] });
      mergeResults(res);
    } catch (err) {
      console.warn('[collabService] Failed to query collaborators by email:', err.message);
    }
  }

  if (cleanUserPhone) {
    try {
      const res = await dbList('collaborators', { filters: [{ column: 'phone', op: 'eq', value: cleanUserPhone }] });
      mergeResults(res);
    } catch (err) {
      console.warn('[collabService] Failed to query collaborators by phone:', err.message);
    }
  }

  return normalizeList(Array.from(resultsMap.values()));
}
