import jwt from 'jsonwebtoken';
import { mfaStore } from './mfaStore.js';
import { users } from './users.js';
import { randomUUID, createHash } from 'node:crypto';
import { sessionRevoked } from './securityStore.js';
import { databaseReady } from './db.js';

export const cookieName = 'lavemais_session';

export function clearSessionCookies(res, config = {}) {
  const common = { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict' };
  // Limpa também a sessão antiga, que era restrita a /api.
  res.clearCookie(cookieName, { ...common, path: '/api' });
  res.clearCookie(cookieName, { ...common, path: '/' });
}

export async function getSessionUser(req, res) {
  if (!databaseReady()) return { error: 'DATABASE_UNAVAILABLE' };
  const token = req.cookies?.[cookieName];
  if (!token) return { error: 'UNAUTHENTICATED' };
  try {
    const config = req.app.locals.config;
    const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: 'lavemais-api', audience: 'lavemais-client' });
    if (typeof claims.sub !== 'string' || !Number.isFinite(claims.exp)) throw new jwt.JsonWebTokenError('Invalid claims');
    if (await sessionRevoked(createHash('sha256').update(token).digest('hex'))) {
      clearSessionCookies(res, config);
      return { error: 'UNAUTHENTICATED' };
    }
    const user = await users.findById(claims.sub);
    if (!user || (claims.sv ?? 0) !== (user.sessionVersion || 0)) {
      clearSessionCookies(res, config);
      return { error: 'UNAUTHENTICATED' };
    }
    const credential = await mfaStore.get(String(user.id));
    if (credential?.enabled && claims.mfaVersion !== credential.version) {
      clearSessionCookies(res, config);
      return { error: 'UNAUTHENTICATED' };
    }
    return { user, mfaVersion: claims.mfaVersion };
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError' || error?.name === 'CastError') {
      clearSessionCookies(res, req.app.locals.config);
      return { error: 'UNAUTHENTICATED' };
    }
    throw error;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const result = await getSessionUser(req, res);
    if (result.error === 'DATABASE_UNAVAILABLE') return res.status(503).json({ error: { code: result.error, message: 'O serviço da conta está temporariamente indisponível.' } });
    if (result.error) return res.status(401).json({ error: { code: result.error, message: 'Entre para acessar sua conta.' } });
    req.authenticatedUser = result.user;
    req.authenticatedMfaVersion = result.mfaVersion;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function issueSession(res, user, secret, nodeEnv, mfaVersion) {
  const token = jwt.sign({ sub: user.id, sv: user.sessionVersion || 0, ...(mfaVersion ? { mfaVersion } : {}) }, secret, { jwtid: randomUUID(), expiresIn: '7d', issuer: 'lavemais-api', audience: 'lavemais-client' });
  clearSessionCookies(res, { nodeEnv });
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
