import { sanitizeInput } from '../middleware/validator.js';
import * as appService from '../services/applicationService.js';
import * as collabService from '../services/collabService.js';
import bcrypt from 'bcryptjs';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function submitApplication(req, res) {
  try {
    const data = sanitizeInput(req.body);
    const errors = [];
    if (!data.name || data.name.trim().length < 2) errors.push('Full name is required (min 2 characters)');
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Valid email is required');
    if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone.replace(/\D/g, '').slice(-10))) errors.push('Valid 10-digit Indian mobile is required');
    if (!data.password || data.password.length < 6) errors.push('Password must be at least 6 characters');
    if (!data.serviceCategory) errors.push('Service category is required');
    if (!data.upiId || !data.upiId.includes('@')) errors.push('Valid UPI ID is required');
    if (!data.aadhaarId || !/^\d{12}$/.test(data.aadhaarId.replace(/\s/g, ''))) errors.push('Valid 12-digit Aadhaar ID is required');
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const normalizedEmail = normalizeEmail(data.email);
    const requestedGoogleEmail = normalizeEmail(data.googleEmail || data.email);
    const existing = await appService.getApplicationByEmail(req.app.locals.db, normalizedEmail);
    if (existing) {
      if (existing.status === 'pending') return res.status(409).json({ success: false, message: 'You already have a pending application. Please wait for admin review.' });
      if (existing.status === 'approved') return res.status(409).json({ success: false, message: 'Your application was already approved. Please login with your credentials.' });
    }

    const existingByGoogleEmail = requestedGoogleEmail
      ? await appService.getApplicationByGoogleEmail(req.app.locals.db, requestedGoogleEmail)
      : null;
    if (existingByGoogleEmail && existingByGoogleEmail.id !== existing?.id) {
      if (existingByGoogleEmail.status === 'pending') return res.status(409).json({ success: false, message: 'You already have a pending application. Please wait for admin review.' });
      if (existingByGoogleEmail.status === 'approved') return res.status(409).json({ success: false, message: 'Your application was already approved. Please login with your credentials.' });
    }

    const hashedPassword = await hashPassword(data.password);
    const application = await appService.createApplication(req.app.locals.db, {
      name: data.name,
      email: normalizedEmail,
      googleEmail: requestedGoogleEmail,
      phone: data.phone,
      password: hashedPassword,
      serviceCategory: data.serviceCategory,
      upiId: data.upiId,
      aadhaarId: data.aadhaarId,
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
      totalRooms: data.totalRooms || 0,
      capacity: data.capacity || 0,
      totalSeats: data.totalSeats || 0,
      servicePhone: data.servicePhone || '',
      driverPhone: data.driverPhone || ''
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully! We will review and notify you.',
      application: {
        id: application.id,
        name: application.name,
        email: application.email,
        googleEmail: application.googleEmail,
        serviceCategory: application.serviceCategory,
        status: application.status
      }
    });
  } catch (e) {
    console.error('Submit application error:', e);
    res.status(500).json({ success: false, message: 'Failed to submit application' });
  }
}

export async function checkApplicationStatus(_req, res) {
  return res.status(410).json({
    success: false,
    message: 'Public application status lookup has been disabled for security reasons. Please contact support or wait for admin review updates.'
  });
}

export async function adminListApplications(req, res) {
  try {
    const applications = await appService.getAllApplications(req.app.locals.db);
    const safe = applications.map(a => {
      const { password, ...rest } = a;
      return rest;
    });
    res.json({ success: true, applications: safe });
  } catch (e) {
    console.error('List applications error:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch' });
  }
}

export async function adminApproveApplication(req, res) {
  try {
    const { id } = req.params;
    const app = await appService.getApplicationById(req.app.locals.db, id);
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
    if (app.status !== 'pending') return res.status(400).json({ success: false, message: 'Application is already ' + app.status });

    const now = new Date().toISOString();
    const normalizedGoogleEmail = normalizeEmail(app.googleEmail || app.email);

    let existingCollaborator = normalizedGoogleEmail
      ? await collabService.getCollaboratorByGoogleEmail(req.app.locals.db, normalizedGoogleEmail)
      : null;

    if (!existingCollaborator && app.email) {
      existingCollaborator = await collabService.getCollaboratorByEmail(req.app.locals.db, app.email);
    }

    const collaboratorPayload = {
      name: app.name,
      email: normalizeEmail(app.email),
      googleEmail: normalizedGoogleEmail,
      phone: app.phone,
      phoneVerified: false,
      password: app.password,
      businessName: app.name + ' - ' + app.serviceCategory,
      businessType: app.serviceCategory,
      businessDescription: app.experience || '',
      serviceCategories: [app.serviceCategory],
      upiId: app.upiId || '',
      aadhaarId: app.aadhaarId || '',
      yearsOfExperience: app.yearsOfExperience || '',
      routeCities: app.routeCities || [],
      operatingCity: app.operatingCity || '',
      address: app.serviceAddress || '',
      city: app.serviceCity || '',
      state: app.serviceState || '',
      landmark: app.serviceLandmark || '',
      pinCode: app.servicePincode || '',
      totalRooms: app.totalRooms || 0,
      capacity: app.capacity || 0,
      totalSeats: app.totalSeats || 0,
      servicePhone: app.servicePhone || '',
      driverPhone: app.driverPhone || '',
      status: 'approved',
      verificationStatus: 'verified',
      verifiedAt: now,
      verifiedBy: req.admin?.username || 'admin'
    };

    if (existingCollaborator) {
      await collabService.updateCollaborator(req.app.locals.db, existingCollaborator.id, collaboratorPayload);
    } else {
      await collabService.createCollaborator(req.app.locals.db, {
        id: 'CL' + Date.now().toString(36).toUpperCase(),
        ...collaboratorPayload
      });
    }

    await appService.updateApplication(req.app.locals.db, id, {
      status: 'approved',
      googleEmail: normalizedGoogleEmail,
      adminNotes: 'Approved by ' + (req.admin?.username || 'admin')
    });

    res.json({ success: true, message: 'Application approved! Collaborator account created.' });
  } catch (e) {
    console.error('Approve application error:', e);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
}

export async function adminRejectApplication(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const app = await appService.getApplicationById(req.app.locals.db, id);
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
    if (app.status !== 'pending') return res.status(400).json({ success: false, message: 'Application is already ' + app.status });

    await appService.updateApplication(req.app.locals.db, id, {
      status: 'rejected',
      adminNotes: reason || 'Rejected by ' + (req.admin?.username || 'admin')
    });

    res.json({ success: true, message: 'Application rejected.' });
  } catch (e) {
    console.error('Reject application error:', e);
    res.status(500).json({ success: false, message: 'Rejection failed' });
  }
} 
