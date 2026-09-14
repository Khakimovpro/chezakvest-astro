const route = (slug = '') => `/${String(slug).replace(/^\/+|\/+$/gu, '')}/`;

export const PRODUCT_BLOCK_ORDER = [
  'hero', 'short', 'gallery', 'video', 'story', 'fit', 'booking', 'reviews',
  'players', 'safety', 'party', 'faq', 'map', 'related', 'finalCta',
];

const hlsFor = (registry, slug, kind) => Object.entries(registry?.videos || {})
  .find(([, video]) => video.kind === kind && (video.quest === slug || video.page === slug))?.[0] || '';

const comparableTitle = (value = '') => String(value).toLocaleLowerCase('ru-RU')
  .replace(/квест/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function productPageModel({ page, site, venues = [], venuePage = {}, reviews = {}, videoRegistry = {} }) {
  const product = page.product || {};
  const venue = venues.find((item) => item.slug === page.venueSlug) || {};
  const address = product.address || venue.address || '';
  const currentRoute = route(page.slug).slice(0, -1);
  const currentTitles = new Set([page.seo?.h1, page.hero?.h1].map(comparableTitle).filter(Boolean));
  const isCurrent = (item) => item.href === currentRoute || currentTitles.has(comparableTitle(item.t));
  const relatedItems = (page.related?.items || []).filter((item) => !isCurrent(item));
  const scenarios = page.scenarios?.items?.length
    ? { ...page.scenarios, items: page.scenarios.items.filter((item) => !isCurrent(item)) }
    : null;
  const selectedReviews = (product.reviewIndexes || [])
    .map((index) => reviews.reviews?.[index]).filter(Boolean);
  const gallery = product.gallery?.length ? product.gallery : [];
  const players = product.players?.length ? product.players : [];
  const hlsSlug = product.videoSlug || hlsFor(videoRegistry, page.slug, 'trailer');
  const hasMap = Boolean(venuePage.map?.img && venuePage.map?.embedUrl);

  return {
    page, site, venue, address,
    hero: page.hero?.h1 && page.hero?.bg ? {
      title: page.hero.h1, image: page.hero.bg, imageSet: page.hero.bgset,
      facts: [...(page.hero.pills || []), address].filter(Boolean),
      breadcrumbs: page.breadcrumbs || [], rating: product.rating || null,
      video: Boolean(hlsSlug),
    } : null,
    short: product.short || null,
    gallery: gallery.length >= 3 ? { title: product.galleryTitle || 'Атмосфера игры', items: gallery } : null,
    video: hlsSlug ? { title: product.videoTitle || 'Смотрите трейлер', slug: hlsSlug, intro: product.videoIntro, points: product.videoPoints } : null,
    story: page.story?.paragraphs?.length || page.features?.items?.length ? { story: page.story, features: page.features } : null,
    fit: product.fit?.for?.length || product.fit?.important?.length ? product.fit : null,
    booking: page.booking?.calendarId ? { ...page.booking, quest: page.hero?.h1 || page.seo?.h1 } : null,
    reviews: selectedReviews.length ? { items: selectedReviews, data: reviews, title: product.reviewsTitle || 'Отзывы о «Чё за Квест»' } : null,
    players: players.length ? { title: product.playersTitle || 'Как у нас проходят игры и праздники', items: players } : null,
    safety: product.safety?.length ? { title: product.safetyTitle || 'Родителям будет спокойнее', items: product.safety } : null,
    party: product.party?.photos?.length ? product.party : null,
    faq: product.faq?.length ? product.faq : null,
    map: hasMap ? { address, map: venuePage.map, howto: venuePage.howto, routeUrl: venuePage.howto?.routeUrl } : null,
    related: relatedItems.length ? { title: page.related?.title || 'Другие квесты', items: relatedItems, scenarios } : null,
    finalCta: product.finalCta || { title: 'Остались вопросы?' },
  };
}

export const productFaqItems = (page = {}) => (page.product?.faq || []).map(({ q, a }) => ({ q, a })).filter((item) => item.q && item.a);

export const headingParts = (lead, tail) => ({
  tail: tail || (/^[а-яё]/u.test(lead || '') ? lead : ''),
  lead: tail || !/^[а-яё]/u.test(lead || '') ? lead : '',
});
