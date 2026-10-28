import mongoose from 'mongoose';
import { getSupabaseClient } from '../db.js';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
  phone: { type: String, required: true, trim: true, maxlength: 24 },
  birthDate: { type: Date, required: true },
  passwordHash: { type: String, required: true, select: false },
  passwordResetCodeHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  passwordResetRequestedAt: { type: Date, select: false },
  sessionVersion: { type: Number, default: 0 },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
});

const MongooseUser = mongoose.models.User || mongoose.model('User', userSchema);

const SUPABASE_FIELD_MAP = {
  fullName: 'full_name',
  birthDate: 'birth_date',
  passwordHash: 'password_hash',
  passwordResetCodeHash: 'password_reset_code_hash',
  passwordResetExpiresAt: 'password_reset_expires_at',
  passwordResetRequestedAt: 'password_reset_requested_at',
  sessionVersion: 'session_version',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

function mapSupabaseRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? row._id,
    fullName: row.full_name ?? row.fullName,
    email: row.email,
    phone: row.phone,
    birthDate: row.birth_date ? new Date(row.birth_date) : undefined,
    passwordHash: row.password_hash ?? row.passwordHash,
    passwordResetCodeHash: row.password_reset_code_hash ?? row.passwordResetCodeHash,
    passwordResetExpiresAt: row.password_reset_expires_at ? new Date(row.password_reset_expires_at) : undefined,
    passwordResetRequestedAt: row.password_reset_requested_at ? new Date(row.password_reset_requested_at) : undefined,
    sessionVersion: Number(row.session_version ?? row.sessionVersion ?? 0),
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
    _id: row.id ?? row._id,
  };
}

function mapSupabaseRecord(record) {
  const result = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    if (value === undefined) continue;
    const mappedKey = SUPABASE_FIELD_MAP[key] || key;
    if (key === 'birthDate' && value instanceof Date) result[mappedKey] = value.toISOString().slice(0, 10);
    else if ((key === 'passwordResetExpiresAt' || key === 'passwordResetRequestedAt' || key === 'createdAt' || key === 'updatedAt') && value instanceof Date) result[mappedKey] = value.toISOString();
    else result[mappedKey] = value;
  }
  return result;
}

function makeSupabaseQuery(method, filter = null, extras = {}) {
  return {
    _selector: '*',
    select(selector) {
      this._selector = selector === '+passwordHash' ? '*' : (selector || '*');
      return this;
    },
    async then(resolve, reject) {
      try {
        resolve(await runSupabaseQuery(method, filter, extras, this._selector));
      } catch (error) {
        reject(error);
      }
    },
    async catch(reject) {
      try {
        return await runSupabaseQuery(method, filter, extras, this._selector);
      } catch (error) {
        return reject(error);
      }
    },
  };
}

async function runSupabaseQuery(method, filter, extras, selector) {
  const client = getSupabaseClient();
  const table = client.from('users');

  if (method === 'findOne') {
    let query = table.select(selector || '*');
    if (filter?.email) query = query.eq('email', filter.email);
    if (filter?.id) query = query.eq('id', filter.id);
    if (filter?._id) query = query.eq('id', filter._id);
    const { data, error } = await query.limit(50);
    if (error) throw error;
    if (!data?.length) return null;
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return data[0] ? mapSupabaseRow(data[0]) : null;
    const candidate = data.find((row) => {
      if (!filter.$or) return true;
      return filter.$or.some((condition) => {
        const entries = Object.entries(condition);
        return entries.every(([key, value]) => {
          const dbKey = key === 'passwordResetRequestedAt' ? 'password_reset_requested_at' : key === 'passwordResetCodeHash' ? 'password_reset_code_hash' : key === 'passwordResetExpiresAt' ? 'password_reset_expires_at' : key === 'sessionVersion' ? 'session_version' : key === 'fullName' ? 'full_name' : key === 'birthDate' ? 'birth_date' : key === 'passwordHash' ? 'password_hash' : key;
          const rowValue = row[dbKey];
          if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, '$lte')) {
            const base = rowValue ? new Date(rowValue) : null;
            const compare = value.$lte ? new Date(value.$lte) : null;
            return !base || !compare ? false : base <= compare;
          }
          return rowValue === value;
        });
      });
    });
    return candidate ? mapSupabaseRow(candidate) : null;
  }

  if (method === 'findById') {
    const { data, error } = await table.select(selector || '*').eq('id', filter).limit(1);
    if (error) throw error;
    return data?.[0] ? mapSupabaseRow(data[0]) : null;
  }

  if (method === 'create') {
    const { data, error } = await table.insert(mapSupabaseRecord(extras.data)).select('*').single();
    if (error) throw error;
    return mapSupabaseRow(data);
  }

  if (method === 'findOneAndUpdate') {
    const rows = await table.select('*').eq('email', filter.email).limit(50);
    if (rows.error) throw rows.error;
    const existing = rows.data?.find((row) => {
      if (!filter.$or) return true;
      return filter.$or.some((condition) => Object.entries(condition).every(([key, value]) => {
        const dbKey = key === 'passwordResetRequestedAt' ? 'password_reset_requested_at' : key === 'passwordResetCodeHash' ? 'password_reset_code_hash' : key === 'passwordResetExpiresAt' ? 'password_reset_expires_at' : key === 'sessionVersion' ? 'session_version' : key === 'fullName' ? 'full_name' : key === 'birthDate' ? 'birth_date' : key === 'passwordHash' ? 'password_hash' : key;
        const rowValue = row[dbKey];
        if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, '$lte')) {
          const base = rowValue ? new Date(rowValue) : null;
          const compare = value.$lte ? new Date(value.$lte) : null;
          return !!base && !!compare && base <= compare;
        }
        return rowValue === value;
      }));
    });
    if (!existing) return null;
    const patch = {};
    if (extras.updateDoc?.$set) Object.assign(patch, mapSupabaseRecord(extras.updateDoc.$set));
    if (extras.updateDoc?.$unset) {
      for (const key of Object.keys(extras.updateDoc.$unset)) patch[SUPABASE_FIELD_MAP[key] || key] = null;
    }
    if (extras.updateDoc?.$inc) {
      for (const [key, value] of Object.entries(extras.updateDoc.$inc)) {
        const dbKey = SUPABASE_FIELD_MAP[key] || key;
        patch[dbKey] = Number(existing[dbKey] ?? 0) + Number(value);
      }
    }
    const { data, error } = await table.update(patch).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return mapSupabaseRow(data);
  }

  if (method === 'updateOne') {
    const rows = await table.select('*').eq('email', filter.email).limit(50);
    if (rows.error) throw rows.error;
    const match = rows.data?.find((row) => {
      const hashMatches = row.password_reset_code_hash === filter.passwordResetCodeHash;
      const expiry = row.password_reset_expires_at ? new Date(row.password_reset_expires_at) : null;
      const validExpiry = !!expiry && expiry > new Date();
      if (filter.passwordResetExpiresAt && typeof filter.passwordResetExpiresAt === 'object') {
        return hashMatches && validExpiry && row.email === filter.email;
      }
      return hashMatches && validExpiry && row.email === filter.email;
    });
    if (!match) return { matchedCount: 0, modifiedCount: 0, acknowledged: true };
    const patch = {};
    if (extras.updateDoc?.$set) Object.assign(patch, mapSupabaseRecord(extras.updateDoc.$set));
    if (extras.updateDoc?.$unset) {
      for (const key of Object.keys(extras.updateDoc.$unset)) patch[SUPABASE_FIELD_MAP[key] || key] = null;
    }
    if (extras.updateDoc?.$inc) {
      for (const [key, value] of Object.entries(extras.updateDoc.$inc)) {
        const dbKey = SUPABASE_FIELD_MAP[key] || key;
        patch[dbKey] = Number(match[dbKey] ?? 0) + Number(value);
      }
    }
    const { data, error } = await table.update(patch).eq('id', match.id).select('*').single();
    if (error) throw error;
    return { matchedCount: 1, modifiedCount: 1, acknowledged: true, value: mapSupabaseRow(data) };
  }

  if (method === 'findByIdAndUpdate') {
    const patch = {};
    if (extras.updateDoc?.$set) Object.assign(patch, mapSupabaseRecord(extras.updateDoc.$set));
    const { data, error } = await table.update(patch).eq('id', filter).select('*').single();
    if (error) throw error;
    return mapSupabaseRow(data);
  }

  return null;
}

const SupabaseUser = {
  create(data) {
    return makeSupabaseQuery('create', null, { data });
  },
  findOne(filter) {
    return makeSupabaseQuery('findOne', filter);
  },
  findById(id) {
    return makeSupabaseQuery('findById', id);
  },
  findOneAndUpdate(filter, updateDoc) {
    return makeSupabaseQuery('findOneAndUpdate', filter, { updateDoc });
  },
  updateOne(filter, updateDoc) {
    return makeSupabaseQuery('updateOne', filter, { updateDoc });
  },
  findByIdAndUpdate(id, updateDoc) {
    return makeSupabaseQuery('findByIdAndUpdate', id, { updateDoc });
  },
};

const UseSupabase = Boolean(process.env.SUPABASE_URL) || Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) || Boolean(process.env.SUPABASE_ANON_KEY);
export const User = UseSupabase ? SupabaseUser : MongooseUser;
