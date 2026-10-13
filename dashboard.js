import { siteContent } from './site-content.js';

const panels = [...document.querySelectorAll('[data-panel]')];
const navLinks = [...document.querySelectorAll('[data-nav]')];
const feedback = document.querySelector('.profile-feedback');
const profileForm = document.querySelector('#profile-form');
const sidebar = document.querySelector('.sidebar');
const menuToggle = document.querySelector('.mobile-menu-toggle');
const navBackdrop = document.querySelector('.nav-backdrop');

function setMenuOpen(open) {
  sidebar.classList.toggle('is-open', open);
  navBackdrop.hidden = !open;
  document.body.classList.toggle('menu-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Fechar navegação' : 'Abrir navegação');
}

menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
navBackdrop.addEventListener('click', () => setMenuOpen(false));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenuOpen(false); });

function panelFromLocation() {
  const path = window.location.pathname;
  const key = path.split('/').filter(Boolean).at(-1);
  const panel = panels.find((item) => item.dataset.panel === key);
  if (panel) return key;
  return panels.some((item) => item.dataset.panel === window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'inicio';
}

function showPanel(id, updateUrl = true) {
  const panelId = panels.some((panel) => panel.dataset.panel === id) ? id : 'inicio';
  panels.forEach((panel) => {
    const active = panel.dataset.panel === panelId;
    panel.classList.toggle('is-visible', active);
    panel.setAttribute('aria-hidden', String(!active));
  });
  navLinks.forEach((link) => {
    const active = link.dataset.nav === panelId;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const nextPath = panelId === 'inicio' ? '/conta' : `/conta/${panelId}`;
  if (updateUrl && window.location.pathname !== nextPath) history.pushState({ panel: panelId }, '', nextPath);
  setMenuOpen(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navLinks.forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  showPanel(link.dataset.nav);
}));
document.querySelectorAll('[data-open-panel]').forEach((button) => button.addEventListener('click', (event) => {
  event.preventDefault();
  showPanel(button.dataset.openPanel);
}));
window.addEventListener('popstate', () => showPanel(panelFromLocation(), false));

function setWhatsAppLinks() {
  const digits = String(siteContent.whatsappNumber || '').replace(/\D/g, '');
  const ready = digits.length >= 12 && digits.length <= 13;
  document.querySelectorAll('[data-whatsapp-link]').forEach((link) => {
    if (!ready) return;
    const message = 'Olá! Tenho uma conta LaveMais e gostaria de consultar um atendimento.';
    link.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    link.hidden = false;
  });
  if (ready) document.querySelectorAll('[data-whatsapp-pending]').forEach((item) => { item.hidden = true; });
}

function addEmpty(parent, title, description, number = '') {
  const item = document.createElement('div');
  item.className = 'editorial-empty';
  const numberNode = document.createElement('span');
  numberNode.textContent = number;
  const content = document.createElement('div');
  const heading = document.createElement('h2'); heading.textContent = title;
  const copy = document.createElement('p'); copy.textContent = description;
  content.append(heading, copy); item.append(numberNode, content); parent.replaceChildren(item);
}

function renderServices() {
  const directory = document.querySelector('[data-service-directory]');
  const overview = document.querySelector('[data-overview-services]');
  const services = (siteContent.services || []).filter((service) => service?.name?.trim());
  const prices = (siteContent.prices || []).filter((item) => item?.label?.trim() && item?.value?.trim() && item.label.toLowerCase().includes('serviço'));
  const recharges = (siteContent.recharges || []).filter(({ amount, bonus }) => amount?.trim() && bonus?.trim());

  if (!services.length && !prices.length) {
    if (recharges.length) {
      directory.hidden = true;
      overview.replaceChildren(...recharges.slice(0, 3).map(({ amount, bonus }) => {
        const row = document.createElement('div'); row.className = 'overview-service-row';
        row.append(Object.assign(document.createElement('span'), { textContent: `Recarga ${amount}` }), Object.assign(document.createElement('strong'), { textContent: `+ ${bonus}` }));
        return row;
      }));
    } else {
      addEmpty(directory, 'Informações em atualização', 'Os serviços e valores serão exibidos quando forem confirmados pela LaveMais.', '01');
      overview.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty-copy', textContent: 'As opções confirmadas aparecerão aqui.' }));
    }
    return;
  }
  directory.replaceChildren();
  overview.replaceChildren();
  services.forEach((service, index) => {
    const article = document.createElement('article'); article.className = 'service-record';
    const heading = document.createElement('h2'); heading.textContent = service.name;
    const description = document.createElement('p'); description.textContent = service.description || service.duration || '';
    article.append(heading, description);
    if (service.price) { const price = document.createElement('strong'); price.textContent = service.price; article.append(price); }
    directory.append(article);
    if (index < 3) {
      const row = document.createElement('div'); row.className = 'overview-service-row';
      row.append(Object.assign(document.createElement('span'), { textContent: service.name }));
      if (service.price) row.append(Object.assign(document.createElement('strong'), { textContent: service.price }));
      overview.append(row);
    }
  });
  prices.forEach((item) => {
    const row = document.createElement('div'); row.className = 'price-record';
    row.append(Object.assign(document.createElement('span'), { textContent: item.label }), Object.assign(document.createElement('strong'), { textContent: item.value }));
    directory.append(row);
    if (!services.length && overview.children.length < 3) {
      const summary = document.createElement('div'); summary.className = 'overview-service-row';
      summary.append(Object.assign(document.createElement('span'), { textContent: item.label }), Object.assign(document.createElement('strong'), { textContent: item.value }));
      overview.append(summary);
    }
  });
}

function renderRecharges() {
  const section = document.querySelector('[data-recharge-list]');
  const rows = section.querySelector('[data-recharge-rows]');
  const note = section.querySelector('[data-recharge-note]');
  const options = (siteContent.recharges || []).filter(({ amount, bonus }) => amount?.trim() && bonus?.trim());
  if (!options.length) return;

  section.hidden = false;
  note.hidden = true;
  rows.replaceChildren(...options.map(({ amount, bonus }) => {
    const row = document.createElement('div');
    row.className = 'client-recharge-row';
    row.append(
      Object.assign(document.createElement('span'), { textContent: amount }),
      Object.assign(document.createElement('strong'), { textContent: bonus }),
    );
    return row;
  }));
}

function renderPlans() {
  const list = document.querySelector('[data-plan-list]');
  const plans = (siteContent.prices || []).filter(({ label, value }) => label?.trim() && value?.trim() && /mensais|anuais|familiares/i.test(label));
  if (!plans.length) {
    addEmpty(list, 'Nenhum plano publicado ainda', 'Não há contratação ou pagamento de planos disponível pela plataforma no momento.', '02');
    return;
  }
  list.replaceChildren(...plans.map(({ label, value }) => {
    const row = document.createElement('div'); row.className = 'price-record';
    row.append(Object.assign(document.createElement('span'), { textContent: label }), Object.assign(document.createElement('strong'), { textContent: value }));
    return row;
  }));
}

function renderStoreInfo() {
  if (siteContent.story?.trim()) document.querySelector('[data-story-copy]').textContent = siteContent.story;
  if (siteContent.contact.address?.trim()) document.querySelector('[data-address]').textContent = siteContent.contact.address;
  const phone = siteContent.contact.phone?.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    const link = Object.assign(document.createElement('a'), { href: `tel:${digits}`, textContent: phone });
    link.className = 'text-link';
    document.querySelector('[data-phone]').replaceChildren(link);
  }
  const hours = document.querySelector('[data-hours]');
  if (siteContent.contact.hours?.length) hours.replaceChildren(...siteContent.contact.hours.map((value) => Object.assign(document.createElement('span'), { textContent: value })));
  if (siteContent.contact.mapsUrl?.trim()) {
    const map = document.querySelector('[data-map-link]'); map.href = siteContent.contact.mapsUrl; map.hidden = false;
  }
}

function showProfileFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle('is-error', isError);
}

function showFieldErrors(fields = {}) {
  document.querySelectorAll('[data-error]').forEach((node) => { node.textContent = fields[node.dataset.error] || ''; node.classList.toggle('is-error', Boolean(fields[node.dataset.error])); });
}

async function loadProfile() {
  try {
    const response = await fetch('/api/client/profile', { credentials: 'same-origin' });
    if (response.status === 401) { window.location.replace('/login?next=%2Fconta'); return; }
    if (!response.ok) throw new Error('profile_unavailable');
    const { user } = await response.json();
    profileForm.elements.fullName.value = user.fullName || '';
    profileForm.elements.email.value = user.email || '';
    profileForm.elements.phone.value = user.phone || '';
    profileForm.elements.birthDate.value = user.birthDate || '';
    const firstName = user.fullName.split(/\s+/)[0] || 'cliente';
    document.querySelector('[data-first-name]').textContent = firstName;
    document.querySelector('[data-short-name]').textContent = firstName;
    document.querySelector('[data-avatar]').textContent = firstName.slice(0, 1).toLocaleUpperCase('pt-BR');
    const since = new Date(user.createdAt);
    document.querySelector('[data-member-since]').textContent = Number.isNaN(since.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(since);
  } catch {
    showProfileFeedback('Não foi possível carregar seus dados. Atualize a página para tentar novamente.', true);
  }
}

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showFieldErrors(); showProfileFeedback('');
  const submit = profileForm.querySelector('button[type="submit"]');
  const label = submit.querySelector('span');
  const previous = label.textContent;
  submit.disabled = true; label.textContent = 'Salvando…';
  try {
    const response = await fetch('/api/client/profile', {
      method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: profileForm.elements.fullName.value, phone: profileForm.elements.phone.value, birthDate: profileForm.elements.birthDate.value }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) { window.location.replace('/login?next=%2Fconta'); return; }
    if (!response.ok) {
      showFieldErrors(result.error?.fields);
      showProfileFeedback(result.error?.message || 'Não foi possível salvar seus dados.', true);
      return;
    }
    const user = result.user;
    profileForm.elements.fullName.value = user.fullName;
    profileForm.elements.phone.value = user.phone;
    profileForm.elements.birthDate.value = user.birthDate;
    const firstName = user.fullName.split(/\s+/)[0] || 'cliente';
    document.querySelector('[data-first-name]').textContent = firstName;
    document.querySelector('[data-short-name]').textContent = firstName;
    document.querySelector('[data-avatar]').textContent = firstName.slice(0, 1).toLocaleUpperCase('pt-BR');
    showProfileFeedback('Seus dados foram atualizados.');
  } catch {
    showProfileFeedback('Não foi possível conectar ao servidor. Tente novamente.', true);
  } finally {
    submit.disabled = false; label.textContent = previous;
  }
});

document.querySelector('.logout-button').addEventListener('click', async (event) => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('logout_failed');
    window.location.replace('/login');
  } catch {
    button.disabled = false;
    button.textContent = 'Falha ao sair — tente novamente';
  }
});

setWhatsAppLinks();
renderServices();
renderRecharges();
renderPlans();
renderStoreInfo();
showPanel(panelFromLocation(), false);
loadProfile();
