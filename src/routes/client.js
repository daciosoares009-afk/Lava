import { Router } from 'express';
import { appointments } from '../appointments.js';
import { users } from '../users.js';
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

router.get('/dashboard', async (req, res) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  res.json(await appointments.overview(req.authenticatedUser.id, today));
});
router.get('/profile', (req, res) => res.json({ user: profileUser(req.authenticatedUser) }));

router.patch('/profile', async (req, res, next) => {
  const { errors, value } = validateProfileUpdate(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os campos informados.', fields: errors } });
  try {
    const user = await users.updateProfile(req.authenticatedUser.id, value);
    if (!user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Entre para acessar sua conta.' } });
    return res.json({ user: profileUser(user) });
  } catch (error) {
    return next(error);
  }
});

export default router;
