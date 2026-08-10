const RUSSIAN_PHONE_PATTERN = /^(?:7\d{10}|\d{10})$/;
const MOSCOW_TIME_ZONE = 'Europe/Moscow';

export function getPhoneDigits(value) {
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

export function getMoscowDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function createWhatsAppUrl(target, message) {
  const recipient = target.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(recipient)) return '';
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}

export async function sendLead(recipient, payload, fetchImpl = globalThis.fetch) {
  const endpoint = String(recipient || '').trim();
  if (!endpoint) return false;
  if (typeof fetchImpl !== 'function') throw new Error('Lead delivery is unavailable');

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Lead delivery failed with ${response.status}`);
  return true;
}

export function createSubmissionGuard() {
  let submitting = false;
  let accepted = false;

  return {
    begin() {
      if (submitting || accepted) return false;
      submitting = true;
      return true;
    },
    accept() {
      submitting = false;
      accepted = true;
    },
    fail() {
      submitting = false;
    },
    reset() {
      accepted = false;
    },
  };
}

function setStatus(form, message, link, linkLabel = 'Открыть черновик WhatsApp') {
  const status = form.querySelector('[data-lead-status]');
  if (!status) return;

  status.hidden = false;
  status.replaceChildren(document.createTextNode(message));

  if (link) {
    // Do not leave a PII-bearing wa.me URL in the DOM: analytics link trackers can collect its
    // query string. The draft is reconstructed only when the visitor explicitly retries it.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lead-form__draft';
    button.textContent = linkLabel;
    button.addEventListener('click', () => openWhatsAppDraft(link));
    status.append(' ', button);
  }
}

function labelForInput(form, input) {
  if (!input.id) return input.name || 'поле';
  const label = [...form.querySelectorAll('label')].find((item) => item.htmlFor === input.id);
  return label?.textContent?.trim() || input.name || 'поле';
}

function showValidationStatus(form) {
  const invalidInput = [...form.elements].find((element) => (
    element instanceof HTMLInputElement && !element.validity.valid
  ));
  if (!(invalidInput instanceof HTMLInputElement)) return;

  invalidInput.setAttribute('aria-invalid', 'true');
  setStatus(form, `Проверьте поле «${labelForInput(form, invalidInput)}»: ${invalidInput.validationMessage}`);
  invalidInput.reportValidity();
}

function clearValidationState(form, input) {
  input.removeAttribute('aria-invalid');
  const status = form.querySelector('[data-lead-status]');
  if (status?.textContent?.startsWith('Проверьте поле')) status.hidden = true;
}

function validatePhone(input) {
  const digits = getPhoneDigits(input.value);
  input.setCustomValidity(RUSSIAN_PHONE_PATTERN.test(digits) ? '' : 'Введите номер российского телефона.');
  return digits;
}

function createLeadPayload(form, phone) {
  const data = new FormData(form);
  const date = String(data.get('date') || '').trim();
  return {
    kind: form.dataset.leadKind || 'callback',
    name: String(data.get('name') || '').trim(),
    phone: formatPhone(phone),
    date: date || null,
    quest: form.dataset.leadQuest || null,
    calendarId: form.dataset.leadCalendarId || null,
    page: window.location.pathname,
  };
}

function createMessage(payload) {
  const kind = payload.kind === 'party'
    ? 'Заявка на праздник'
    : payload.kind === 'booking'
      ? 'Предварительная заявка на квест'
      : 'Заявка на обратный звонок';
  const lines = [
    kind,
    `Имя: ${payload.name}`,
    `Телефон: ${payload.phone}`,
  ];

  if (payload.date) lines.push(`Дата: ${formatDate(payload.date)}`);
  if (payload.quest) lines.push(`Квест: ${payload.quest}`);
  lines.push(`Страница: ${payload.page}`);
  return lines.join('\n');
}

function setDateMinimums(form) {
  const min = getMoscowDate();
  form.querySelectorAll('input[type="date"]').forEach((input) => {
    input.min = min;
  });
}

function setSubmitting(form, submitting) {
  form.toggleAttribute('aria-busy', submitting);
  form.querySelectorAll('[data-lead-submit]').forEach((button) => {
    button.disabled = submitting;
  });
}

function openWhatsAppDraft(url) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function announceLeadAccepted() {
  document.dispatchEvent(new CustomEvent('lead:accepted'));
}

function initialiseLeadForm(form) {
  if (form.dataset.leadReady === 'true') return;
  form.dataset.leadReady = 'true';

  const phoneInput = form.elements.namedItem('phone');
  if (!(phoneInput instanceof HTMLInputElement)) return;
  setDateMinimums(form);
  const submission = createSubmissionGuard();

  const refreshPhoneValidity = (changed = false) => {
    if (changed) submission.reset();
    if (phoneInput.value) validatePhone(phoneInput);
    else phoneInput.setCustomValidity('');
    clearValidationState(form, phoneInput);
  };

  phoneInput.addEventListener('input', () => refreshPhoneValidity(true));
  phoneInput.addEventListener('blur', () => refreshPhoneValidity());
  form.querySelectorAll('input').forEach((input) => {
    if (input === phoneInput) return;
    input.addEventListener('input', () => {
      submission.reset();
      clearValidationState(form, input);
    });
    input.addEventListener('change', () => {
      submission.reset();
      clearValidationState(form, input);
    });
  });

  const submitLead = async (event) => {
    event?.preventDefault();

    const phone = validatePhone(phoneInput);
    if (!form.checkValidity()) {
      showValidationStatus(form);
      return;
    }

    if (!submission.begin()) return;

    const payload = createLeadPayload(form, phone);
    const draftUrl = createWhatsAppUrl(form.dataset.leadTarget || '', createMessage(payload));
    if (!draftUrl) {
      submission.fail();
      setStatus(form, 'Не удалось подготовить черновик WhatsApp. Позвоните нам по телефону на сайте.');
      return;
    }

    const recipient = form.dataset.leadRecipient || '';
    setSubmitting(form, true);
    openWhatsAppDraft(draftUrl);

    try {
      const delivered = await sendLead(recipient, payload);
      if (delivered) form.reset();
      setStatus(form, 'Заявка принята, перезвоним', draftUrl);
      announceLeadAccepted();
      submission.accept();
    } catch {
      submission.fail();
      setStatus(form, 'Не удалось передать заявку. Откройте черновик WhatsApp, чтобы отправить её самостоятельно.', draftUrl);
    } finally {
      setSubmitting(form, false);
    }
  };

  form.addEventListener('submit', submitLead);
  form.querySelector('[data-lead-submit]')?.addEventListener('click', submitLead);
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.target instanceof HTMLAnchorElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    submitLead(event);
  });
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-lead-form]').forEach(initialiseLeadForm);
}
