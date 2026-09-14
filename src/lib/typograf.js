// Text-only typography. Callers render the result through Astro escaping.
export const typograf = (value = '') => String(value)
  .replace(/(\d)[ \t]*-[ \t]*(?=\d)/gu, '$1–')
  .replace(/[ \t]+[-–—][ \t]+/gu, '\u00a0— ')
  .replace(/(?<![\p{L}\p{N}])(в|во|и|а|с|со|к|ко|о|об|у|на|по|за|от|до|из|не|ни|но|да)[ \t]+(?=\S)/giu, '$1\u00a0')
  .replace(/(\S)[ \t]+(ли|ль|же|ж|бы|б)(?=[\s.,!?…:;]|$)/giu, '$1\u00a0$2')
  .replace(/(?<!\p{L})(ул\.|пр\.|пер\.|д\.|г\.|им\.|стр\.|пр-т)[ \t]+(?=\S)/giu, '$1\u00a0')
  .replace(/(\d)[ \t]+(?=\p{L})/gu, '$1\u00a0')
  .replace(/(\d)-(?=\p{L})/gu, '$1-\u2060')
  .replace(/(?<!\p{L})(\p{L}+-\p{L}+)(?!\p{L})/gu, word => word.length <= 14 ? word.replace('-', '-\u2060') : word);
