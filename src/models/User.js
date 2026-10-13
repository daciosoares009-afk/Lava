import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true },
  phone: { type: String, required: true, trim: true, maxlength: 24 },
  birthDate: { type: Date, required: true },
  passwordHash: { type: String, required: true, select: false },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  versionKey: false,
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
