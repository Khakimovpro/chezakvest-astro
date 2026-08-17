import { createWhatsAppUrl, formatPhone, getPhoneDigits } from './lead-form.js';

const COOLDOWN_KEY = 'exitPopupDismissedAt';
const WEEK = 7 * 24 * 60 * 60 * 1000;

function readDismissal() {
  try {
    return Number(window.localStorage.getItem(COOLDOWN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch {
    // Storage can be disabled by the visitor. The dialog still remains usable.
  }
}

export function initExitIntent(dialog) {
  if (!dialog || dialog.dataset.exitIntentReady) return;
  dialog.dataset.exitIntentReady = 'true';
  const form = dialog.querySelector('[data-exit-intent-form]');
  const phone = dialog.querySelector('[data-exit-intent-phone]');
  const close = dialog.querySelector('[data-exit-intent-close]');
  const status = dialog.querySelector('[data-exit-intent-status]');
  const honeypot = dialog.querySelector('[data-exit-intent-honeypot]');
  const consent = dialog.querySelector('[data-exit-intent-consent]');
  const whatsapp = dialog.dataset.exitWhatsapp || '';
  let shown = false;

  const dismissedRecently = () => Date.now() - readDismissal() < WEEK;
  const dismiss = () => {
    rememberDismissal();
    if (dialog.open) dialog.close();
  };
  const show = () => {
    if (shown || dismissedRecently() || dialog.open) return;
    shown = true;
    dialog.showModal();
    phone?.focus();
  };

  document.addEventListener('mouseout', (event) => {
    if (event.relatedTarget || event.clientY > 0 || window.matchMedia('(pointer: coarse)').matches) return;
    show();
  });
  close?.addEventListener('click', dismiss);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss();
  });
  dialog.addEventListener('close', rememberDismissal);
  phone?.addEventListener('input', () => {
    const digits = getPhoneDigits(phone.value);
    if (digits) phone.value = formatPhone(digits);
    phone.setCustomValidity('');
  });
  form?.addEventListener('submit', (event) => {
    // The snapshot keeps a document-level submit listener frozen for the archived
    // forms. This independent lead path must not be reported as locally sent.
    event.preventDefault();
    event.stopPropagation();
    if (honeypot?.value) return dismiss();
    const digits = getPhoneDigits(phone?.value || '');
    if (!digits) {
      phone?.setCustomValidity('Введите телефон в формате +7 (999) 999-99-99');
      phone?.reportValidity();
      return;
    }
    if (!consent?.checked) {
      if (status) status.textContent = 'Подтвердите согласие на обработку персональных данных.';
      consent?.reportValidity();
      return;
    }
    const message = `Заявка на обратный звонок\nТелефон: ${formatPhone(digits)}\nСтраница: ${window.location.pathname}`;
    const url = createWhatsAppUrl(whatsapp, message);
    if (!url) {
      if (status) status.textContent = 'Не удалось открыть WhatsApp. Позвоните нам, пожалуйста.';
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    rememberDismissal();
    if (status) status.textContent = 'Открылся черновик WhatsApp. Отправьте сообщение, чтобы заявка дошла.';
  });
}
