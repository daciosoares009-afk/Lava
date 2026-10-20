const requestForm = document.querySelector('#request-form');
const confirmForm = document.querySelector('#confirm-form');
const title = document.querySelector('#reset-title');
const subtitle = document.querySelector('#reset-subtitle');

document.querySelector('#year').textContent = new Date().getFullYear();

function clearFeedback(form) {
  form.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
  form.querySelectorAll('.input-wrap').forEach((wrap) => wrap.classList.remove('has-error'));
  form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
  const feedback = form.querySelector('.form-feedback');
  feedback.textContent = '';
  feedback.className = 'form-feedback';
}

function showFeedback(form, message, type = 'error') {
  const feedback = form.querySelector('.form-feedback');
  feedback.textContent = message;
  feedback.className = `form-feedback is-visible is-${type}`;
}

function markInvalid(input, message) {
  input.closest('.field').querySelector('.field-error').textContent = message;
  input.closest('.input-wrap').classList.add('has-error');
  input.setAttribute('aria-invalid', 'true');
}

function validateForm(form, confirmation = false) {
  clearFeedback(form);
  let firstInvalid = null;
  for (const input of form.querySelectorAll('input[required]')) {
    let message = '';
    const value = input.value.trim();
    if (!value) message = 'Este campo é obrigatório.';
    else if (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) message = 'Digite um e-mail válido.';
    else if (input.name === 'code' && !/^\d{6}$/.test(value)) message = 'Digite o código de 6 dígitos recebido por e-mail.';
    else if (input.name === 'password') {
      if (value.length < 8) message = 'A senha precisa ter pelo menos 8 caracteres.';
      else if (!/[A-Za-zÀ-ÿ]/.test(value) || !/\d/.test(value)) message = 'Inclua pelo menos uma letra e um número.';
    } else if (input.name === 'confirmPassword' && value !== form.elements.password.value) {
      message = 'As senhas não coincidem.';
    }
    if (message) {
      markInvalid(input, message);
      if (!firstInvalid) firstInvalid = input;
    }
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  if (confirmation && new TextEncoder().encode(form.elements.password.value).length > 72) {
    markInvalid(form.elements.password, 'A senha deve ter no máximo 72 bytes.');
    form.elements.password.focus();
    return false;
  }
  return true;
}

async function submitForm(form, endpoint, data) {
  const button = form.querySelector('.submit-button');
  const label = button.querySelector('span');
  const originalLabel = label.textContent;
  button.disabled = true;
  label.textContent = 'Enviando...';
  try {
    const response = await fetch(`/api/auth/password-reset/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      for (const [name, message] of Object.entries(result.error?.fields || {})) {
        const input = form.elements.namedItem(name);
        if (input) markInvalid(input, message);
      }
      showFeedback(form, result.error?.message || 'Não foi possível concluir. Tente novamente.');
      return false;
    }
    showFeedback(form, result.message, 'success');
    return true;
  } catch {
    showFeedback(form, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    return false;
  } finally {
    button.disabled = false;
    label.textContent = originalLabel;
  }
}

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateForm(requestForm)) return;
  const email = requestForm.elements.email.value.trim();
  if (!await submitForm(requestForm, 'request', { email })) return;
  confirmForm.elements.email.value = email;
  requestForm.hidden = true;
  confirmForm.hidden = false;
  title.textContent = 'Confira seu e-mail';
  subtitle.textContent = 'Se o endereço estiver cadastrado, você receberá um código válido por 10 minutos.';
  confirmForm.elements.code.focus();
});

confirmForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateForm(confirmForm, true)) return;
  const result = await submitForm(confirmForm, 'confirm', {
    email: confirmForm.elements.email.value.trim(),
    code: confirmForm.elements.code.value.trim(),
    password: confirmForm.elements.password.value,
  });
  if (!result) return;
  confirmForm.querySelector('.submit-button').hidden = true;
  confirmForm.querySelector('.reset-back').hidden = true;
  confirmForm.querySelectorAll('input').forEach((input) => { input.disabled = true; });
  subtitle.textContent = 'Agora você já pode entrar usando sua nova senha.';
});

document.querySelector('.reset-back').addEventListener('click', () => {
  clearFeedback(confirmForm);
  confirmForm.hidden = true;
  requestForm.hidden = false;
  title.textContent = 'Esqueceu sua senha?';
  subtitle.textContent = 'Informe seu e-mail e enviaremos um código de verificação.';
  requestForm.elements.email.value = confirmForm.elements.email.value;
  requestForm.elements.email.focus();
});

document.querySelectorAll('.password-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const input = button.closest('.input-wrap').querySelector('input');
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.textContent = showing ? 'Ocultar' : 'Mostrar';
    button.setAttribute('aria-label', showing ? 'Ocultar senha' : 'Mostrar senha');
    button.setAttribute('aria-pressed', String(showing));
  });
});

document.querySelectorAll('.reset-form input').forEach((input) => {
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    input.closest('.field').querySelector('.field-error').textContent = '';
    input.closest('.input-wrap').classList.remove('has-error');
  });
});
