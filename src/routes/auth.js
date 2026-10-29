import { Router } from 'express';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { persistentLimit, revokeSession } from '../securityStore.js';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { users } from '../users.js';
import { validateLogin, validatePasswordResetConfirmation, validatePasswordResetRequest, validateRegistration } from '../authValidation.js';
import { databaseReady } from '../db.js';
import { clearSessionCookies, cookieName, getSessionUser } from '../authSession.js';

const router = Router();
const authLimit = persistentLimit('auth-ip', 15 * 60_000, 10);
const passwordResetRequestLimit = persistentLimit('reset-request-ip', 60 * 60_000, 5);
const passwordResetConfirmLimit = persistentLimit('reset-confirm-ip', 15 * 60_000, 10);
const resetAccountLimit = persistentLimit('reset-account', 15 * 60_000, 10, true);
function ensureDatabase(_req, res, next) {
  if (!databaseReady()) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'O serviço de cadastro e login está temporariamente indisponível.' } });
  return next();
}

function publicUser(user) {
  return { id: user.id, fullName: user.fullName, email: user.email, createdAt: user.createdAt };
}

function issueSession(res, user, secret, nodeEnv) {
  const token = jwt.sign({ sub: user.id, sv: user.sessionVersion || 0 }, secret, { jwtid: randomUUID(), expiresIn: '7d', issuer: 'lavemais-api', audience: 'lavemais-client' });
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

router.post('/register', ensureDatabase, authLimit, async (req, res, next) => {
  const { errors, value } = validateRegistration(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os campos informados.', fields: errors } });
  try {
    const passwordHash = await bcrypt.hash(value.password, 12);
    const user = await users.create({
      fullName: value.fullName,
      email: value.email,
      phone: value.phone,
      birthDate: value.birthDate,
      passwordHash,
    });
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if ((error?.code === 11000 && error?.keyPattern?.email) || error?.code === '23505') {
      return res.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'Este e-mail já possui cadastro.' } });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os dados informados.' } });
    }
    return next(error);
  }
});

router.post('/password-reset/request', ensureDatabase, passwordResetRequestLimit, async (req, res, next) => {
  const { errors, value } = validatePasswordResetRequest(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Informe um e-mail válido.', fields: errors } });

  const config = req.app.locals.config;
  if (!config.smtp?.configured) {
    return res.status(503).json({ error: { code: 'EMAIL_UNAVAILABLE', message: 'O envio de e-mails está temporariamente indisponível.' } });
  }

  try {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = passwordResetCodeHash(code, config.jwtSecret);
    const user = await users.requestReset(value.email, codeHash);

    if (user) {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        requireTLS: config.smtp.port !== 465,
        auth: { user: config.smtp.user, pass: config.smtp.password },
        connectionTimeout: 4_000,
        greetingTimeout: 4_000,
        socketTimeout: 8_000,
      });
      try {
        await transporter.sendMail({
          from: config.smtp.from,
          to: value.email,
          subject: 'Código para redefinir sua senha | LaveMais',
          text: `Seu código para redefinir a senha é: ${code}\n\nEle expira em 10 minutos. Se você não solicitou a redefinição, ignore este e-mail.`,
        });
      } catch (error) {
        try { await users.cancelReset(value.email, codeHash); }
        catch (cleanupError) { console.error('Password reset cleanup failed:', cleanupError?.code || cleanupError?.name); }
        console.error('Password reset email delivery failed:', error?.name || 'Error');
        return res.status(503).json({ error: { code: 'EMAIL_DELIVERY_FAILED', message: 'Não foi possível enviar o código agora. Tente novamente mais tarde.' } });
      }
    }

    return res.json({ message: 'Se o e-mail estiver cadastrado, você receberá um código para redefinir a senha.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/password-reset/confirm', ensureDatabase, passwordResetConfirmLimit, resetAccountLimit, async (req, res, next) => {
  const { errors, value } = validatePasswordResetConfirmation(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira o e-mail, o código e a nova senha.', fields: errors } });

  try {
    const passwordHash = await bcrypt.hash(value.password, 12);
    const consumed = await users.consumeReset(value.email, passwordResetCodeHash(value.code, req.app.locals.config.jwtSecret), passwordHash);
    if (!consumed) {
      return res.status(400).json({ error: { code: 'INVALID_RESET_CODE', message: 'Código inválido ou expirado. Solicite um novo código.' } });
    }
    return res.json({ message: 'Senha redefinida com sucesso. Entre com sua nova senha.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', ensureDatabase, authLimit, async (req, res, next) => {
  const { errors, value } = validateLogin(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Informe e-mail e senha válidos.', fields: errors } });
  try {
    const user = await users.findForLogin(value.email);
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

router.post('/logout', async (req, res, next) => {
  const config = req.app.locals.config;
  clearSessionCookies(res, config);
  const token = req.cookies?.[cookieName];
  if (!token) return res.status(204).end();
  try {
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'lavemais-api', audience: 'lavemais-client' });
    await revokeSession(createHash('sha256').update(token).digest('hex'), new Date(claims.exp * 1000));
    return res.status(204).end();
  } catch (error) {
    if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return res.status(204).end();
    return next(error);
  }
});

export default router;
