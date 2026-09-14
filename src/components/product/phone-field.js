const mask = '(___) ___-__-__';
const digitPositions = [...mask].flatMap((char, index) => char === '_' ? [index] : []);

export function nationalDigits(value) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function maskNationalPhone(value) {
  const digits = nationalDigits(value);
  if (!digits) return '';
  let i = 0;
  return mask.replace(/_/g, () => digits[i++] || '_');
}

if (typeof document !== 'undefined') document.querySelectorAll('[data-phone-field]').forEach((input) => {
  const apply = () => {
    const before = input.value;
    const caret = input.selectionStart ?? before.length;
    let count = before.slice(0, caret).replace(/\D/g, '').length;
    if (before.replace(/\D/g, '').length === 11 && /^[78]/.test(before.replace(/\D/g, ''))) count--;
    input.value = maskNationalPhone(before);
    if (document.activeElement === input) {
      const position = input.value ? digitPositions[Math.max(0, count)] ?? mask.length : 0;
      input.setSelectionRange(position, position);
    }
  };
  input.addEventListener('beforeinput', (event) => {
    if (!['deleteContentBackward', 'deleteContentForward'].includes(event.inputType) || input.selectionStart !== input.selectionEnd) return;
    const caret = input.selectionStart;
    const positions = digitPositions.filter(i => /\d/.test(input.value[i] || ''));
    const target = event.inputType === 'deleteContentBackward' ? positions.findLast(i => i < caret) : positions.find(i => i >= caret);
    if (target !== undefined) input.setSelectionRange(target, target + 1);
  });
  // Capture before delivery validation so it sees the normalized value.
  input.addEventListener('input', apply, true);
  input.addEventListener('change', apply);
  apply();
});
