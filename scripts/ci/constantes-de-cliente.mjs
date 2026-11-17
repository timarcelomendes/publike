// Nenhum arquivo do servidor importa uma constante (ou função que não é componente) de um arquivo "use client".
//
// No servidor, o que vem de um módulo "use client" é uma referência ao módulo, não o valor. Uma constante assim usada
// pelo servidor quebra em silêncio: o <script> do <head> com o SCRIPT_LARGURA esperava o JavaScript do módulo e a
// hidratação errava às vezes (erro #418, a página inteira desenhada de novo; 17/11/2026), e `sp[PARAMETRO_DA_VOLTA]`
// nunca achava o parâmetro. Constante usada dos dois lados vai para src/lib (como lib/aviso-cookies.ts).
//
// Uso: node scripts/ci/constantes-de-cliente.mjs (sai com 1 e a lista quando acha).

import fs from "node:fs";
import path from "node:path";

const RAIZ = "src";
const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

const arquivos = [];
(function andar(pasta) {
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) andar(p);
    else if (/\.(tsx?|mts)$/.test(e.name) && !e.name.endsWith(".d.ts")) arquivos.push(p);
  }
})(RAIZ);

// o que cada arquivo "use client" exporta e não é componente: constantes e funções com nome em minúscula
const doCliente = new Map();
for (const f of arquivos) {
  const s = fs.readFileSync(f, "utf8");
  if (!USE_CLIENT.test(s)) continue;
  const nomes = new Set();
  for (const m of s.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    // `export const Nome = (...) =>`, `forwardRef(...)`, `memo(...)`, `dynamic(...)` ou `lazy(...)` com nome de
    // componente continuam componentes
    const resto = s.slice(m.index + m[0].length, m.index + m[0].length + 80);
    if (/^[A-Z][a-z]/.test(m[1]) && /^\s*(?::[^=]+)?=\s*(?:\(|function|memo\(|forwardRef\(|dynamic\(|lazy\(|React\.)/.test(resto)) {
      continue;
    }
    nomes.add(m[1]);
  }
  for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+([a-z_$][\w$]*)/g)) nomes.add(m[1]);
  if (nomes.size) doCliente.set(path.resolve(f), nomes);
}

function resolver(de, modulo) {
  const base = modulo.startsWith("@/")
    ? path.resolve("src", modulo.slice(2))
    : modulo.startsWith(".")
      ? path.resolve(path.dirname(de), modulo)
      : null;
  if (!base) return null;
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const p = base + ext;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const achados = [];
for (const f of arquivos) {
  const s = fs.readFileSync(f, "utf8");
  if (USE_CLIENT.test(s)) continue;
  for (const m of s.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)) {
    if (m[1]) continue;
    const alvo = resolver(f, m[3]);
    if (!alvo || !doCliente.has(alvo)) continue;
    const nomes = m[2]
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith("type "))
      .map((x) => x.split(/\s+as\s+/)[0]);
    const ruins = nomes.filter((n) => doCliente.get(alvo).has(n));
    if (ruins.length) achados.push(`${f}: ${ruins.join(", ")} (de ${path.relative(".", alvo)})`);
  }
}

if (achados.length) {
  console.error('Constantes de arquivos "use client" importadas no servidor (mova para src/lib):');
  for (const a of achados) console.error(`  ${a}`);
  process.exit(1);
}
console.log('Nenhuma constante de "use client" no servidor.');
