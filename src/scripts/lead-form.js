import site from '../data/site.json' with { type: 'json' };
import venues from '../data/venues.json' with { type: 'json' };
import { getVisitContext } from './lead-context.js';

// Public page JSON supplies route context without changing existing form markup.
let files = {};
try { files = import.meta.glob('../data/pages/*.json', { eager: true }); } catch { /* Node unit tests have no Vite transform. */ }
const pageData = Object.fromEntries(Object.values(files).map((mod) => {
  const page = mod.default || mod;
  const listed = venues.chips.flatMap((venue) => venue.groups.flatMap((group) => group.items)).find((item) => item.href.replace(/^\/|\/$/g, '') === page.slug);
  return [page.slug, { type: page.type, venueSlug: page.venueSlug, quest: page.type === 'quest' ? listed?.t || page.seo?.h1 || '' : '', crmName: page.crmName || page.seo?.h1 || page.hero?.h1 || '' }];
}));

const RUSSIAN_PHONE_PATTERN = /^(?:7\d{10}|\d{10})$/;
const MOSCOW_TIME_ZONE = 'Europe/Moscow';
// Обычная заявка не должна принимать произвольную двухсимвольную строку вместо имени.
const PERSON_NAME_PATTERN = /^(?=.{2,80}$)\p{L}(?:[\p{L}\s'-]*\p{L})?$/u;

export function isValidLeadName(value) {
  return PERSON_NAME_PATTERN.test(String(value || '').trim());
}

export function getPhoneDigits(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return digits;
  if (digits.length === 10) return `7${digits}`;
  return '';
}

export function formatPhone(digits) {
  return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
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
  if (!endpoint) throw new Error('Lead endpoint is missing');
  if (typeof fetchImpl !== 'function') throw new Error('Lead delivery is unavailable');

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Lead delivery failed with ${response.status}`);
  if ((await response.json()).ok !== true) throw new Error('Lead was not accepted');
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

function setStatus(form, message) {
  let status = form.querySelector('[data-lead-status]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.leadStatus = '';
    status.setAttribute('role', 'status');
    form.append(status);
  }
  status.hidden = false;
  status.replaceChildren(document.createTextNode(message));
  return status;
}

function deliveryError(form) {
  const status = setStatus(form, 'Не получилось отправить заявку. Позвоните нам: ');
  const phone = document.createElement('a');
  phone.href = site.header.phoneHref;
  phone.textContent = site.header.phone;
  const wa = document.createElement('a');
  wa.href = site.header.wa;
  wa.textContent = 'WhatsApp';
  status.append(phone, ' или напишите в ', wa);
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

function validateName(input) {
  const value = input.value.trim();
  input.setCustomValidity(!value || isValidLeadName(value) ? '' : 'Введите настоящее имя.');
}

const startedForms = new WeakMap();
const quizAnswers = new WeakMap();

// Capture existing quiz nodes before their renderer replaces the current step.
// Reading their final state in the next task preserves target-level click changes.
function rememberQuizStep(event) {
  const stage = event.target.closest?.('[data-source-quiz-stage]');
  if (!stage || event.target.closest('.source-quiz__form')) return;
  const question = stage.querySelector('.source-quiz__question')?.textContent?.trim();
  if (!question) return;
  const choices = [...stage.querySelectorAll('.source-quiz__answer')];
  const date = stage.querySelector('input[type=date]');
  window.setTimeout(() => {
    const answers = quizAnswers.get(stage) || new Map();
    const selected = choices.filter((choice) => choice.getAttribute('aria-pressed') === 'true')
      .map((choice) => choice.querySelector('.source-quiz__answer-title')?.textContent?.trim() || '');
    answers.set(question, { text: date?.value || selected.join(', '), date: date?.value || '' });
    quizAnswers.set(stage, answers);
  }, 0);
}

function quizDetails(form) {
  const answers = quizAnswers.get(form.closest('[data-source-quiz-stage]'));
  return {
    date: [...(answers?.values() || [])].find((answer) => answer.date)?.date || '',
    text: [...(answers?.entries() || [])].map(([question, answer]) => `${question}: ${answer.text}`).join('\n'),
  };
}

function formConsent(form) {
  const checkbox = form.querySelector('[name=consent], [name=privacy]:not([type=hidden]), [name=Checkbox], .t-input-group_cb input, .source-quiz__consent input, [data-exit-intent-consent]');
  if (checkbox) return checkbox.checked === true;
  // Legacy Zero Blocks already declare consent by submitting next to their
  // authored notice, and encode that choice as a hidden privacy=yes field.
  const legacy = form.querySelector('input[type=hidden][name=privacy][value=yes]');
  return Boolean(legacy && form.closest('.t-rec')?.textContent?.includes('согласие'));
}

export function markLeadStarted(form) {
  if (!startedForms.has(form)) startedForms.set(form, Date.now());
}

function createLeadPayload(form, phone) {
  const data = new FormData(form);
  const read = (selector, key) => String(data.get(key) || form.querySelector(selector)?.value || '').trim();
  const slug = window.location.pathname.replace(/^\/|\/$/g, '').replace((import.meta.env?.BASE_URL || '/').replace(/^\/|\/$/g, '') + '/', '');
  const page = pageData[slug] || {};
  const venue = venues.chips.find((item) => item.slug === page.venueSlug);
  const details = quizDetails(form);
  const dateText = read('[data-tilda-rule="date"], .t-datepicker', 'date') || details.date;
  const date = dateText.replace(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/, '$3-$2-$1');
  const snapshot = form.closest('.t-rec');
  const quiz = form.classList.contains('source-quiz__form');
  const exit = form.hasAttribute('data-exit-intent-form');
  const formKind = quiz ? 'callback' : snapshot ? `snapshot-${snapshot.id}` : form.classList.contains('prebook__form') ? 'prebooking' : form.dataset.leadKind || 'callback';
  const title = form.closest('section, .t-rec, dialog')?.querySelector('h1,h2,h3,.t-title,.t-heading,.source-quiz__question,[data-elem-type=text] .tn-atom')?.textContent?.trim();
  const context = {
    pageUrl: window.location.href.slice(0, 1500), pageTitle: document.title.slice(0, 300),
    crmName: (page.crmName || document.querySelector('h1')?.textContent?.trim() || 'Чё за Квест').slice(0, 200),
    pageSlug: slug, pageType: page.type || document.body.dataset.pageType || 'info',
    quest: read('select[name=kvest]', 'kvest') || form.dataset.leadQuest || page.quest || '', venue: form.dataset.leadVenue || venue?.t || '',
  };
  const preferences = ['sposob-svyazy', 'forma-svyazi', 'messenger-type', 'messenger-id', 'email', 'Email']
    .filter((key) => data.get(key)).map((key) => `${key}: ${data.get(key)}`).join('\n');
  const comment = [read('textarea, [name="Comment"]', 'comment'), details.text, preferences].filter(Boolean).join('\n');
  return {
    ...getVisitContext(), ...context,
    form: formKind, formTitle: (title || form.dataset.leadTitle || formKind).slice(0, 250),
    name: exit ? 'Обратный звонок' : read('[name="Name"], [data-tilda-rule="name"]', 'name'),
    phone: `+${phone}`, date,
    comment: exit ? 'Имя не запрашивается в форме обратного звонка.' : comment.slice(0, 1000),
    consent: formConsent(form),
    website: read('[name="website"]', 'website'), startedAt: startedForms.get(form) || Date.now(),
  };
}

export async function submitLeadForm(form) {
  if (form.dataset.leadSubmitting === 'true' || form.dataset.leadAccepted === 'true') return;
  const phone = getPhoneDigits(form.querySelector('[name="phone"], [name="Phone"], [data-tilda-rule="phone"]')?.value || '');
  const payload = createLeadPayload(form, phone);
  if (!isValidLeadName(payload.name) || !phone || !payload.consent) {
    setStatus(form, 'Проверьте имя, российский номер телефона и согласие на обработку данных.');
    return;
  }
  form.dataset.leadSubmitting = 'true';
  setSubmitting(form, true);
  try {
    await sendLead(site.leads.recipient, payload);
    form.dataset.leadAccepted = 'true';
    document.dispatchEvent(new CustomEvent('lead:accepted'));
    const base = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');
    window.location.assign(`${base}/${payload.pageType === 'holiday' ? 'kids_spasibo' : 'spasibo'}/?form=${encodeURIComponent(payload.form)}`);
  } catch {
    deliveryError(form);
  } finally {
    delete form.dataset.leadSubmitting;
    setSubmitting(form, false);
  }
}

function setDateMinimums(form) {
  const min = getMoscowDate();
  form.querySelectorAll('input[type="date"]').forEach((input) => {
    input.min = min;
  });
}

function setSubmitting(form, submitting) {
  form.toggleAttribute('aria-busy', submitting);
  form.querySelectorAll('[data-lead-submit], button[type=submit], input[type=submit]').forEach((button) => {
    button.disabled = submitting;
  });
}

function initialiseLeadForm(form) {
  if (form.dataset.leadReady === 'true') return;
  form.dataset.leadReady = 'true';

  const phoneInput = form.elements.namedItem('phone');
  const nameInput = form.elements.namedItem('name');
  if (!(phoneInput instanceof HTMLInputElement) || !(nameInput instanceof HTMLInputElement)) return;
  setDateMinimums(form);
  form.addEventListener('focusin', () => markLeadStarted(form));

  const refreshPhoneValidity = () => {
    if (phoneInput.value) validatePhone(phoneInput);
    else phoneInput.setCustomValidity('');
    clearValidationState(form, phoneInput);
  };

  phoneInput.addEventListener('input', () => refreshPhoneValidity());
  phoneInput.addEventListener('blur', () => refreshPhoneValidity());
  const refreshNameValidity = () => {
    validateName(nameInput);
    clearValidationState(form, nameInput);
  };
  nameInput.addEventListener('input', () => {
    refreshNameValidity();
  });
  nameInput.addEventListener('blur', refreshNameValidity);
  form.querySelectorAll('input').forEach((input) => {
    if (input === phoneInput || input === nameInput) return;
    input.addEventListener('input', () => {
      clearValidationState(form, input);
    });
    input.addEventListener('change', () => {
      clearValidationState(form, input);
    });
  });

  const submitLead = async (event) => {
    event?.preventDefault();

    validateName(nameInput);
    validatePhone(phoneInput);
    if (!form.checkValidity()) {
      showValidationStatus(form);
      return;
    }

    await submitLeadForm(form);
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
  document.addEventListener('click', rememberQuizStep, true);
  document.addEventListener('input', rememberQuizStep, true);
  document.addEventListener('focusin', (event) => {
    const form = event.target.closest?.('form');
    if (form) markLeadStarted(form);
  });
  // Dynamic local quizzes and the exit dialog have older target-level handlers.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form.matches?.('.source-quiz__form, [data-exit-intent-form]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.reportValidity()) void submitLeadForm(form);
  }, true);
  document.querySelectorAll('[data-lead-form]').forEach(initialiseLeadForm);
  document.dispatchEvent(new CustomEvent('lead:forms-ready'));
}
