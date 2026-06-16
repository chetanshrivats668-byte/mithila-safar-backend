import { createClient } from '@supabase/supabase-js';
import { memoryDb } from './firestoreFallback.js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function isSupabaseAvailable() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export const supabase = isSupabaseAvailable()
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

export { isSupabaseAvailable };
