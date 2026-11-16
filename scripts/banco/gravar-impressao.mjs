// Lê a impressão do banco (o JSON de privado.impressao_do_banco(), na entrada) e escreve, na saída, o
// banco-esperado.json: as migrações do repositório e a impressão, em ordem e uma por linha (o diff do git fica
// só no que mudou). Migração 20270629110000.
//   psql -X -At -c "select privado.impressao_do_banco()::text" | node scripts/banco/gravar-impressao.mjs
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migracoes = readdirSync(join(raiz, "supabase", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -4))
  .sort();
const entrada = readFileSync(0, "utf8").trim();
if (!entrada.startsWith("{")) {
  console.error("gravar-impressao: a entrada não é a impressão do banco (rodou as migrações até a 20270629110000?)");
  process.exit(1);
}
const impressao = JSON.parse(entrada);
const objetos = Object.fromEntries(Object.keys(impressao).sort().map((k) => [k, impressao[k]]));
process.stdout.write(JSON.stringify({ migracoes, objetos }, null, 1) + "\n");
