// Чат поддержки — тот же виджет YourGood, что на оригинале.
//
// На чезаквест.рф скрипт стоит в <head> и грузится вместе со страницей. Здесь он
// подключается позже: сначала страница успевает отрисоваться, и только затем
// в фоне появляется кнопка чата. Так виджет не участвует в первом экране и не
// тянет вниз показатели скорости, ради которых затевался переезд.

const WIDGET_ID = 'eb74aec3-27d2-4551-885e-03b5a16822da';
const WIDGET_SRC = 'https://widget.yourgood.app/script/widget.js';
// Столько ждём, если браузер не умеет сообщать о простое.
const FALLBACK_DELAY = 3500;

let requested = false;

function appendWidget() {
  if (requested || document.querySelector(`script[src^="${WIDGET_SRC}"]`)) return;
  requested = true;
  const script = document.createElement('script');
  script.defer = true;
  script.dataset.pfId = WIDGET_ID;
  // Параметр now есть и в оригинале: сервис отдаёт свежую сборку виджета.
  script.src = `${WIDGET_SRC}?id=${WIDGET_ID}&now=${Date.now()}`;
  document.head.appendChild(script);
  hideOwnFabWhenWidgetIsUp();
}

// Виджет и наша плавающая кнопка делают одно и то же — открывают мессенджеры,
// и оба садятся в правый нижний угол. Как только виджет действительно нарисовал
// свою кнопку, свою убираем: на оригинале в этом углу стоит именно он. Если
// виджет не поднялся (кончился тариф, блокировщик, нет сети), остаётся наша.
function hideOwnFabWhenWidgetIsUp() {
  const deadline = Date.now() + 30000;
  const check = () => {
    const button = document.querySelector('pf-widget')?.shadowRoot?.querySelector('section');
    if (button) {
      document.body.classList.add('has-support-chat');
      return;
    }
    if (Date.now() < deadline) window.setTimeout(check, 1000);
  };
  check();
}

export function initSupportChat() {
  if (typeof window === 'undefined') return;
  // Экономный режим у посетителя — повод не тянуть стороннюю кнопку вовсе.
  if (navigator.connection?.saveData) return;

  const start = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(appendWidget, { timeout: FALLBACK_DELAY });
    } else {
      window.setTimeout(appendWidget, FALLBACK_DELAY);
    }
  };

  // Живое действие посетителя важнее таймера: если он уже листает страницу,
  // чат нужен ему прямо сейчас.
  const events = ['pointerdown', 'keydown', 'scroll'];
  const onIntent = () => {
    events.forEach((event) => window.removeEventListener(event, onIntent));
    appendWidget();
  };
  events.forEach((event) => window.addEventListener(event, onIntent, { once: true, passive: true }));

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
