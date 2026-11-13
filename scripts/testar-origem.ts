// A origem dos links de compartilhar (src/lib/origem.ts, comOrigem, 13/11/2026). Sem banco e sem rede.
// Roda com `npx tsx scripts/testar-origem.ts` (sai com erro se algo mudou).
import { comOrigem, origemDoLink } from "../src/lib/origem";

let falhas = 0;
let total = 0;
function igual(nome: string, veio: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas++;
    console.error(`✗ ${nome}\n    veio:     ${JSON.stringify(veio)}\n    esperado: ${JSON.stringify(esperado)}`);
  }
}

const daqui = (link: string) => origemDoLink(new URL(link).searchParams);

igual(
  "a página compartilhada ganha a origem",
  comOrigem("https://publike.org/vagas/goiania", "compartilhar", "pagina"),
  "https://publike.org/vagas/goiania?utm_source=compartilhar&utm_campaign=pagina",
);
igual("e o site lê compartilhar:pagina", daqui(comOrigem("https://publike.org/post/1", "compartilhar", "post")), "compartilhar:post");
igual(
  "o link com outros parâmetros mantém os dele",
  comOrigem("https://publike.org/?tipo=vaga&raio=10", "compartilhar", "pagina"),
  "https://publike.org/?tipo=vaga&raio=10&utm_source=compartilhar&utm_campaign=pagina",
);
igual(
  "o link que já tem origem fica como está",
  comOrigem("https://publike.org/?utm_source=instagram&utm_campaign=bio", "compartilhar", "pagina"),
  "https://publike.org/?utm_source=instagram&utm_campaign=bio",
);
igual("o convite do candidato", daqui(comOrigem("https://publike.org/candidatura/abc", "convite", "candidato")), "convite:candidato");
igual("o caminho da ajuda", daqui(comOrigem("https://publike.org/ajuda/caminho/x", "compartilhar", "caminho")), "compartilhar:caminho");
igual("o link quebrado volta igual", comOrigem("/sem-endereco", "compartilhar", "pagina"), "/sem-endereco");

console.log(falhas ? `${falhas} de ${total} falharam` : `${total} conferências, todas certas`);
process.exit(falhas ? 1 : 0);
