import jwt from 'jsonwebtoken';
import { User } from './models/User.js';
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
    const claims = jwt.verify(token, config.jwtSecret, { issuer: 'lavemais-api', audience: 'lavemais-client' });
    const user = await User.findById(claims.sub);
    if (!user || (claims.sv ?? 0) !== (user.sessionVersion || 0)) {
      clearSessionCookies(res, config);
      return { error: 'UNAUTHENTICATED' };
    }
    return { user };
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
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
    return next();
  } catch (error) {
    return next(error);
  }
}
