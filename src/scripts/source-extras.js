// Подбор праздничной программы и плашки, которые его открывают.
//
// На оригинале это сторонний виджет Marquiz: встроенный кадр в блоке «Поможем
// подобрать праздничную программу» и плавающая плашка слева внизу. В снимке от
// него остаётся только пустое место, поэтому подбор собран здесь заново —
// вопросы, ответы, подсказки менеджера и форма взяты из настроек оригинального
// квиза и лежат в src/data/quizzes.json.
//
// Стартовый экран генератор снимков кладёт в разметку сам, скрипт добавляет шаги.

const BASE = import.meta.env.BASE_URL.replace(/\/$/u, '');
const CARD_DISMISSED_KEY = 'source-quiz-card-dismissed';
const CARD_DELAY_MS = 10000;

let quizzesPromise = null;

// Настройки квизов весят больше, чем стоит грузить на каждой странице: они
// нужны только тому, кто нажал «Подобрать программу».
const loadQuizzes = () => {
  quizzesPromise ??= import('../data/quizzes.json').then((module) => module.default);
  return quizzesPromise;
};

const asset = (path) => (path && path.startsWith('/') ? `${BASE}${path}` : path);

const stored = (key) => {
  try {
    return window.sessionStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const remember = (key) => {
  try {
    window.sessionStorage.setItem(key, 'true');
  } catch {
    // Приватный режим запрещает хранилище — плашка просто вернётся на следующей странице.
  }
};

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** Один прогон подбора: держит ответы, рисует шаги и заявку. */
class QuizRun {
  constructor(stage, quiz, { onFinish } = {}) {
    this.stage = stage;
    this.quiz = quiz;
    this.onFinish = onFinish;
    this.index = 0;
    this.answers = quiz.questions.map(() => []);
    this.dates = quiz.questions.map(() => '');
  }

  get total() {
    return this.quiz.questions.length;
  }

  start() {
    this.index = 0;
    this.render();
  }

  answered(index = this.index) {
    const question = this.quiz.questions[index];
    if (!question) return false;
    return question.type === 'date' ? Boolean(this.dates[index]) : this.answers[index].length > 0;
  }

  next() {
    if (!this.answered()) return;
    if (this.index < this.total - 1) {
      this.index += 1;
      this.render();
    } else {
      this.renderForm();
    }
  }

  back() {
    if (this.index === 0) return;
    this.index -= 1;
    this.render();
  }

  swap(node) {
    this.stage.replaceChildren(node);
    // Шаг въезжает справа — так же, как на оригинале.
    node.classList.add('source-quiz__step--enter');
    requestAnimationFrame(() => node.classList.remove('source-quiz__step--enter'));
    const focusable = node.querySelector('button, input, [tabindex]');
    if (focusable && this.stage.dataset.sourceQuizStarted) focusable.focus({ preventScroll: true });
  }

  /** Правая колонка: администратор и подсказка к текущему вопросу. */
  aside(hint) {
    const { assistant } = this.quiz;
    if (!assistant && !hint) return null;
    const aside = element('aside', 'source-quiz__aside');
    if (assistant) {
      const person = element('div', 'source-quiz__manager');
      if (assistant.avatar) {
        const avatar = element('img', 'source-quiz__avatar');
        avatar.src = asset(assistant.avatar);
        avatar.alt = '';
        avatar.loading = 'lazy';
        avatar.decoding = 'async';
        person.append(avatar);
      }
      const who = element('span', 'source-quiz__manager-text');
      who.append(
        element('span', 'source-quiz__manager-name', assistant.name),
        element('span', 'source-quiz__manager-role', assistant.title),
      );
      person.append(who);
      aside.append(person);
    }
    if (hint) aside.append(element('p', 'source-quiz__hint', hint));
    return aside;
  }

  progress() {
    const done = Math.round((this.index / this.total) * 100);
    const wrap = element('div', 'source-quiz__progress');
    wrap.append(element('span', 'source-quiz__progress-label', 'Готово:'));
    wrap.append(element('b', 'source-quiz__progress-value', `${done}%`));
    const bar = element('div', 'source-quiz__bar');
    const fill = element('i', 'source-quiz__bar-fill');
    fill.style.width = `${done}%`;
    bar.append(fill);
    wrap.append(bar);
    return wrap;
  }

  navigation(last) {
    const nav = element('div', 'source-quiz__nav');
    nav.append(this.progress());
    const buttons = element('div', 'source-quiz__nav-buttons');
    const back = element('button', 'source-quiz__back', '←');
    back.type = 'button';
    back.setAttribute('aria-label', 'Назад');
    back.disabled = this.index === 0;
    back.addEventListener('click', () => this.back());
    const next = element('button', 'source-quiz__next', last ? 'Оставить заявку' : 'Далее →');
    next.type = 'button';
    next.disabled = !this.answered();
    next.addEventListener('click', () => this.next());
    this.nextButton = next;
    buttons.append(back, next);
    nav.append(buttons);
    return nav;
  }

  render() {
    const question = this.quiz.questions[this.index];
    const step = element('div', 'source-quiz__step');
    const main = element('div', 'source-quiz__main');
    main.append(element('p', 'source-quiz__question', question.title));

    if (question.type === 'date') {
      const label = element('label', 'source-quiz__date');
      const input = document.createElement('input');
      input.type = 'date';
      input.value = this.dates[this.index];
      input.addEventListener('input', () => {
        this.dates[this.index] = input.value;
        if (this.nextButton) this.nextButton.disabled = !this.answered();
      });
      label.append(input);
      main.append(label);
    } else {
      const many = question.select === 'many';
      const list = element('ul', `source-quiz__answers source-quiz__answers--${question.type === 'images' ? 'images' : 'variants'}`);
      question.answers.forEach((answer, position) => {
        const item = document.createElement('li');
        const button = element('button', 'source-quiz__answer');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(this.answers[this.index].includes(position)));
        if (answer.image) {
          const picture = element('img', 'source-quiz__answer-image');
          picture.src = asset(answer.image);
          picture.alt = '';
          picture.loading = 'lazy';
          picture.decoding = 'async';
          button.append(picture);
        }
        const body = element('span', 'source-quiz__answer-body');
        body.append(element('span', 'source-quiz__answer-title', answer.title));
        if (answer.note) body.append(element('span', 'source-quiz__answer-note', answer.note));
        button.append(body);
        button.addEventListener('click', () => {
          const chosen = this.answers[this.index];
          if (many) {
            const at = chosen.indexOf(position);
            if (at === -1) chosen.push(position);
            else chosen.splice(at, 1);
          } else {
            this.answers[this.index] = chosen.includes(position) ? [] : [position];
          }
          list.querySelectorAll('.source-quiz__answer').forEach((node, order) => {
            node.setAttribute('aria-pressed', String(this.answers[this.index].includes(order)));
          });
          if (this.nextButton) this.nextButton.disabled = !this.answered();
          // Одиночный выбор на оригинале сразу уводит на следующий вопрос.
          if (!many && this.answered()) window.setTimeout(() => this.next(), 220);
        });
        item.append(button);
        list.append(item);
      });
      main.append(list);
    }

    main.append(this.navigation(this.index === this.total - 1));
    step.append(main);
    const aside = this.aside(question.hint);
    if (aside) step.append(aside);
    this.swap(step);
  }

  renderForm() {
    const { form } = this.quiz;
    const step = element('div', 'source-quiz__step');
    const main = element('div', 'source-quiz__main');
    const shape = document.createElement('form');
    shape.className = 'source-quiz__form';
    shape.noValidate = false;
    shape.append(element('p', 'source-quiz__question', form.title));
    if (form.text) shape.append(element('p', 'source-quiz__form-text', form.text));

    (form.fields || []).forEach((field) => {
      const label = element('label', 'source-quiz__field');
      label.append(element('span', 'source-quiz__field-label', field.type === 'phone' ? 'Телефон' : 'Имя'));
      const input = document.createElement('input');
      input.name = field.key || field.type;
      input.required = Boolean(field.required);
      if (field.type === 'phone') {
        input.type = 'tel';
        input.autocomplete = 'tel';
        input.placeholder = field.hint || '+7 (___) ___-__-__';
      } else {
        input.type = 'text';
        input.autocomplete = 'name';
        input.placeholder = field.placeholder || '';
      }
      label.append(input);
      shape.append(label);
    });

    const consent = element('label', 'source-quiz__consent');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.required = true;
    consent.append(box, element('span', null, 'Я согласен на обработку персональных данных'));
    shape.append(consent);

    const submit = element('button', 'source-quiz__button', form.button);
    submit.type = 'submit';
    shape.append(submit);

    shape.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!shape.reportValidity()) return;
      const done = element('div', 'source-quiz__done');
      done.setAttribute('role', 'status');
      done.append(element('p', 'source-quiz__question', 'Спасибо! Заявка принята.'));
      const bonus = this.quiz.bonus?.items?.[0]?.name;
      if (bonus) done.append(element('p', 'source-quiz__form-text', `Ваш подарок: ${bonus}.`));
      const finished = element('div', 'source-quiz__step');
      const holder = element('div', 'source-quiz__main');
      holder.append(done);
      finished.append(holder);
      this.swap(finished);
      this.onFinish?.();
    });

    main.append(shape);
    step.append(main);
    const aside = this.aside(this.quiz.start?.disclaimer || '');
    if (aside) step.append(aside);
    this.swap(step);
  }
}

// Цвета оригинального квиза едут в CSS-переменные блока или окна.
const quizStyle = (quiz) => {
  const colours = quiz.colors || {};
  return [
    `--source-quiz-color:${colours.main || '#ff6b00'}`,
    `--source-quiz-button-text:${colours.buttonText || '#ffffff'}`,
    `--source-quiz-bg:${colours.bg || '#333333'}`,
    `--source-quiz-bg-text:${colours.bgText || '#ffffff'}`,
  ].join(';');
};

/** Общее модальное окно: в нём подбор открывается из плашки и из карточки. */
let modal = null;

const ensureModal = () => {
  if (modal) return modal;
  modal = document.createElement('dialog');
  modal.className = 'source-quiz-modal';
  modal.setAttribute('aria-label', 'Подбор праздничной программы');
  const close = element('button', 'source-quiz-modal__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть');
  close.addEventListener('click', () => modal.close());
  const stage = element('div', 'source-quiz__stage');
  stage.dataset.sourceQuizStage = '';
  modal.append(close, stage);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });
  document.body.append(modal);
  return modal;
};

const openModalQuiz = async (quizId) => {
  const quizzes = await loadQuizzes();
  const quiz = quizzes[quizId];
  if (!quiz) return false;
  const dialog = ensureModal();
  const stage = dialog.querySelector('[data-source-quiz-stage]');
  stage.dataset.sourceQuizStarted = 'true';
  dialog.style.cssText = quizStyle(quiz);
  const run = new QuizRun(stage, quiz);
  run.start();
  if (!dialog.open) dialog.showModal();
  return true;
};

/** Встроенный блок «Поможем подобрать праздничную программу». */
const initInlineQuiz = (block) => {
  if (block.dataset.ready) return;
  block.dataset.ready = 'true';
  const stage = block.querySelector('[data-source-quiz-stage]');
  const trigger = block.querySelector('[data-source-quiz-start]');
  if (!stage || !trigger) return;

  // Ролик стартового экрана крутится беззвучно и только пока блок на виду.
  const video = block.querySelector('video.source-quiz__media');
  if (video) {
    video.muted = true;
    const watcher = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      });
    }, { rootMargin: '200px' });
    watcher.observe(block);
  }

  trigger.addEventListener('click', async (event) => {
    event.preventDefault();
    const quizzes = await loadQuizzes();
    const quiz = quizzes[block.dataset.sourceQuiz];
    if (!quiz) return;
    stage.dataset.sourceQuizStarted = 'true';
    new QuizRun(stage, quiz).start();
  });
};

/** Карточка квиза в левом нижнем углу — вариант плашки «Widget» у Marquiz. */
const initQuizCard = (card) => {
  if (card.dataset.ready) return;
  card.dataset.ready = 'true';
  if (stored(CARD_DISMISSED_KEY)) return;
  // Карточка живёт поверх страницы, а снимок до раскладки скрыт целиком.
  document.body.append(card);
  card.querySelector('[data-source-quiz-card-close]')?.addEventListener('click', () => {
    card.hidden = true;
    document.body.classList.remove('quiz-pop-visible', 'source-quiz-card-visible');
    remember(CARD_DISMISSED_KEY);
  });
  card.querySelector('[data-source-quiz-start]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await openModalQuiz(card.dataset.sourceQuizCard);
  });
  // Задержка появления взята из аргументов оригинального виджета.
  const delay = Number(card.dataset.quizDelay);
  window.setTimeout(() => {
    card.hidden = false;
    document.body.classList.add('quiz-pop-visible', 'source-quiz-card-visible');
  }, Number.isFinite(delay) && delay > 0 ? delay * 1000 : CARD_DELAY_MS);
};

export function initSourceExtras() {
  const root = document.querySelector('[data-source-snapshot]') || document;

  root.querySelectorAll('[data-source-quiz]').forEach((block) => initInlineQuiz(block));
  root.querySelectorAll('[data-source-quiz-card]').forEach((card) => initQuizCard(card));

  // Узкая плашка «Бонус» собирается модулем виджетов и ведёт на общую форму.
  // Если у страницы есть свой подбор, перехватываем нажатие раньше попапов.
  const marker = root.querySelector('[data-source-bonus][data-bonus-quiz]');
  const quizId = marker?.getAttribute('data-bonus-quiz');
  if (quizId) {
    document.addEventListener('click', (event) => {
      const link = event.target.closest?.('.quiz-pop__link');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      openModalQuiz(quizId);
    }, true);
  }
}
