export type Lang = 'ru' | 'uk' | 'en';
export type Level = 'j' | 'm' | 's';

export const LEVEL_NAMES: Record<Level, string> = { j: 'Junior', m: 'Middle', s: 'Senior' };

const STRINGS = {
  ru: {
    short: 'Коротко',
    long: 'Подробно',
    example: 'Пример',
    next: 'Что спросят дальше',
    sources: 'Источники',
    askedFrom: 'Спрашивают начиная с уровня',
    know: 'Знаю',
    shaky: 'Плаваю',
    dunno: 'Не знаю',
    selfCheck: 'Самопроверка',
    reveal: 'Показать ответ',
    conceal: 'Скрыть ответ',
    level: 'Уровень ответа',
    all: 'Все',
    quiz: 'Карточки',
    quizHint: 'Скрыть ответы и проверить себя',
    progress: 'Знаю {k} из {n}',
    google: 'Google',
    docs: 'Документация',
    wiki: 'Википедия',
    glossary: 'Глоссарий',
    close: 'Закрыть',
    noDef: 'Определения пока нет — поищите по ссылкам ниже.',
  },
  uk: {
    short: 'Коротко',
    long: 'Детально',
    example: 'Приклад',
    next: 'Що спитають далі',
    sources: 'Джерела',
    askedFrom: 'Питають починаючи з рівня',
    know: 'Знаю',
    shaky: 'Плаваю',
    dunno: 'Не знаю',
    selfCheck: 'Самоперевірка',
    reveal: 'Показати відповідь',
    conceal: 'Сховати відповідь',
    level: 'Рівень відповіді',
    all: 'Усі',
    quiz: 'Картки',
    quizHint: 'Сховати відповіді й перевірити себе',
    progress: 'Знаю {k} з {n}',
    google: 'Google',
    docs: 'Документація',
    wiki: 'Вікіпедія',
    glossary: 'Глосарій',
    close: 'Закрити',
    noDef: 'Визначення поки немає — пошукайте за посиланнями нижче.',
  },
  en: {
    short: 'Short',
    long: 'In depth',
    example: 'Example',
    next: 'Likely follow-ups',
    sources: 'Sources',
    askedFrom: 'Asked starting from',
    know: 'Know it',
    shaky: 'Shaky',
    dunno: "Don't know",
    selfCheck: 'Self-check',
    reveal: 'Show answer',
    conceal: 'Hide answer',
    level: 'Answer level',
    all: 'All',
    quiz: 'Flashcards',
    quizHint: 'Hide answers and test yourself',
    progress: 'Know {k} of {n}',
    google: 'Google',
    docs: 'Docs',
    wiki: 'Wikipedia',
    glossary: 'Glossary',
    close: 'Close',
    noDef: 'No definition yet — search using the links below.',
  },
} as const;

export type Strings = (typeof STRINGS)[Lang];

export function langOf(locals: App.Locals): Lang {
  const tag = locals.starlightRoute?.lang?.slice(0, 2);
  return tag === 'uk' || tag === 'en' ? tag : 'ru';
}

export function ui(lang: Lang): Strings {
  return STRINGS[lang];
}

/** Префикс локали в URL: русский живёт в корне. */
export function localePrefix(lang: Lang): string {
  return lang === 'ru' ? '' : `${lang}/`;
}

export function baseUrl(): string {
  return import.meta.env.BASE_URL.replace(/\/?$/, '/');
}
