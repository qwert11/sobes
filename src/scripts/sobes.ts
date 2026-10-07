// Поведение страниц с вопросами: уровень ответа, режим карточек, самопроверка, панель терминов.
// Всё состояние — в localStorage этого браузера.

interface Term {
  term: string;
  def: string;
  q?: string;
  docs?: string;
  wiki?: string;
}

const KEY_LEVEL = 'sobes:lv';
const KEY_QUIZ = 'sobes:quiz';
const KEY_STATUS = 'sobes:st';

const root = document.documentElement;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* приватный режим или запрет хранилища — работаем без сохранения */
  }
}

function readStatus(): Record<string, string> {
  try {
    return JSON.parse(read(KEY_STATUS) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/* ---------- уровень и карточки ---------- */

function syncToolbar(): void {
  document.querySelectorAll<HTMLButtonElement>('.tb-lv button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lv === root.dataset.lv));
  });
  document.querySelectorAll<HTMLButtonElement>('.tb-quiz').forEach((b) => {
    b.setAttribute('aria-pressed', String(root.dataset.quiz === '1'));
  });
}

function setLevel(level: string): void {
  root.dataset.lv = level;
  write(KEY_LEVEL, level);
  syncToolbar();
}

function setQuiz(on: boolean): void {
  if (on) root.dataset.quiz = '1';
  else delete root.dataset.quiz;
  write(KEY_QUIZ, on ? '1' : null);
  document.querySelectorAll('.q.revealed').forEach((q) => q.classList.remove('revealed'));
  syncToolbar();
}

/* ---------- самопроверка ---------- */

function renderStatus(): void {
  const status = readStatus();
  const cards = Array.from(document.querySelectorAll<HTMLElement>('.q'));
  for (const card of cards) {
    const s = status[card.dataset.qid ?? ''] ?? '';
    card.dataset.st = s;
    card.querySelectorAll<HTMLButtonElement>('.q-check button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.s === s));
    });
  }
  const known = cards.filter((c) => c.dataset.st === 'k').length;
  document.querySelectorAll<HTMLElement>('.tb').forEach((tb) => {
    if (!cards.length) return;
    const long = tb.querySelector('.p-long');
    const short = tb.querySelector('.p-short');
    if (long) {
      long.textContent = (tb.dataset.fmt ?? '{k}/{n}')
        .replace('{k}', String(known))
        .replace('{n}', String(cards.length));
    }
    if (short) short.textContent = `${known}/${cards.length}`;
  });
}

function setStatus(card: HTMLElement, value: string): void {
  const id = card.dataset.qid;
  if (!id) return;
  const status = readStatus();
  if (status[id] === value) delete status[id];
  else status[id] = value;
  write(KEY_STATUS, JSON.stringify(status));
  renderStatus();
}

/* ---------- панель терминов ---------- */

const panel = document.querySelector<HTMLElement>('.tp');
// Панель рендерится внутри контента, где её z-index заперт контекстом наложения
// Starlight (оглавление справа оказывается поверх). Переносим в body.
if (panel) document.body.append(panel);
let glossary: Promise<Record<string, Term>> | null = null;
let opener: HTMLElement | null = null;

function loadGlossary(): Promise<Record<string, Term>> {
  if (!glossary && panel?.dataset.json) {
    glossary = fetch(panel.dataset.json)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return glossary ?? Promise.resolve({});
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function openTerm(button: HTMLElement): Promise<void> {
  if (!panel) return;
  const key = button.dataset.k ?? '';
  const entry = (await loadGlossary())[key];
  const lang = panel.dataset.lang ?? 'ru';
  const title = entry?.term ?? button.textContent?.trim() ?? key;

  panel.querySelector('#tp-title')!.textContent = title;
  panel.querySelector('.tp-def')!.innerHTML = entry
    ? escapeHtml(entry.def).replace(/`([^`]+)`/g, '<code>$1</code>')
    : escapeHtml(panel.dataset.nodef ?? '');

  const google = panel.querySelector<HTMLAnchorElement>('.tp-google')!;
  google.href = `https://www.google.com/search?q=${encodeURIComponent(entry?.q ?? title)}`;

  const docs = panel.querySelector<HTMLAnchorElement>('.tp-docs')!;
  docs.hidden = !entry?.docs;
  if (entry?.docs) docs.href = entry.docs;

  const wiki = panel.querySelector<HTMLAnchorElement>('.tp-wiki')!;
  wiki.href = entry?.wiki
    ? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(entry.wiki.replace(/ /g, '_'))}`
    : `https://${lang}.wikipedia.org/w/index.php?search=${encodeURIComponent(entry?.q ?? title)}`;

  const gloss = panel.querySelector<HTMLAnchorElement>('.tp-gloss')!;
  gloss.hidden = !entry;
  gloss.href = `${panel.dataset.glossary}#${encodeURIComponent(key)}`;

  opener?.setAttribute('aria-expanded', 'false');
  opener = button;
  button.setAttribute('aria-expanded', 'true');
  panel.hidden = false;
  panel.querySelector<HTMLButtonElement>('.tp-close')?.focus({ preventScroll: true });
}

function closeTerm(): void {
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  opener?.setAttribute('aria-expanded', 'false');
  opener?.focus({ preventScroll: true });
  opener = null;
}

/* ---------- события ---------- */

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const term = target.closest<HTMLElement>('.term');
  if (term) {
    void openTerm(term);
    return;
  }
  const button = target.closest<HTMLElement>('button');

  if (button?.matches('.tb-lv button')) setLevel(button.dataset.lv ?? 'm');
  else if (button?.matches('.tb-quiz')) setQuiz(root.dataset.quiz !== '1');
  else if (button?.matches('.q-reveal')) button.closest('.q')?.classList.toggle('revealed');
  else if (button?.matches('.q-check button')) {
    const card = button.closest<HTMLElement>('.q');
    if (card) setStatus(card, button.dataset.s ?? '');
  } else if (button?.matches('.tp-close')) closeTerm();
  else if (panel && !panel.hidden && !panel.contains(target)) closeTerm();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTerm();
  const term = (event.target as HTMLElement).closest?.<HTMLElement>('.term');
  if (term && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    void openTerm(term);
  }
});

if (!root.dataset.lv) root.dataset.lv = read(KEY_LEVEL) ?? 'm';
syncToolbar();
renderStatus();
