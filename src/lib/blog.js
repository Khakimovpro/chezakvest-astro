// Обработка отрендеренного тела статьи блога.
//
// Markdown ничего не знает ни про SITE_BASE, ни про правило trailing slash,
// а production-contract.mjs роняет сборку и за то, и за другое. Поэтому HTML
// статьи проходит здесь перед вставкой в страницу.

const INTERNAL_PATH = /^\/(?!\/)/;

export function normalizeBase(base = '') {
  return String(base || '').replace(/\/+$/, '');
}

// Внутренний маршрут получает слеш на конце. Файлы (/assets/x.webp), якоря и
// параметры остаются как есть.
export function withTrailingSlash(path = '') {
  const [rawPath = '', rest = ''] = String(path).split(/(?=[?#])/, 2);
  if (!rawPath || !INTERNAL_PATH.test(rawPath)) return path;
  if (/\.[a-z0-9]{2,5}$/i.test(rawPath)) return path;
  if (rawPath.endsWith('/')) return `${rawPath}${rest}`;
  return `${rawPath}/${rest}`;
}

// Каждой h2 даётся латинский id: оглавление ссылается именно на него, а
// контракт проверяет, что у якоря есть цель на странице.
export function addHeadingIds(html = '') {
  let index = 0;
  return String(html).replace(/<h2\b([^>]*)>/gi, (match, attrs) => {
    index += 1;
    const cleaned = String(attrs).replace(/\sid="[^"]*"/i, '');
    return `<h2${cleaned} id="razdel-${index}">`;
  });
}

export function collectHeadings(html = '') {
  const headings = [];
  const pattern = /<h2\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/gi;
  let match = pattern.exec(html);
  while (match) {
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text) headings.push({ id: match[1], text });
    match = pattern.exec(html);
  }
  return headings;
}

// Ссылки и картинки приводятся к форме, которую принимает контракт:
// внутренний путь получает префикс базы, маршрут — слеш на конце.
export function applyBaseToHtml(html = '', base = '') {
  const prefix = normalizeBase(base);
  return String(html).replace(/\s(href|src|srcset)="([^"]*)"/gi, (match, attr, value) => {
    if (attr.toLowerCase() === 'srcset') {
      const rewritten = value.split(',').map((part) => {
        const trimmed = part.trim();
        if (!INTERNAL_PATH.test(trimmed)) return trimmed;
        return `${prefix}${trimmed}`;
      }).join(', ');
      return ` ${attr}="${rewritten}"`;
    }
    if (!INTERNAL_PATH.test(value)) return match;
    const normalized = attr.toLowerCase() === 'href' ? withTrailingSlash(value) : value;
    return ` ${attr}="${prefix}${normalized}"`;
  });
}

export function prepareArticleHtml(html = '', base = '') {
  const withIds = addHeadingIds(html);
  return { html: applyBaseToHtml(withIds, base), headings: collectHeadings(withIds) };
}

// Приблизительное время чтения — на случай, если в статье его не указали.
export function readingTime(html = '') {
  const words = String(html).replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  const tail = minutes % 10 === 1 && minutes % 100 !== 11 ? 'минута'
    : [2, 3, 4].includes(minutes % 10) && ![12, 13, 14].includes(minutes % 100) ? 'минуты'
      : 'минут';
  return `${minutes} ${tail}`;
}

export function formatDateRu(value = '') {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return value;
  const [, year, month, day] = match;
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}
