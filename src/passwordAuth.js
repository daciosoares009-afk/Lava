import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

// A missing account must still perform the same cost-12 password comparison.
// This random value is never a credential and is never persisted or returned.
let fallbackHash;
export async function passwordMatches(user, password) {
  const hash = user?.passwordHash || await (fallbackHash ??= bcrypt.hash(randomBytes(32).toString('hex'), 12));
  const matches = await bcrypt.compare(password, hash);
  return Boolean(user && matches);
}
