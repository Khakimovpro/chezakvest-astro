const RUSSIAN_PHONE_PATTERN = /^(?:7\d{10}|\d{10})$/;

function getPhoneDigits(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return digits;
  if (digits.length === 10) return `7${digits}`;
  return '';
}

function formatPhone(digits) {
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
}

function formatDate(value) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function createWhatsAppUrl(target, message) {
  const recipient = target.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(recipient)) return '';
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}

function setStatus(form, message, link) {
  const status = form.querySelector('[data-lead-status]');
  if (!status) return;

  status.hidden = false;
  status.replaceChildren(document.createTextNode(message));

  if (link) {
    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = 'Открыть WhatsApp';
    status.append(' ', anchor);
  }
}

function validatePhone(input) {
  const digits = getPhoneDigits(input.value);
  input.setCustomValidity(RUSSIAN_PHONE_PATTERN.test(digits) ? '' : 'Введите номер российского телефона.');
  return digits;
}

function createMessage(form, phone) {
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const date = String(data.get('date') || '').trim();
  const kind = form.dataset.leadKind === 'party' ? 'Заявка на праздник' : 'Заявка на обратный звонок';
  const lines = [
    kind,
    `Имя: ${name}`,
    `Телефон: ${formatPhone(phone)}`,
  ];

  if (date) lines.push(`Дата: ${formatDate(date)}`);
  lines.push(`Страница: ${window.location.pathname}`);
  return lines.join('\n');
}

function initialiseLeadForm(form) {
  if (form.dataset.leadReady === 'true') return;
  form.dataset.leadReady = 'true';

  const phoneInput = form.elements.namedItem('phone');
  if (!(phoneInput instanceof HTMLInputElement)) return;

  const refreshPhoneValidity = () => {
    if (phoneInput.value) validatePhone(phoneInput);
    else phoneInput.setCustomValidity('');
  };

  phoneInput.addEventListener('input', refreshPhoneValidity);
  phoneInput.addEventListener('blur', refreshPhoneValidity);

  const submitLead = (event) => {
    const phone = validatePhone(phoneInput);
    if (!form.checkValidity()) {
      event.preventDefault();
      form.reportValidity();
      return;
    }

    event.preventDefault();
    const url = createWhatsAppUrl(form.dataset.leadTarget || '', createMessage(form, phone));
    if (!url) {
      setStatus(form, 'Не удалось подготовить заявку. Позвоните нам по телефону на сайте.');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    form.reset();
    setStatus(form, 'Заявка подготовлена. WhatsApp должен открыться в новой вкладке.', url);
  };

  form.addEventListener('submit', submitLead);
  form.querySelector('[data-lead-submit]')?.addEventListener('click', submitLead);
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLAnchorElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    submitLead(event);
  });
}

document.querySelectorAll('[data-lead-form]').forEach(initialiseLeadForm);
