export function validateProfileUpdate(body) {
  const errors = {};
  const value = {};
  const allowed = ['fullName', 'phone', 'birthDate'];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { errors: { profile: 'Informe os dados do perfil.' }, value };
  if (Object.keys(body).some((key) => !allowed.includes(key))) errors.profile = 'O e-mail não pode ser alterado por este formulário.';

  if ('fullName' in body) {
    value.fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
    if (value.fullName.length < 3 || value.fullName.length > 120 || value.fullName.split(' ').length < 2) errors.fullName = 'Informe nome e sobrenome.';
  }
  if ('phone' in body) {
    value.phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const digits = value.phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15 || value.phone.length > 24) errors.phone = 'Informe um telefone válido com DDD.';
  }
  if ('birthDate' in body) {
    const date = typeof body.birthDate === 'string' ? new Date(`${body.birthDate}T00:00:00.000Z`) : new Date('invalid');
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body.birthDate || date >= new Date()) errors.birthDate = 'Informe uma data de nascimento válida.';
    else value.birthDate = date;
  }
  if (!Object.keys(body).some((key) => allowed.includes(key))) errors.profile ||= 'Informe ao menos um campo para atualizar.';
  return { errors, value };
}
