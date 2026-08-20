// Приёмка живого слоя: проверяет на собранном сайте то, что уже один раз молча пропало —
// маску телефона, кнопку мессенджеров, плашку «Бонус», карту, отзывы, наведение на карточку,
// цвет меню, ленивые картинки, вес страницы, внешние запросы и горизонтальный скролл.
//
// Запуск (сначала поднять статику: cd dist && python3 -m http.server 8899):
//   node scripts/live-layer-verify.mjs http://127.0.0.1:8899 <тег> [маршруты через запятую]
// Отчёт: logs/live-layer-<тег>/{report.json,summary.txt} + скриншоты.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/$/, '');
const tag = process.argv[3] || 'after';
const OUT = new URL(`../logs/live-layer-${tag}/`, import.meta.url).pathname;
await fs.mkdir(OUT, { recursive: true });

const ROUTES = (process.argv[4] || '/,/kids/,/contacts/,/40letpobedy216/,/igra_v_kalmara/,/nansena107/,/prazdniki-pod-kluch/,/strashnye-kvesty/,/new-year/,/prazdnik-maxi/,/roblox-land/,/pryatki_v_temnote/,/brawl_stars/,/den-rozhdeniya-na-vr-arene/').split(',');

// Source snapshots deliberately retain the URL in data-source-lazy-img until
// our observer has a nearby, rendered target. Native `loading=lazy` alone is
// too eager on tall desktop pages, so prove both sides of the contract: the
// initial viewport has no unresolved or broken image and the final viewport
// resolves every image brought into view by a full-page scroll.
const lazyImageHealth = () => {
  const isRenderedInViewport = (image) => {
    const rect = image.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.top >= innerHeight) return false;
    for (let element = image; element instanceof HTMLElement; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.02) return false;
    }
    return true;
  };
  const images = [...document.images];
  const deferred = images.filter((image) => image.dataset.sourceLazyImg);
  const hydrated = images.filter((image) => image.dataset.sourceLazyHydrated === 'true');
  const broken = images.filter((image) => (
    image.hasAttribute('src')
    && !image.currentSrc.startsWith('data:')
    && image.complete
    && image.naturalWidth === 0
  ));
  const describe = (image) => ({
    alt: image.alt.slice(0, 60),
    source: (image.dataset.sourceLazyImg || image.getAttribute('src') || '').slice(0, 100),
  });
  return {
    deferred: deferred.length,
    hydrated: hydrated.length,
    visibleDeferred: deferred.filter(isRenderedInViewport).slice(0, 6).map(describe),
    visibleBroken: broken.filter(isRenderedInViewport).slice(0, 6).map(describe),
    // A marker-less image without src is an impossible steady state: a normal
    // source image has src and a waiting source image keeps its lazy marker.
    // This catches a broken hydrate routine that removes the marker first.
    visibleBlank: images.filter((image) => !image.hasAttribute('src') && !image.dataset.sourceLazyImg && isRenderedInViewport).slice(0, 6).map(describe),
    invalidHydrated: hydrated.filter((image) => !image.hasAttribute('src') || !image.currentSrc).slice(0, 6).map(describe),
    // Once a marker has been consumed it must resolve even if the visitor has
    // already scrolled past that card. A final-viewport-only test would miss
    // a broken image in the middle of a long source snapshot.
    brokenHydrated: hydrated.filter((image) => image.complete && image.naturalWidth === 0).slice(0, 6).map(describe),
  };
};

const t829Geometry = () => {
  const record = document.querySelector('#rec844797119');
  const container = record?.querySelector('.t829__container');
  const grid = container?.querySelector('.t829__grid');
  const item = grid?.querySelector(':scope > .t829__grid-item');
  const wrapper = item?.querySelector('.t829__imgwrapper');
  if (!(record instanceof HTMLElement) || !(container instanceof HTMLElement) || !(grid instanceof HTMLElement)
    || !(item instanceof HTMLElement) || !(wrapper instanceof HTMLElement)) return null;
  const round = (value) => Math.round(value);
  return {
    record: round(record.getBoundingClientRect().height),
    grid: round(grid.getBoundingClientRect().height),
    item: round(item.getBoundingClientRect().height),
    wrapper: round(wrapper.getBoundingClientRect().height),
    itemBounds: [...grid.querySelectorAll(':scope > .t829__grid-item')].map((card) => {
      const rect = card.getBoundingClientRect();
      return [round(rect.x), round(rect.y), round(rect.width), round(rect.height)];
    }),
  };
};

const footerGeometry = () => {
  const footer = document.querySelector('.t977');
  const logo = footer?.querySelector('.t977__logo');
  const social = footer?.querySelector('.t-sociallinks__customimg');
  if (!(footer instanceof HTMLElement) || !(logo instanceof HTMLImageElement)
    || !(social instanceof HTMLImageElement)) return null;
  const round = (value) => Math.round(value);
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return [round(box.width), round(box.height)];
  };
  return { footer: round(footer.getBoundingClientRect().height), logo: rect(logo), social: rect(social) };
};

const probe = () => {
  const px = (v) => Math.round(v);
  const R = (el) => { const r = el.getBoundingClientRect(); return [px(r.x), px(r.y), px(r.width), px(r.height)]; };

  // A1 — телефонная маска
  const wraps = [...document.querySelectorAll('.t-input-phonemask__wrap')]
    .filter((w) => w.getBoundingClientRect().height > 5);
  const phone = wraps.slice(0, 3).map((w) => {
    const inp = w.querySelector('input.t-input-phonemask');
    const sel = w.querySelector('.t-input-phonemask__select');
    const flag = w.querySelector('.t-input-phonemask__select-flag');
    const wr = w.getBoundingClientRect();
    const ir = inp?.getBoundingClientRect();
    return {
      display: getComputedStyle(w).display,
      wrap: R(w),
      sel: sel ? R(sel) : null,
      inp: inp ? R(inp) : null,
      overflowPx: ir ? Math.round(ir.bottom - wr.bottom) : null,
      sideBySide: !!(sel && inp) && sel.getBoundingClientRect().right <= inp.getBoundingClientRect().left + 2,
      flagBg: flag ? getComputedStyle(flag).backgroundImage.slice(0, 40) : null,
      flagPos: flag ? getComputedStyle(flag).backgroundPosition : null,
      fontSize: inp ? getComputedStyle(inp).fontSize : null,
    };
  });

  // A2 — плавающие кнопки
  const fixed = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width >= 24 && r.height >= 24 && r.bottom > innerHeight * 0.5;
  }).map((el) => ({ cls: el.className.toString().slice(0, 50), text: (el.innerText || '').trim().slice(0, 30), rect: R(el) }));
  const fab = !!document.querySelector('[data-messenger-root], .mfab-root');
  const bonus = [...document.querySelectorAll('body *')].some((el) => /бонус/i.test((el.textContent || '').slice(0, 200)) && getComputedStyle(el).position === 'fixed');

  // A3 — карта
  const mapNode = document.querySelector('.source-map, [data-source-widget="map"], .lazymap, [data-map-embed]');
  const map = mapNode ? { present: true, rect: R(mapNode), hasIframe: !!mapNode.querySelector('iframe'), text: (mapNode.innerText || '').trim().slice(0, 40) } : { present: false };

  // A4 — отзывы
  const revNodes = [...document.querySelectorAll('.source-reviews, #otzivy, [data-source-widget="reviews"], .reviews, .rv, [id*="otziv"]')];
  const rev = revNodes.find((n) => n.getBoundingClientRect().height > 120 && (n.innerText || '').trim().length > 40);
  const reviews = rev ? { present: true, rect: R(rev), text: (rev.innerText || '').trim().slice(0, 60) } : { present: false, anchors: revNodes.length };

  // A6 — карточки
  const cards = [...document.querySelectorAll('.game-card-animated')];
  const cardsInfo = { count: cards.length, withArrow: cards.filter((c) => c.querySelector('.game-card-arrow')).length, firstRect: cards[0] ? R(cards[0]) : null, cols: cards.slice(0, 6).map((c) => Math.round(c.getBoundingClientRect().x)) };

  // A7 — меню
  const menu = [...document.querySelectorAll('.hdr .nav .nav__item > a, .hdr .nav .nav__trigger > a, .hdr .nav a')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.top > -50 && r.top < 200 && r.width > 20; })
    .slice(0, 6).map((e) => ({ t: (e.innerText || '').trim().slice(0, 24), color: getComputedStyle(e).color }));

  // C1 — картинки и вес
  const imgs = [...document.images];
  const lazy = imgs.filter((i) => i.loading === 'lazy').length;
  const res = performance.getEntriesByType('resource');
  const totalKb = Math.round(res.reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024);
  const external = res.filter((r) => !r.name.startsWith(location.origin)).map((r) => r.name.slice(0, 60));

  // общее
  const anims = [...document.querySelectorAll('[data-animate-style], .t-animate')].slice(0, 5)
    .map((e) => ({ op: getComputedStyle(e).opacity, tr: getComputedStyle(e).transition.slice(0, 30) }));
  const hidden = [...document.querySelectorAll('[data-animate-style], .t-animate, .t396__elem--anim-hidden')]
    .filter((e) => parseFloat(getComputedStyle(e).opacity) < 0.05).length;

  return {
    title: document.title, height: document.documentElement.scrollHeight,
    phone, fab, bonus, fixed, map, reviews, cards: cardsInfo, menu,
    imgs: imgs.length, lazy, totalKb, external: [...new Set(external)].slice(0, 6),
    anims, invisibleAnimated: hidden,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

const browser = await chromium.launch();
const out = {};
for (const route of ROUTES) {
  const viewports = [{ width: 1440 }, { width: 390 }];
  if (route === '/kids/') viewports.push({ width: 1024 }, { width: 1920 });
  if (route === '/prazdniki-pod-kluch/') viewports.push({ width: 1024 }, { width: 1920 });
  // The narrowest source artboards can be scaled by Tilda at 360px. Keep a
  // real gallery route in the regression pass so controls cannot disappear
  // beyond either edge while its photo still fits the viewport.
  if (route === '/40letpobedy216/') viewports.push({ width: 360 });
  // A representative SBS route gets a separate first-load check with motion
  // explicitly reduced. This must happen before the local layer initialises.
  if (route === '/strashnye-kvesty/') viewports.push({ width: 1440, reducedMotion: true });
  for (const viewport of viewports) {
    const { width, reducedMotion = false } = viewport;
    const phoneViewport = width <= 639;
    const ctx = await browser.newContext({
      viewport: { width, height: phoneViewport ? 844 : 900 },
      isMobile: phoneViewport,
      hasTouch: phoneViewport,
      deviceScaleFactor: 1,
      reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
      userAgent: phoneViewport
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
        : undefined,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 100)); });
    page.on('requestfailed', (r) => errors.push('FAILED ' + r.url().slice(0, 80)));
    const key = `${route} @${width}${reducedMotion ? ' reduce' : ''}`;
    try {
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3500);
      const lazyBefore = await page.evaluate(lazyImageHealth);
      const t829Before = route === '/kids/' ? await page.evaluate(t829Geometry) : null;
      const footerBefore = await page.evaluate(footerGeometry);
      const fullCarouselCoverage = route === '/den-rozhdeniya-na-vr-arene/' && width === 1440 && !reducedMotion;
      const coverAdditionalAutoplay = route === '/igra_v_kalmara/' && width === 1440 && !reducedMotion;
      const liveControls = await page.evaluate(async ({ coverCarouselInteractions, checkAdditionalAutoplay }) => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const externalBeforeInteraction = performance.getEntriesByType('resource')
          .filter((entry) => !entry.name.startsWith(location.origin)).map((entry) => entry.name);
        const nativeCarousels = [...document.querySelectorAll('.t1196, .t1148')];
        const carousel = nativeCarousels[0];
        const carouselHealth = nativeCarousels.map((root) => {
          const type = root.classList.contains('t1196') ? 't1196' : 't1148';
          const items = [...root.querySelectorAll(`.${type}__item`)];
          const activeItems = items.filter((item) => item.getAttribute('aria-current') === 'true');
          return {
            type,
            items: items.length,
            minHeight: Math.min(...items.map((item) => item.getBoundingClientRect().height)),
            activeItems: activeItems.length,
            activeMatchesIndex: activeItems[0] === items[Number(root.dataset.activeSlideIndex)],
          };
        });
        let carouselResult = null;
        if (carousel) {
          const type = carousel.classList.contains('t1196') ? 't1196' : 't1148';
          const slider = carousel.querySelector(`.${type}__slider`);
          carousel.scrollIntoView({ block: 'center' });
          await wait(180);
          const before = carousel.dataset.activeSlideIndex;
          const autoplayOwner = carousel.closest('[data-slide-timeout]') ?? carousel.querySelector('[data-slide-timeout]');
          const autoplayExpected = autoplayOwner?.getAttribute('data-slide-timeout') === '3000'
            && !matchMedia('(prefers-reduced-motion: reduce)').matches;
          let autoplayAfter = before;
          if (autoplayExpected) {
            await wait(3700);
            autoplayAfter = carousel.dataset.activeSlideIndex;
          }
          carousel.querySelector(`.${type}__control_right`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(700);
          const afterRight = carousel.dataset.activeSlideIndex;
          carousel.querySelector(`.${type}__control_left`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(700);
          const afterLeft = carousel.dataset.activeSlideIndex;
          slider?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
          await wait(700);
          const afterWheel = carousel.dataset.activeSlideIndex;
          let interactions = null;
          if (coverCarouselInteractions && autoplayExpected && slider) {
            const dragBefore = slider.scrollLeft;
            const dragAtEnd = dragBefore >= slider.scrollWidth - slider.clientWidth - 1;
            const dragTargetX = dragAtEnd ? 540 : 300;
            slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 81, clientX: 420 }));
            slider.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 81, clientX: dragTargetX }));
            slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 81, clientX: dragTargetX }));
            await wait(120);
            const dragAfter = slider.scrollLeft;
            carousel.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            carousel.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            const pausedAt = carousel.dataset.activeSlideIndex;
            await wait(3300);
            const pausedAfter = carousel.dataset.activeSlideIndex;
            carousel.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            await wait(3700);
            const resumedAfter = carousel.dataset.activeSlideIndex;
            carousel.dispatchEvent(new Event('touchstart', { bubbles: true }));
            const touchPausedAt = carousel.dataset.activeSlideIndex;
            await wait(3300);
            const touchPausedAfter = carousel.dataset.activeSlideIndex;
            carousel.dispatchEvent(new Event('touchend', { bubbles: true }));
            await wait(3700);
            const touchResumedAfter = carousel.dataset.activeSlideIndex;
            const focusControl = carousel.querySelector(`.${type}__control_right`);
            focusControl?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
            const focusPausedAt = carousel.dataset.activeSlideIndex;
            await wait(3300);
            const focusPausedAfter = carousel.dataset.activeSlideIndex;
            focusControl?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            await wait(3700);
            const focusResumedAfter = carousel.dataset.activeSlideIndex;
            carousel.scrollIntoView({ block: 'start' });
            await wait(200);
            window.scrollTo({ top: document.documentElement.scrollHeight });
            await wait(300);
            const offscreenAt = carousel.dataset.activeSlideIndex;
            await wait(3300);
            const offscreenAfter = carousel.dataset.activeSlideIndex;
            carousel.scrollIntoView({ block: 'start' });
            await wait(300);
            await wait(3700);
            interactions = {
              dragMoved: dragAfter !== dragBefore,
              paused: pausedAt === pausedAfter,
              resumed: pausedAfter !== resumedAfter,
              touchPaused: touchPausedAt === touchPausedAfter,
              touchResumed: touchPausedAfter !== touchResumedAfter,
              focusPaused: focusPausedAt === focusPausedAfter,
              focusResumed: focusPausedAfter !== focusResumedAfter,
              offscreenPaused: offscreenAt === offscreenAfter,
              intersectionResumed: offscreenAfter !== carousel.dataset.activeSlideIndex,
            };
          }
          carouselResult = {
            present: true,
            before,
            afterRight,
            afterLeft,
            afterWheel,
            active: carousel.querySelectorAll('[aria-current="true"]').length === 1,
            autoplayExpected,
            autoplayAfter,
            interactions,
          };
        }
        // The first carousel covers the full interaction matrix below. Exercise
        // controls on every following root too: otherwise a later T1196/T1148
        // could lose its binding while the page-level health remains green.
        const carouselControls = [];
        const followingCarousels = nativeCarousels.slice(1);
        if (followingCarousels.length) {
          const records = followingCarousels.map((root) => {
            const type = root.classList.contains('t1196') ? 't1196' : 't1148';
            const items = [...root.querySelectorAll(`.${type}__item`)];
            return { root, type, items, before: root.dataset.activeSlideIndex };
          });
          records.forEach(({ root, type }) => root.querySelector(`.${type}__control_right`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
          await wait(700);
          records.forEach((record) => { record.afterRight = record.root.dataset.activeSlideIndex; });
          records.forEach(({ root, type }) => root.querySelector(`.${type}__control_left`)?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
          await wait(700);
          records.forEach((record) => {
            const activeItems = record.items.filter((item) => item.getAttribute('aria-current') === 'true');
            carouselControls.push({
              type: record.type,
              items: record.items.length,
              before: record.before,
              afterRight: record.afterRight,
              afterLeft: record.root.dataset.activeSlideIndex,
              active: activeItems.length === 1,
            });
          });
        }
        // `/igra_v_kalmara/` deliberately starts with a non-autoplay carousel;
        // verify its two later authored 3000ms carousels independently.
        const carouselAutoplay = [];
        const carouselAutoplayExpected = followingCarousels.filter((root) => {
          const owner = root.closest('[data-slide-timeout]') ?? root.querySelector('[data-slide-timeout]');
          return owner?.getAttribute('data-slide-timeout') === '3000';
        }).length;
        if (checkAdditionalAutoplay) {
          for (const root of followingCarousels) {
            const owner = root.closest('[data-slide-timeout]') ?? root.querySelector('[data-slide-timeout]');
            if (owner?.getAttribute('data-slide-timeout') !== '3000') continue;
            root.scrollIntoView({ block: 'center' });
            await wait(220);
            const before = root.dataset.activeSlideIndex;
            await wait(3700);
            carouselAutoplay.push({ before, after: root.dataset.activeSlideIndex });
          }
        }
        const galleryIsRendered = (gallery) => {
          if (gallery.getBoundingClientRect().width < 1) return false;
          for (let element = gallery; element instanceof HTMLElement; element = element.parentElement) {
            const style = getComputedStyle(element);
            if (element.classList.contains('nolimAutoScaleFix')
              || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return false;
          }
          return true;
        };
        const galleries = [...document.querySelectorAll('.t396__elem[data-elem-type="gallery"] .t-slds')]
          .filter(galleryIsRendered);
        const galleryHealth = galleries.map((gallery) => {
          const bullets = [...gallery.querySelectorAll('button.t-slds__bullet')];
          const arrows = [...gallery.querySelectorAll('button.t-slds__arrow_wrapper')];
          const galleryRect = gallery.getBoundingClientRect();
          const photoRect = gallery.querySelector('.t-slds__main')?.getBoundingClientRect() ?? galleryRect;
          const hasVisibleBullets = bullets.every((bullet) => {
            const rect = bullet.getBoundingClientRect();
            return rect.width >= 8 && rect.height >= 8 && getComputedStyle(bullet).display !== 'none';
          });
          const hasSourceArrows = arrows.length === 2 && arrows.every((arrow) => {
            const rect = arrow.getBoundingClientRect();
            const style = getComputedStyle(arrow);
            const outsidePhoto = rect.left < photoRect.left || rect.right > photoRect.right;
            return rect.width >= 40 && rect.height >= 40
              && style.backgroundColor === 'rgb(255, 105, 0)'
              && style.display !== 'none' && outsidePhoto;
          });
          const unclippedArrows = arrows.length === 2 && arrows.every((arrow) => {
            const rect = arrow.getBoundingClientRect();
            return rect.left >= -1 && rect.right <= innerWidth + 1;
          });
          return {
            slides: gallery.querySelectorAll('.t-slds__item').length,
            arrows: arrows.length,
            bullets: bullets.length,
            visibleBullets: hasVisibleBullets,
            sourceArrows: hasSourceArrows,
            unclippedArrows,
            activeBullets: bullets.filter((bullet) => bullet.classList.contains('t-slds__bullet_active')).length,
          };
        });
        const gallery = galleries.find((slider) => slider.querySelectorAll('.t-slds__item').length > 1
          && slider.querySelector('.t-slds__arrow_wrapper'));
        let galleryResult = null;
        if (gallery) {
          const before = gallery.querySelector('.t-slds__item_active')?.dataset.slideIndex;
          gallery.querySelector('.t-slds__arrow_wrapper-right')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(80);
          const afterArrow = gallery.querySelector('.t-slds__item_active')?.dataset.slideIndex;
          const alternateBullet = [...gallery.querySelectorAll('button.t-slds__bullet')]
            .find((bullet) => !bullet.classList.contains('t-slds__bullet_active'));
          alternateBullet?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          await wait(80);
          galleryResult = {
            present: true,
            before,
            afterArrow,
            afterBullet: gallery.querySelector('.t-slds__item_active')?.dataset.slideIndex,
            buttons: gallery.querySelectorAll('button.t-slds__arrow_wrapper').length,
            slides: gallery.querySelectorAll('.t-slds__item').length,
            activeBullets: gallery.querySelectorAll('button.t-slds__bullet.t-slds__bullet_active').length,
          };
        }
        const stages = [...document.querySelectorAll('[data-source-video-kind]')];
        const videoHealth = stages.map((stage) => ({
          kind: stage.dataset.sourceVideoKind,
          poster: !!stage.querySelector('img[src*="/assets/rutube/"]'),
          deferred: !stage.querySelector('.source-video__media'),
          signedRutube: stage.dataset.sourceVideoKind !== 'rutube' || /\?p=/.test(stage.dataset.rutubeid || ''),
          playable: stage.dataset.sourceVideoKind === 'rutube' || !!stage.dataset.sourceVideoUrl,
          localDirectVideo: stage.dataset.sourceVideoKind !== 'video' || (() => {
            try {
              return new URL(decodeURIComponent(stage.dataset.sourceVideoUrl || ''), document.baseURI).origin === location.origin;
            } catch {
              return false;
            }
          })(),
        }));
        let videoResult = null;
        if (stages.length) {
          const results = [];
          for (const stage of stages) {
            const before = stage.querySelector('.source-video__media') === null;
            stage.querySelector('[data-source-video-play]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await wait(60);
            const media = stage.querySelector('.source-video__media');
            let localDirectVideo = true;
            let directVideoPlayback = true;
            if (stage.dataset.sourceVideoKind === 'video') {
              const expected = new URL(decodeURIComponent(stage.dataset.sourceVideoUrl || ''), document.baseURI).href;
              localDirectVideo = media instanceof HTMLVideoElement && media.src === expected && expected.startsWith(location.origin);
              if (media instanceof HTMLVideoElement) {
                // Synthetic DOM clicks are not trusted user activation. Muting
                // only this acceptance instance lets the browser prove that the
                // local MP4 loads and starts without altering guest behavior.
                media.muted = true;
                try {
                  await media.play();
                  directVideoPlayback = await Promise.race([
                    new Promise((resolve) => media.addEventListener('playing', () => resolve(true), { once: true })),
                    wait(1500).then(() => media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !media.error),
                  ]);
                } catch {
                  directVideoPlayback = false;
                }
              } else {
                directVideoPlayback = false;
              }
            }
            results.push({
              deferredBeforeClick: before,
              mountedAfterClick: media !== null,
              localDirectVideo,
              directVideoPlayback,
            });
          }
          videoResult = {
            present: true,
            slots: results.length,
            deferredBeforeClick: results.every((result) => result.deferredBeforeClick),
            mountedAfterClick: results.every((result) => result.mountedAfterClick),
            localDirectVideo: results.every((result) => result.localDirectVideo),
            directVideoPlayback: results.every((result) => result.directVideoPlayback),
          };
        }
        const parseSbs = (value) => {
          try { return JSON.parse((value || '').replaceAll("'", '"')); } catch { return []; }
        };
        const sbsOwners = [...document.querySelectorAll('[data-animate-sbs-event]')]
          .filter((element) => parseSbs(element.getAttribute('data-animate-sbs-opts')).length > 1);
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // A loop can still be authored as a hover effect (and can belong to a
        // zero-size decorative source clone). Only an in-view animation is
        // expected to be running before interaction, so use it as the active
        // SBS representative and leave hover to the dedicated probe below.
        const sbsOwner = sbsOwners.find((element) => {
          const event = element.getAttribute('data-animate-sbs-event');
          const rect = element.getBoundingClientRect();
          return (event === 'intoview' || event === 'blockintoview') && rect.width > 1 && rect.height > 1;
        }) ?? sbsOwners[0];
        sbsOwner?.scrollIntoView({ block: 'start' });
        await wait(500);
        const sbs = sbsOwner?.querySelector('.tn-atom__sbs-wrapper');
        const sbsStates = sbsOwners.map((owner) => {
          const wrapper = owner.querySelector('.tn-atom__sbs-wrapper');
          const shouldAnimate = innerWidth >= 1200 || owner.getAttribute('data-animate-mobile') === 'y';
          return {
            wrapped: !!wrapper,
            shouldAnimate,
            animation: wrapper ? getComputedStyle(wrapper).animationName : 'none',
            started: owner.classList.contains('t-sbs-anim_started'),
          };
        });
        const hoverOwner = sbsOwners.find((element) => element.getAttribute('data-animate-sbs-event') === 'hover');
        const hover = hoverOwner?.querySelector('.tn-atom__sbs-wrapper');
        const hoverShouldAnimate = !!hover && !reduced
          && (innerWidth >= 1200 || hoverOwner?.getAttribute('data-animate-mobile') === 'y');
        const hoverBefore = hover?.style.animation || hover?.style.transform || '';
        const iosHover = /iPad|iPhone|iPod/u.test(navigator.userAgent);
        const hoverTriggerIds = (hoverOwner?.getAttribute('data-animate-sbs-trgels') || '')
          .split(',').map((id) => id.trim()).filter(Boolean);
        const hoverScope = hoverOwner?.closest('.t396__artboard') || document;
        const hoverTrigger = hoverTriggerIds.length
          ? hoverTriggerIds.map((id) => hoverScope.querySelector(`[data-elem-id="${id}"], [data-group-id="${id}"]`)).find(Boolean)
          : hoverOwner;
        hoverTrigger?.dispatchEvent(iosHover
          ? new MouseEvent('click', { bubbles: true })
          : new PointerEvent('pointerenter', { bubbles: true }));
        await wait(80);
        const hoverAfter = hover?.style.animation || hover?.style.transform || '';
        hoverTrigger?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
        const sbsResult = {
          authored: sbsOwners.length,
          allWrapped: reduced || sbsStates.every((state) => state.wrapped),
          reducedAnimated: reduced && sbsStates.some((state) => state.animation !== 'none'),
          blockedMobile: sbsStates.filter((state) => !state.shouldAnimate)
            .every((state) => state.animation === 'none'),
          representative: sbs ? {
            animation: getComputedStyle(sbs).animationName,
            display: getComputedStyle(sbs).display,
          } : null,
          reduced,
          activeRequired: !!sbs
            && (sbsOwner?.getAttribute('data-animate-sbs-event') === 'intoview' || sbsOwner?.getAttribute('data-animate-sbs-event') === 'blockintoview')
            && (innerWidth >= 1200 || sbsOwner?.getAttribute('data-animate-mobile') === 'y'),
          hoverPresent: !!hover,
          hoverChanged: !hoverShouldAnimate || hoverBefore !== hoverAfter,
        };
        const desktopExit = !matchMedia('(pointer: coarse)').matches;
        const exit = document.querySelector('[data-exit-intent-dialog]');
        const openedUrls = [];
        const originalOpen = window.open;
        window.open = (...args) => { openedUrls.push(args); return null; };
        if (desktopExit) {
          document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientY: 0 }));
          await wait(30);
        }
        let exitResult = exit ? { present: true, desktop: desktopExit, open: exit.open, honeypot: !!exit.querySelector('[data-exit-intent-honeypot]') } : null;
        if (exit?.open && desktopExit) {
          const phone = exit.querySelector('[data-exit-intent-phone]');
          const consent = exit.querySelector('[data-exit-intent-consent]');
          const form = exit.querySelector('[data-exit-intent-form]');
          const status = exit.querySelector('[data-exit-intent-status]');
          phone.value = '+7 (999) 123-45-67';
          phone.dispatchEvent(new Event('input', { bubbles: true }));
          consent.checked = false;
          form.requestSubmit();
          await wait(30);
          const consentBlocked = openedUrls.length === 0;
          consent.checked = true;
          form.requestSubmit();
          await wait(30);
          exit.close();
          document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientY: 0 }));
          await wait(30);
          exitResult = {
            ...exitResult,
            whatsappDraft: openedUrls[0]?.[0] || '',
            truthfulStatus: /Открылся черновик WhatsApp/u.test(status?.textContent || ''),
            cooldown: !exit.open,
            persistedCooldown: Number(localStorage.getItem('exitPopupDismissedAt')) > Date.now() - 5_000,
            consentBlocked,
          };
        }
        window.open = originalOpen;
        return {
          externalBeforeInteraction,
          carousel: carouselResult,
          carouselHealth,
          carouselControls,
          carouselAutoplay,
          carouselAutoplayExpected,
          gallery: galleryResult,
          galleryHealth,
          galleryCount: galleries.length,
          video: videoResult,
          videoHealth,
          sbs: sbsResult,
          exit: exitResult,
        };
      }, { coverCarouselInteractions: fullCarouselCoverage, checkAdditionalAutoplay: coverAdditionalAutoplay });
      const firstFrame = await page.evaluate(() => {
        const shell = document.querySelector('.source-snapshot-shell');
        if (!shell) return { shell: false };
        const s = getComputedStyle(shell);
        return { shell: true, display: s.display, visibility: s.visibility, busy: shell.getAttribute('aria-busy'), h: Math.round(shell.getBoundingClientRect().height) };
      });
      const initialKb = await page.evaluate(() => Math.round(performance.getEntriesByType('resource').reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) / 1024));
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 900) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
      });
      await page.waitForTimeout(1800);
      const lazyAfterScroll = await page.evaluate(lazyImageHealth);
      const t829After = route === '/kids/' ? await page.evaluate(t829Geometry) : null;
      const footerAfter = await page.evaluate(footerGeometry);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const data = await page.evaluate(probe);
      data.initialKb = initialKb;
      data.lazyBefore = lazyBefore;
      data.lazyAfterScroll = lazyAfterScroll;
      data.t829 = { before: t829Before, after: t829After };
      data.footer = { before: footerBefore, after: footerAfter };
      data.liveControls = liveControls;
      data.firstFrame = firstFrame;
      data.errors = errors.slice(0, 5);
      // The controlled strategy must still render in clients without native
      // IntersectionObserver. Exercise that real fallback once, before any
      // page script has a chance to capture the browser implementation.
      if (route === '/prazdniki-pod-kluch/' && width === 1440 && !reducedMotion) {
        const fallbackContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await fallbackContext.addInitScript(() => {
          Object.defineProperty(window, 'IntersectionObserver', { configurable: true, value: undefined });
        });
        const fallbackPage = await fallbackContext.newPage();
        await fallbackPage.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await fallbackPage.waitForTimeout(1800);
        data.lazyFallback = await fallbackPage.evaluate(lazyImageHealth);
        await fallbackContext.close();
      }
      // The main path above proves a real WhatsApp draft. On one desktop page
      // also exercise the two defensive branches in fresh documents: persisted
      // cooldown after reload and honeypot without opening WhatsApp.
      if (route === '/' && width === 1440 && !reducedMotion && liveControls.exit?.desktop) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(450);
        const reloadCooldown = await page.evaluate(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const dialog = document.querySelector('[data-exit-intent-dialog]');
          document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientY: 0 }));
          await wait(50);
          return !!dialog && !dialog.open;
        });
        await page.evaluate(() => localStorage.removeItem('exitPopupDismissedAt'));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(450);
        const honeypot = await page.evaluate(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const opened = [];
          const originalOpen = window.open;
          window.open = (...args) => { opened.push(args); return null; };
          const dialog = document.querySelector('[data-exit-intent-dialog]');
          document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientY: 0 }));
          await wait(30);
          const form = dialog?.querySelector('[data-exit-intent-form]');
          const phone = dialog?.querySelector('[data-exit-intent-phone]');
          const consent = dialog?.querySelector('[data-exit-intent-consent]');
          const trap = dialog?.querySelector('[data-exit-intent-honeypot]');
          phone.value = '+7 (999) 123-45-67';
          phone.dispatchEvent(new Event('input', { bubbles: true }));
          consent.checked = true;
          trap.value = 'bot';
          form.requestSubmit();
          await wait(30);
          window.open = originalOpen;
          return {
            ignored: opened.length === 0 && !dialog.open,
            persisted: Number(localStorage.getItem('exitPopupDismissedAt')) > Date.now() - 5_000,
          };
        });
        data.liveControls.exit = { ...liveControls.exit, reloadCooldown, honeypot };
      }
      // hover первой карточки
      if (data.cards.count && width === 1440) {
        const t = await page.evaluate(() => {
          const c = document.querySelector('.game-card-animated');
          if (!c) return null;
          c.scrollIntoView({ block: 'center' });
          const r = c.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        if (t) {
          await page.waitForTimeout(400);
          await page.mouse.move(t.x, t.y);
          await page.waitForTimeout(700);
          data.hover = await page.evaluate(() => {
            const c = document.querySelector('.game-card-animated');
            const arrow = c?.querySelector('.game-card-arrow');
            const img = c?.querySelector('.game-card-image');
            return {
              active: !!c?.classList.contains('active'),
              arrowOpacity: arrow ? getComputedStyle(arrow).opacity : null,
              imgTransform: img ? getComputedStyle(img).transform.slice(0, 30) : null,
            };
          });
          await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '_')}-hover.png` });
          await page.mouse.move(5, 5);
        }
      }
      out[key] = data;
      if (width === 1440) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '_')}-bottom.png` });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${route.replace(/\//g, '_')}-top.png` });
      }
    } catch (e) {
      out[key] = { error: String(e).slice(0, 160) };
    }
    await ctx.close();
  }
}
await browser.close();
await fs.writeFile(`${OUT}/report.json`, JSON.stringify(out, null, 2));

// краткая сводка
const lines = [];
for (const [key, d] of Object.entries(out)) {
  if (d.error) { lines.push(`${key}: ОШИБКА ${d.error}`); continue; }
  const ph = d.phone[0];
  lines.push([
    key.padEnd(28),
    `маска:${ph ? (ph.sideBySide ? 'ok' : 'СЛОМАНА') + (ph.overflowPx > 2 ? `(+${ph.overflowPx}px)` : '') : '—'}`,
    `fab:${d.fab ? 'ok' : 'НЕТ'}`,
    `бонус:${d.bonus ? 'ok' : '—'}`,
    `карта:${d.map.present ? 'ok' : 'НЕТ'}`,
    `отзывы:${d.reviews.present ? 'ok' : (d.reviews.anchors ? 'ПУСТО' : '—')}`,
    `карточки:${d.cards.count}${d.hover ? '/hover:' + (d.hover.active ? 'ok' : 'НЕТ') : ''}`,
    `x:${(d.cards.cols || []).slice(0, 3).join('/') || '—'}`,
    `меню:${d.menu[0]?.color || '—'}`,
    `img:${d.imgs}/lazy:${d.lazy}`,
    `lazy:${d.lazyBefore?.deferred ?? '—'}→${d.lazyAfterScroll?.deferred ?? '—'}+${d.lazyAfterScroll?.hydrated ?? '—'}`,
    `вес:старт ${d.initialKb}/после скролла ${d.totalKb}KB`,
    `внешние:${d.external.length}/до-клика:${d.liveControls?.externalBeforeInteraction?.length ?? '—'}`,
    `live:${d.liveControls?.carousel ? (d.liveControls.carousel.active ? 'carousel-ok' : 'carousel-FAIL') : '—'}${d.liveControls?.gallery ? (d.liveControls.gallery.activeBullets === 1 ? '/gallery-ok' : '/gallery-FAIL') : ''}${d.liveControls?.video ? (d.liveControls.video.mountedAfterClick ? '/video-ok' : '/video-FAIL') : ''}${d.liveControls?.exit ? (d.liveControls.exit.desktop ? (d.liveControls.exit.truthfulStatus && d.liveControls.exit.cooldown ? '/exit-ok' : '/exit-FAIL') : '/exit-skip-touch') : ''}`,
    `невидимых:${d.invisibleAnimated}`,
    `hScroll:${d.hScroll ? 'ЕСТЬ' : 'нет'}`,
    `ошибок:${d.errors.length}`,
  ].join('  '));
}
await fs.writeFile(`${OUT}/summary.txt`, lines.join('\n'));
console.log(lines.join('\n'));
console.log('\nОтчёт:', OUT);

const failures = Object.entries(out).flatMap(([key, data]) => {
  if (data.error) return [key];
  const live = data.liveControls;
  const problems = [];
  if (live?.carousel && (
    !live.carousel.active
    || live.carousel.before === live.carousel.afterRight
    || live.carousel.afterRight === live.carousel.afterLeft
    || live.carousel.afterLeft === live.carousel.afterWheel
    || (live.carousel.autoplayExpected && live.carousel.before === live.carousel.autoplayAfter)
  )) problems.push('carousel');
  if (live?.carouselHealth?.some((carousel) => carousel.items > 1 && (
    carousel.minHeight <= 1 || carousel.activeItems !== 1 || !carousel.activeMatchesIndex
  ))) problems.push('carousel-health');
  if (live?.carouselControls?.some((carousel) => carousel.items > 1 && (
    carousel.before === carousel.afterRight || carousel.afterRight === carousel.afterLeft || !carousel.active
  ))) problems.push('carousel-controls');
  if (key === '/igra_v_kalmara/ @1440' && (
    live?.carouselAutoplayExpected !== 2
    || live?.carouselAutoplay?.length !== live?.carouselAutoplayExpected
    || live.carouselAutoplay.some((carousel) => carousel.before === carousel.after)
  )) problems.push('carousel-autoplay');
  if (key === '/den-rozhdeniya-na-vr-arene/ @1440' && (!live?.carousel?.interactions
    || Object.values(live.carousel.interactions).some((result) => !result))) problems.push('carousel-interactions');
  if (live?.gallery && (
    live.gallery.buttons !== 2
    || live.gallery.before === live.gallery.afterArrow
    || live.gallery.afterArrow === live.gallery.afterBullet
    || live.gallery.activeBullets !== 1
  )) problems.push('gallery');
  if (live?.galleryHealth?.some((gallery) => gallery.slides > 1 && (
    gallery.arrows !== 2 || gallery.bullets !== gallery.slides || !gallery.visibleBullets || !gallery.sourceArrows || !gallery.unclippedArrows || gallery.activeBullets !== 1
  ))) problems.push('gallery-health');
  if (key.startsWith('/40letpobedy216/ @') && (live?.galleryCount ?? 0) < 2) problems.push('gallery-presence');
  if (live?.video && (!live.video.deferredBeforeClick || !live.video.mountedAfterClick || !live.video.localDirectVideo || !live.video.directVideoPlayback)) problems.push('video');
  if (live?.videoHealth?.some((stage) => !stage.poster || !stage.deferred || !stage.signedRutube || !stage.playable || !stage.localDirectVideo)) problems.push('video-health');
  if (live?.externalBeforeInteraction?.length) problems.push('pre-click-network');
  if (data.lazyBefore?.visibleDeferred?.length || data.lazyBefore?.visibleBroken?.length || data.lazyBefore?.visibleBlank?.length
    || data.lazyAfterScroll?.visibleDeferred?.length || data.lazyAfterScroll?.visibleBroken?.length || data.lazyAfterScroll?.visibleBlank?.length
    || data.lazyAfterScroll?.invalidHydrated?.length || data.lazyAfterScroll?.brokenHydrated?.length) problems.push('lazy-visible');
  if (key.startsWith('/prazdniki-pod-kluch/ @') && (data.lazyBefore?.deferred ?? 0) < 20) problems.push('lazy-deferred');
  if (key.startsWith('/kids/ @') && (!data.t829.before || !data.t829.after || (
    data.t829.before.wrapper < 32
    || data.t829.before.item !== data.t829.after.item
    || data.t829.before.grid !== data.t829.after.grid
    || data.t829.before.record !== data.t829.after.record
    || data.t829.after.itemBounds.length !== 5
    || data.t829.after.itemBounds.some((bounds, index, all) => all.slice(0, index).some((other) => (
      bounds[0] < other[0] + other[2] && bounds[0] + bounds[2] > other[0]
      && bounds[1] < other[1] + other[3] && bounds[1] + bounds[3] > other[1]
    )))
  ))) problems.push('lazy-layout');
  if (key === '/prazdniki-pod-kluch/ @1440' && (!data.lazyFallback
    || data.lazyFallback.deferred !== 0
    || data.lazyFallback.visibleBlank.length
    || data.lazyFallback.visibleBroken.length
    || data.lazyFallback.invalidHydrated.length
    || data.lazyFallback.brokenHydrated.length)) problems.push('lazy-fallback');
  if (data.footer.before && data.footer.after && (
    data.footer.before.footer !== data.footer.after.footer
    || data.footer.before.logo[0] !== data.footer.after.logo[0]
    || data.footer.before.logo[1] !== data.footer.after.logo[1]
    || data.footer.before.social[0] !== data.footer.after.social[0]
    || data.footer.before.social[1] !== data.footer.after.social[1]
  )) problems.push('lazy-footer-layout');
  if (live?.sbs?.authored && (
    !live.sbs.allWrapped
    || (!live.sbs.reduced && live.sbs.activeRequired && (
      // Обёртка sbs повторяет раскладку своего элемента артборда: у атома-ячейки
      // это display:inherit (в вычисленном виде — table), у остальных block.
      // Требуем от неё настоящий бокс, который донесёт transform до атома.
      ['none', 'inline'].includes(live.sbs.representative?.display) || live.sbs.representative?.animation === 'none'
    ))
    || live.sbs.reducedAnimated
    || !live.sbs.blockedMobile
    || !live.sbs.hoverChanged
  )) problems.push('sbs');
  if (live?.exit?.desktop && (
    !live.exit.open || !live.exit.honeypot || !live.exit.consentBlocked || !live.exit.truthfulStatus || !live.exit.cooldown || !live.exit.persistedCooldown || !/wa\.me\//u.test(live.exit.whatsappDraft)
  )) problems.push('exit');
  if (key === '/ @1440' && (!live?.exit?.reloadCooldown || !live.exit.honeypot?.ignored || !live.exit.honeypot?.persisted)) problems.push('exit-defences');
  return problems.map((problem) => `${key}: ${problem}`);
});
if (failures.length) {
  console.error('Live-layer failures:\n' + failures.join('\n'));
  process.exitCode = 1;
}
