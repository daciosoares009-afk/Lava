export function validateAppointment(body, now = new Date()) {
  const errors = {}, value = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { errors: { appointment: 'Informe a solicitação.' }, value };
  if (Object.keys(body).some(key => !['service', 'preferredDate', 'notes'].includes(key))) errors.appointment = 'Há campos não permitidos.';
  value.service = typeof body.service === 'string' ? body.service.trim() : '';
  value.notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  value.preferredDate = typeof body.preferredDate === 'string' ? body.preferredDate : '';
  if (value.service.length < 3 || value.service.length > 120) errors.service = 'Descreva o atendimento em 3 a 120 caracteres.';
  if (body.notes !== undefined && typeof body.notes !== 'string' || value.notes.length > 1000) errors.notes = 'Use até 1.000 caracteres nas observações.';
  const date = new Date(`${value.preferredDate}T00:00:00Z`);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const last = new Date(now); last.setUTCDate(last.getUTCDate() + 365);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.preferredDate) || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== value.preferredDate || value.preferredDate < today || date > last) errors.preferredDate = 'Escolha uma data de hoje até os próximos 365 dias.';
  return { errors, value };
}
