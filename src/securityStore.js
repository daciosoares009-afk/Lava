import mongoose from 'mongoose';
import { isIP } from 'node:net';
import { createHmac } from 'node:crypto';
import { getDatabaseBackend, getSupabaseClient } from './db.js';

const bucketSchema = new mongoose.Schema({ _id: String, hits: Number, expiresAt: Date }, { versionKey: false });
bucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Bucket = mongoose.models.RateBucket || mongoose.model('RateBucket', bucketSchema);
const revocationSchema = new mongoose.Schema({ _id: String, expiresAt: Date }, { versionKey: false });
revocationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Revocation = mongoose.models.SessionRevocation || mongoose.model('SessionRevocation', revocationSchema);

export async function initializeSecurityIndexes() {
  await Promise.all([Bucket.init(), Revocation.init()]);
}
export async function incrementBucket(key, windowMs) {
  const now = Date.now();
  // Fixed windows share exactly the same key on every server instance.
  const start = Math.floor(now / windowMs) * windowMs;
  const id = `${key}:${start}`;
  const expiresAt = new Date(start + windowMs);
  if (getDatabaseBackend() === 'mongo') {
    let row;
    try { row = await Bucket.findOneAndUpdate({ _id: id }, { $inc: { hits: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, new: true }); }
    catch (error) { if (error.code !== 11000) throw error; row = await Bucket.findOneAndUpdate({ _id: id }, { $inc: { hits: 1 } }, { new: true }); }
    return { hits: row.hits, expiresAt };
  }
  const { data, error } = await getSupabaseClient().rpc('lavemais_rate_limit', { p_key: id, p_expires_at: expiresAt.toISOString() });
  if (error) throw error;
  return { hits: data, expiresAt };
}
export function clientIdentity(req) {
  // Vercel overwrites X-Forwarded-For; other hosts must configure trusted CIDRs.
  const forwarded = req.app.locals.config.vercelDeployment ? req.headers['x-forwarded-for'] : undefined;
  let ip = typeof forwarded === 'string' && isIP(forwarded.trim()) ? forwarded.trim() : req.ip;
  if (ip?.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  if (isIP(ip) === 6) {
    const [left, right = ''] = ip.split('::');
    const head = left ? left.split(':') : [];
    const tail = right ? right.split(':') : [];
    const full = ip.includes('::') ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
    return full.slice(0, 4).map(part => Number.parseInt(part, 16).toString(16)).join(':') + '::/64';
  }
  return ip;
}
export function persistentLimit(scope, windowMs, limit, account = false) {
  return async (req, res, next) => {
    try {
      const identity = account ? String(req.body?.email || '').trim().toLowerCase() : clientIdentity(req);
      const hash = createHmac('sha256', req.app.locals.config.jwtSecret).update(`${scope}:${identity}`).digest('hex');
      const { hits, expiresAt } = await incrementBucket(hash, windowMs);
      if (hits <= limit) return next();
      res.set('Retry-After', String(Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000))));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } });
    } catch (error) { return next(error); }
  };
}
export async function revokeSession(hash, expiresAt) {
  if (getDatabaseBackend() === 'mongo') return Revocation.updateOne({ _id: hash }, { $set: { expiresAt } }, { upsert: true });
  const { error } = await getSupabaseClient().from('session_revocations').upsert({ token_hash: hash, expires_at: expiresAt.toISOString() });
  if (error) throw error;
}
export async function sessionRevoked(hash) {
  if (getDatabaseBackend() === 'mongo') return Boolean(await Revocation.exists({ _id: hash, expiresAt: { $gt: new Date() } }));
  const { data, error } = await getSupabaseClient().from('session_revocations').select('token_hash').eq('token_hash', hash).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
