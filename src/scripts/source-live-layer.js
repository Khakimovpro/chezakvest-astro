const RIDE_DURATION = 600;
const AUTOPLAY_DELAY = 3000;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const cycleSlideIndex = (index, length) => ((index % length) + length) % length;
const clampIndex = cycleSlideIndex;

export const isArchivedAutoplayTimeout = (value) => Number(value) === AUTOPLAY_DELAY;

function slideTimeout(element) {
  const owner = element.closest('[data-slide-timeout]') ?? element.querySelector('[data-slide-timeout]');
  const timeout = Number(owner?.getAttribute('data-slide-timeout'));
  return isArchivedAutoplayTimeout(timeout) ? timeout : 0;
}

function updateActiveSlide(root, items, index) {
  const active = clampIndex(index, items.length);
  root.dataset.activeSlideIndex = String(active);
  items.forEach((item, itemIndex) => {
    if (itemIndex === active) item.setAttribute('aria-current', 'true');
    else item.removeAttribute('aria-current');
  });
  return active;
}

function closestSlideIndex(slider, items) {
  const left = slider.scrollLeft;
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;
  items.forEach((item, index) => {
    const itemLeft = item.offsetLeft - items[0].offsetLeft;
    const nextDistance = Math.abs(itemLeft - left);
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = index;
    }
  });
  return nearest;
}

function createAutoplay(root, advance) {
  const timeout = slideTimeout(root);
  if (!timeout || prefersReducedMotion()) return;

  let timer = 0;
  let observed = false;
  let paused = false;
  const clear = () => window.clearTimeout(timer);
  const schedule = () => {
    clear();
    if (!observed || paused) return;
    timer = window.setTimeout(() => {
      if (!observed || paused) return;
      advance();
      timer = window.setTimeout(schedule, RIDE_DURATION);
    }, timeout);
  };
  const pause = () => { paused = true; clear(); };
  const resume = () => { paused = false; schedule(); };

  root.addEventListener('mouseenter', pause, { passive: true });
  root.addEventListener('mousemove', pause, { once: true, passive: true });
  root.addEventListener('mouseleave', resume, { passive: true });
  root.addEventListener('touchstart', pause, { passive: true });
  root.addEventListener('touchend', resume, { passive: true });
  root.addEventListener('focusin', (event) => {
    if (event.target.closest('button, [role="button"]')) pause();
  });
  root.addEventListener('focusout', (event) => {
    if (event.target.closest('button, [role="button"]')) resume();
  });

  const observer = new IntersectionObserver(([entry]) => {
    observed = entry.isIntersecting;
    if (observed) schedule();
    else clear();
  }, { threshold: 0.1 });
  observer.observe(root);
}

function initialiseNativeCarousel(root) {
  if (root.dataset.sourceNativeCarouselReady) return;
  const type = root.classList.contains('t1196') ? 't1196' : 't1148';
  const slider = root.querySelector(`.${type}__slider`);
  const items = [...root.querySelectorAll(`.${type}__item`)];
  if (!slider || items.length < 2) return;

  root.dataset.sourceNativeCarouselReady = 'true';
  let active = updateActiveSlide(root, items, closestSlideIndex(slider, items));
  let restoreSnapTimer = 0;
  let riding = false;
  const authoredSnap = slider.style.scrollSnapType;
  const cancelRide = () => {
    if (!riding) return;
    window.clearTimeout(restoreSnapTimer);
    // A physical drag takes precedence over a pending native smooth scroll.
    // Stop it at its current position before using that position as the new
    // source of truth for aria-current and the next control action.
    slider.scrollTo({ left: slider.scrollLeft, behavior: 'auto' });
    slider.style.scrollSnapType = authoredSnap;
    riding = false;
    active = updateActiveSlide(root, items, closestSlideIndex(slider, items));
  };
  const go = (index) => {
    active = updateActiveSlide(root, items, index);
    riding = true;
    window.clearTimeout(restoreSnapTimer);
    slider.style.scrollSnapType = 'none';
    slider.scrollTo({ left: items[active].offsetLeft - items[0].offsetLeft, behavior: 'smooth' });
    restoreSnapTimer = window.setTimeout(() => {
      slider.style.scrollSnapType = authoredSnap;
      riding = false;
    }, RIDE_DURATION);
  };

  root.querySelector(`.${type}__control_left`)?.addEventListener('click', () => go(active - 1));
  root.querySelector(`.${type}__control_right`)?.addEventListener('click', () => go(active + 1));
  slider.addEventListener('scroll', () => {
    if (riding) return;
    active = updateActiveSlide(root, items, closestSlideIndex(slider, items));
  }, { passive: true });

  let pointerStart = null;
  slider.addEventListener('pointerdown', (event) => {
    cancelRide();
    pointerStart = { id: event.pointerId, x: event.clientX, left: slider.scrollLeft };
    slider.setPointerCapture?.(event.pointerId);
  });
  slider.addEventListener('pointermove', (event) => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    slider.scrollLeft = pointerStart.left - (event.clientX - pointerStart.x) * 1.5;
  });
  const finishPointer = (event) => {
    if (pointerStart?.id !== event.pointerId) return;
    pointerStart = null;
    active = updateActiveSlide(root, items, closestSlideIndex(slider, items));
  };
  slider.addEventListener('pointerup', finishPointer);
  slider.addEventListener('pointercancel', finishPointer);

  let lastWheelAt = 0;
  slider.addEventListener('wheel', (event) => {
    const now = performance.now();
    if (now - lastWheelAt < 300 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    lastWheelAt = now;
    event.preventDefault();
    go(active + (event.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  createAutoplay(root, () => go(active + 1));
}

function initialiseTildaSliderAutoplay(root) {
  root.querySelectorAll('.t-slds').forEach((slider) => {
    if (slider.dataset.sourceAutoplayReady || !slideTimeout(slider)) return;
    slider.dataset.sourceAutoplayReady = 'true';
    const right = slider.querySelector('.t-slds__arrow_wrapper-right');
    if (right) createAutoplay(slider, () => right.click());
  });
}

// A captured T396 artboard still includes record-scoped `#rec…` rules with
// `!important` dimensions for the old Tilda controls.  Those rules outrank the
// generic snapshot CSS and leave half of a gallery arrow outside a narrow
// artboard.  Keep the authored photo geometry, but give local controls their
// explicit 40px contract and inset the photo only on the two phone grids.
function initialiseZeroGalleryControls(scope) {
  const sliders = [...scope.querySelectorAll('.t396__elem[data-elem-type="gallery"] .t-slds')];
  if (!sliders.length) return;
  const authored = new WeakMap();
  const remember = (element, property) => {
    let values = authored.get(element);
    if (!values) {
      values = new Map();
      authored.set(element, values);
    }
    if (!values.has(property)) values.set(property, {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
  };
  const set = (element, property, value) => {
    remember(element, property);
    element.style.setProperty(property, value, 'important');
  };
  const restore = (element, property) => {
    const saved = authored.get(element)?.get(property);
    if (saved?.value) element.style.setProperty(property, saved.value, saved.priority);
    else element.style.removeProperty(property);
  };
  const controlProperties = [
    ['display', 'grid'], ['place-items', 'center'], ['width', '40px'], ['height', '40px'],
    ['padding', '0'], ['border', '0'], ['border-radius', '50%'], ['background', '#ff6900'],
    ['color', '#fff'], ['font', '400 31px/1 Arial, sans-serif'], ['pointer-events', 'auto'],
  ];
  const containerProperties = [
    ['position', 'absolute'], ['top', '50%'], ['left', '-20px'], ['right', '-20px'],
    ['width', 'auto'], ['margin', '0'], ['z-index', '4'], ['display', 'flex'],
    ['justify-content', 'space-between'], ['transform', 'translateY(-50%)'], ['pointer-events', 'none'],
  ];
  const syncMediaFrame = (slider) => {
    const main = slider.querySelector('.t-slds__main');
    const container = slider.querySelector('.t-slds__container');
    const wrapper = slider.querySelector('.t-slds__items-wrapper');
    const items = wrapper ? [...wrapper.querySelectorAll(':scope > .t-slds__item')] : [];
    const bullets = [...slider.querySelectorAll('.t-slds__bullet')];
    const width = slider.offsetWidth;
    if (!(main instanceof HTMLElement) || !(wrapper instanceof HTMLElement) || !items.length || !(width > 0)) return;
    // Some captured Tilda widgets retain stale trailing dots after their
    // archived slide list was normalised. They point at no item and make the
    // visible control count disagree with the actual gallery.
    bullets.slice(items.length).forEach((bullet) => bullet.remove());
    // Source snapshots sometimes initialise a lazy gallery after its shell has
    // received its mobile geometry. Keep the visual frame, each slide, and the
    // active-slide transform at the shell width rather than letting an old
    // authored frame paint over the controls.
    if (Math.abs(main.offsetWidth - width) < 1) return;
    const height = main.offsetHeight;
    set(main, 'width', `${width}px`);
    if (container instanceof HTMLElement) set(container, 'width', `${width}px`);
    set(wrapper, 'width', `${width * items.length}px`);
    if (height > 0) set(wrapper, 'height', `${height}px`);
    const activeIndex = Math.max(0, items.findIndex((item) => item.classList.contains('t-slds__item_active')));
    items.forEach((item) => {
      set(item, 'flex', `0 0 ${width}px`);
      set(item, 'width', `${width}px`);
      if (height > 0) set(item, 'height', `${height}px`);
      item.querySelectorAll('.tn-atom__slds-img, .t-slds__bgimg').forEach((media) => {
        if (!(media instanceof HTMLElement)) return;
        set(media, 'width', `${width}px`);
        if (height > 0) set(media, 'height', `${height}px`);
      });
    });
    set(wrapper, 'transform', `translate3d(${-activeIndex * width}px, 0, 0)`);
  };
  let mediaSyncFrame = 0;
  const pendingMediaSync = new Set();
  const queueMediaSync = (slider) => {
    pendingMediaSync.add(slider);
    if (mediaSyncFrame) return;
    mediaSyncFrame = window.requestAnimationFrame(() => {
      mediaSyncFrame = 0;
      pendingMediaSync.forEach(syncMediaFrame);
      pendingMediaSync.clear();
    });
  };
  const mediaObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const slider = mutation.target.closest('.t-slds');
      if (slider instanceof HTMLElement) queueMediaSync(slider);
    });
  });
  sliders.forEach((slider) => {
    const main = slider.querySelector('.t-slds__main');
    if (main instanceof HTMLElement) mediaObserver.observe(main, { attributes: true, attributeFilter: ['style'] });
    slider.addEventListener('click', (event) => {
      const control = event.target instanceof Element
        ? event.target.closest('.t-slds__arrow_wrapper, .t-slds__bullet')
        : null;
      if (control) queueMediaSync(slider);
    });
  });
  let resetSliderGeometry = false;
  const layout = () => {
    let relayoutSource = resetSliderGeometry;
    if (resetSliderGeometry) {
      sliders.forEach((slider) => ['width', 'margin-left', 'margin-right'].forEach((property) => restore(slider, property)));
      resetSliderGeometry = false;
    }
    const phone = window.innerWidth <= 639;
    sliders.forEach((slider) => {
      const container = slider.querySelector('.t-slds__arrow_container');
      const controls = [...slider.querySelectorAll('.t-slds__arrow_wrapper')];
      if (!container || controls.length !== 2) return;
      const rect = slider.getBoundingClientRect();
      // Tilda occasionally scales a 320px artboard up to the viewport. Inline
      // CSS dimensions live before that transform, while the visibility
      // contract is expressed in screen pixels. Translate the 40px controls
      // through the active scale so their rendered geometry remains exact.
      const scale = slider.offsetWidth ? rect.width / slider.offsetWidth : 1;
      const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      const controlSize = 40 / safeScale;
      const inset = 20 / safeScale;
      const properties = phone
        ? [...containerProperties.filter(([property]) => property !== 'left' && property !== 'right'), ['left', `-${inset}px`], ['right', `-${inset}px`]]
        : containerProperties;
      properties.forEach(([property, value]) => set(container, property, value));
      controls.forEach((control) => controlProperties.forEach(([property, value]) => {
        set(control, property, property === 'width' || property === 'height' ? `${controlSize}px` : value);
      }));
      const controlsEscapeViewport = controls.some((control) => {
        const controlRect = control.getBoundingClientRect();
        return controlRect.left < 0 || controlRect.right > window.innerWidth;
      });
      if (phone && controlsEscapeViewport) {
        const targetWidth = Math.min(rect.width, window.innerWidth - 40);
        const targetLeft = Math.max(20, Math.min(rect.left, window.innerWidth - 20 - targetWidth));
        const marginLeft = parseFloat(getComputedStyle(slider).marginLeft) || 0;
        set(slider, 'width', `${targetWidth / safeScale}px`);
        set(slider, 'margin-left', `${marginLeft + ((targetLeft - rect.left) / safeScale)}px`);
        relayoutSource = true;
      }
      syncMediaFrame(slider);
    });
    if (relayoutSource) window.dispatchEvent(new Event('source:relayout-sliders'));
  };
  layout();
  // Preview sliders gain their final dimensions shortly after the DOM is
  // ready. Reapply at bounded settling points; subsequent viewport changes
  // use the normal debounced resize path below.
  [250, 900, 1800].forEach((delay) => window.setTimeout(layout, delay));
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    resetSliderGeometry = true;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(layout, 120);
  }, { passive: true });
}

export function parseSbsOptions(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value.replaceAll("'", '"'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Tilda keeps an independent SBS timeline for each of its responsive grids.
// The narrowest matching grid wins: 320 (<=479), 480 (<=639), 640 (<=959),
// and 960 (<=1199).  The desktop attribute is used at 1200px and above.
const SBS_RESPONSIVE_BREAKPOINTS = [
  { key: '320', maxWidth: 479 },
  { key: '480', maxWidth: 639 },
  { key: '640', maxWidth: 959 },
  { key: '960', maxWidth: 1199 },
];

export function sbsFramesForViewport(element, width = window.innerWidth) {
  const responsive = SBS_RESPONSIVE_BREAKPOINTS.find(({ maxWidth }) => width <= maxWidth);
  const responsiveValue = responsive
    ? element.getAttribute(`data-animate-sbs-opts-res-${responsive.key}`)
    : null;
  return parseSbsOptions(responsiveValue || element.getAttribute('data-animate-sbs-opts'));
}

export function sbsTriggerOffset(element, topOffset, viewportHeight = window.innerHeight) {
  const rawTrigger = element.getAttribute('data-animate-sbs-trg');
  const parsedTrigger = Number(rawTrigger);
  const trigger = rawTrigger == null || rawTrigger === '' || !Number.isFinite(parsedTrigger) ? 1 : parsedTrigger;
  let offset = Number(element.getAttribute('data-animate-sbs-trgofst')) || 0;
  // This is the published tilda-animation-sbs trigger calculation. `trg` is
  // not an IntersectionObserver ratio: 0.5 and 1 are viewport-relative
  // offsets, with a short artboard clamped to its own document position.
  if (trigger === 0.5 || trigger === 1) {
    offset += viewportHeight * trigger;
    if (offset > topOffset && offset <= viewportHeight * trigger) offset = topOffset;
  }
  return offset;
}

function sbsTransform(frame) {
  const x = Number(frame.mx ?? 0);
  const y = Number(frame.my ?? 0);
  const sx = Number(frame.sx ?? 1);
  const sy = Number(frame.sy ?? 1);
  const rotate = Number(frame.ro ?? 0);
  return `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${sx}, ${sy})`;
}

function ensureSbsWrapper(atom) {
  let wrapper = atom.parentElement?.classList.contains('tn-atom__sbs-wrapper')
    ? atom.parentElement
    : null;
  if (!wrapper) {
    wrapper = document.createElement('span');
    wrapper.className = 'tn-atom__sbs-wrapper';
    atom.parentNode?.insertBefore(wrapper, atom);
    wrapper.append(atom);
  }
  // Tilda wraps the atom itself, rather than its children. That makes the
  // transform include atom-owned backgrounds, borders and pseudo-elements on
  // empty shape/button atoms as well as regular text and images.
  wrapper.style.display = 'block';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.transformOrigin = 'center';
  return wrapper;
}

function keyframeName(element, index) {
  return `source-sbs-${element.dataset.elemId || 'item'}-${index}`.replaceAll(/[^a-z0-9_-]/giu, '-');
}

export function buildSbsKeyframes(name, frames) {
  // Tilda inserts a held copy of the preceding state before a step with `dt`.
  // Keep that pause in the native timeline instead of starting the next motion
  // immediately; it is common in both hero decorations and hover cards.
  const steps = frames.flatMap((frame, index) => {
    if (!index || !(Number(frame.dd ?? frame.dt) > 0)) return [frame];
    return [{ ...frames[index - 1], ti: Number(frame.dd ?? frame.dt) }, frame];
  });
  const total = Math.max(1, steps.reduce((sum, frame, index) => sum + (index ? Number(frame.ti ?? 0) : 0), 0));
  let elapsed = 0;
  const keyframes = steps.map((frame, index) => {
    if (index) elapsed += Number(frame.ti ?? 0);
    const opacity = frame.op == null ? '' : `opacity:${Number(frame.op)};`;
    const nextEase = steps[index + 1]?.ea;
    const timing = nextEase == null ? '' : `animation-timing-function:${sbsTimingFunction(nextEase)};`;
    return `${(elapsed / total) * 100}%{transform:${sbsTransform(frame)};${opacity}${timing}}`;
  });
  return { css: `@keyframes ${name}{${keyframes.join('')}}`, duration: total };
}

function sbsTimingFunction(value) {
  switch (String(value).trim()) {
    case 'easeIn': return 'ease-in';
    case 'easeOut': return 'ease-out';
    case 'easeInOut': return 'ease-in-out';
    case 'bounceFin': return 'cubic-bezier(0.34,1.61,0.7,1)';
    case '': return 'linear';
    default: return String(value).trim();
  }
}

function usesIosHoverTap() {
  const platform = navigator.platform || '';
  return /iPad|iPhone|iPod/u.test(navigator.userAgent)
    || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function sbsHoverTriggerElements(element) {
  const ids = (element.getAttribute('data-animate-sbs-trgels') || '')
    .split(',').map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return [element];
  const artboard = element.closest('.t396__artboard, .tn-artboard');
  const targets = ids.flatMap((id) => {
    const escaped = window.CSS?.escape ? window.CSS.escape(id) : id.replaceAll(/[^a-z0-9_-]/giu, '');
    const selector = `[data-elem-id="${escaped}"], [data-group-id="${escaped}"]`;
    const target = artboard?.querySelector(selector) ?? document.querySelector(selector);
    return target ? [target] : [];
  });
  return targets.length ? targets : [element];
}

function initialiseSbs(root) {
  if (prefersReducedMotion()) return;
  let rules = '';
  let animationIndex = 0;
  const responsiveStates = [];
  const intoViewStates = [];
  root.querySelectorAll('[data-animate-sbs-event]').forEach((element) => {
    const hydratedWrapper = element.querySelector(':scope > .tn-atom__sbs-anim-wrapper');
    const atom = hydratedWrapper?.querySelector(':scope > .tn-atom')
      ?? element.querySelector(':scope > .tn-atom');
    const desktopFrames = parseSbsOptions(element.getAttribute('data-animate-sbs-opts'));
    if (!atom || desktopFrames.length < 2) return;
    const wrapper = ensureSbsWrapper(atom);
    const loop = element.getAttribute('data-animate-sbs-loop');
    const event = element.getAttribute('data-animate-sbs-event');
    let hoverBound = false;
    let iosHoverActive = false;
    let started = false;
    const animation = keyframeName(element, animationIndex++);
    rules += buildSbsKeyframes(animation, desktopFrames).css;
    // Reuse the same animation name under Tilda's media queries. This lets CSS
    // select the right keyframes immediately and lets `start` recompute the
    // matching duration when a viewport is resized.
    [...SBS_RESPONSIVE_BREAKPOINTS].reverse().forEach(({ key, maxWidth }) => {
      const frames = parseSbsOptions(element.getAttribute(`data-animate-sbs-opts-res-${key}`));
      if (frames.length >= 2) {
        rules += `@media (max-width:${maxWidth}px){${buildSbsKeyframes(animation, frames).css}}`;
      }
    });
    const canAnimate = () => window.innerWidth >= 1200 || element.getAttribute('data-animate-mobile') === 'y';
    const stop = () => {
      wrapper.style.animation = '';
      wrapper.style.transform = '';
      element.classList.remove('t-sbs-anim_started');
      started = false;
    };
    const play = (reverse = false) => {
      if (!canAnimate()) return stop();
      const frames = sbsFramesForViewport(element);
      if (frames.length < 2) return stop();
      const { duration } = buildSbsKeyframes(animation, frames);
      element.classList.add('t-sbs-anim_started');
      started = true;
      const iterations = loop?.includes('loop') ? 'infinite' : '1';
      const direction = reverse ? 'reverse' : (loop === 'loopwithreverse' ? 'alternate' : 'normal');
      wrapper.style.animation = `${animation} ${duration}ms linear ${iterations} ${direction} both`;
    };
    const start = () => {
      if (!canAnimate()) return stop();
      const frames = sbsFramesForViewport(element);
      if (frames.length < 2) return stop();
      if (event === 'hover') {
        wrapper.style.animation = '';
        wrapper.style.transform = sbsTransform(frames[0]);
        if (!hoverBound) {
          hoverBound = true;
          const hoverTargets = sbsHoverTriggerElements(element);
          if (usesIosHoverTap()) {
            const closeIosHover = (click) => {
              if (hoverTargets.some((target) => target.contains(click.target))) return;
              if (iosHoverActive && canAnimate()) play(true);
              iosHoverActive = false;
              element.classList.remove('t-hover-mob-active');
              document.removeEventListener('click', closeIosHover);
            };
            hoverTargets.forEach((target) => target.addEventListener('click', () => {
              if (!canAnimate() || iosHoverActive) return;
              wrapper.style.transform = '';
              play();
              iosHoverActive = true;
              element.classList.add('t-hover-mob-active');
              window.setTimeout(() => document.addEventListener('click', closeIosHover), 0);
            }));
          } else {
            hoverTargets.forEach((target) => target.addEventListener('pointerenter', () => {
              wrapper.style.transform = '';
              play();
            }));
            hoverTargets.forEach((target) => target.addEventListener('pointerleave', () => {
              if (canAnimate()) play(true);
            }));
          }
        }
        return;
      }
      if (!started) play();
    };
    // `trg` is a document-scroll trigger in Tilda, not an intersection ratio.
    // blockintoview intentionally uses the complete Zero artboard/record as
    // its target, since decorative children often sit beyond the viewport.
    const observed = event === 'blockintoview'
      ? element.closest('.t396__artboard, .t-rec') ?? element
      : element;
    const startsAtSourceOffset = () => {
      const top = observed.getBoundingClientRect().top + window.scrollY;
      return window.scrollY + sbsTriggerOffset(element, top) >= top;
    };
    const maybeStart = () => {
      if (startsAtSourceOffset()) start();
    };
    responsiveStates.push({ start, stop, canAnimate, maybeStart, event });
    if (event === 'intoview' || event === 'blockintoview') {
      intoViewStates.push(maybeStart);
    } else if (event === 'hover') {
      start();
    }
  });
  if (rules) {
    const style = document.createElement('style');
    style.dataset.sourceSbsKeyframes = '';
    style.textContent = rules;
    document.head.append(style);
    const checkIntoView = () => intoViewStates.forEach((maybeStart) => maybeStart());
    checkIntoView();
    let scrollTimer = 0;
    window.addEventListener('scroll', () => {
      if (scrollTimer) return;
      scrollTimer = window.setTimeout(() => {
        scrollTimer = 0;
        checkIntoView();
      }, 200);
    }, { passive: true });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        responsiveStates.forEach((state) => {
          if (state.canAnimate()) {
            if (state.event === 'intoview' || state.event === 'blockintoview') state.maybeStart();
            else state.start();
          }
          else state.stop();
        });
      }, 120);
    }, { passive: true });
  }
}

export function initSourceLiveLayer(root = document) {
  const scope = root.querySelector?.('[data-source-snapshot]') ?? root;
  if (!scope || scope.dataset.sourceLiveLayerReady) return;
  scope.dataset.sourceLiveLayerReady = 'true';
  scope.querySelectorAll('.t1196, .t1148').forEach(initialiseNativeCarousel);
  initialiseTildaSliderAutoplay(scope);
  initialiseZeroGalleryControls(scope);
  initialiseSbs(scope);
}
