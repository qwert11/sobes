// Отчёт по покрытию терминов: что разметит авторазметка и где остались блоки без подсказок.
//   node scripts/glossary-report.mjs                 — сводка по всем языкам
//   node scripts/glossary-report.mjs dotnet/gc       — только эти страницы
//   node scripts/glossary-report.mjs dotnet/gc --show — плюс текст блоков с ⟦терминами⟧
//   node scripts/glossary-report.mjs --misses        — частые слова без записи в глоссарии
import fs from 'node:fs';
import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';
import {
  LIMITS,
  SKIP,
  indexFor,
  isTerm,
  jsxName,
  manualKeys,
  markCode,
  markText,
} from '../src/plugins/glossary-autolink.mjs';
import { buildIndex, findTerms, loadGlossary, pageInfo, pickerFor } from '../src/plugins/glossary-match.mjs';

const DOCS = 'src/content/docs';
const args = process.argv.slice(2);
const show = args.includes('--show');
const misses = args.includes('--misses');
const formsMode = args.includes('--forms');
const filters = args.filter((a) => !a.startsWith('--'));

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.mdx?$/.test(e.name) ? [path.join(d, e.name)] : [],
  );

const parse = (src) =>
  fromMarkdown(src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), {
    extensions: [mdxjs()],
    mdastExtensions: [mdxFromMarkdown()],
  });

const isT = isTerm;
const name = jsxName;

function blocks(node, out = []) {
  for (const child of node.children ?? []) {
    if (LIMITS[name(child)]) out.push(child);
    else blocks(child, out);
  }
  return out;
}

const countTerms = (node, acc = { keys: [] }) => {
  if (isT(node)) {
    acc.keys.push((node.attributes ?? []).find((a) => a.name === 'k')?.value);
    return acc;
  }
  for (const c of node.children ?? []) countTerms(c, acc);
  return acc;
};

/**
 * Та же разметка, что на сборке, но по дереву mdast-util: плагин Sätteri ходит по дереву сам,
 * а здесь обход нужен свой, чтобы посчитать блоки до и после.
 */
function markBlock(block, index, pick) {
  const state = { left: LIMITS[name(block)], used: manualKeys(block) };
  const walk = (node) => {
    if (!node.children?.length) return;
    const out = [];
    for (const child of node.children) {
      if (state.left <= 0 || SKIP.has(child.type) || isT(child)) {
        out.push(child);
      } else if (child.type === 'text') {
        out.push(...(markText(child.value, state, index, pick) ?? [child]));
      } else if (child.type === 'inlineCode') {
        out.push(...(markCode(child.value, state, index, pick) ?? [child]));
      } else {
        walk(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  walk(block);
}

/** Текст блока с ⟦ключ: слова⟧ на месте терминов — для глазной проверки. */
function render(node, out = []) {
  if (isT(node)) {
    const k = (node.attributes ?? []).find((a) => a.name === 'k')?.value;
    out.push(`⟦${k}: `);
    for (const c of node.children ?? []) render(c, out);
    out.push('⟧');
    return out;
  }
  if (node.type === 'text') out.push(node.value);
  else if (node.type === 'inlineCode') out.push(`\`${node.value}\``);
  else if (node.type === 'code') out.push('\n[код]\n');
  else for (const c of node.children ?? []) render(c, out);
  return out;
}

const pages = walk(DOCS)
  .map((file) => ({ file, page: pageInfo(file) }))
  .filter((p) => p.page)
  .filter((p) => !filters.length || filters.some((f) => `${p.page.category}/${p.file.replace(/\\/g, '/').split('/').pop().replace(/\.mdx?$/, '')}`.startsWith(f)));

const stats = {};
const missCount = new Map();
const formCount = new Map();
const indexOf = indexFor;

for (const { file, page } of pages) {
  const tree = parse(fs.readFileSync(file, 'utf8'));
  const after = blocks(tree);
  const before = after.map((b) => countTerms(b).keys.length);
  for (const b of after) markBlock(b, indexOf(page.lang), pickerFor(page));

  const s = (stats[page.lang] ??= { blocks: 0, manual: 0, auto: 0, emptyBefore: 0, emptyAfter: 0 });
  after.forEach((b, i) => {
    const c = countTerms(b);
    s.blocks++;
    s.manual += before[i];
    s.auto += c.keys.length - before[i];
    if (!before[i]) s.emptyBefore++;
    if (!c.keys.length) s.emptyAfter++;
  });

  if (show) {
    console.log(`\n=== ${file} ===`);
    for (const b of after) console.log(`\n--- <${name(b)} ${(b.attributes ?? []).map((a) => `${a.name}=${a.value ?? ''}`).join(' ')}>\n${render(b).join('')}`);
  }

  if (formsMode) {
    const g = loadGlossary(page.lang);
    for (const b of after) {
      for (const m of render(b).join('').matchAll(/⟦([^:]+): ([^⟧]*)⟧/g)) {
        const [, key, text] = m;
        const file = g.get(key)?.file ?? '?';
        const id = `${page.lang}\t${key}\t${text.toLowerCase()}`;
        const rec = formCount.get(id) ?? { n: 0, lang: page.lang, key, text, file, cross: 0 };
        rec.n++;
        if (!file.startsWith(`${page.category}-`)) rec.cross++;
        formCount.set(id, rec);
      }
    }
  }

  if (misses) {
    // Чего не хватает глоссарию: имена из кода и латинские названия, которых нет ни в одном файле.
    const index = indexOf(page.lang);
    for (const b of after) {
      const text = render(b).join('').replace(/⟦[^:]+: [^⟧]*⟧/g, ' ');
      const seen = new Set();
      for (const m of text.matchAll(/`([^`\n]{2,40})`|\b([A-Z][A-Za-z0-9.]{2,}|[A-Z]{2,6})\b/g)) {
        const w = (m[1] ?? m[2]).trim();
        if (!/^[\w.@/-]+$/.test(w) || seen.has(w)) continue;
        seen.add(w);
        if (findTerms(w, index, (list) => list[0]).some((h) => h.start === 0 && h.end === w.length)) continue;
        const rec = missCount.get(`${page.lang}\t${w}`) ?? { n: 0, lang: page.lang, w, pages: new Set() };
        rec.n++;
        rec.pages.add(page.topic);
        missCount.set(`${page.lang}\t${w}`, rec);
      }
    }
  }
}

for (const [lang, s] of Object.entries(stats)) {
  const cover = (100 * (1 - s.emptyAfter / s.blocks)).toFixed(0);
  const was = (100 * (1 - s.emptyBefore / s.blocks)).toFixed(0);
  console.log(
    `${lang}: блоков ${s.blocks}, вручную ${s.manual}, добавлено ${s.auto}, ` +
      `блоков с терминами было ${was}% → стало ${cover}%`,
  );
}

if (formsMode) {
  console.log('\nСловоформы: размечено / из них на чужой категории');
  [...formCount.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 600)
    .forEach((r) =>
      console.log(
        `${String(r.n).padStart(4)} ${String(r.cross).padStart(4)}  ${r.lang}  ${r.key.padEnd(26)} ${r.file.padEnd(22)} ${r.text}`,
      ),
    );
}

if (misses) {
  console.log('\nНазвания без записи в глоссарии: упоминаний / тем / язык / что');
  [...missCount.values()]
    .filter((r) => r.n >= 4 && r.lang === 'ru')
    .sort((a, b) => b.n - a.n)
    .slice(0, 120)
    .forEach((r) => console.log(`${String(r.n).padStart(4)} ${String(r.pages.size).padStart(3)}  ${r.lang}  ${r.w}   ${[...r.pages].slice(0, 4).join(', ')}`));
}
