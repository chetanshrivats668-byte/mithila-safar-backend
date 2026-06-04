import crypto from 'crypto';
import { sanitizeInput } from '../middleware/validator.js';
import * as appService from '../services/applicationService.js';
import * as collabService from '../services/collabService.js';
import { generateToken } from '../middleware/auth.js';

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

    const existing = await appService.getApplicationByEmail(req.app.locals.db, data.email);
    if (existing) {
      if (existing.status === 'pending') return res.status(409).json({ success: false, message: 'You already have a pending application. Please wait for admin review.' });
      if (existing.status === 'approved') return res.status(409).json({ success: false, message: 'Your application was already approved. Please login with your credentials.' });
    }

    const hashedPassword = crypto.createHash('sha256').update(data.password).digest('hex');
    const application = await appService.createApplication(req.app.locals.db, {
      name: data.name,
      email: data.email,
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
      servicePincode: data.servicePincode || ''
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully! We will review and notify you.',
      application: { id: application.id, name: application.name, email: application.email, serviceCategory: application.serviceCategory, status: application.status }
    });
  } catch (e) {
    console.error('Submit application error:', e);
    res.status(500).json({ success: false, message: 'Failed to submit application' });
  }
}

export async function checkApplicationStatus(req, res) {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    const app = await appService.getApplicationByEmail(req.app.locals.db, email);
    if (!app) return res.json({ success: true, hasApplication: false });
    res.json({
      success: true,
      hasApplication: true,
      application: {
        id: app.id,
        name: app.name,
        serviceCategory: app.serviceCategory,
        status: app.status,
        createdAt: app.createdAt
      }
    });
  } catch (e) {
    console.error('Check application status error:', e);
    res.status(500).json({ success: false, message: 'Failed to check status' });
  }
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

    const collabId = 'CL' + Date.now().toString(36).toUpperCase();
    const now = new Date().toISOString();
    const collabData = {
      id: collabId,
      name: app.name,
      email: app.email,
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
      // Create as approved so collaborator appears in public listings
      status: 'approved',
      verificationStatus: 'verified',
      verifiedAt: now,
      verifiedBy: req.admin?.username || 'admin',
      createdAt: now,
      updatedAt: now
    };

    await collabService.createCollaborator(req.app.locals.db, collabData);
    await appService.updateApplication(req.app.locals.db, id, { status: 'approved', adminNotes: 'Approved by ' + (req.admin?.username || 'admin') });

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
