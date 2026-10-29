const tabBar = document.querySelector('.mode-switch');
const tabs = { login: document.querySelector('#tab-login'), register: document.querySelector('#tab-register') };
const forms = { login: document.querySelector('#login-form'), register: document.querySelector('#register-form') };
const title = document.querySelector('#form-title');
const subtitle = document.querySelector('#form-subtitle');
const kicker = document.querySelector('#form-kicker');
const logoutButton = document.querySelector('.logout-button');
let currentUser = null;
const accountDestinations = new Set(['/conta', '/conta/inicio', '/conta/agendamentos', '/conta/servicos', '/conta/planos', '/conta/beneficios', '/conta/perfil', '/conta/sobre']);

function postLoginDestination() {
  const requested = new URLSearchParams(window.location.search).get('next');
  return accountDestinations.has(requested) ? requested : '/conta';
}

document.querySelector('#year').textContent = new Date().getFullYear();

function setMode(mode) {
  const registering = mode === 'register';
  tabs.login.classList.toggle('is-active', !registering);
  tabs.register.classList.toggle('is-active', registering);
  tabs.login.setAttribute('aria-selected', String(!registering));
  tabs.register.setAttribute('aria-selected', String(registering));
  tabs.login.tabIndex = registering ? -1 : 0;
  tabs.register.tabIndex = registering ? 0 : -1;
  tabBar.classList.toggle('register-active', registering);
  forms.login.hidden = registering;
  forms.register.hidden = !registering;
  document.querySelector('.form-wrap').classList.toggle('form-register', registering);
  kicker.textContent = registering ? 'COMECE POR AQUI' : 'SUA CONTA LAVEMAIS';
  title.innerHTML = registering ? 'Sua rotina mais leve<br />começa aqui.' : 'Que bom ter você<br class="desktop-break" /> por aqui.';
  subtitle.textContent = registering ? 'Crie seu cadastro para aproveitar sua experiência LaveMais.' : 'Entre com seus dados para continuar.';
  clearFeedback(forms.login);
  clearFeedback(forms.register);
  logoutButton.hidden = registering || !currentUser;
  if (!registering && currentUser) showFeedback(forms.login, `Sessão ativa: ${currentUser.fullName}.`, 'success');
  const destination = postLoginDestination();
  const query = destination === '/conta' && !new URLSearchParams(window.location.search).has('next') ? '' : `?next=${encodeURIComponent(destination)}`;
  history.replaceState(null, '', `${window.location.pathname}${query}${registering ? '#cadastro' : '#login'}`);
}

function clearFeedback(form) {
  form.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
  form.querySelectorAll('.input-wrap').forEach((wrap) => wrap.classList.remove('has-error'));
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
  const field = input.closest('.field');
  field.querySelector('.field-error').textContent = message;
  field.querySelector('.input-wrap').classList.add('has-error');
  input.setAttribute('aria-invalid', 'true');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

async function postAuth(form, endpoint, data) {
  const button = form.querySelector('.submit-button');
  const label = button.querySelector('span');
  const originalLabel = label.textContent;
  button.disabled = true;
  label.textContent = 'Enviando...';
  try {
    const response = await fetch(`/api/auth/${endpoint}`, {
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
      showFeedback(form, result.error?.message || 'Não foi possível concluir. Tente novamente.', 'error');
      return null;
    }
    return result;
  } catch {
    showFeedback(form, 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.', 'error');
    return null;
  } finally {
    button.disabled = false;
    label.textContent = originalLabel;
  }
}

async function checkSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) return;
    const result = await response.json();
    currentUser = result.user;
    if (currentUser) window.location.replace(postLoginDestination());
  } catch {
    // A tela continua disponível quando a API ainda não pode ser alcançada.
  }
}

function validateForm(form, mode) {
  clearFeedback(form);
  let firstInvalid = null;
  const fields = [...form.querySelectorAll('input[required]')];
  for (const input of fields) {
    input.removeAttribute('aria-invalid');
    const value = ['password', 'confirmPassword'].includes(input.name) ? input.value : input.value.trim();
    let message = '';
    if (!value) message = 'Este campo é obrigatório.';
    else if (input.type === 'email' && !validEmail(value)) message = 'Digite um e-mail válido.';
    else if (input.name === 'fullName' && value.replace(/\s+/g, ' ').split(' ').length < 2) message = 'Informe seu nome e sobrenome.';
    else if (input.name === 'phone' && value.replace(/\D/g, '').length < 10) message = 'Digite um telefone com DDD.';
    else if (input.name === 'birthDate') {
      const birth = new Date(`${value}T00:00:00`);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (Number.isNaN(birth.getTime()) || birth >= today) message = 'Informe uma data de nascimento válida.';
    } else if (input.name === 'password') {
      if (new TextEncoder().encode(value).length > 72) message = 'A senha deve ter no máximo 72 bytes.';
      else if (value.length < 8) message = 'A senha precisa ter pelo menos 8 caracteres.';
      else if (mode === 'register' && (!/[A-Za-zÀ-ÿ]/.test(value) || !/\d/.test(value))) message = 'Inclua pelo menos uma letra e um número.';
    } else if (input.name === 'confirmPassword' && value !== form.elements.password.value) message = 'As senhas não coincidem.';
    if (message) {
      markInvalid(input, message);
      if (!firstInvalid) firstInvalid = input;
    }
  }
  if (firstInvalid) { firstInvalid.focus(); return false; }
  return true;
}

document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.id === 'tab-register' ? 'register' : 'login')));
document.querySelectorAll('[data-switch]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.switch)));
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

document.querySelectorAll('.auth-form input').forEach((input) => {
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    input.closest('.field')?.querySelector('.field-error')?.replaceChildren();
    input.closest('.input-wrap')?.classList.remove('has-error');
  });
});

forms.login.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateForm(forms.login, 'login')) return;
  postAuth(forms.login, 'login', {
    email: forms.login.elements.email.value.trim(),
    password: forms.login.elements.password.value,
  }).then((result) => {
    if (!result) return;
    currentUser = result.user;
    forms.login.elements.password.value = '';
    window.location.assign(postLoginDestination());
  });
});

forms.register.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validateForm(forms.register, 'register')) return;
  postAuth(forms.register, 'register', {
    fullName: forms.register.elements.fullName.value.trim(),
    email: forms.register.elements.email.value.trim(),
    phone: forms.register.elements.phone.value.trim(),
    birthDate: forms.register.elements.birthDate.value,
    password: forms.register.elements.password.value,
  }).then((result) => {
    if (!result) return;
    const email = result.user.email;
    forms.register.reset();
    forms.login.elements.email.value = email;
    setMode('login');
    showFeedback(forms.login, 'Cadastro concluído e salvo. Entre com sua senha para acessar sua conta.', 'success');
    forms.login.elements.password.focus();
  });
});

logoutButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('logout_failed');
    currentUser = null;
    logoutButton.hidden = true;
    showFeedback(forms.login, 'Você saiu da sua conta.', 'info');
  } catch {
    showFeedback(forms.login, 'Não foi possível encerrar a sessão. Tente novamente.', 'error');
  }
});

setMode(window.location.hash === '#cadastro' ? 'register' : 'login');
checkSession();

tabBar.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const registering = event.key === 'End' || (event.key !== 'Home' && tabs.login.getAttribute('aria-selected') === 'true');
  setMode(registering ? 'register' : 'login');
  (registering ? tabs.register : tabs.login).focus();
});
