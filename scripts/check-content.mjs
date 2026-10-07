// Проверка контента без сборки сайта.
//   npm run check:content                 — все страницы
//   npm run check:content -- dotnet/async — только страницы, чей путь (без префикса языка) начинается так
//
// Ошибки: синтаксис MDX и YAML, неполный набор ответов J/M/S, термин без записи в глоссарии,
// разные вопросы в разных языках, повтор id. Предупреждения: нет <Ex>/<Next>/<Src>, повтор ключа глоссария.

import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { parse } from 'yaml';

const DOCS = 'src/content/docs';
const GLOSSARY = 'src/data/glossary';
const LANGS = ['ru', 'uk', 'en'];
const LEVELS = ['j', 'm', 's'];

const filters = process.argv.slice(2).map((f) => f.replace(/\\/g, '/').replace(/\.mdx?$/, ''));
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

/* ---------- глоссарий ---------- */

const glossary = Object.fromEntries(LANGS.map((l) => [l, new Map()]));
for (const lang of LANGS) {
  const dir = path.join(GLOSSARY, lang);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const rel = `${GLOSSARY}/${lang}/${file}`;
    let data;
    try {
      data = parse(fs.readFileSync(path.join(dir, file), 'utf8')) ?? {};
    } catch (e) {
      err(rel, `YAML: ${e.message.split('\n')[0]}`);
      continue;
    }
    for (const [key, entry] of Object.entries(data)) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key)) err(rel, `ключ «${key}» должен быть kebab-case латиницей`);
      if (typeof entry?.term !== 'string' || typeof entry?.def !== 'string') {
        err(rel, `«${key}»: нужны строковые поля term и def`);
      }
      if (glossary[lang].has(key)) warn(rel, `ключ «${key}» уже есть в ${glossary[lang].get(key)}`);
      else glossary[lang].set(key, rel);
    }
  }
}
for (const lang of ['uk', 'en']) {
  for (const key of glossary.ru.keys()) {
    if (!glossary[lang].has(key)) warn(`${GLOSSARY}/${lang}`, `нет перевода термина «${key}»`);
  }
}

/* ---------- страницы ---------- */

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : /\.mdx?$/.test(d.name) ? [path.join(dir, d.name)] : [],
  );
}

function pageInfo(file) {
  const rel = path.relative(DOCS, file).replace(/\\/g, '/');
  const [first, ...rest] = rel.split('/');
  const lang = first === 'uk' || first === 'en' ? first : 'ru';
  const key = (lang === 'ru' ? rel : rest.join('/')).replace(/\.mdx?$/, '');
  return { rel, lang, key };
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;
const pages = walk(DOCS).map((file) => ({ file, ...pageInfo(file) }));
const selected = pages.filter((p) => !filters.length || filters.some((f) => p.key.startsWith(f)));
const ids = Object.fromEntries(LANGS.map((l) => [l, new Map()]));
const questionsByPage = new Map();

for (const page of pages) {
  const src = fs.readFileSync(page.file, 'utf8');
  const where = `${DOCS}/${page.rel}`;
  const isSelected = selected.includes(page);
  const report = (fn) => (isSelected ? fn : () => {});
  const e = report((m) => err(where, m));
  const w = report((m) => warn(where, m));

  if (isSelected) {
    try {
      // front matter компилятор MDX не понимает: заменяем пустыми строками, чтобы номера строк совпадали
      const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (fm) => '\n'.repeat(fm.split('\n').length - 1));
      await compile(body, { format: page.file.endsWith('.mdx') ? 'mdx' : 'md' });
    } catch (ex) {
      const line = ex.line ?? ex.place?.line ?? ex.position?.start?.line;
      e(`MDX${line ? ` строка ${line}` : ''}: ${ex.reason ?? ex.message}`);
    }
  }

  const opens = [...src.matchAll(/<Q\s+id="([^"]+)"\s+level="([^"]+)"\s*>/g)];
  const closes = (src.match(/<\/Q>/g) ?? []).length;
  if (opens.length !== closes) e(`<Q> открыто ${opens.length}, закрыто ${closes}`);
  if (opens.length && !/import Q from/.test(src)) e('нет import Q');

  const list = [];
  opens.forEach((m, i) => {
    const [, id, level] = m;
    const at = `строка ${lineOf(src, m.index)} (${id})`;
    const end = i + 1 < opens.length ? opens[i + 1].index : src.length;
    const body = src.slice(m.index, end);
    list.push(id);

    if (!LEVELS.includes(level)) e(`${at}: level должен быть j, m или s`);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(id)) e(`${at}: id вида категория.тема.слаг латиницей`);
    if (ids[page.lang].has(id)) e(`${at}: id уже использован в ${ids[page.lang].get(id)}`);
    else ids[page.lang].set(id, page.rel);

    const headings = body.match(/^## .+$/gm) ?? [];
    if (headings.length !== 1) e(`${at}: в карточке должен быть ровно один заголовок «## вопрос», найдено ${headings.length}`);
    if (/^## .*<T\s/m.test(body)) e(`${at}: <T> в заголовке вопроса не используется`);

    const shorts = [...body.matchAll(/<A\s+short\s+l="([^"]+)"\s*>/g)].map((x) => x[1]);
    const longs = [...body.matchAll(/<A\s+l="([^"]+)"\s*>/g)].map((x) => x[1]);
    const strayA = [...body.matchAll(/<A\b[^>]*>/g)].length - shorts.length - longs.length;
    if (strayA) e(`${at}: ${strayA} тегов <A> в неверном формате (нужно <A short l="j"> или <A l="j">)`);
    for (const [name, got] of [['коротких', shorts], ['подробных', longs]]) {
      const sorted = [...got].sort().join(',');
      if (sorted !== 'j,m,s') e(`${at}: ${name} ответов должно быть по одному на j, m, s — найдено [${got.join(', ')}]`);
    }
    if (!/<Ex[\s>]/.test(body)) w(`${at}: нет <Ex>`);
    if (!/<Next>/.test(body)) w(`${at}: нет <Next>`);
    if (!/<Src>/.test(body)) w(`${at}: нет <Src>`);
  });
  questionsByPage.set(page.rel, list);

  for (const m of src.matchAll(/<T\s+k="([^"]+)"/g)) {
    if (!glossary[page.lang].has(m[1])) e(`строка ${lineOf(src, m.index)}: термина «${m[1]}» нет в ${GLOSSARY}/${page.lang}/`);
  }
}

/* ---------- одинаковые вопросы во всех языках ---------- */

for (const page of selected.filter((p) => p.lang === 'ru')) {
  const ru = questionsByPage.get(page.rel) ?? [];
  if (!ru.length) continue;
  for (const lang of ['uk', 'en']) {
    const rel = `${lang}/${page.rel}`;
    const other = questionsByPage.get(rel);
    if (!other) err(`${DOCS}/${rel}`, 'нет перевода страницы');
    else if (other.join('|') !== ru.join('|')) {
      err(`${DOCS}/${rel}`, `вопросы не совпадают с русской версией: ru [${ru.join(', ')}] / ${lang} [${other.join(', ')}]`);
    }
  }
}

/* ---------- итог ---------- */

const count = selected.reduce((n, p) => n + (questionsByPage.get(p.rel)?.length ?? 0), 0);
for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(
  `\nСтраниц: ${selected.length}, вопросов: ${count}, ошибок: ${errors.length}, предупреждений: ${warnings.length}`,
);
process.exit(errors.length ? 1 : 0);
