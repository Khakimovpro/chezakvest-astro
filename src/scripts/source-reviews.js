// Модуль «reviews» живого слоя: оживляет блок отзывов из снимка.
// Разметку (шапку, теги, сетку карточек) кладёт генератор снимков, здесь —
// поведение виджета оригинала: фильтр по площадке, фильтр по тегу, листание
// сетки стрелками и точками, «Читать дальше» у обрезанных отзывов.

const ROWS = 3; // строк на странице — столько же, сколько у виджета оригинала

/** Сколько строк карточек влезает в это место страницы.
 *  На пяти лендингах (Among Us, Калмар, Minecraft, Roblox, выпускной) виджет
 *  вставлен в Zero-Block: там под него отведён блок фиксированной высоты, и
 *  три ряда просто наехали бы на следующую запись снимка. */
function rowsFor(block) {
  return block.closest('.source-reviews-slot') ? 1 : ROWS;
}

/** Сколько карточек помещается в строку прямо сейчас (читаем из грид-раскладки). */
function columnsOf(list) {
  const template = getComputedStyle(list).gridTemplateColumns;
  const columns = template.split(' ').filter((value) => value && value !== 'none').length;
  return Math.max(1, columns);
}

function setupBlock(block) {
  const list = block.querySelector('[data-source-reviews-list]');
  if (!list) return;

  const items = [...list.querySelectorAll('.source-reviews__item')];
  if (!items.length) return;

  const tags = [...block.querySelectorAll('[data-source-reviews-tag]')];
  const services = [...block.querySelectorAll('[data-source-reviews-service]')];
  const dots = block.querySelector('[data-source-reviews-dots]');
  const empty = block.querySelector('[data-source-reviews-empty]');
  const prev = block.querySelector('[data-source-reviews-arrow="prev"]');
  const next = block.querySelector('[data-source-reviews-arrow="next"]');

  // Теги у отзыва хранятся в data-атрибуте строкой; сравниваем без регистра —
  // ровно так же, как это делает виджет оригинала.
  const meta = items.map((item) => ({
    item,
    service: item.dataset.service || '',
    tags: (item.dataset.tags || '').split(',').filter(Boolean).map((value) => value.toLowerCase()),
  }));

  let activeService = null;
  let activeTag = null;
  let page = 0;
  const rows = rowsFor(block);
  let pageSize = columnsOf(list) * rows;

  const matched = () => meta.filter((entry) => {
    if (activeService && entry.service !== activeService) return false;
    if (activeTag && !entry.tags.includes(activeTag)) return false;
    return true;
  });

  const render = () => {
    pageSize = columnsOf(list) * rows;
    const visible = matched();
    const pages = Math.max(1, Math.ceil(visible.length / pageSize));
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;

    const shown = new Set(visible.slice(page * pageSize, (page + 1) * pageSize).map((entry) => entry.item));
    meta.forEach((entry) => {
      const isShown = shown.has(entry.item);
      entry.item.hidden = !isShown;
      if (!isShown) entry.item.querySelector('.review-card')?.classList.remove('is-expanded');
    });

    // Сетку не прячем даже пустой: у скрытого элемента нельзя прочитать число
    // колонок, и следующий расчёт страницы уехал бы.
    if (empty) empty.hidden = visible.length !== 0;

    const paged = pages > 1;
    if (prev) {
      prev.hidden = !paged;
      prev.disabled = page === 0;
    }
    if (next) {
      next.hidden = !paged;
      next.disabled = page >= pages - 1;
    }

    if (dots) {
      // Контейнер точек остаётся в потоке даже пустым: он распирает подвал и
      // держит кнопку «Оставить отзыв» у правого края, как на оригинале.
      if (dots.childElementCount !== (paged ? pages : 0)) {
        dots.textContent = '';
        for (let index = 0; paged && index < pages; index += 1) {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'source-reviews__dot';
          dot.setAttribute('role', 'tab');
          dot.setAttribute('aria-label', `Страница ${index + 1}`);
          dot.addEventListener('click', () => {
            page = index;
            render();
          });
          dots.append(dot);
        }
      }
      [...dots.children].forEach((dot, index) => {
        dot.setAttribute('aria-selected', String(index === page));
      });
    }

    // «Читать дальше» показываем только там, где текст правда не поместился.
    shown.forEach((item) => {
      const body = item.querySelector('.review-card__body');
      const more = item.querySelector('[data-source-reviews-more]');
      if (!body || !more) return;
      if (item.querySelector('.review-card')?.classList.contains('is-expanded')) return;
      more.hidden = body.scrollHeight <= body.clientHeight + 1;
    });
  };

  tags.forEach((chip) => {
    chip.addEventListener('click', () => {
      const value = (chip.dataset.sourceReviewsTag || '').toLowerCase();
      activeTag = activeTag === value ? null : value;
      tags.forEach((other) => {
        other.setAttribute('aria-pressed', String((other.dataset.sourceReviewsTag || '').toLowerCase() === activeTag));
      });
      page = 0;
      render();
    });
  });

  services.forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.sourceReviewsService || '';
      activeService = activeService === value ? null : value;
      services.forEach((other) => {
        other.setAttribute('aria-pressed', String((other.dataset.sourceReviewsService || '') === activeService));
      });
      page = 0;
      render();
    });
  });

  prev?.addEventListener('click', () => {
    page -= 1;
    render();
  });
  next?.addEventListener('click', () => {
    page += 1;
    render();
  });

  list.addEventListener('click', (event) => {
    const more = event.target.closest('[data-source-reviews-more]');
    if (!more) return;
    const card = more.closest('.review-card');
    if (!card) return;
    card.classList.add('is-expanded');
    more.hidden = true;
  });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 150);
  });

  block.classList.add('is-live');
  // Оболочку снимка держат в `display:none`, пока не досчитается первая
  // раскладка артборда. Мерить число колонок и обрезку текста до этого момента
  // бесполезно: скрытый элемент отдаёт нули.
  whenShellVisible(block, () => {
    render();
    // Шрифты приезжают позже разметки и меняют высоту строк, поэтому решение
    // «влез ли текст» пересчитываем ещё раз, когда они встали на место.
    document.fonts?.ready?.then(render).catch(() => {});
  });
}

/** Ждём, пока снимок перестанет быть скрытым, и только потом считаем раскладку. */
function whenShellVisible(block, run) {
  const shell = block.closest('.source-snapshot-shell');
  if (!shell || !shell.hasAttribute('aria-busy')) {
    run();
    return;
  }
  const observer = new MutationObserver(() => {
    if (shell.hasAttribute('aria-busy')) return;
    observer.disconnect();
    run();
  });
  observer.observe(shell, { attributes: true, attributeFilter: ['aria-busy'] });
}

export function initSourceReviews(scope = document) {
  scope.querySelectorAll('[data-source-reviews]').forEach((block) => {
    if (block.dataset.sourceReviewsReady === '') return;
    block.dataset.sourceReviewsReady = '';
    setupBlock(block);
  });
}
