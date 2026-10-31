import { MongooseUser } from './models/User.js';
import mongoose from 'mongoose';
import { getDatabaseBackend, getSupabaseClient } from './db.js';
const schema = new mongoose.Schema({ _id: String, secret: String, enabled: Boolean, version: String, expiresAt: Date, lastCounter: Number, recoveryHashes: [String] }, { versionKey: false });
const Credential = mongoose.models.MfaCredential || mongoose.model('MfaCredential', schema);
const mongo = () => getDatabaseBackend() === 'mongo';
function row(data) { return data && { secret: data.secret, enabled: data.enabled, version: data.version, expiresAt: new Date(data.expires_at), lastCounter: data.last_counter, recoveryHashes: data.recovery_hashes }; }
async function result(query) { const { data, error } = await query; if (error) throw error; return data; }
export const mfaStore = {
  async get(id) {
    if (mongo()) return Credential.findById(String(id)).lean();
    return row(await result(getSupabaseClient().from('mfa_credentials').select('*').eq('user_id', id).maybeSingle()));
  },
  async begin(id, secret, version) {
    if (mongo()) {
      try { return Boolean(await Credential.findOneAndUpdate({ _id: String(id), enabled: { $ne: true } }, { $set: { secret, version, enabled: false, expiresAt: new Date(Date.now() + 600000), lastCounter: -1, recoveryHashes: [] } }, { upsert: true, new: true })); }
      catch (error) { if (error.code === 11000) return false; throw error; }
    }
    return result(getSupabaseClient().rpc('lavemais_mfa_begin', { p_id: id, p_secret: secret, p_version: version }));
  },
  async activate(id, version, counter, hashes) {
    if (mongo()) return Boolean(await Credential.findOneAndUpdate({ _id: String(id), version, enabled: false, expiresAt: { $gt: new Date() } }, { $set: { enabled: true, lastCounter: counter, recoveryHashes: hashes } }));
    return result(getSupabaseClient().rpc('lavemais_mfa_activate', { p_id: id, p_version: version, p_counter: counter, p_hashes: hashes }));
  },
  async consume(id, version, counter, recovery) {
    if (mongo()) return Boolean(await Credential.findOneAndUpdate({ _id: String(id), version, enabled: true, ...(recovery ? { recoveryHashes: recovery } : { lastCounter: { $lt: counter } }) }, recovery ? { $pull: { recoveryHashes: recovery } } : { $set: { lastCounter: counter } }));
    return result(getSupabaseClient().rpc('lavemais_mfa_consume', { p_id: id, p_version: version, p_counter: counter, p_recovery: recovery }));
  },
  async disable(id, version) {
    if (mongo()) {
      await MongooseUser.updateOne({ _id: id }, { $inc: { sessionVersion: 1 } });
      return Boolean(await Credential.findOneAndUpdate({ _id: String(id), enabled: true, version }, { $set: { enabled: false, secret: '', recoveryHashes: [], version: '' } }));
    }
    return result(getSupabaseClient().rpc('lavemais_mfa_disable', { p_id: id, p_version: version }));
  },
};
