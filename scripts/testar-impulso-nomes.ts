// Os nomes no Google Ads (src/lib/impulso-nomes.ts, 13/11/2026). Sem banco e sem rede.
// Roda com `npx tsx scripts/testar-impulso-nomes.ts` (sai com erro se algo mudou).
import { nomeDaCampanhaDaVaga, nomeDaCampanhaDoCliente, nomeDoGrupo, tipoDoImpulso } from "../src/lib/impulso-nomes";

let falhas = 0;
let total = 0;
function igual(nome: string, veio: unknown, esperado: unknown) {
  total++;
  if (JSON.stringify(veio) !== JSON.stringify(esperado)) {
    falhas++;
    console.error(`✗ ${nome}\n    veio:     ${JSON.stringify(veio)}\n    esperado: ${JSON.stringify(esperado)}`);
  }
}

igual("pago", tipoDoImpulso({ origem: "compra", dias: 7 }), "Pago 7 dias");
igual("pago de 1 dia", tipoDoImpulso({ origem: "compra", dias: 1 }), "Pago 1 dia");
igual("automático vence a origem", tipoDoImpulso({ origem: "cortesia", automatico: true, dias: 3 }), "Automático");
igual("presente", tipoDoImpulso({ origem: "admin", dias: 3 }), "Presente");
igual("grátis", tipoDoImpulso({ origem: "cortesia", dias: 3 }), "Grátis");
igual("crédito", tipoDoImpulso({ origem: "credito", dias: 5 }), "Crédito");
igual(
  "campanha da vaga",
  nomeDaCampanhaDaVaga({ cliente: "Padaria Boa", origem: "compra", dias: 7, vaga: "Padeiro", codigo: "8da58639ff" }),
  "Impulso · Padaria Boa · Pago 7 dias · Padeiro · 8da58639ff",
);
igual(
  "sem cliente e com espaços e quebra de linha",
  nomeDaCampanhaDaVaga({ cliente: null, origem: "admin", dias: 3, vaga: "  Auxiliar\nde   cozinha ", codigo: "x1" }),
  "Impulso · Sem nome · Presente · Auxiliar de cozinha · x1",
);
igual(
  "nome comprido é cortado",
  nomeDaCampanhaDaVaga({ cliente: "C".repeat(80), origem: "compra", dias: 3, vaga: "V".repeat(90), codigo: "c" }).length,
  "Impulso · ".length + 40 + " · Pago 3 dias · ".length + 50 + " · c".length,
);
igual("campanha do cliente", nomeDaCampanhaDoCliente({ cliente: "Etica RH", codigo: "23d635ad63" }), "Impulso · Etica RH · Presente · 23d635ad63");
igual("grupo da vaga", nomeDoGrupo({ vaga: "Padeiro", bairro: "Setor Bueno" }), "Padeiro · Setor Bueno");
igual("grupo sem bairro", nomeDoGrupo({ vaga: "Padeiro", bairro: "" }), "Padeiro");
igual("grupo na campanha do cliente", nomeDoGrupo({ vaga: "Analista Fiscal", bairro: "Centro", codigo: "e253c34388" }), "Analista Fiscal · Centro · e253c34388");

console.log(falhas ? `${falhas} de ${total} falharam` : `${total} conferências, todas certas`);
process.exit(falhas ? 1 : 0);
