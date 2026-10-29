const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateRegistration(body) {
  const errors = {};
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
  const email = normalizeEmail(body.email);
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const digits = phone.replace(/\D/g, '');
  const birthDate = typeof body.birthDate === 'string' ? new Date(`${body.birthDate}T00:00:00.000Z`) : new Date('invalid');
  const password = typeof body.password === 'string' ? body.password : '';

  if (fullName.length < 3 || fullName.length > 120 || fullName.split(' ').length < 2) errors.fullName = 'Informe nome e sobrenome.';
  if (email.length > 254 || !emailPattern.test(email)) errors.email = 'Informe um e-mail válido.';
  if (digits.length < 10 || digits.length > 15 || phone.length > 24) errors.phone = 'Informe um telefone válido com DDD.';
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== body.birthDate || birthDate >= new Date()) errors.birthDate = 'Informe uma data de nascimento válida.';
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    errors.password = 'A senha deve ter ao menos 8 caracteres, incluir letra e número, e usar no máximo 72 bytes.';
  }
  return { errors, value: { fullName, email, phone, birthDate, password } };
}

export function validateLogin(body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};
  if (!emailPattern.test(email) || email.length > 254) errors.email = 'Informe um e-mail válido.';
  if (!password || Buffer.byteLength(password, 'utf8') > 72) errors.password = 'Informe uma senha válida.';
  return { errors, value: { email, password } };
}

export function validatePasswordResetRequest(body) {
  const email = normalizeEmail(body.email);
  const errors = {};
  if (!emailPattern.test(email) || email.length > 254) errors.email = 'Informe um e-mail válido.';
  return { errors, value: { email } };
}

export function validatePasswordResetConfirmation(body) {
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = {};

  if (!emailPattern.test(email) || email.length > 254) errors.email = 'Informe um e-mail válido.';
  if (!/^\d{6}$/.test(code)) errors.code = 'Informe o código de 6 dígitos recebido por e-mail.';
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || !/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    errors.password = 'A senha deve ter ao menos 8 caracteres, incluir letra e número, e usar no máximo 72 bytes.';
  }
  return { errors, value: { email, code, password } };
}
