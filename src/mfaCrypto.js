import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual, createHash } from 'node:crypto';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode(value) {
  let bits = 0, buffer = 0; const result = [];
  for (const char of value) { const index = alphabet.indexOf(char); if (index < 0) throw new Error('Invalid authenticator secret'); buffer = (buffer << 5) | index; bits += 5; if (bits >= 8) { result.push((buffer >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(result);
}
export const newSecret = () => base32(randomBytes(20));
export function totp(secret, counter, digits = 6) {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', decode(secret)).update(bytes).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
export function matchingCounter(secret, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30000);
  for (const delta of [0, -1, 1]) if (counter + delta >= 0 && timingSafeEqual(Buffer.from(code), Buffer.from(totp(secret, counter + delta)))) return counter + delta;
  return null;
}
function key(config) {
  if (!/^[a-f0-9]{64}$/i.test(config.mfaEncryptionKey || '')) throw Object.assign(new Error('MFA encryption unavailable'), { status: 503 });
  return Buffer.from(config.mfaEncryptionKey, 'hex');
}
export function encryptSecret(secret, config, userId) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(config), iv);
  cipher.setAAD(Buffer.from(String(userId)));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(value => value.toString('base64url')).join('.');
}
export function decryptSecret(value, config, userId) {
  const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(config), iv); cipher.setAAD(Buffer.from(String(userId))); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
export const recoveryHash = code => createHash('sha256').update(code).digest('hex');
export const recoveryCodes = () => Array.from({ length: 8 }, () => randomBytes(12).toString('hex'));
