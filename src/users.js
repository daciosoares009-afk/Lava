import { getDatabaseBackend, getSupabaseClient } from './db.js';
import { MongooseUser } from './models/User.js';

const profileColumns = 'id,full_name,email,phone,birth_date,session_version,created_at,updated_at';
function mapRow(row) {
  if (!row) return null;
  return { id: row.id, fullName: row.full_name, email: row.email, phone: row.phone,
    birthDate: new Date(row.birth_date), sessionVersion: row.session_version,
    passwordHash: row.password_hash, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) };
}
function record(data) {
  const names = { fullName: 'full_name', birthDate: 'birth_date', passwordHash: 'password_hash' };
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [names[key] || key, value instanceof Date ? value.toISOString().slice(0, 10) : value]));
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
const useMongo = () => getDatabaseBackend() === 'mongo';
export const users = {
  async create(data) {
    if (useMongo()) return MongooseUser.create(data);
    return mapRow(await result(getSupabaseClient().from('users').insert(record(data)).select(profileColumns).single()));
  },
  async findForLogin(email) {
    if (useMongo()) return MongooseUser.findOne({ email }).select('+passwordHash');
    return mapRow(await result(getSupabaseClient().from('users').select(`${profileColumns},password_hash`).eq('email', email).maybeSingle()));
  },
  async findById(id) {
    if (useMongo()) return MongooseUser.findById(id);
    // Old Mongo JWTs cannot address UUID rows after migration.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return null;
    return mapRow(await result(getSupabaseClient().from('users').select(profileColumns).eq('id', id).maybeSingle()));
  },
  async updateProfile(id, data) {
    if (useMongo()) return MongooseUser.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
    return mapRow(await result(getSupabaseClient().from('users').update(record(data)).eq('id', id).select(profileColumns).maybeSingle()));
  },
  async requestReset(email, hash) {
    if (useMongo()) {
      const now = new Date();
      return MongooseUser.findOneAndUpdate({ email, $or: [{ passwordResetRequestedAt: null }, { passwordResetRequestedAt: { $lte: new Date(now - 60000) } }] }, {
        $set: { passwordResetCodeHash: hash, passwordResetRequestedAt: now, passwordResetExpiresAt: new Date(+now + 600000) },
      }, { new: true, timestamps: false });
    }
    const rows = await result(getSupabaseClient().rpc('lavemais_request_reset', { p_email: email, p_hash: hash }));
    return rows?.[0] || null;
  },
  async cancelReset(email, hash) {
    if (useMongo()) return MongooseUser.updateOne({ email, passwordResetCodeHash: hash }, {
      $unset: { passwordResetCodeHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 },
    }, { timestamps: false });
    return result(getSupabaseClient().rpc('lavemais_cancel_reset', { p_email: email, p_hash: hash }));
  },
  async consumeReset(email, hash, passwordHash) {
    if (useMongo()) {
      const updated = await MongooseUser.updateOne({ email, passwordResetCodeHash: hash, passwordResetExpiresAt: { $gt: new Date() } }, {
        $set: { passwordHash }, $inc: { sessionVersion: 1 },
        $unset: { passwordResetCodeHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 },
      });
      return updated.matchedCount === 1;
    }
    return result(getSupabaseClient().rpc('lavemais_consume_reset', { p_email: email, p_hash: hash, p_password_hash: passwordHash }));
  },
};
