// Компиляция примеров C# из русских страниц (код во всех языках одинаковый, отличаются комментарии).
//   npm run check:examples                 — все страницы
//   npm run check:examples -- dotnet/async — только страницы, чей путь начинается так
//
// Каждый блок ```csharp собирается отдельным проектом net10.0 во временной папке.
// Ошибки делятся на два вида:
//   контекст — пример-фрагмент ссылается на то, чего в нём нет (CS0103, CS0246, …): это нормально;
//   ошибка   — всё остальное: синтаксис, порядок объявлений, неверное API. Их надо исправлять.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DOCS = 'src/content/docs';
const CONTEXT_CODES = new Set([
  'CS0103', // имя не существует в текущем контексте
  'CS0246', // тип или пространство имён не найдено
  'CS0234', // в пространстве имён нет такого члена (нет NuGet-пакета)
  'CS5001', // нет точки входа: пример — только объявления типов
  'CS0012', // тип определён в сборке без ссылки
]);

const filters = process.argv.slice(2).map((f) => f.replace(/\\/g, '/').replace(/\.mdx?$/, ''));
const userDotnet = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'dotnet', 'dotnet.exe');
const dotnet = fs.existsSync(userDotnet) ? userDotnet : 'dotnet';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'uk' || d.name === 'en' ? [] : walk(p);
    return d.name.endsWith('.mdx') ? [p] : [];
  });
}

/* ---------- извлечь примеры ---------- */

const snippets = [];
for (const file of walk(DOCS)) {
  const rel = path.relative(DOCS, file).replace(/\\/g, '/').replace(/\.mdx$/, '');
  if (filters.length && !filters.some((f) => rel.startsWith(f))) continue;
  const src = fs.readFileSync(file, 'utf8');
  let qid = '';
  let n = 0;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const q = lines[i].match(/<Q\s+id="([^"]+)"/);
    if (q) {
      qid = q[1];
      n = 0;
    }
    if (/^```(csharp|cs|c#)\b/.test(lines[i].trim())) {
      const start = i + 1;
      let end = start;
      while (end < lines.length && lines[end].trim() !== '```') end++;
      n++;
      snippets.push({ rel, qid, n, line: start + 1, code: lines.slice(start, end).join('\n') });
      i = end;
    }
  }
}

if (!snippets.length) {
  console.log('Примеров C# не найдено.');
  process.exit(0);
}

/* ---------- собрать ---------- */

const root = path.join(os.tmpdir(), 'sobes-examples');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <LangVersion>latest</LangVersion>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <EnableDefaultCompileItems>true</EnableDefaultCompileItems>
  </PropertyGroup>
</Project>
`;

const projects = snippets.map((s, i) => {
  const dir = path.join(root, `s${String(i).padStart(3, '0')}`);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'Program.cs'), s.code);
  fs.writeFileSync(path.join(dir, `${path.basename(dir)}.csproj`), csproj);
  return { ...s, dir, name: path.basename(dir) };
});

function build(list, slnx) {
  fs.writeFileSync(
    path.join(root, slnx),
    `<Solution>\n${list.map((p) => `  <Project Path="${p.name}/${p.name}.csproj" />`).join('\n')}\n</Solution>\n`,
  );
  const res = spawnSync(dotnet, ['build', slnx, '-m', '-nologo', '-v:q', '-clp:NoSummary'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' },
  });
  const errors = new Map();
  const out = `${res.stdout}\n${res.stderr}`;
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/[\\/](s\d{3})[\\/]Program\.cs\((\d+),(\d+)\): error (CS\d+): (.*?)(?: \[.*\])?$/);
    if (!m) continue;
    const [, name, ln, col, code, msg] = m;
    const errs = errors.get(name) ?? [];
    const key = `${ln}:${col}:${code}`;
    if (!errs.some((e) => e.key === key)) errs.push({ key, ln: +ln, code, msg });
    errors.set(name, errs);
  }
  return { res, out, errors };
}

console.log(`Собираю ${projects.length} примеров (${dotnet})…`);
const first = build(projects, 'all.slnx');
const { res, out } = first;
const byProject = first.errors;

// Пример из членов класса без самого класса («private void X() {…}») — оборачиваем в класс и собираем ещё раз.
const MEMBER_FRAGMENT = new Set(['CS0106', 'CS0026', 'CS0027']);
const members = projects.filter((p) => (byProject.get(p.name) ?? []).some((e) => MEMBER_FRAGMENT.has(e.code)));
if (members.length) {
  for (const p of members) {
    const body = p.code.replace(/^/gm, '    ');
    fs.writeFileSync(path.join(p.dir, 'Program.cs'), `public partial class Snippet\n{\n${body}\n}\n`);
  }
  console.log(`Ещё раз собираю ${members.length} фрагментов-членов класса внутри class Snippet…`);
  const second = build(members, 'members.slnx');
  for (const p of members) {
    // номера строк — в исходном примере: обёртка добавила одну строку сверху и одну «{»
    const errs = (second.errors.get(p.name) ?? []).map((e) => ({ ...e, ln: e.ln - 2 }));
    byProject.set(p.name, errs);
  }
}

// Пример «методы класса + строки, которые их вызывают»: методы — в класс, строки — в тело метода.
// Куски разделены пустыми строками; кусок — член класса, если его первая строка кода начинается
// с модификатора или с объявления метода.
const MEMBER_START =
  /^(\[|(public|private|protected|internal|static|async|readonly|override|virtual|abstract|sealed|partial|const|event|unsafe)\b|(void|Task|ValueTask)\b[^=;]*\()/;
const hasReal = (p) => (byProject.get(p.name) ?? []).some((e) => !CONTEXT_CODES.has(e.code));
const mixed = members.filter(hasReal);
if (mixed.length) {
  for (const p of mixed) {
    // кусок, начинающийся с отступа или скобки, — продолжение предыдущего (пустая строка внутри метода)
    const chunks = p.code.split(/\n\s*\n/).reduce((acc, c) => {
      if (acc.length && /^[\s{}]/.test(c)) acc[acc.length - 1] += `\n\n${c}`;
      else acc.push(c);
      return acc;
    }, []);
    const isMember = (chunk) => {
      const code = chunk.split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? '';
      return MEMBER_START.test(code.trim()) && !/^\s/.test(code);
    };
    const indent = (s, n) => s.replace(/^/gm, ' '.repeat(n));
    const memberCode = chunks.filter(isMember).map((c) => indent(c, 4)).join('\n\n');
    const bodyCode = chunks.filter((c) => !isMember(c)).map((c) => indent(c, 8)).join('\n\n');
    fs.writeFileSync(
      path.join(p.dir, 'Program.cs'),
      `public partial class Snippet\n{\n${memberCode}\n\n    async Task __Body()\n    {\n${bodyCode}\n    }\n}\n`,
    );
  }
  console.log(`Ещё раз собираю ${mixed.length} смешанных примеров: методы — в класс, операторы — в метод…`);
  const third = build(mixed, 'mixed.slnx');
  for (const p of mixed) {
    // строки после перестановки не совпадают с исходными — показываем только сообщения
    byProject.set(p.name, (third.errors.get(p.name) ?? []).map((e) => ({ ...e, ln: 0 })));
  }
}

// Явные иллюстрации, которые не должны компилироваться как есть (например, псевдокод
// сгенерированного компилятором кода). Ключ — id вопроса и номер примера.
const ILLUSTRATIONS = new Set([
  'dotnet.async.how-await-works#1', // упрощённый MoveNext: поля state machine и `ref this` структуры
]);
for (const p of projects) {
  if (ILLUSTRATIONS.has(`${p.qid}#${p.n}`)) byProject.set(p.name, [{ key: 'illustration', ln: 0, code: 'ILLUSTRATION', msg: '' }]);
}
CONTEXT_CODES.add('ILLUSTRATION');

let ok = 0;
let contextOnly = 0;
const broken = [];
for (const p of projects) {
  const errs = byProject.get(p.name) ?? [];
  const real = errs.filter((e) => !CONTEXT_CODES.has(e.code));
  if (!errs.length) ok++;
  else if (!real.length) contextOnly++;
  else broken.push({ p, real, context: errs.length - real.length });
}

for (const { p, real, context } of broken) {
  console.log(`\nERROR ${DOCS}/${p.rel}.mdx:${p.line}  ${p.qid} пример #${p.n}`);
  for (const e of real) console.log(`  ${e.ln > 0 ? `строка ${e.ln}: ` : ''}${e.code} ${e.msg}`);
  if (context) console.log(`  (+${context} ошибок контекста)`);
}

if (!byProject.size && res.status !== 0) {
  console.log(out.split(/\r?\n/).slice(-30).join('\n'));
  console.log('\nСборка упала, но ошибки компилятора не распознаны — см. вывод выше.');
  process.exit(2);
}

console.log(
  `\nПримеров: ${projects.length}, компилируются: ${ok}, фрагменты (нет контекста): ${contextOnly}, с ошибками: ${broken.length}`,
);
console.log(`Проекты: ${root}`);
process.exit(broken.length ? 1 : 0);
