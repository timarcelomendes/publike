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

  // o lugar de fora (25/11/2026, a ANPE: "barueri sp" e "SÃO PAULO" viraram Goiânia)
  const foras: [string, string | null, "cidade" | "bairro" | "lugar", unknown][] = [
    ["barueri sp", null, "lugar", { fora: "Barueri (SP)" }],
    ["SÃO PAULO", null, "cidade", { fora: "São Paulo (SP)" }],
    ["SÃO PAULO", null, "lugar", { fora: "São Paulo (SP)" }],
    ["São Paulo", "Goiânia", "bairro", { bairro: "São Paulo", cidade: "Goiânia" }],
    ["Vila São Paulo", null, "lugar", { bairro: "Vila São Paulo", cidade: "Goiânia" }],
    ["Barueri - SP", null, "lugar", { fora: "Barueri (SP)" }],
    ["SP", null, "cidade", { fora: "São Paulo" }],
    ["Barueri", null, "cidade", { fora: "Barueri (SP)" }],
    ["Itapevi", null, "cidade", { fora: "Itapevi" }],
    ["Recife/PE", null, "lugar", { fora: "Recife (PE)" }],
    ["Uberlândia (MG)", null, "lugar", { fora: "Uberlândia (MG)" }],
    ["Belo Horizonte", null, "lugar", { fora: "Belo Horizonte (MG)" }],
    ["Setor Belo Horizonte, Aparecida", null, "lugar", { bairro: "Setor Belo Horizonte", cidade: "Aparecida de Goiânia" }],
    ["Campinas", null, "lugar", { bairro: "Campinas", cidade: "Goiânia" }],
    ["Centro, Campinas", null, "lugar", { fora: "Campinas (SP)" }],
    ["Brasília", null, "lugar", { fora: "Brasília (DF)" }],
    ["Vila Brasília", null, "lugar", { bairro: "Vila Brasília", cidade: "Aparecida de Goiânia" }],
    ["Rio Verde", null, "lugar", { fora: "Rio Verde (GO)" }],
    ["Aparecida SP", null, "lugar", { fora: "Aparecida (SP)" }],
    ["Minas Gerais", null, "lugar", { fora: "Minas Gerais" }],
    ["Jardim Bela Vista ap", null, "lugar", { bairro: "Jardim Bela Vista ap", cidade: null }],
    ["Setor Leste Vila Nova se", null, "lugar", { bairro: "Setor Leste Vila Nova se", cidade: null }],
    ["Goiás", null, "cidade", { soGoias: true }],
    ["GO", null, "cidade", { soGoias: true }],
    ["Goiânia (GO)", null, "cidade", { bairro: "", cidade: "Goiânia" }],
    ["Ap. de Goiânia", null, "cidade", { bairro: "", cidade: "Aparecida de Goiânia" }],
    ["Jardim Tiradentes, Ap de Goiânia", null, "lugar", { bairro: "Jardim Tiradentes", cidade: "Aparecida de Goiânia" }],
    ["gyn", null, "cidade", { bairro: "", cidade: "Goiânia" }],
    ["Setor Bueno", null, "cidade", { bairro: "Setor Bueno", cidade: "Goiânia" }],
    ["Jundiaí", null, "lugar", { bairro: "Jundiaí", cidade: "Anápolis" }],
  ];
  for (const [texto, daVaga, contexto, esperado] of foras) {
    const lido = lugarDaResposta(texto, daVaga, contexto);
    conferir(`o lugar (${contexto}): ${texto}`, JSON.stringify(lido) === JSON.stringify(esperado), lido);
  }
  const fr = await import("../src/lib/fora-da-regiao");
  conferir("a vaga da ANPE é de fora", fr.foraDoRascunho({ bairro: "barueri sp", cidade: "Goiânia" }) === "Barueri (SP)");
  conferir("a marca vale", fr.foraDoRascunho({ bairro: "", cidade: "", fora: "Curitiba (PR)" }) === "Curitiba (PR)");
  conferir("a cidade que não é das praças", fr.foraDoRascunho({ bairro: "Centro", cidade: "Uberlândia" }) === "Uberlândia (MG)");
  conferir("a vaga daqui não é de fora", fr.foraDoRascunho({ bairro: "Vila São Paulo", cidade: "Goiânia" }) === null);
  conferir("Goiânia - GO não é de fora", fr.foraDoRascunho({ bairro: "Setor Bueno", cidade: "Goiânia - GO" }) === null);
  conferir("Campinas na cidade é a de SP", fr.foraDoRascunho({ bairro: "Centro", cidade: "Campinas" }) === "Campinas (SP)");
  conferir("o texto leva a marca do lugar", vw.MARCA_DO_LUGAR.test(fr.textoForaDaRegiao("Barueri (SP)")));
  // a leitura do anúncio: a cidade de fora vem marcada, sem a cidade daqui
  const lv = await import("../src/lib/leitura-de-vagas");
  const lidos: [string, string, string | null, unknown][] = [
    ["Barueri - SP", "Centro", null, { cidade: "", bairro: "Centro", fora: "Barueri (SP)" }],
    ["São Paulo", "Centro", null, { cidade: "", bairro: "Centro", fora: "São Paulo (SP)" }],
    ["", "Alphaville, Barueri - SP", null, { cidade: "", bairro: "Alphaville, Barueri - SP", fora: "Alphaville, Barueri (SP)" }],
    ["Goiânia - GO", "St. Bueno", null, { cidade: "Goiânia", bairro: "Setor Bueno" }],
    ["Aparecida", "Setor Garavelo", null, { cidade: "Aparecida de Goiânia", bairro: "Setor Garavelo" }],
    ["Goiânia e região", "", null, { cidade: "Goiânia", bairro: "" }],
    ["São Paulo", "", "remoto", { cidade: "", bairro: "" }],
  ];
  for (const [cidade, bairro, modelo, esperado] of lidos) {
    const lido = lv.lugarDaVaga(cidade, bairro, modelo);
    conferir(`a leitura: ${cidade} / ${bairro}${modelo ? ` (${modelo})` : ""}`, JSON.stringify(lido) === JSON.stringify(esperado), lido);
  }
  conferir("o lote de fora: a vaga sem lugar fica de fora também", vw.lugarDoLote([
    { ...base, bairro: "Centro", cidade: "", fora: "Barueri (SP)" },
    { ...base, titulo: "Cozinheiro", bairro: "", cidade: "" },
  ] as any)[1].fora === "Barueri (SP)");

  // o tipo de contratação escrito (migração 20270926120000)
  const tipos: [string, string | null][] = [
    ["CLT", "clt"],
    ["com carteira assinada", "clt"],
    ["sim", "clt"],
    ["é sim", "clt"],
    ["é estágio", "estagio"],
    ["Estagiário", "estagio"],
    ["jovem aprendiz", "aprendiz"],
    ["temporário", "temporario"],
    ["diária", "diaria"],
    ["freela", "freelance"],
    ["freelancer", "freelance"],
    ["comissão", "produtividade"],
    ["autônomo", "autonomo"],
    ["PJ", "pj"],
    ["MEI", "pj"],
    ["intermitente", "intermitente"],
    ["trainee", "trainee"],
    ["não", null],
    ["outro", null],
    ["quanto custa?", null],
  ];
  for (const [texto, esperado] of tipos) conferir(`o tipo: ${texto}`, m.regimeDaResposta(texto) === esperado, m.regimeDaResposta(texto));
  const botoesTipo = m.botoesDoRegime(token);
  conferir("os botões do tipo cabem", botoesTipo.every((b) => b.titulo.length <= 20) && botoesTipo.every((b) => m.PAYLOAD_REGIME.test(b.id)));
  const semTipo = await m.registroDaVagaLida({ ...base, regime: "" } as any);
  conferir("sem o tipo: só falta o tipo", !semTipo.ok && m.soFaltaORegime(semTipo), !semTipo.ok && semTipo.campos);

  // o lembrete da vaga que não foi ao ar (migração 20270926120000), pelo que falta
  const vp = await import("../src/lib/servidor/vaga-pelo-whatsapp");
  const lembrete = (rascunho: any, extra: any = {}) =>
    vp.lembreteDaVagaPreparada({ conversa: "c", numero: "5562999990000", nome: "Jana", token, rascunho, no_lote: 1, abriu: false, ...extra }, "Oi, Jana!");
  const pronto = await lembrete(base, { abriu: true });
  conferir(
    "o lembrete: Conseguiu publicar?",
    !!pronto && pronto.texto.startsWith("Oi, Jana! Vi que você abriu a vaga de *Operadora de caixa* no site") && pronto.botoes?.[0].id === `a:publicar:${token}`,
    pronto,
  );
  const doTipo = await lembrete({ ...base, regime: "" });
  conferir("o lembrete: a pergunta do tipo", !!doTipo && doTipo.texto.includes(m.PERGUNTA_DO_REGIME) && doTipo.botoes?.[0].id === `a:regime:clt:${token}`, doTipo);
  const doLugar = await lembrete({ ...base, bairro: "", cidade: "" });
  conferir("o lembrete: a pergunta do lugar", !!doLugar && vw.MARCA_DO_LUGAR.test(doLugar.texto) && doLugar.botoes?.[0].id === `a:conferir:${token}`, doLugar);
  const daAnpe = await lembrete({ ...base, titulo: "Atendente de restaurante", bairro: "barueri sp", cidade: "Goiânia" });
  conferir(
    "o lembrete: a correção da vaga de fora",
    !!daAnpe && daAnpe.texto.includes("Corrigindo") && daAnpe.texto.includes("*Barueri (SP)*") && !daAnpe.botoes && !daAnpe.botao,
    daAnpe,
  );
  conferir("o lembrete: a de fora já explicada fica sem", (await lembrete({ ...base, cidade: "", fora: "Barueri (SP)" })) === null);
  const doLoteL = await lembrete(base, { no_lote: 3 });
  conferir(
    "o lembrete: o lote",
    !!doLoteL && doLoteL.texto.startsWith("Oi, Jana! As 3 vagas") && doLoteL.texto.includes("*Sim, publicar as 3*") && doLoteL.botoes?.[0].id === `a:lote:${token}`,
    doLoteL,
  );
  // o que só se acerta no site: o link já preenchido
  const doSite = await lembrete({ ...base, titulo: "Ab" });
  conferir("o lembrete: o que só se acerta no site vai com o link", !!doSite && doSite.botao?.titulo === "Conferir e publicar" && !doSite.botoes, doSite);

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
