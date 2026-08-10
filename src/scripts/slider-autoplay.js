export const AUTOPLAY_DELAY = 6000;

/**
 * Keep carousel timing independent from its DOM so the same lifecycle can be
 * exercised in tests. A user pause survives visibility changes; a temporary
 * hidden tab only clears the pending timer until it is visible again.
 */
export function createAutoplay({
  onTick,
  delay = AUTOPLAY_DELAY,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  isDocumentHidden = () => typeof document !== 'undefined' && document.hidden,
  prefersReducedMotion = () => false,
} = {}) {
  if (typeof onTick !== 'function') throw new TypeError('createAutoplay requires onTick');

  let enabled = false;
  let timeoutId = null;

  const clear = () => {
    if (timeoutId === null) return;
    clearTimeoutFn(timeoutId);
    timeoutId = null;
  };
  const canRotate = () => enabled && !isDocumentHidden() && !prefersReducedMotion();
  const schedule = () => {
    clear();
    if (!canRotate()) return false;

    timeoutId = setTimeoutFn(() => {
      timeoutId = null;
      if (!canRotate()) return;
      onTick();
      schedule();
    }, delay);
    return true;
  };

  return {
    start() {
      if (prefersReducedMotion()) {
        enabled = false;
        clear();
        return false;
      }
      enabled = true;
      return schedule();
    },
    stop() {
      enabled = false;
      clear();
    },
    handleVisibilityChange() {
      if (isDocumentHidden()) {
        clear();
        return false;
      }
      return schedule();
    },
    get isEnabled() {
      return enabled;
    },
    get isRunning() {
      return timeoutId !== null;
    },
  };
}
