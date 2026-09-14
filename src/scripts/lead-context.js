const VISIT_KEY = 'chezakvest-lead-visit';
const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_referrer', 'yclid', 'gclid'];
const TTL = 30 * 24 * 60 * 60 * 1000;
let memoryVisit;

export function visitContext({ storage, url, referrer = '', now = Date.now() }) {
  let previous;
  try { previous = JSON.parse(storage?.getItem(VISIT_KEY) || 'null'); } catch { /* Storage can be denied. */ }
  if (previous?.expires > now) return previous.values;
  const params = new URL(url).searchParams;
  const values = { referrer: referrer.slice(0, 1500) };
  ATTRIBUTION_KEYS.forEach((key) => { values[key] = (params.get(key) || '').slice(0, key === 'utm_referrer' ? 1500 : 250); });
  try { storage?.setItem(VISIT_KEY, JSON.stringify({ expires: now + TTL, values })); } catch { /* Keep in memory. */ }
  return values;
}

export function getVisitContext() {
  if (!memoryVisit) {
    let storage;
    try { storage = window.localStorage; } catch { /* Private browser. */ }
    memoryVisit = visitContext({ storage, url: window.location.href, referrer: document.referrer });
  }
  const cookie = (key) => {
    const value = document.cookie.split('; ').find((item) => item.startsWith(`${key}=`))?.slice(key.length + 1) || '';
    try { return decodeURIComponent(value).slice(0, 100); } catch { return ''; }
  };
  return { ...memoryVisit, ym_uid: cookie('_ym_uid'), roistat_visit: cookie('roistat_visit') };
}

if (typeof window !== 'undefined') getVisitContext();
