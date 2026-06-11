import 'dotenv/config';
import { createCollaborator } from '../services/collabService.js';
// We need to pass a mock db object
const mockDb = {};

async function testInsert() {
  try {
    console.log('Testing createCollaborator write to Supabase...');
    const result = await createCollaborator(mockDb, {
      id: 'TEST_CL_123',
      name: 'Test Partner',
      email: 'testpartner@gmail.com',
      phone: '9876543210',
      password: 'somehashhere',
      businessName: 'Test Business',
      businessType: 'bus',
      serviceCategories: ['bus'],
      status: 'approved',
      verificationStatus: 'verified'
    });
    console.log('Finished. Result:', result);
  } catch (err) {
    console.error('Test insert crashed:', err);
  }
}

testInsert();
