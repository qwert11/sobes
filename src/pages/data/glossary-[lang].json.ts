import type { APIRoute, GetStaticPaths } from 'astro';
import { getGlossary } from '../../lib/glossary';
import type { Lang } from '../../lib/ui';

export const getStaticPaths: GetStaticPaths = () =>
  (['ru', 'uk', 'en'] as const).map((lang) => ({ params: { lang } }));

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(getGlossary(params.lang as Lang)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
