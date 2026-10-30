import { Router } from 'express';
import { requireAuth } from '../authSession.js';
import { appointments } from '../appointments.js';
import { validateAppointment } from '../appointmentValidation.js';
import { persistentLimit } from '../securityStore.js';

const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
  const status = req.query.status || '';
  const page = Number(req.query.page || 1);
  if (!['', 'pending', 'cancelled'].includes(status) || !Number.isInteger(page) || page < 1 || page > 10000) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Filtro ou página inválida.' } });
  return res.json(await appointments.list(req.authenticatedUser.id, { status, page }));
});
router.use(persistentLimit('appointments-write', 60 * 60_000, 60));
router.post('/', async (req, res) => {
  const { errors, value } = validateAppointment(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os dados da solicitação.', fields: errors } });
  return res.status(201).json({ appointment: await appointments.create(req.authenticatedUser.id, value) });
});
router.patch('/:id', async (req, res) => {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Atualize a lista antes de alterar.' } });
  const { revision: ignored, ...input } = req.body;
  const { errors, value } = validateAppointment(input);
  if (Object.keys(errors).length) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Confira os dados da solicitação.', fields: errors } });
  const appointment = await appointments.change(req.authenticatedUser.id, req.params.id, revision, value);
  if (!appointment) return res.status(409).json({ error: { code: 'APPOINTMENT_CONFLICT', message: 'Solicitação indisponível ou alterada. Atualize a lista.' } });
  return res.json({ appointment });
});
// Cancelamento preserva histórico; não apaga registros de atendimento.
router.post('/:id/cancel', async (req, res) => {
  const revision = req.body?.revision;
  if (!Number.isSafeInteger(revision) || revision < 0 || Object.keys(req.body).some(key => key !== 'revision')) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Informe a versão da solicitação.' } });
  const appointment = await appointments.change(req.authenticatedUser.id, req.params.id, revision);
  if (!appointment) return res.status(409).json({ error: { code: 'APPOINTMENT_CONFLICT', message: 'Solicitação indisponível ou alterada. Atualize a lista.' } });
  return res.json({ appointment });
});
export default router;
