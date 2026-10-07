# Подготовка к собеседованию

Вопросы и ответы по моему стеку — .NET, Delphi, веб, Python — на уровнях Junior, Middle и
Senior. Русский, украинский и английский.

Сайт: https://qwert11.github.io/sobes/

## Что на странице вопроса

- Короткий и подробный ответ на каждом из трёх уровней; переключатель уровня над вопросами.
- Пример кода, уточняющие вопросы интервьюера, ссылки на документацию.
- Термины с пунктиром открывают определение: сбоку на компьютере, снизу на телефоне.
- Режим карточек и самопроверка «знаю / плаваю / не знаю» — хранятся в браузере.

## Разработка

```bash
npm install
npm run dev             # http://localhost:4321/sobes/
npm run check:content   # проверка вопросов, переводов и глоссария
npm run check:examples  # компиляция примеров C# (нужен .NET 10 SDK)
npm run build           # статическая сборка в dist/
```

Как писать вопросы — [CONTENT-GUIDE.md](CONTENT-GUIDE.md).

Стек: [Astro](https://astro.build) + [Starlight](https://starlight.astro.build), поиск
Pagefind, публикация через GitHub Actions на GitHub Pages при пуше в `main`.
