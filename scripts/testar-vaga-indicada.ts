// A vaga que quem procura trabalho mandou vira convite (migração 20271011120000): o que conta como anúncio de vaga e o
// agradecimento. Roda com `npx tsx scripts/testar-vaga-indicada.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.error(`✗ ${nome}${detalhe === undefined ? "" : `\n    ${JSON.stringify(detalhe)}`}`);
  }
}

async function main() {
  const v = await import("../src/lib/servidor/vaga-pelo-whatsapp");
  for (const s of ["um anúncio de vaga", "um print de vaga de emprego", "um cartaz de contratação: contratando"])
    conferir(v.eAnuncioDeVaga(s), `é vaga: ${s}`);
  for (const s of ["uma carteira de trabalho digital", "um certificado de curso", "", null])
    conferir(!v.eAnuncioDeVaga(s as any), `não é vaga: ${s}`);

  const novo = v.respostaDaVagaIndicada("novo", "Atendente", "Padaria Pão de Ouro", "Ana");
  conferir(novo.startsWith("Obrigado, Ana!") && novo.includes("*Atendente*") && novo.includes("*Padaria Pão de Ouro*"), "novo", novo);
  conferir(!/me mand|mande|envie/i.test(novo), "não pede nada", novo);
  conferir(v.respostaDaVagaIndicada("ja_no_publike", "Atendente", null, null).includes("já usa o Publike"), "já no Publike");
  conferir(v.respostaDaVagaIndicada("limite", null, null, null).includes("Amanhã"), "limite");
  conferir(v.respostaDaVagaIndicada("sem_nome", null, null, null).includes("nome da empresa"), "sem nome");

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
