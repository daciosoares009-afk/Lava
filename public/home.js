import { siteContent } from './site-content.js';

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-navigation');
const year = document.querySelector('[data-current-year]');

year.textContent = new Date().getFullYear();

function setMenuOpen(open) {
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  navigation.classList.toggle('is-open', open);
}

menuToggle.addEventListener('click', () => setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true'));
navigation.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener('click', () => setMenuOpen(false)));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenuOpen(false); });
window.addEventListener('resize', () => { if (window.innerWidth > 820) setMenuOpen(false); });

function setWhatsApp(number) {
  const digits = String(number || '').replace(/\D/g, '');
  const available = digits.length >= 12 && digits.length <= 13;
  document.querySelectorAll('[data-whatsapp-link]').forEach((link) => {
    if (!available) return;
    const message = 'Olá! Gostaria de conhecer os serviços e consultar a disponibilidade da LaveMais.';
    link.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    link.hidden = false;
  });
  if (available) document.querySelectorAll('[data-whatsapp-pending]').forEach((element) => { element.hidden = true; });
}

function renderContact() {
  const address = document.querySelector('[data-address]');
  if (siteContent.contact.address.trim()) address.textContent = siteContent.contact.address;

  const phone = document.querySelector('[data-phone]');
  if (siteContent.contact.phone.trim()) {
    const digits = siteContent.contact.phone.replace(/\D/g, '');
    const link = Object.assign(document.createElement('a'), { href: `tel:${digits}`, textContent: siteContent.contact.phone });
    link.className = 'contact-phone-link';
    phone.replaceChildren(link);
  }

  const hours = document.querySelector('[data-hours]');
  if (siteContent.contact.hours.length) {
    hours.replaceChildren(...siteContent.contact.hours.map((item) => {
      const line = document.createElement('span');
      line.className = 'hours-line';
      line.textContent = item;
      return line;
    }));
  }

  if (siteContent.contact.mapsUrl.trim()) {
    const map = document.querySelector('[data-map-link]');
    map.href = siteContent.contact.mapsUrl;
    map.hidden = false;
  }

  if (siteContent.story.trim()) document.querySelector('[data-story-copy]').textContent = siteContent.story;
}

function renderPrices() {
  const rows = document.querySelector('[data-price-rows]');
  const note = document.querySelector('[data-price-note]');
  const available = siteContent.prices.filter(({ label, value }) => label?.trim() && value?.trim());
  if (!available.length || !rows || !note) return;

  rows.closest('[data-price-list]').hidden = false;
  note.hidden = true;
  available.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'price-row';
    const name = document.createElement('span');
    name.textContent = label;
    const detail = document.createElement('span');
    detail.className = 'price-value';
    detail.textContent = value;
    row.append(name, detail);
    rows.append(row);
  });
}

function renderRecharges() {
  const rows = document.querySelector('[data-recharge-rows]');
  const note = document.querySelector('[data-recharge-note]');
  const options = (siteContent.recharges || []).filter(({ amount, bonus }) => amount?.trim() && bonus?.trim());
  if (!options.length) return;

  note.hidden = true;
  options.forEach(({ amount, bonus }) => {
    const row = document.createElement('div');
    row.className = 'price-row';
    row.append(
      Object.assign(document.createElement('span'), { textContent: amount }),
      Object.assign(document.createElement('span'), { className: 'price-value', textContent: bonus }),
    );
    rows.append(row);
  });
}

function renderServices() {
  const list = document.querySelector('[data-services-list]');
  const note = document.querySelector('[data-services-note]');
  const services = siteContent.services.filter(({ name }) => name?.trim());
  if (!services.length) return;

  note.hidden = true;
  services.forEach((service, index) => {
    const item = document.createElement('article');
    item.className = 'service-item';
    const number = document.createElement('span');
    number.className = 'service-item-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const content = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = service.name;
    content.append(title);
    if (service.description) {
      const description = document.createElement('p');
      description.textContent = service.description;
      content.append(description);
    }
    const meta = document.createElement('div');
    meta.className = 'service-item-meta';
    if (service.duration) meta.append(Object.assign(document.createElement('span'), { textContent: service.duration }));
    if (service.price) meta.append(Object.assign(document.createElement('span'), { textContent: service.price }));
    item.append(number, content, meta);
    list.append(item);
  });
}

function renderLegalLinks() {
  const container = document.querySelector('[data-legal-links]');
  [['termsUrl', 'Termos de uso'], ['privacyUrl', 'Política de privacidade']].forEach(([key, label]) => {
    const url = siteContent.legal[key]?.trim();
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.textContent = label;
    container.append(link);
  });
}

async function updateAccountLink() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) return;
    const result = await response.json();
    if (!result.user) return;
    document.querySelectorAll('[data-account-link]').forEach((link) => {
      link.textContent = 'Minha conta';
      link.href = '/conta';
      link.setAttribute('aria-label', `Acessar conta de ${result.user.fullName}`);
    });
  } catch {
    // A página pública continua disponível quando o endpoint de sessão não responde.
  }
}

renderContact();
renderPrices();
renderRecharges();
renderServices();
renderLegalLinks();
setWhatsApp(siteContent.whatsappNumber);
updateAccountLink();
