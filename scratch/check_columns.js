import 'dotenv/config';
import { supabase } from '../utils/supabaseClient.js';

async function check() {
  try {
    console.log('Checking collaborators table columns...');
    const { data: collabData, error: collabError } = await supabase.from('collaborators').select('*').limit(1);
    if (collabError) {
      console.error('Collab query error:', collabError);
    } else {
      console.log('Collab columns:', collabData.length > 0 ? Object.keys(collabData[0]) : 'No records');
    }
  } catch (err) {
    console.error('Crash checking columns:', err);
  }
}

check();
