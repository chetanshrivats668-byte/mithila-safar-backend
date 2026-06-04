import { get as dbGet, list as dbList, create as dbCreate, update as dbUpdate, remove as dbRemove, isSupabaseAvailable } from '../utils/db.js';
import { memoryDb } from '../utils/firestoreFallback.js';

// Normalize collaborator rows from Supabase (PostgREST returns lowercase keys)
// to include a backward-compatible `verification_status` field.
function normalize(c) {
  if (!c) return c;
  c.verification_status = c.verificationStatus || c.verification_status || c.verificationstatus || 'pending';
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
  delete c.verificationstatus;
  delete c.routecities; delete c.operatingcity;
  delete c.pincode;
  return c;
}

function normalizeList(arr) {
  return (arr || []).map(normalize);
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
  const found = Array.from(memoryDb.collabs.values()).find(c => c.email === email);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collaborators', { filters: [{ column: 'email', op: 'eq', value: email }] });
    return normalize(results.length > 0 ? results[0] : null);
  }
  return null;
}

export async function getCollaboratorByPhone(db, phone) {
  const found = Array.from(memoryDb.collabs.values()).find(c => c.phone === phone);
  if (found) return normalize(found);
  if (isSupabaseAvailable()) {
    const results = await dbList('collaborators', { filters: [{ column: 'phone', op: 'eq', value: phone }] });
    return normalize(results.length > 0 ? results[0] : null);
  }
  return null;
}

export async function createCollaborator(db, data) {
  const collabId = data.id || 'CL' + Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();
  const collabData = {
    id: collabId,
    name: data.name,
    email: data.email,
    phone: data.phone,
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
      verificationStatus: data.verificationStatus || 'pending',
      status: data.status || 'pending'
    };
    delete record.verification_status;
    await dbCreate('collaborators', collabId, record).catch(() => {});
  }
  return { id: collabId, ...collabData };
}

export async function updateCollaborator(db, collabId, updates) {
  updates.updatedAt = new Date().toISOString();
  const existing = memoryDb.collabs.get(collabId);
  if (existing) {
    Object.assign(existing, updates);
  }
  if (isSupabaseAvailable()) {
    await dbUpdate('collaborators', collabId, updates).catch(() => {});
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
    await dbRemove('collaborators', collabId).catch(() => {});
  }
}
