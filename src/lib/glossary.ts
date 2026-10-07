import { parse } from 'yaml';
import type { Lang } from './ui';

export interface Term {
  /** Как термин показывается в заголовке панели. */
  term: string;
  /** Определение в 1–3 предложения; `код` в обратных кавычках допускается. */
  def: string;
  /** Запрос для Google, если он должен отличаться от term. */
  q?: string;
  /** Ссылка на официальную документацию. */
  docs?: string;
  /** Точное название статьи в Википедии этого языка. */
  wiki?: string;
}

const files = import.meta.glob('/src/data/glossary/*/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const cache = new Map<Lang, Record<string, Term>>();

/** Все термины языка из src/data/glossary/<lang>/*.yaml; при повторе ключа побеждает первый файл. */
export function getGlossary(lang: Lang): Record<string, Term> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const out: Record<string, Term> = {};
  for (const path of Object.keys(files).sort()) {
    const m = path.match(/\/glossary\/([a-z]+)\/[^/]+\.ya?ml$/);
    if (!m || m[1] !== lang) continue;
    let data: Record<string, Term>;
    try {
      data = (parse(files[path]) ?? {}) as Record<string, Term>;
    } catch {
      continue; // битый YAML ловит check:content, сборку он не роняет
    }
    for (const [key, value] of Object.entries(data)) {
      const valid = typeof value?.term === 'string' && typeof value?.def === 'string';
      if (valid && !(key in out)) out[key] = value;
    }
  }
  cache.set(lang, out);
  return out;
}
