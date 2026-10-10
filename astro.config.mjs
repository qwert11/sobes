// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Уровень ответа и режим карточек выставляются до первой отрисовки,
// чтобы при загрузке страницы не мигали чужие уровни.
const bootScript = `try{var d=document.documentElement,s=localStorage;d.dataset.lv=s.getItem('sobes:lv')||'m';if(s.getItem('sobes:quiz')==='1')d.dataset.quiz='1'}catch(e){document.documentElement.dataset.lv='m'}`;

export default defineConfig({
  site: 'https://qwert11.github.io',
  base: '/sobes',
  integrations: [
    starlight({
      title: {
        ru: 'Подготовка к собеседованию',
        uk: 'Підготовка до співбесіди',
        en: 'Interview prep',
      },
      defaultLocale: 'root',
      locales: {
        root: { label: 'Русский', lang: 'ru' },
        uk: { label: 'Українська', lang: 'uk' },
        en: { label: 'English', lang: 'en' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/qwert11/sobes' }],
      customCss: ['./src/styles/custom.css'],
      head: [{ tag: 'script', content: bootScript }],
      components: {
        MarkdownContent: './src/components/MarkdownContent.astro',
      },
      sidebar: [
        {
          label: 'C# и .NET',
          translations: { uk: 'C# та .NET', en: 'C# & .NET' },
          items: [{ autogenerate: { directory: 'dotnet' } }],
        },
        {
          label: 'ASP.NET Core',
          items: [{ autogenerate: { directory: 'aspnet' } }],
        },
        {
          label: 'Базы данных',
          translations: { uk: 'Бази даних', en: 'Databases' },
          items: [{ autogenerate: { directory: 'db' } }],
        },
        {
          label: 'Доступ и безопасность',
          translations: { uk: 'Доступ і безпека', en: 'Access and security' },
          items: [{ autogenerate: { directory: 'security' } }],
        },
        {
          label: 'Интеграции и архитектура',
          translations: { uk: 'Інтеграції та архітектура', en: 'Integrations and architecture' },
          items: [{ autogenerate: { directory: 'arch' } }],
        },
        {
          label: 'Глоссарий',
          translations: { uk: 'Глосарій', en: 'Glossary' },
          slug: 'glossary',
        },
      ],
      expressiveCode: { defaultProps: { wrap: true } },
      favicon: '/favicon.svg',
      lastUpdated: false,
      pagination: true,
    }),
  ],
});
