import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth } from '../authSession.js';
import { validateProfileUpdate } from '../profileValidation.js';

const router = Router();

function profileUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    birthDate: user.birthDate?.toISOString().slice(0, 10) || '',
    createdAt: user.createdAt,
  };
}

router.use(requireAuth);

router.get('/profile', (req, res) => res.json({ user: profileUser(req.authenticatedUser) }));

router.patch('/profile', async (req, res, next) => {
  const { errors, value } = validateProfileUpdate(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os campos informados.', fields: errors } });
  try {
    const user = await User.findByIdAndUpdate(req.authenticatedUser.id, { $set: value }, { new: true, runValidators: true });
    if (!user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Entre para acessar sua conta.' } });
    return res.json({ user: profileUser(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;
