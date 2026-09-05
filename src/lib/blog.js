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
  const value = String(path);
  const cut = value.search(/[?#]/);
  const rawPath = cut === -1 ? value : value.slice(0, cut);
  const rest = cut === -1 ? '' : value.slice(cut);
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

// Ленты фотографий прокручиваются вбок, но браузер сам не делает контейнер
// фокусируемым: с клавиатуры видна только первая картинка. Раздаём фокус и имя.
export function makeGalleriesFocusable(html = '') {
  return String(html).replace(/<div\s+style="([^"]*overflow-x\s*:\s*auto[^"]*)"/gi,
    (match, style) => `<div style="${style}" tabindex="0" role="group" aria-label="Фотографии, прокручиваются вбок"`);
}

export function prepareArticleHtml(html = '', base = '') {
  const withIds = addHeadingIds(html);
  const withGalleries = makeGalleriesFocusable(withIds);
  return { html: applyBaseToHtml(withGalleries, base), headings: collectHeadings(withIds) };
}

export function formatDateRu(value = '') {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return value;
  const [, year, month, day] = match;
  return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}
