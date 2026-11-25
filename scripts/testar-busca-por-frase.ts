// A busca escrita como a pessoa fala (src/lib/busca-por-frase.ts): o que é frase e os filtros do que a IA leu.
// npx tsx scripts/testar-busca-por-frase.ts
import { buscaDoLido, pareceFrase } from "../src/lib/busca-por-frase";

let falhas = 0;
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) {
    falhas++;
    console.error(`ERRO ${nome}`, detalhe ?? "");
  }
};

for (const t of ["garçom à noite perto do Setor Bueno", "vaga de vendedor no jardim américa", "quero trabalhar de manhã sem experiência", "auxiliar de cozinha clt", "estágio em administração"])
  conferir(`frase: ${t}`, pareceFrase(t));
for (const t of ["garçom", "auxiliar de cozinha", "vendedora", "motorista", "a"]) conferir(`palavras: ${t}`, !pareceFrase(t));

const vazio = { funcao: "", categoria: "", turno: "", regime: "", comeca_ja: false, bairro: "", cidade: "", perto_de_mim: false };
const garcom = buscaDoLido({ ...vazio, funcao: "garçom", turno: "noite", bairro: "Setor Bueno" }, { nome: "Setor Bueno", lat: -16.7, lng: -49.27 });
conferir(
  "garçom à noite no Setor Bueno",
  garcom?.q === "garçom" && garcom.turno === "noite" && garcom.lugar?.nome === "Setor Bueno" && garcom.partes.join(" · ") === "Garçom · Setor Bueno e arredores · à noite",
  garcom,
);
const area = buscaDoLido({ ...vazio, categoria: "alimentacao", regime: "clt", comeca_ja: true }, null);
conferir("só a área, CLT, começa já", area?.q === "" && area.categoria === "alimentacao" && area.regime === "clt" && area.ja && area.partes[0] === "Alimentação", area);
conferir("nada para filtrar", buscaDoLido(vazio, null) === null);
conferir("valor fora da lista não vale", buscaDoLido({ ...vazio, funcao: "pedreiro", turno: "madrugada", regime: "xyz" }, null)?.turno === null);
const perto = buscaDoLido({ ...vazio, funcao: "caixa", perto_de_mim: true }, null);
conferir("perto de mim, sem o bairro", perto?.pertoDeMim === true, perto);

console.log(falhas ? `${falhas} falha(s)` : "tudo certo");
process.exit(falhas ? 1 : 0);
