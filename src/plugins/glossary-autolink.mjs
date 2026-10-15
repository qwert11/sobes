// Авторазметка терминов глоссария на сборке (mdast-плагин процессора Sätteri).
//
// Зачем. Читатель видит один блок ответа: переключил уровень — остальные скрыты. Термин,
// размеченный вручную один раз на страницу, в соседнем блоке остаётся без подсказки, и до
// половины ответов шли вообще без терминов. Плагин размечает термины заново в каждом блоке
// <A> и <Next>: первое упоминание внутри блока, не больше LIMITS штук.
//
// Ручные <T> остаются как есть: их ключи считаются уже размеченными в своём блоке.
// Не трогает заголовки, примеры кода, ссылки и жирные подписи блоков («**Что это**»).
import { fileURLToPath } from 'node:url';
import { buildIndex, findTerms, loadGlossary, pageInfo, pickerFor } from './glossary-match.mjs';

/** Сколько терминов размечать автоматически в одном блоке. */
export const LIMITS = { A: 8, Next: 4 };

/** Узлы, внутри которых размечать нельзя. */
export const SKIP = new Set([
  'code', 'heading', 'link', 'linkReference', 'strong', 'definition',
  'mdxFlowExpression', 'mdxTextExpression', 'mdxjsEsm', 'yaml', 'toml', 'html',
]);

const indexCache = new Map();
export function indexFor(lang) {
  if (!indexCache.has(lang)) indexCache.set(lang, buildIndex(loadGlossary(lang)));
  return indexCache.get(lang);
}

export const jsxName = (node) =>
  node && (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') ? node.name : null;

export const isTerm = (node) => jsxName(node) === 'T';

export const keyOf = (node) => {
  const attr = (node.attributes ?? []).find((a) => a.type === 'mdxJsxAttribute' && a.name === 'k');
  return typeof attr?.value === 'string' ? attr.value : null;
};

/** Ключи терминов, размеченных в блоке вручную: второй раз их не размечаем. */
export function manualKeys(node, out = new Set()) {
  if (isTerm(node)) {
    const k = keyOf(node);
    if (k) out.add(k);
    return out;
  }
  for (const child of node?.children ?? []) manualKeys(child, out);
  return out;
}

export const term = (key, children) => ({
  type: 'mdxJsxTextElement',
  name: 'T',
  attributes: [{ type: 'mdxJsxAttribute', name: 'k', value: key }],
  children,
});

/** Блок, к которому относится узел, или null, если размечать здесь нельзя. */
function blockOf(node, ctx) {
  let cur = node;
  for (let depth = 0; depth < 32; depth += 1) {
    const parent = ctx.parent(cur);
    if (!parent) return null;
    if (SKIP.has(parent.type) || isTerm(parent)) return null;
    const limit = LIMITS[jsxName(parent)];
    if (limit) return { block: parent, limit };
    cur = parent;
  }
  return null;
}

export default function glossaryAutolink(pluginCtx) {
  const file = pluginCtx.fileURL ? fileURLToPath(pluginCtx.fileURL) : '';
  const page = pageInfo(file);
  if (!page || !/<(A|Next)[\s>]/.test(pluginCtx.source)) return null;

  const index = indexFor(page.lang);
  if (!index.size) return null;
  const pick = pickerFor(page);
  const states = new Map();

  const stateOf = (node, ctx) => {
    const found = blockOf(node, ctx);
    if (!found) return null;
    let state = states.get(found.block);
    if (!state) {
      state = { left: found.limit, used: manualKeys(found.block) };
      states.set(found.block, state);
    }
    return state.left > 0 ? state : null;
  };

  return {
    name: 'glossary-autolink',

    text(node, ctx) {
      const state = stateOf(node, ctx);
      const out = state && markText(node.value, state, index, pick);
      if (out) ctx.replaceNode(node, out);
    },

    // `GC.Collect` размечается целиком или никак: разрывать код на части нельзя.
    inlineCode(node, ctx) {
      const state = stateOf(node, ctx);
      const out = state && markCode(node.value, state, index, pick);
      if (out) ctx.replaceNode(node, out);
    },
  };
}

/** Текстовый узел → узлы с размеченными терминами, или null, если размечать нечего. */
export function markText(value, state, index, pick) {
  const hits = findTerms(value, index, pick).filter((h) => !state.used.has(h.key));
  if (!hits.length) return null;

  const out = [];
  let pos = 0;
  for (const hit of hits) {
    if (state.left <= 0) break;
    if (state.used.has(hit.key)) continue;
    if (hit.start > pos) out.push({ type: 'text', value: value.slice(pos, hit.start) });
    out.push(term(hit.key, [{ type: 'text', value: value.slice(hit.start, hit.end) }]));
    state.used.add(hit.key);
    state.left -= 1;
    pos = hit.end;
  }
  if (!out.length) return null;
  if (pos < value.length) out.push({ type: 'text', value: value.slice(pos) });
  return out;
}

/** Узел `кода` → размеченный целиком, или null. */
export function markCode(value, state, index, pick) {
  const hit = findTerms(value, index, pick).find(
    (h) => h.start === 0 && h.end === value.length && !state.used.has(h.key),
  );
  if (!hit) return null;
  state.used.add(hit.key);
  state.left -= 1;
  return [term(hit.key, [{ type: 'inlineCode', value }])];
}
