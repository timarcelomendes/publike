// O lance do impulso (src/lib/impulso-lance.ts, 13/11/2026): o robô só mexe no lance de quem está no jeito dele (a
// parcela de impressões), e no CPC manual o grupo sem lance (R$ 0,01) ganha o teto das Regras. Sem banco e sem rede.
// Roda com `npx tsx scripts/testar-impulso-lance.ts` (sai com erro se algo mudou).
import { decidirLance } from "../src/lib/impulso-ajuste";
import {
  gruposSemLance,
  lanceDoRobo,
  tetoEmMicros,
  usaLanceDoGrupo,
} from "../src/lib/impulso-lance";

let falhas = 0;
let total = 0;
function igual(nome: string, veio: unknown, esperado: unknown) {
  total++;
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas++;
    console.error(`✗ ${nome}\n    veio:     ${a}\n    esperado: ${b}`);
  }
}

// o jeito do lance do robô: só a parcela de impressões
igual(
  "parcela de impressões é do robô",
  lanceDoRobo("TARGET_IMPRESSION_SHARE"),
  true,
);
igual("Maximizar cliques foi mudado à mão", lanceDoRobo("TARGET_SPEND"), false);
igual("CPC manual foi mudado à mão", lanceDoRobo("MANUAL_CPC"), false);
igual("sem campanha não é do robô", lanceDoRobo(undefined), false);

// o lance do grupo só conta no CPC manual
igual("CPC manual usa o lance do grupo", usaLanceDoGrupo("MANUAL_CPC"), true);
igual("Maximizar cliques não usa", usaLanceDoGrupo("TARGET_SPEND"), false);
igual(
  "parcela de impressões não usa",
  usaLanceDoGrupo("TARGET_IMPRESSION_SHARE"),
  false,
);

// os grupos sem lance ganham o teto; o lance posto à mão fica
igual("R$ 2 em micros", tetoEmMicros(2), 2_000_000);
igual("R$ 3,50 em micros", tetoEmMicros(3.5), 3_500_000);
igual(
  "só os grupos com R$ 0,01 ou sem lance",
  gruposSemLance(
    [
      { nome: "a", micros: 10_000 },
      { nome: "b", micros: null },
      { nome: "c", micros: 1_500_000 },
      { nome: "d", micros: 2_000_000 },
    ],
    2,
  ),
  [
    { nome: "a", micros: 10_000, novo: 2_000_000 },
    { nome: "b", micros: null, novo: 2_000_000 },
  ],
);
igual(
  "nenhum grupo sem lance",
  gruposSemLance([{ nome: "c", micros: 1_500_000 }], 2),
  [],
);

// o ajuste diário não mexe no lance de quem foi mudado à mão (com os números de quem perde leilão por lance)
const base = {
  verba: 30,
  dias: 7,
  gasto: 5,
  faltam: 3,
  orcamento: 5,
  diasNaJanela: 2,
  impressoes: 200,
  cliques: 10,
  custo: 5,
  parcela: 0.3,
  perdeLance: 0.6,
  perdeVerba: 0,
  teto: 2,
  raio: 25,
  raioExtra: 0,
};
const regras = { tetoMax: 3.5, raioMax: 10 };
igual(
  "na parcela de impressões, o ajuste mexe",
  decidirLance({ ...base, estrategia: "TARGET_IMPRESSION_SHARE" }, regras) !==
    null,
  true,
);
igual(
  "em Maximizar cliques, não mexe",
  decidirLance({ ...base, estrategia: "TARGET_SPEND" }, regras),
  null,
);
igual(
  "no CPC manual, não mexe",
  decidirLance({ ...base, estrategia: "MANUAL_CPC", teto: null }, regras),
  null,
);

console.log(
  falhas
    ? `${falhas} de ${total} falharam`
    : `${total} conferências, todas certas`,
);
process.exit(falhas ? 1 : 0);
