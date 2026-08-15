const ALLOWED_TAGS = new Set(['a', 'b', 'br', 'em', 'span', 'strong']);
const COLOR_PATTERN = /^(?:#[\da-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+%?)?\s*\)|[a-z]{3,24})$/iu;

function escapeHtml(value, quote = false) {
  const escaped = String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return quote ? escaped.replaceAll('"', '&quot;').replaceAll("'", '&#39;') : escaped;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'iu'));
  return match?.[2] ?? '';
}

function safeColor(style) {
  for (const declaration of String(style).split(';')) {
    const separator = declaration.indexOf(':');
    if (separator === -1 || declaration.slice(0, separator).trim().toLowerCase() !== 'color') continue;
    const color = declaration.slice(separator + 1).trim().replace(/\s+/gu, ' ').toLowerCase();
    if (COLOR_PATTERN.test(color)) return color;
  }
  return '';
}

function safeHref(value) {
  const href = String(value).trim();
  if (/^(?:\/|#|https?:\/\/|mailto:|tel:)/iu.test(href)) return href;
  return '';
}

export function sanitizeInlineHtml(value) {
  const source = String(value ?? '')
    .replace(/<!--[^]*?-->/gu, '')
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/giu, '');
  let output = '';
  let cursor = 0;
  const stack = [];
  for (const match of source.matchAll(/<\/?\s*[a-z][^>]*>/giu)) {
    output += escapeHtml(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    const closing = /^<\s*\//u.test(match[0]);
    const name = match[0].match(/^<\s*\/?\s*([a-z\d-]+)/iu)?.[1]?.toLowerCase() ?? '';
    if (!ALLOWED_TAGS.has(name)) continue;
    if (name === 'br') {
      if (!closing) output += '<br>';
      continue;
    }
    if (closing) {
      const index = stack.lastIndexOf(name);
      if (index === -1) continue;
      while (stack.length > index) output += `</${stack.pop()}>`;
      continue;
    }

    let attributes = '';
    if (name === 'a') {
      const href = safeHref(attribute(match[0], 'href'));
      if (!href) continue;
      attributes += ` href="${escapeHtml(href, true)}"`;
      if (attribute(match[0], 'target') === '_blank') {
        attributes += ' target="_blank" rel="noopener noreferrer"';
      }
    } else {
      const color = safeColor(attribute(match[0], 'style'));
      if (color) attributes += ` style="color:${escapeHtml(color, true)}"`;
    }
    output += `<${name}${attributes}>`;
    stack.push(name);
  }
  output += escapeHtml(source.slice(cursor));
  while (stack.length) output += `</${stack.pop()}>`;
  return output;
}
