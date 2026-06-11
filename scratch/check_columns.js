import 'dotenv/config';
import { supabase } from '../utils/supabaseClient.js';

async function check() {
  try {
    console.log('Checking collaborator_cabs table columns...');
    const { data: cabsData, error: cabsError } = await supabase.from('collaborator_cabs').select('*').limit(1);
    if (cabsError) {
      console.error('Cabs query error:', cabsError);
    } else {
      console.log('Cabs columns:', cabsData.length > 0 ? Object.keys(cabsData[0]) : 'No records to inspect');
    }

    console.log('Checking collaborator_hotels table columns...');
    const { data: hotelsData, error: hotelsError } = await supabase.from('collaborator_hotels').select('*').limit(1);
    if (hotelsError) {
      console.error('Hotels query error:', hotelsError);
    } else {
      console.log('Hotels columns:', hotelsData.length > 0 ? Object.keys(hotelsData[0]) : 'No records to inspect');
    }

    console.log('Checking collaborator_cafes table columns...');
    const { data: cafesData, error: cafesError } = await supabase.from('collaborator_cafes').select('*').limit(1);
    if (cafesError) {
      console.error('Cafes query error:', cafesError);
    } else {
      console.log('Cafes columns:', cafesData.length > 0 ? Object.keys(cafesData[0]) : 'No records to inspect');
    }

  } catch (err) {
    console.error('Crash checking columns:', err);
  }
}

check();
