// Клиентская часть блога: полоса прогресса на статье и фильтры на витрине.
// Всё опционально — без JS страница остаётся полностью читаемой.

export function initReadingProgress() {
  const bar = document.querySelector('[data-blog-progress]');
  if (!bar) return;
  const update = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    bar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

const plural = (count) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'статья';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'статьи';
  return 'статей';
};

export function initBlogFilters() {
  const grid = document.querySelector('[data-blog-grid]');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('[data-blog-card]')];
  const search = document.querySelector('[data-blog-search]');
  const tags = [...document.querySelectorAll('[data-blog-tag]')];
  const counter = document.querySelector('[data-blog-count]');
  const empty = document.querySelector('[data-blog-empty]');
  let activeTag = '';

  const apply = () => {
    const query = (search?.value || '').trim().toLowerCase();
    let shown = 0;
    cards.forEach((card) => {
      const haystack = `${card.dataset.title || ''} ${card.dataset.description || ''}`;
      const cardTags = (card.dataset.tags || '').split('|');
      const matchesQuery = !query || haystack.includes(query);
      const matchesTag = !activeTag || cardTags.includes(activeTag);
      const visible = matchesQuery && matchesTag;
      card.hidden = !visible;
      if (visible) shown += 1;
    });
    if (counter) counter.textContent = `${shown} ${plural(shown)}`;
    if (empty) empty.hidden = shown > 0;
  };

  search?.addEventListener('input', apply);
  tags.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.blogTag || '';
      activeTag = activeTag === value ? '' : value;
      tags.forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.blogTag === activeTag)));
      apply();
    });
  });
  apply();
}
