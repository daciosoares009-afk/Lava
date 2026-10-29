import mongoose from 'mongoose';
import { getDatabaseBackend } from '../db.js';

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

export const MongooseUser = mongoose.models.User || mongoose.model('User', userSchema);
// Compatibility for Mongo integration tooling; application code uses users.js.
export const User = new Proxy({}, { get(_target, method) {
  if (getDatabaseBackend() !== 'mongo') throw new Error('Operação Mongoose indisponível neste backend.');
  const value = MongooseUser[method];
  return typeof value === 'function' ? value.bind(MongooseUser) : value;
} });
