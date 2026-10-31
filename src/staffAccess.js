import { requireAuth } from './authSession.js';
export const isStaff = (user, config) => Boolean(user && config.staffUserIds?.includes(String(user.id)));
export async function requireStaff(req, res, next) {
  return requireAuth(req, res, () => {
    if (!isStaff(req.authenticatedUser, req.app.locals.config)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso restrito à equipe.' } });
    return next();
  });
}
