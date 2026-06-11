import { supabase, isSupabaseAvailable } from './supabaseClient.js';

const TABLE_NOT_FOUND_CODES = ['42P01', 'PGRST205', 'PGRST301'];

function isTableError(err) {
  return err && TABLE_NOT_FOUND_CODES.includes(err.code);
}

function mapRow(row) {
  if (!row) return null;
  const data = { ...row };
  delete data.id;
  return { id: row.id, ...data };
}

// NOTE: Do NOT lowercase column keys – Supabase schema uses quoted camelCase
// identifiers that are case-sensitive in PostgREST.

export async function get(table, id) {
  try {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isTableError(error)) return null;
      throw error;
    }
    return data ? mapRow(data) : null;
  } catch (err) {
    if (isTableError(err)) return null;
    throw err;
  }
}

export async function list(table, opts = {}) {
  try {
    let q = supabase.from(table).select('*');
    if (opts.filters) {
      for (const f of opts.filters) {
        const col = f.column;
        if (f.op === 'eq') q = q.eq(col, f.value);
        if (f.op === 'neq') q = q.neq(col, f.value);
        if (f.op === 'gt') q = q.gt(col, f.value);
        if (f.op === 'gte') q = q.gte(col, f.value);
        if (f.op === 'lt') q = q.lt(col, f.value);
        if (f.op === 'lte') q = q.lte(col, f.value);
        if (f.op === 'like') q = q.like(col, f.value);
        if (f.op === 'ilike') q = q.ilike(col, f.value);
      }
    }
    if (opts.orderBy) {
      q = q.order(opts.orderBy.column, { ascending: opts.orderBy.ascending !== false });
    }
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) {
      if (isTableError(error)) return [];
      throw error;
    }
    return (data || []).map(r => mapRow(r));
  } catch (err) {
    if (isTableError(err)) return [];
    throw err;
  }
}

export async function create(table, id, data) {
  try {
    const clean = { ...data };
    if (table === 'users') {
      delete clean.userId;
    }
    const record = { id, ...clean };
    const { error } = await supabase.from(table).insert(record);
    if (error) {
      if (isTableError(error)) return null;
      throw error;
    }
    return record;
  } catch (err) {
    if (isTableError(err)) return null;
    throw err;
  }
}

export async function update(table, id, data) {
  try {
    const record = { ...data };
    const { error } = await supabase.from(table).update(record).eq('id', id);
    if (error) {
      if (isTableError(error)) return;
      throw error;
    }
    return { id, ...record };
  } catch (err) {
    if (isTableError(err)) return;
    throw err;
  }
}

export async function remove(table, id) {
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      if (isTableError(error)) return;
      throw error;
    }
  } catch (err) {
    if (isTableError(err)) return;
    throw err;
  }
}

export { isSupabaseAvailable };
