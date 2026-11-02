// Antes do `npm run dev`: se o package-lock.json mudou desde a última instalação (um commit trouxe uma
// dependência nova), roda o `npm install` sozinho, para o site não parar em "Module not found".
// A marca da última instalação fica em node_modules/.publike-lock (a soma do package-lock.json).
// `--conferir`: só diz se falta instalar (sai com 1), sem instalar nada.
// Na Vercel e no CI não faz nada: lá a instalação já vem antes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.VERCEL || process.env.CI) process.exit(0);

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = join(raiz, "package-lock.json");
const marca = join(raiz, "node_modules", ".publike-lock");
const soConferir = process.argv.includes("--conferir");

const soma = createHash("sha256").update(readFileSync(lock)).digest("hex");
const instalada = existsSync(marca) ? readFileSync(marca, "utf8").trim() : null;

/** As dependências do package.json que não estão em node_modules. */
function faltando() {
  const pacote = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
  const nomes = Object.keys({ ...pacote.dependencies, ...pacote.devDependencies });
  return nomes.filter((n) => !existsSync(join(raiz, "node_modules", n, "package.json")));
}

const falta = faltando();
// sem a marca (primeira vez com este script), só instala se faltar alguma coisa; senão, guarda a marca
if (instalada === soma || (instalada === null && falta.length === 0)) {
  if (instalada === null && !soConferir) writeFileSync(marca, soma);
  process.exit(0);
}

if (soConferir) {
  console.log(
    falta.length
      ? `Falta instalar: ${falta.join(", ")}. Rode npm install.`
      : "O package-lock.json mudou desde a última instalação. Rode npm install.",
  );
  process.exit(1);
}

console.log(
  falta.length
    ? `\nDependência nova (${falta.join(", ")}): rodando npm install antes de ligar o site...\n`
    : "\nO package-lock.json mudou: rodando npm install antes de ligar o site...\n",
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const r = spawnSync(npm, ["install"], { cwd: raiz, stdio: "inherit" });
if (r.status !== 0) {
  console.error("\nO npm install não terminou. Confira a mensagem acima e rode npm install de novo.\n");
  process.exit(r.status ?? 1);
}
writeFileSync(marca, soma);
