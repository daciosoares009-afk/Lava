import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const magic = Buffer.from('LAVEBK1');
export function backupCipher(hexKey) {
  if (!/^[a-f0-9]{64}$/i.test(hexKey || '')) throw new Error('Backup key must be 32 random bytes in hex');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(hexKey,'hex'),iv);
  return {cipher,header:Buffer.concat([magic,iv])};
}
export function backupDecipher(header,tag,hexKey) {
  if (header.length!==19||!header.subarray(0,7).equals(magic)||!/^[a-f0-9]{64}$/i.test(hexKey||'')) throw new Error('Invalid encrypted backup');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(hexKey,'hex'),header.subarray(7));decipher.setAuthTag(tag);return decipher;
}
