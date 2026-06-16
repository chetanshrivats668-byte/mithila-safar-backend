import { supabase, isSupabaseAvailable } from './supabaseClient.js';
import { memoryDb } from './firestoreFallback.js';


const TABLE_NOT_FOUND_CODES = ['42P01', 'PGRST205', 'PGRST301'];

function isTableError(err) {
  return err && TABLE_NOT_FOUND_CODES.includes(err.code);
}

function mapRow(row, table = '') {
  if (!row) return null;
  const data = { ...row };
  delete data.id;

  // Handle virtual collaboratorId field for orders table
  if (table === 'orders' || data.details) {
    if (data.details && !data.collaboratorId) {
      let detailsObj = data.details;
      if (typeof detailsObj === 'string') {
        try {
          detailsObj = JSON.parse(detailsObj);
        } catch (e) {}
      }
      if (detailsObj) {
        data.collaboratorId = detailsObj.collaboratorId || detailsObj.collabId || null;
      }
    }
  }

  // Handle virtual orderId field for orders table (since primary key in DB is "id")
  if (table === 'orders') {
    data.orderId = row.id;
  }

  return { id: row.id, ...data };
}

function mapTableToMemoryStore(table) {
  const tableMap = {
    users: 'users',
    collabs: 'collabs',
    orders: 'orders',
    bookings: 'bookings',
    email_otps: 'email_otps',
    collab_applications: 'collab_applications',
    audit_logs: 'audit_logs',
    collaborator_buses: 'buses',
    collaborator_hotels: 'hotels',
    collaborator_cabs: 'cabs',
    collaborator_cafes: 'cafes',
    collaborator_seats: 'seats',
    hotel_rooms: 'room_layouts',
    cafe_tables: 'table_layouts'
  };
  return tableMap[table] || null;
}

function getMemoryStore(table) {
  const key = mapTableToMemoryStore(table);
  return key ? memoryDb[key] : null;
}

function applyFilters(rows, filters = []) {
  if (!Array.isArray(filters) || filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => {
    const val = row?.[f.column];
    switch (f.op) {
      case 'eq': return val === f.value;
      case 'neq': return val !== f.value;
      case 'gt': return val > f.value;
      case 'gte': return val >= f.value;
      case 'lt': return val < f.value;
      case 'lte': return val <= f.value;
      case 'like': return String(val || '').includes(String(f.value || '').replace(/%/g, ''));
      case 'ilike': return String(val || '').toLowerCase().includes(String(f.value || '').replace(/%/g, '').toLowerCase());
      default: return true;
    }
  }));
}

function applyOrderAndLimit(rows, opts = {}) {
  let out = [...rows];
  if (opts.orderBy?.column) {
    const { column, ascending } = opts.orderBy;
    out.sort((a, b) => {
      const av = a?.[column];
      const bv = b?.[column];
      if (av == null && bv == null) return 0;
      if (av == null) return ascending === false ? 1 : -1;
      if (bv == null) return ascending === false ? -1 : 1;
      if (av > bv) return ascending === false ? -1 : 1;
      if (av < bv) return ascending === false ? 1 : -1;
      return 0;
    });
  }
  if (opts.limit) out = out.slice(0, opts.limit);
  return out;
}

// NOTE: Do NOT lowercase column keys – Supabase schema uses quoted camelCase
// identifiers that are case-sensitive in PostgREST.

export async function get(table, id) {
  if (!isSupabaseAvailable()) {
    const store = getMemoryStore(table);
    if (!store) return null;
    return store.get(id) || null;
  }

  try {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) {
      if (isTableError(error)) return null;
      throw error;
    }
    return data ? mapRow(data, table) : null;
  } catch (err) {
    if (isTableError(err)) return null;
    throw err;
  }
}

export async function list(table, opts = {}) {
  if (!isSupabaseAvailable()) {
    const store = getMemoryStore(table);
    if (!store) return [];
    const rows = Array.from(store.values());
    return applyOrderAndLimit(applyFilters(rows, opts.filters), opts);
  }

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
    return (data || []).map(r => mapRow(r, table));
  } catch (err) {
    if (isTableError(err)) return [];
    throw err;
  }
}

export async function create(table, id, data) {
  if (!isSupabaseAvailable()) {
    const store = getMemoryStore(table);
    if (store) {
      const clean = { ...data };
      if (table === 'users') {
        delete clean.userId;
      }
      const record = { id, ...clean };
      store.set(id, record);
      return record;
    }
    return null;
  }

  try {
    const clean = { ...data };
    if (table === 'users') {
      delete clean.userId;
    }
    if (table === 'orders') {
      delete clean.collaboratorId;
      delete clean.orderId;
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
  if (!isSupabaseAvailable()) {
    const store = getMemoryStore(table);
    if (store) {
      const existing = store.get(id) || {};
      const record = { ...existing, ...data };
      store.set(id, record);
      return record;
    }
    return;
  }

  try {
    const record = { ...data };
    if (table === 'orders') {
      delete record.collaboratorId;
      delete record.orderId;
    }
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
  if (!isSupabaseAvailable()) {
    const store = getMemoryStore(table);
    if (store) {
      store.delete(id);
    }
    return;
  }

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
