// Поиск терминов глоссария в тексте: словоформы, стемминг, разбор записей YAML.
// Используется плагином авторазметки (glossary-autolink.mjs) и отчётом scripts/glossary-report.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const GLOSSARY = 'src/data/glossary';

/** Окончания, которые стемминг отбрасывает у кириллических слов. Длинные идут первыми. */
const ENDINGS = [
  'ами', 'ями', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ої', 'ою', 'ею', 'єю', 'ів', 'ям',
  'ах', 'ях', 'ов', 'ев', 'ей', 'ом', 'ем', 'ой', 'ую', 'юю', 'ые', 'ие', 'ый', 'ий', 'ій',
  'ая', 'яя', 'ое', 'ее', 'ам', 'ми', 'ї', 'і', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь',
  'й', 'є',
];

/**
 * Термины, которые уместны на странице любой категории: общие понятия, а не частность темы.
 * Остальные однословные кириллические формы размечаются только внутри своей категории —
 * иначе «запись», «задача», «контракт», «том» ловятся в чужом смысле.
 */
const UNIVERSAL = new Set([
  'abstraction', 'encapsulation', 'inheritance', 'polymorphism', 'recursion', 'graph',
  'hash-table', 'linked-list', 'binary-search', 'big-o', 'idempotency', 'immutability',
  'authentication', 'authorization', 'deadlock', 'race-condition', 'closure', 'cache',
  'backpressure', 'eventual-consistency', 'coupling', 'cohesion', 'refactoring',
  'technical-debt', 'code-review', 'unit-test', 'integration-test', 'mock', 'stub',
]);

const CYR = /[а-яёіїєґ]/i;
/** Слово: буквы и цифры, внутри допустимы апостроф, _ и точка между частями (GC.Collect, work_mem). */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}_’'ʼ]*(?:\.[\p{L}\p{N}][\p{L}\p{N}_]*)*/gu;
/** Символ, примыкание которого к совпадению запрещает разметку (часть другого слова). */
const GLUE = /[\p{L}\p{N}_\-’'ʼ.]/u;
/** Латинская аббревиатура: ищется с учётом регистра, иначе `COMMIT` в SQL поймает git-коммит. */
const UPPER = /^[A-Z][A-Z0-9_]+$/;

/** Начальная форма слова: у кириллицы отбрасывается окончание, у латиницы — признак множественного числа. */
export function stem(word) {
  const w = word.toLowerCase().replace(/[’ʼ]/g, "'");
  if (CYR.test(w)) {
    for (const end of ENDINGS) {
      if (w.length - end.length >= 3 && w.endsWith(end)) return w.slice(0, -end.length);
    }
    return w;
  }
  if (w.length >= 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length >= 5 && /(?:s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length >= 4 && /[^sui]s$/.test(w)) return w.slice(0, -1);
  return w;
}

const words = (text) =>
  [...text.matchAll(WORD)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));

/**
 * Словоформы записи: основная часть названия и варианты в скобках.
 * «Пул потоков (thread pool)» → ['Пул потоков', 'thread pool'].
 * Пробел перед скобкой обязателен: «ConfigureAwait(false)» — одно название, а не два.
 */
export function formsOf(term) {
  const clean = term.replace(/`/g, '').trim();
  const m = clean.match(/^([^()]+?)\s+\(([^()]+)\)$/);
  const raw = m ? [m[1], ...m[2].split(/,\s*/)] : [clean];
  const out = [];
  for (const item of raw) {
    const form = item.trim().replace(/[.,;:]+$/, '');
    if (!form) continue;
    // «ранее .NET Aspire», «англ. ...» — пояснение, а не словоформа.
    if (/^(ранее|раніше|formerly|англ\.|рус\.|укр\.|див\.|см\.)/i.test(form)) continue;
    const parts = words(form);
    if (!parts.length || parts.length > 4) continue;
    if (form.length < 3 && !/^[A-Z][A-Z0-9]$/.test(form)) continue;
    if (!out.some((f) => f.toLowerCase() === form.toLowerCase())) out.push(form);
  }
  return out;
}

/** Термины языка: ключ → {term, file, forms} по всем файлам каталога, первый файл выигрывает. */
export function loadGlossary(lang, root = '.') {
  const dir = path.join(root, GLOSSARY, lang);
  const out = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    let data;
    try {
      data = parse(fs.readFileSync(path.join(dir, file), 'utf8')) ?? {};
    } catch {
      continue; // битый YAML ловит check:content
    }
    for (const [key, entry] of Object.entries(data)) {
      if (typeof entry?.term !== 'string' || out.has(key)) continue;
      out.set(key, { term: entry.term, file: file.replace(/\.ya?ml$/, ''), forms: entry.forms });
    }
  }
  return out;
}

/**
 * Индекс поиска: по начальной форме первого слова — список словоформ, которые с неё начинаются.
 * Внутри списка длинные формы идут первыми, чтобы «пул потоков» выигрывал у «потока».
 */
export function buildIndex(glossary) {
  const byStem = new Map();
  for (const [key, entry] of glossary) {
    const forms = Array.isArray(entry.forms) && entry.forms.length ? entry.forms : formsOf(entry.term);
    for (const form of forms) {
      const parts = words(String(form));
      if (!parts.length) continue;
      const text = String(form);
      // В форме есть значимая пунктуация («Оператор ??», «@switch») — сравниваем буквально.
      const bare = text.replace(WORD, '').replace(/[\s -]/g, '');
      const item = {
        key,
        file: entry.file,
        form: text,
        stems: parts.map((p) => stem(p.text)),
        exact: parts.map((p) => p.text),
        literal: bare ? text : null,
        head: parts[0].start,
        generic: parts.length === 1 && !bare && CYR.test(text) && !UNIVERSAL.has(key),
      };
      const headStem = item.stems[0];
      if (!byStem.has(headStem)) byStem.set(headStem, []);
      byStem.get(headStem).push(item);
    }
  }
  const weight = (x) => (x.literal ? 100 : 0) + x.stems.length * 10 + Math.min(x.form.length, 9);
  for (const list of byStem.values()) list.sort((a, b) => weight(b) - weight(a));
  return byStem;
}

/** Совпадает ли форма с текстом начиная с токена i. Возвращает [start, end] или null. */
function matchAt(text, toks, i, item) {
  if (item.literal) {
    const start = toks[i].start - item.head;
    const end = start + item.literal.length;
    if (start < 0 || end > text.length) return null;
    if (text.slice(start, end).toLowerCase() !== item.literal.toLowerCase()) return null;
    return [start, end];
  }
  const n = item.stems.length;
  if (i + n > toks.length) return null;
  for (let j = 0; j < n; j++) {
    const tok = toks[i + j];
    if (stem(tok.text) !== item.stems[j]) return null;
    // Аббревиатура и слово в ВЕРХНЕМ регистре сверяются с учётом регистра:
    // `COMMIT` в SQL — не коммит git, «Ad hoc» — не Active Directory.
    if ((UPPER.test(tok.text) || UPPER.test(item.exact[j])) && tok.text !== item.exact[j]) return null;
    if (j > 0 && !/^[\s -]+$/.test(text.slice(toks[i + j - 1].end, tok.start))) return null;
  }
  return [toks[i].start, toks[i + n - 1].end];
}

/**
 * Совпадения терминов в тексте, слева направо, без пересечений.
 * `resolve(candidates)` выбирает запись среди омонимов и может отказаться (null).
 * Возвращает [{start, end, key, form}].
 */
export function findTerms(text, index, resolve = (list) => list[0]) {
  const toks = words(text);
  const hits = [];
  let i = 0;
  while (i < toks.length) {
    const list = index.get(stem(toks[i].text)) ?? [];
    let hit = null;
    for (const item of list) {
      const span = matchAt(text, toks, i, item);
      if (!span) continue;
      const [start, end] = span;
      // Совпадение не должно быть частью другого слова: «GC» внутри «GC-хендл» не размечаем.
      if (start > 0 && GLUE.test(text[start - 1])) continue;
      if (end < text.length && GLUE.test(text[end])) continue;
      const group = list.filter((x) => x.form.toLowerCase() === item.form.toLowerCase());
      const chosen = resolve(group);
      if (!chosen) continue;
      hit = { start, end, key: chosen.key, form: item.form, words: item.literal ? 1 : item.stems.length };
      break;
    }
    if (hit) {
      hits.push(hit);
      while (i < toks.length && toks[i].start < hit.end) i += 1;
    } else {
      i += 1;
    }
  }
  return hits;
}

/**
 * Выбор записи для страницы: сначала термин из файла своей темы, потом из своей категории.
 * Однословный кириллический термин из чужой категории отбрасывается — слишком часто это омоним.
 * page — {topic: 'dotnet-gc', category: 'dotnet'}.
 */
export function pickerFor(page) {
  return (list) => {
    const own = list.find((x) => x.file === page.topic) ?? list.find((x) => x.file.startsWith(`${page.category}-`));
    if (own) return own;
    return list.find((x) => !x.generic) ?? null;
  };
}

/** Язык, категория и тема по пути файла страницы. */
export function pageInfo(file) {
  const rel = file.replace(/\\/g, '/').split(/(?:^|\/)src\/content\/docs\//)[1];
  if (!rel) return null;
  const parts = rel.replace(/\.mdx?$/, '').split('/');
  const lang = parts[0] === 'uk' || parts[0] === 'en' ? parts.shift() : 'ru';
  if (parts.length < 2) return null;
  return { lang, category: parts[0], topic: `${parts[0]}-${parts[1]}` };
}
