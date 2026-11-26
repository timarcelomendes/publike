// Os selos de reputação de quem publica vaga (migração 20271004120000; Marcelo: "Preciso dar destaque aos anúncios das
// empresas, agências e anunciantes que respondem rápido, tem boa reputação"), sem banco: o `fetch` é trocado por
// respostas prontas. Confere os textos de cada selo, o que o painel diz que falta, os pontos na linha do tempo (sem
// passar na frente do que está mais perto), o filtro "Com selo" e o robô das filas. Roda com
// `npx tsx scripts/testar-selos.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";
process.env.PUBLIKE_CHAVE_SERVIDOR = "c".repeat(40);

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.error(`✗ ${nome}${detalhe === undefined ? "" : `\n    ${JSON.stringify(detalhe)}`}`);
  }
}

let pedidos: any[] = [];
let resposta: () => Response = () => json(2);
const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (u.includes("/rpc/servidor_calcular_selos")) {
    pedidos.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
    return resposta();
  }
  return json(null);
}) as typeof fetch;

const AGORA = Date.parse("2026-11-25T15:00:00Z");
const DIA = 24 * 3600 * 1000;

async function main() {
  const sl = await import("../src/lib/selos");
  const r = await import("../src/lib/relevancia");
  const f = await import("../src/lib/filtros");
  const filas = await import("../src/lib/servidor/filas");

  // --- 1. Do banco aos selos ---------------------------------------------------------------------------------------
  const linha = (x: any = {}) => ({
    responde_rapido: false,
    responde_por: null,
    bem_avaliada: false,
    nota: null,
    avaliacoes: 0,
    contratou: 0,
    ...x,
  });
  const nenhum = sl.selosDoBanco(linha());
  conferir(!sl.temSelos(nenhum) && sl.selosVisiveis(nenhum).length === 0, "sem selo: nada no cartão");
  conferir(sl.selosDoBanco(linha({ responde_por: "outro" })).respondePor === null, "origem desconhecida: nenhuma");
  conferir(sl.selosDoBanco(linha({ nota: "4.7" })).nota === 4.7, "a nota vem como número", sl.selosDoBanco(linha({ nota: "4.7" })));

  const todos = sl.selosDoBanco(
    linha({ responde_rapido: true, responde_por: "pessoas", bem_avaliada: true, nota: 4.7, avaliacoes: 12, contratou: 3 }),
  );
  let vis = sl.selosVisiveis(todos, "empresa");
  conferir(vis.map((s) => s.chave).join() === "responde,avaliada,contratou", "os três, na ordem", vis);
  conferir(vis[0].texto === "Responde rápido", "o texto do primeiro", vis[0]);
  conferir(
    vis[0].explicacao === "Quem se candidatou confirmou: 7 de cada 10 ou mais disseram que a empresa respondeu, nos últimos 90 dias.",
    "a explicação de quem confirmou",
    vis[0].explicacao,
  );
  conferir(vis[1].texto === "Bem avaliada · 4,7", "a nota com vírgula", vis[1].texto);
  conferir(vis[1].explicacao.includes("12 avaliações"), "quantas avaliações", vis[1].explicacao);
  conferir(vis[2].texto === "Contratou 3 pelo Publike", "quantas contratações", vis[2].texto);
  conferir(vis.map((x) => x.curto).join("|") === "Responde rápido|4,7|Contratou pelo Publike", "os textos curtos do tíquete", vis);

  vis = sl.selosVisiveis({ ...todos, respondePor: "painel", contratou: 1 }, "pessoa");
  conferir(
    vis[0].explicacao === "Quem publicou responde 7 de cada 10 candidaturas ou mais pelo Publike, em geral em até 2 dias.",
    "pessoa, pelo painel: quem publicou",
    vis[0].explicacao,
  );
  conferir(vis[2].texto === "Contratou pelo Publike" && vis[2].explicacao.startsWith("Uma pessoa"), "uma contratação", vis[2]);
  conferir(sl.selosVisiveis(todos, "agencia")[0].explicacao.includes("a agência"), "agência");
  // bem avaliada sem nota: não mostra um número inventado
  conferir(
    sl.selosVisiveis({ ...nenhum, bemAvaliada: true, nota: null }).length === 0,
    "bem avaliada sem a nota: nada",
  );

  // --- 2. Os pontos na linha do tempo ------------------------------------------------------------------------------
  conferir(sl.pontosDosSelos(null) === 0 && sl.pontosDosSelos(nenhum) === 0, "sem selo, sem pontos");
  conferir(sl.pontosDosSelos(todos) === 16, "os três: 8 + 5 + 3", sl.pontosDosSelos(todos));
  conferir(sl.pontosDosSelos({ ...nenhum, respondeRapido: true }) === 8, "só o responde: 8");
  const base = {
    tipo: "vaga",
    titulo: "Auxiliar de cozinha",
    categoria: "alimentacao",
    bairro: "Setor Oeste",
    autor_id: "a",
    criado_em: new Date(AGORA - 3 * DIA).toISOString(),
    prioridade: 1,
    distancia_km: 6,
    minha_curtida: null,
  };
  const comSelo = { ...base, id: "com", selos: todos };
  const semSelo = { ...base, id: "sem", autor_id: "b" };
  const ordem = r.ordenarPorRelevancia([semSelo, comSelo], r.SEM_SINAIS, new Map(), AGORA).map((a) => a.id);
  conferir(ordem.join() === "com,sem", "no mesmo lugar, quem tem selo vem antes", ordem);
  conferir(
    r.relevanciaParaVoce(comSelo, r.SEM_SINAIS, null, AGORA) - r.relevanciaParaVoce(semSelo, r.SEM_SINAIS, null, AGORA) === 16,
    "a diferença é a dos selos",
  );
  // mais perto ganha: a 1 km sem selo antes da de 12 km com os três selos
  const perto = { ...semSelo, id: "perto", distancia_km: 1, prioridade: 0 };
  const longe = { ...comSelo, id: "longe", distancia_km: 12, prioridade: 2 };
  const ordemPerto = r.ordenarPorRelevancia([longe, perto], r.SEM_SINAIS, new Map(), AGORA).map((a) => a.id);
  conferir(ordemPerto.join() === "perto,longe", "o selo não passa na frente do que está mais perto", ordemPerto);
  // serviço não muda
  const servico = { ...comSelo, tipo: "servico" };
  conferir(
    r.relevanciaParaVoce(servico, r.SEM_SINAIS, null, AGORA) ===
      r.relevanciaParaVoce({ ...servico, selos: null }, r.SEM_SINAIS, null, AGORA),
    "serviço não ganha pontos de selo",
  );

  // --- 3. O painel: o que falta ------------------------------------------------------------------------------------
  const situacao = (x: any = {}) =>
    sl.situacaoDosSelosDoBanco({
      responde_rapido: false,
      responde_por: null,
      bem_avaliada: false,
      nota: null,
      avaliacoes: 0,
      contratou: 0,
      te_sim: 0,
      te_ainda_nao: 0,
      resposta_taxa: null,
      resposta_horas: null,
      resposta_automaticas: null,
      parado: null,
      sem_resposta: 0,
      denuncia: false,
      suspensa: false,
      contratou_total: 0,
      vagas_no_ar: 2,
      ...x,
    })!;
  conferir(sl.situacaoDosSelosDoBanco(null) === null && sl.situacaoDosSelosDoBanco("x") === null, "sem dados: nada");
  let itens = sl.oQueFalta(situacao());
  conferir(itens.map((i) => `${i.chave}:${i.ganho}`).join() === "responde:false,avaliada:false,contratou:false", "a conta nova", itens);
  conferir(itens[0].texto.startsWith("Dois dias depois de cada contato"), "sem respostas ainda: como funciona", itens[0].texto);
  conferir(itens[1].texto.startsWith("Ainda sem avaliações"), "sem avaliações", itens[1].texto);
  conferir(itens[2].texto.startsWith("Conte quem você contratou"), "como ganhar o contratou", itens[2].texto);

  itens = sl.oQueFalta(situacao({ te_sim: 1, te_ainda_nao: 1 }));
  conferir(itens[0].texto.startsWith("Até agora, 2 pessoas responderam (1 disse que sim)"), "menos de 3 respostas", itens[0].texto);
  itens = sl.oQueFalta(situacao({ te_sim: 2, te_ainda_nao: 3 }));
  conferir(
    itens[0].texto.startsWith("Das 5 pessoas que responderam, 2 disseram que você respondeu. Para o selo, 7 de cada 10"),
    "5 respostas, 2 sim",
    itens[0].texto,
  );
  itens = sl.oQueFalta(situacao({ te_sim: 2, te_ainda_nao: 3, resposta_taxa: 0.4, resposta_horas: 30, resposta_automaticas: 0.1, parado: false }));
  conferir(itens[0].texto.includes("Pelo Publike, você responde 4 de cada 10 candidaturas, em geral em 1 dia."), "o outro caminho, pelo Publike", itens[0].texto);
  itens = sl.oQueFalta(situacao({ resposta_taxa: 1, resposta_horas: 0, resposta_automaticas: 1, parado: false }));
  conferir(itens[0].texto.includes("a maior parte das respostas é automática"), "contato direto não conta", itens[0].texto);
  itens = sl.oQueFalta(situacao({ resposta_taxa: 0.9, resposta_horas: 5, resposta_automaticas: 0, parado: true }));
  conferir(itens[0].texto.includes("Entre no Publike pelo menos uma vez por semana"), "parado", itens[0].texto);
  itens = sl.oQueFalta(situacao({ sem_resposta: 2, te_sim: 4 }));
  conferir(
    itens[0].texto.startsWith('2 vagas estão com o "Ainda está aberta?" sem resposta') &&
      itens[0].link?.href === "/painel/anuncios?tipo=vaga",
    "o Ainda está aberta? sem resposta, com o link",
    itens[0],
  );
  itens = sl.oQueFalta(situacao({ denuncia: true, te_sim: 4, avaliacoes: 5, nota: 5 }));
  conferir(itens.every((i) => !i.ganho && i.texto.includes("denúncia confirmada")), "denúncia: nenhum selo", itens);
  itens = sl.oQueFalta(situacao({ suspensa: true }));
  conferir(itens.every((i) => i.texto.startsWith("Com a conta suspensa")), "suspensa", itens);
  itens = sl.oQueFalta(
    situacao({ responde_rapido: true, responde_por: "pessoas", te_sim: 8, te_ainda_nao: 2, bem_avaliada: true, nota: 4.8, avaliacoes: 6, contratou: 2 }),
  );
  conferir(itens.every((i) => i.ganho), "com os três", itens);
  conferir(itens[0].texto === "8 de cada 10 pessoas que se candidataram disseram que você respondeu.", "o número de quem confirmou", itens[0].texto);
  conferir(itens[1].texto === "Nota 4,8 em 6 avaliações do seu processo seletivo.", "a nota", itens[1].texto);
  conferir(itens[2].texto === "2 pessoas que se candidataram pelo Publike foram contratadas por você.", "as contratações", itens[2].texto);
  itens = sl.oQueFalta(situacao({ responde_rapido: true, responde_por: "painel", resposta_taxa: 0.9, resposta_horas: 5 }));
  conferir(itens[0].texto === "Você responde 9 de cada 10 candidaturas pelo Publike, em geral no mesmo dia.", "pelo painel", itens[0].texto);
  itens = sl.oQueFalta(situacao({ responde_rapido: true, responde_por: "painel", resposta_taxa: 1, resposta_horas: 10 }));
  conferir(itens[0].texto === "Você responde todas as candidaturas pelo Publike, em geral no mesmo dia.", "todas", itens[0].texto);
  itens = sl.oQueFalta(situacao({ avaliacoes: 2, nota: 4.9 }));
  conferir(itens[1].texto.startsWith("Nota 4,9 em 2 avaliações. Para o selo"), "faltam avaliações", itens[1].texto);

  // --- 4. O filtro "Com selo" -------------------------------------------------------------------------------------
  const lidos = f.lerFiltros({ tipo: "vaga", selo: "1" });
  conferir(lidos.selo === true, "selo=1 liga o filtro em Vagas", lidos.selo);
  conferir(f.hrefFiltros(lidos).includes("selo=1"), "o link guarda o filtro", f.hrefFiltros(lidos));
  conferir(f.lerFiltros({ tipo: "servico", selo: "1" }).selo === false, "em Serviços, não vale");
  conferir(f.aplicarIntencao({ ...lidos, tipo: null }, "servico").selo === false, "a intenção de serviço tira o filtro");
  conferir(f.filtrosMudados(lidos) === f.filtrosMudados({ ...lidos, selo: false }) + 1, "conta como filtro mudado");
  conferir(f.SEM_FILTROS.selo === false, "Limpar filtros desliga");

  // --- 5. O robô das filas ------------------------------------------------------------------------------------------
  pedidos = [];
  resposta = () => json(2);
  let robo = await filas.calcularSelos();
  conferir(robo.contas === 2 && !robo.motivo, "o robô conta as contas refeitas", robo);
  conferir(pedidos[0]?.p_chave === "c".repeat(40) && !("p_agora" in (pedidos[0] ?? {})), "com a chave, a cada meia hora", pedidos[0]);
  resposta = () => json({ code: "PGRST202", details: null, hint: null, message: "Could not find the function" }, 404);
  robo = await filas.calcularSelos();
  conferir(robo.contas === 0 && !robo.motivo, "sem a migração: nada, sem erro", robo);
  resposta = () => json({ code: "XX000", details: null, hint: null, message: "falhou" }, 500);
  const erroAntes = console.error;
  console.error = () => {};
  robo = await filas.calcularSelos();
  console.error = erroAntes;
  conferir(robo.contas === 0 && Boolean(robo.motivo), "com falha: o motivo vai para o resumo da fila", robo);

  console.log(`${total - falhas} de ${total} conferências passaram`);
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
