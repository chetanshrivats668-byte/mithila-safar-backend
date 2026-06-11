import 'dotenv/config';
import { getApplicationById } from '../services/applicationService.js';
import { getCollaboratorByEmail, createCollaborator } from '../services/collabService.js';

const mockDb = {};

async function run() {
  try {
    const appId = 'APPMQ8YRSJR';
    console.log(`Fetching application: ${appId}...`);
    const app = await getApplicationById(mockDb, appId);
    if (!app) {
      console.error(`Application ${appId} not found.`);
      return;
    }
    console.log(`Found application:`, {
      id: app.id,
      name: app.name,
      email: app.email,
      phone: app.phone,
      status: app.status
    });

    console.log(`Checking if collaborator already exists for email: ${app.email}...`);
    const existing = await getCollaboratorByEmail(mockDb, app.email);
    if (existing) {
      console.log(`Collaborator already exists with ID: ${existing.id}. Status: ${existing.status}`);
      return;
    }

    console.log(`Recreating collaborator account from approved application...`);
    const collaboratorPayload = {
      name: app.name,
      email: app.email,
      googleEmail: app.googleEmail || app.email,
      phone: app.phone,
      phoneVerified: false,
      password: app.password, // Note: already hashed in application
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
      status: 'approved',
      verificationStatus: 'verified',
      verifiedAt: new Date().toISOString(),
      verifiedBy: 'admin_sync'
    };

    const result = await createCollaborator(mockDb, {
      id: 'CL' + Date.now().toString(36).toUpperCase(),
      ...collaboratorPayload
    });

    console.log(`Successfully created collaborator!`, result);
  } catch (error) {
    console.error(`Error running sync script:`, error);
  }
}

run();
