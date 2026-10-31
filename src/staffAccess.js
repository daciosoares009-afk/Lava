import { mfaStore } from './mfaStore.js';
import { requireAuth } from './authSession.js';
export const isStaff = (user, config) => Boolean(user && config.staffUserIds?.includes(String(user.id)));
export async function requireStaff(req, res, next) {
  return requireAuth(req, res, async () => {
    if (!isStaff(req.authenticatedUser, req.app.locals.config)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso restrito à equipe.' } });
    try {
      const credential = req.app.locals.config.requireStaffMfa ? await mfaStore.get(String(req.authenticatedUser.id)) : null;
      if (req.app.locals.config.requireStaffMfa && (!credential?.enabled || credential.version !== req.authenticatedMfaVersion)) return res.status(403).json({ error: { code: 'MFA_REQUIRED', message: 'Ative o segundo fator em Minha conta > Perfil para acessar a equipe.' } });
      return next();
    } catch (error) { return next(error); }
  });
}
