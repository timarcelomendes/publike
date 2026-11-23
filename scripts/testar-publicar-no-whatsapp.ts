// Publicar a vaga dentro do WhatsApp (23/11/2026; migração 20270914120000): a vaga lida vira o formulário do site e
// passa pelas mesmas regras (`completarAnuncio` e `lerAnuncio`); o nome da empresa; quando dá para publicar aqui.
// Roda com `npx tsx scripts/testar-publicar-no-whatsapp.ts` (sai com erro se algo mudou). Com um caminho de arquivo no
// fim, grava lá o registro da vaga de exemplo (para conferir a função do banco num banco local).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
// sem internet: o mapa do bairro não responde, e a vaga fica no centro da cidade (como no site)
globalThis.fetch = (async () => {
  throw new Error("sem rede no teste");
}) as any;

let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.error(`ERRO ${nome}`, detalhe ?? "");
  }
}

async function main() {
  const m = await import("../src/lib/servidor/publicar-no-whatsapp");
  const base = {
    titulo: "Operadora de caixa",
    descricao: "",
    categoria: "",
    regime: "clt",
    salario: 1950,
    salario_ate: null,
    unidade: "mes",
    beneficios: [],
    cidade: "Goiânia",
    bairro: "Setor Urias Magalhães",
    quantidade: 1,
  };

  // o nome
  conferir("nome simples", m.nomeDaEmpresa("Padaria Pão Quente") === "Padaria Pão Quente");
  conferir("nome com 'Nome:'", m.nomeDaEmpresa("Nome: Mercado Bom Preço.") === "Mercado Bom Preço");
  conferir("nome com artigo fica", m.nomeDaEmpresa("O Boticário") === "O Boticário");
  conferir("telefone não", m.nomeDaEmpresa("Padaria 62 98477-1907") === null);
  conferir("link não", m.nomeDaEmpresa("www.padaria.com") === null);
  conferir("pergunta não", m.nomeDaEmpresa("precisa de CNPJ?") === null);
  conferir("curto não", m.nomeDaEmpresa("a") === null);

  // quando dá para publicar aqui
  conferir("com cargo e bairro", m.podePublicarAqui(base as any));
  conferir("sem bairro, pelo site", !m.podePublicarAqui({ ...base, bairro: "" } as any));
  conferir("cargo curto, pelo site", !m.podePublicarAqui({ ...base, titulo: "Gari" } as any));

  // o formulário e as regras do site
  const f = m.formularioDaVagaLida(base as any);
  conferir("salário em reais com vírgula", f.get("pagamento_valor") === "1950");
  conferir("prazo de 30 dias", f.get("prazo") === "30");
  const r = await m.registroDaVagaLida(base as any);
  conferir("a vaga passa nas regras", r.ok, !r.ok && r.erros);
  if (r.ok) {
    conferir("descrição escrita pelo Publike", r.registro.descricao.length >= 20, r.registro.descricao);
    conferir("categoria pelo título", Boolean(r.registro.categoria), r.registro.categoria);
    conferir("ponto no mapa", /^SRID=4326;POINT\(-4\d\.\d+ -1\d\.\d+\)$/.test(r.registro.local), r.registro.local);
    conferir("sem contato direto", r.registro.contato_direto === false);
    const arquivo = process.argv[2];
    if (arquivo) writeFileSync(arquivo, JSON.stringify(r.registro));
  }
  const combinar = await m.registroDaVagaLida({ ...base, salario: null } as any);
  conferir("a combinar passa", combinar.ok, !combinar.ok && combinar.erros);
  const semBairro = await m.registroDaVagaLida({ ...base, bairro: "" } as any);
  conferir("sem bairro não passa", !semBairro.ok);

  // os botões cabem (20 letras) e o token vai no payload
  const token = "a".repeat(64);
  const botoes = m.botoesDaVagaPreparada(token);
  conferir("botões até 20 letras", botoes.every((b) => b.titulo.length <= 20));
  conferir("payload do publicar", m.PAYLOAD_PUBLICAR.exec(botoes[0].id)?.[1] === token);
  conferir("payload do conferir", m.PAYLOAD_CONFERIR.exec(botoes[1].id)?.[1] === token);

  // o lugar respondido na conversa (migração 20270916150000)
  const { lugarDaResposta } = await import("../src/lib/lugar-da-resposta");
  const vw = await import("../src/lib/vagas-pelo-whatsapp");
  const lugares: [string, string | null, unknown][] = [
    ["Setor Bueno, Goiânia", null, { bairro: "Setor Bueno", cidade: "Goiânia" }],
    ["Passeio das Águas em Goiânia", null, { bairro: "Passeio das Águas", cidade: "Goiânia" }],
    ["Goiânia", null, { bairro: "", cidade: "Goiânia" }],
    ["goiania - go", null, { bairro: "", cidade: "Goiânia" }],
    ["Passeio das Águas", null, { bairro: "Passeio das Águas", cidade: null }],
    ["Passeio das Águas", "Goiânia", { bairro: "Passeio das Águas", cidade: "Goiânia" }],
    ["Setor Garavelo, Aparecida", null, { bairro: "Setor Garavelo", cidade: "Aparecida de Goiânia" }],
    ["Jundiaí, Anápolis", null, { bairro: "Jundiaí", cidade: "Anápolis" }],
    ["Vila Trindade", null, { bairro: "Vila Trindade", cidade: null }],
    ["Fica no Setor Bueno", null, { bairro: "Setor Bueno", cidade: "Goiânia" }],
    ["Centro", "Anápolis", { bairro: "Centro", cidade: "Anápolis" }],
    ["Goiânia, Setor Bueno", null, { bairro: "Setor Bueno", cidade: "Goiânia" }],
    ["Shopping Passeio das Águas, Goiânia - GO", null, { bairro: "Shopping Passeio das Águas", cidade: "Goiânia" }],
    ["não sei", null, null],
    ["okay", null, null],
    ["Quanto custa para publicar", null, null],
    ["precisa de CNPJ?", null, null],
    ["62 98477-1907", null, null],
    ["https://publike.org", null, null],
    ["[a pessoa mandou uma foto]", null, null],
  ];
  for (const [texto, daVaga, esperado] of lugares) {
    const lido = lugarDaResposta(texto, daVaga);
    conferir(`o lugar: ${texto}${daVaga ? ` (vaga em ${daVaga})` : ""}`, JSON.stringify(lido) === JSON.stringify(esperado), lido);
  }
  // o lugar do lote: com lugares diferentes, nada muda
  const doisLugares = vw.lugarDoLote([
    { ...base, bairro: "Setor Bueno" },
    { ...base, titulo: "Vendedora", bairro: "Setor Oeste" },
    { ...base, titulo: "Estoquista", bairro: "" },
  ] as any);
  conferir("lugares diferentes: a vaga sem lugar fica sem", doisLugares[2].bairro === "", doisLugares);
  const umLugar = vw.lugarDoLote([{ ...base, bairro: "", cidade: "" }, { ...base, titulo: "Vendedora", bairro: "Setor Oeste", cidade: "Goiânia" }] as any);
  conferir("um lugar só: a vaga sem lugar fica com ele", umLugar[0].bairro === "Setor Oeste" && umLugar[0].cidade === "Goiânia", umLugar);
  conferir("o botão do lugar: conferir o lote", m.botoesDoLugar(token, 2)[0].id === `a:conferir_lote:${token}` && m.botoesDoLugar(token, 1)[0].id === `a:conferir:${token}`);

  if (falhas) {
    console.error(`\n${falhas} falha(s)`);
    process.exit(1);
  }
  console.log("\ntudo certo");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
