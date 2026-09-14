// Text-only typography: safe to render through Astro escaping.
export const typograf = (value = '') => String(value)
  .replace(/(\d)\s*-\s*(?=\d)/gu, '$1–')
  .replace(/(?<![\p{L}\p{N}])([а-яё]{1,2})[ \t]+(?=\S)/giu, '$1\u00a0')
  .replace(/ +(?=[—–](?:\s|$))/gu, '\u00a0');
