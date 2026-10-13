import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { User } from '../models/User.js';
import { validateLogin, validateRegistration } from '../authValidation.js';
import { databaseReady } from '../db.js';
import { clearSessionCookies, cookieName, getSessionUser } from '../authSession.js';

const router = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } } });
function ensureDatabase(_req, res, next) {
  if (!databaseReady()) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'O serviço de cadastro e login está temporariamente indisponível.' } });
  return next();
}

function publicUser(user) {
  return { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt };
}

function issueSession(res, user, secret, nodeEnv) {
  const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '7d', issuer: 'lavemais-api', audience: 'lavemais-client' });
  clearSessionCookies(res, { nodeEnv });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post('/register', authLimit, ensureDatabase, async (req, res, next) => {
  const { errors, value } = validateRegistration(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os campos informados.', fields: errors } });
  try {
    const passwordHash = await bcrypt.hash(value.password, 12);
    const user = await User.create({
      fullName: value.fullName,
      email: value.email,
      phone: value.phone,
      birthDate: value.birthDate,
      passwordHash,
    });
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'Este e-mail já possui cadastro.' } });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os dados informados.' } });
    }
    return next(error);
  }
});

router.post('/login', authLimit, ensureDatabase, async (req, res, next) => {
  const { errors, value } = validateLogin(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Informe e-mail e senha válidos.', fields: errors } });
  try {
    const user = await User.findOne({ email: value.email }).select('+passwordHash');
    const matches = user ? await bcrypt.compare(value.password, user.passwordHash) : false;
    if (!matches) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' } });
    issueSession(res, user, req.app.locals.config.jwtSecret, req.app.locals.config.nodeEnv);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', ensureDatabase, async (req, res, next) => {
  try {
    const result = await getSessionUser(req, res);
    if (result.error) return res.status(result.error === 'DATABASE_UNAVAILABLE' ? 503 : 401).json({ error: { code: result.error, message: 'Entre para acessar sua conta.' } });
    return res.json({ user: publicUser(result.user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookies(res, req.app.locals.config);
  return res.status(204).end();
});

export default router;
