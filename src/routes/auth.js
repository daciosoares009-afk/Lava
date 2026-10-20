import { Router } from 'express';
import { createHmac, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { User } from '../models/User.js';
import { validateLogin, validatePasswordResetConfirmation, validatePasswordResetRequest, validateRegistration } from '../authValidation.js';
import { databaseReady } from '../db.js';
import { clearSessionCookies, cookieName, getSessionUser } from '../authSession.js';

const router = Router();
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } } });
const passwordResetRequestLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Muitas solicitações. Aguarde antes de pedir outro código.' } } });
const passwordResetConfirmLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' } } });
function ensureDatabase(_req, res, next) {
  if (!databaseReady()) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'O serviço de cadastro e login está temporariamente indisponível.' } });
  return next();
}

function publicUser(user) {
  return { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt };
}

function issueSession(res, user, secret, nodeEnv) {
  const token = jwt.sign({ sub: user.id, sv: user.sessionVersion || 0 }, secret, { expiresIn: '7d', issuer: 'lavemais-api', audience: 'lavemais-client' });
  clearSessionCookies(res, { nodeEnv });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function passwordResetCodeHash(code, secret) {
  return createHmac('sha256', secret).update(code).digest('hex');
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

router.post('/password-reset/request', passwordResetRequestLimit, ensureDatabase, async (req, res, next) => {
  const { errors, value } = validatePasswordResetRequest(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Informe um e-mail válido.', fields: errors } });

  const config = req.app.locals.config;
  if (!config.smtp?.configured) {
    return res.status(503).json({ error: { code: 'EMAIL_UNAVAILABLE', message: 'O envio de e-mails está temporariamente indisponível.' } });
  }

  try {
    const now = new Date();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = passwordResetCodeHash(code, config.jwtSecret);
    const user = await User.findOneAndUpdate({
      email: value.email,
      $or: [
        { passwordResetRequestedAt: { $exists: false } },
        { passwordResetRequestedAt: { $lte: new Date(now.getTime() - 60_000) } },
      ],
    }, {
      $set: {
        passwordResetCodeHash: codeHash,
        passwordResetExpiresAt: new Date(now.getTime() + 10 * 60_000),
        passwordResetRequestedAt: now,
      },
    }, { timestamps: false });

    if (user) {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        requireTLS: config.smtp.port !== 465,
        auth: { user: config.smtp.user, pass: config.smtp.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      try {
        await transporter.sendMail({
          from: config.smtp.from,
          to: value.email,
          subject: 'Código para redefinir sua senha | LaveMais',
          text: `Seu código para redefinir a senha é: ${code}\n\nEle expira em 10 minutos. Se você não solicitou a redefinição, ignore este e-mail.`,
        });
      } catch (error) {
        await User.updateOne({ _id: user._id, passwordResetCodeHash: codeHash }, {
          $unset: { passwordResetCodeHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 },
        });
        console.error('Password reset email delivery failed:', error?.name || 'Error');
        return res.status(503).json({ error: { code: 'EMAIL_DELIVERY_FAILED', message: 'Não foi possível enviar o código agora. Tente novamente mais tarde.' } });
      }
    }

    return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um código para redefinir a senha.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/password-reset/confirm', passwordResetConfirmLimit, ensureDatabase, async (req, res, next) => {
  const { errors, value } = validatePasswordResetConfirmation(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira o e-mail, o código e a nova senha.', fields: errors } });

  try {
    const passwordHash = await bcrypt.hash(value.password, 12);
    const result = await User.updateOne({
      email: value.email,
      passwordResetCodeHash: passwordResetCodeHash(value.code, req.app.locals.config.jwtSecret),
      passwordResetExpiresAt: { $gt: new Date() },
    }, {
      $set: { passwordHash },
      $inc: { sessionVersion: 1 },
      $unset: { passwordResetCodeHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 },
    });
    if (!result.matchedCount) {
      return res.status(400).json({ error: { code: 'INVALID_RESET_CODE', message: 'Código inválido ou expirado. Solicite um novo código.' } });
    }
    return res.json({ message: 'Senha redefinida com sucesso. Entre com sua nova senha.' });
  } catch (error) {
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
