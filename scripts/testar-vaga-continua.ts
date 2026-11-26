// A vaga ainda está aberta? (migração 20271003120000; Marcelo, com a vaga da Organiza Inventory: 28 dias no ar e 38
// curtidas), sem banco e sem a Meta: o `fetch` é trocado por respostas prontas. Confere os textos de cada estado no
// cartão e na página da vaga, o aviso do WhatsApp com os botões "Sim, continua" / "Já preenchi" (que voltam como
// `v:<id>:sim|preenchi`), o robô das filas e a vaga sem resposta descendo na linha. Roda com
// `npx tsx scripts/testar-vaga-continua.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.OPENAI_API_KEY = "sk-falsa";
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";
process.env.WHATSAPP_TOKEN = "token-falso";
process.env.WHATSAPP_PHONE_ID = "1234567";
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

// --- O mundo de mentira -------------------------------------------------------------------------------------------

let modelos: Record<string, unknown> = {};
let itens: any[] = [];
let enviados: any[] = [];
let marcas: any[] = [];
let pedidosDoRobo: any[] = [];
let respostaDoRobo: () => Response = () => json(3);

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (u.includes("graph.facebook.com") && u.includes("/messages")) {
    enviados.push(corpo);
    return json({ messages: [{ id: "wamid.saida" }] });
  }
  if (u.includes("/rpc/servidor_whatsapp_config"))
    return json({ ativo: true, para_todos: true, conferidos_em: new Date().toISOString(), modelos });
  if (u.includes("/rpc/servidor_whatsapp_pegar")) return json({ itens });
  if (u.includes("/rpc/servidor_whatsapp_marcar")) {
    marcas.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/servidor_perguntar_se_continua")) {
    pedidosDoRobo.push(corpo);
    return respostaDoRobo();
  }
  if (u.includes("/rpc/")) return json(null);
  return json(null);
}) as typeof fetch;

const CONTA = "aaaaaaaa-1111-2222-3333-444444444444";
const VAGA = "bbbbbbbb-1111-2222-3333-444444444444";
const DIA = 24 * 3600 * 1000;
const AGORA = Date.parse("2026-11-25T15:00:00Z");

const aviso = (x: any = {}) => ({
  id: 77,
  tipo: "vaga_continua",
  conta_id: CONTA,
  numero: "556282028335",
  quantos: 1,
  anuncio_id: VAGA,
  ator_id: null,
  tentativas: 1,
  aviso: { tipo: "vaga_continua", link: `/painel/anuncio/${VAGA}/continua`, recado_id: null, texto: "" },
  dados: {
    nome: "Organiza Inventory",
    conta_tipo: "empresa",
    vaga: "Auxiliar de inventário",
    anuncio_tipo: "vaga",
    empresa: null,
    ator: null,
    esperando: 0,
    entrevista: null,
  },
  ...x,
});

async function main() {
  const v = await import("../src/lib/vaga-continua");
  const w = await import("../src/lib/servidor/whatsapp");
  const filas = await import("../src/lib/servidor/filas");
  const r = await import("../src/lib/relevancia");
  modelos = Object.fromEntries(w.MODELOS.map((m) => [m.nome, { status: "APPROVED", categoria: m.categoria ?? "UTILITY" }]));

  // --- 1. Os estados que vêm do banco ----------------------------------------------------------------------------
  const s = (estado: string | null, extra: any = {}) => v.situacaoDoBanco({ estado, confirmada_em: null, pedi: false, ...extra });
  conferir(s("inventado").estado === null, "estado desconhecido: nada", s("inventado"));
  conferir(s("confirmada", { pedi: null }).pedi === false, "pedi nulo: falso");
  conferir(v.linhaDaContinua(null, AGORA) === null && v.linhaDaContinua(s(null), AGORA) === null, "sem estado: nada no cartão");

  // confirmada (quem publicou confirmou ou renovou nos últimos 7 dias)
  const ontem = new Date(AGORA - DIA).toISOString();
  let l = v.linhaDaContinua(s("confirmada", { confirmada_em: ontem }), AGORA);
  conferir(l?.tipo === "confirmada" && l.texto === "Confirmada aberta ontem", "confirmada ontem", l);
  l = v.linhaDaContinua(s("confirmada", { confirmada_em: new Date(AGORA - 3 * DIA).toISOString() }), AGORA, { cartao: true });
  conferir(l?.tipo === "confirmada" && l.texto === "Confirmada aberta há 3 dias", "confirmada há 3 dias, também no cartão", l);
  l = v.linhaDaContinua(s("confirmada"), AGORA);
  conferir(l?.texto === "Confirmada aberta", "confirmada sem a data", l);
  // a confirmação vale mais que o pedido de quem vê
  l = v.linhaDaContinua(s("confirmada", { pedi: true }), AGORA);
  conferir(l?.tipo === "confirmada", "confirmada, mesmo com o pedido em aberto", l);

  // quem vê perguntou e espera a resposta
  for (const estado of ["aguardando", "sem_resposta", "pode_perguntar"]) {
    l = v.linhaDaContinua(s(estado, { pedi: true }), AGORA, { cartao: true, curtidas: 0 });
    conferir(
      l?.tipo === "perguntou" && l.texto === "Você perguntou se continua aberta. Avisamos quando a empresa responder.",
      `perguntou (${estado}): a espera, sem outro botão`,
      l,
    );
  }

  // o Publike perguntou há menos de 3 dias
  l = v.linhaDaContinua(s("aguardando"), AGORA, { cartao: true });
  conferir(l?.tipo === "aguardando" && l.texto === "Perguntamos à empresa se continua aberta", "aguardando a empresa", l);

  // 3 dias sem resposta: no cartão, o aviso; na página, o aviso e o "Perguntar de novo"
  l = v.linhaDaContinua(s("sem_resposta"), AGORA, { cartao: true, curtidas: 38 });
  conferir(l?.tipo === "sem_resposta" && l.texto === "A empresa não confirmou se continua aberta", "sem resposta, no cartão", l);
  l = v.linhaDaContinua(s("sem_resposta"), AGORA);
  conferir(
    l?.tipo === "perguntar" && l.texto === "A empresa não confirmou se continua aberta." && l.botao === "Perguntar de novo",
    "sem resposta, na página: perguntar de novo",
    l,
  );

  // a vaga antiga: no cartão, o botão só com 10 curtidas ou mais; na página, sempre
  conferir(v.CURTIDAS_PARA_O_CARTAO === 10, "o botão no cartão a partir de 10 curtidas");
  l = v.linhaDaContinua(s("pode_perguntar"), AGORA, { cartao: true, curtidas: 9 });
  conferir(l === null, "9 curtidas: sem o botão no cartão", l);
  l = v.linhaDaContinua(s("pode_perguntar"), AGORA, { cartao: true, curtidas: null });
  conferir(l === null, "sem o número de curtidas: sem o botão no cartão", l);
  l = v.linhaDaContinua(s("pode_perguntar"), AGORA, { cartao: true, curtidas: 38 });
  conferir(l?.tipo === "perguntar" && l.botao === "Ainda está aberta?" && l.texto === "", "38 curtidas: o botão no cartão", l);
  l = v.linhaDaContinua(s("pode_perguntar"), AGORA, { curtidas: 0 });
  conferir(l?.tipo === "perguntar" && l.botao === "Ainda está aberta?", "na página: o botão mesmo sem curtidas", l);

  conferir(v.semResposta(s("sem_resposta")) && !v.semResposta(s("aguardando")) && !v.semResposta(null), "só a sem resposta desce");

  // --- 2. O aviso do WhatsApp para quem publicou ------------------------------------------------------------------
  const modelo = w.MODELOS.find((m) => m.nome === "publike_vaga_continua");
  conferir(Boolean(modelo) && modelo?.aviso === "vaga_continua", "o modelo do aviso existe", modelo?.nome);
  if (modelo) {
    const variaveis = [...modelo.corpo.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    conferir(
      variaveis.length === 2 && variaveis.every((x) => x in modelo.exemplo),
      "as variáveis do corpo têm exemplo (a Meta pede)",
      variaveis,
    );
    conferir(modelo.corpo.length <= 1024, "o corpo cabe no limite da Meta", modelo.corpo.length);
    conferir(
      modelo.botoes.length === 2 &&
        modelo.botoes.every((b) => b.tipo === "resposta" && b.texto.length <= 25) &&
        modelo.botoes.map((b: any) => b.valor).join() === "sim,preenchi",
      "os dois botões de resposta (até 25 letras)",
      modelo.botoes,
    );
  }

  let montada: any = w.montarMensagem(aviso() as any);
  conferir(
    montada.modelo === "publike_vaga_continua" &&
      montada.params?.nome === "Organiza Inventory" &&
      montada.params?.vaga === "Auxiliar de inventário",
    "o aviso vira o modelo, com o nome e a vaga",
    montada,
  );
  conferir(montada.respostas?.join() === "v:77:sim,v:77:preenchi", "os botões levam o aviso e a resposta", montada.respostas);
  montada = w.montarMensagem(aviso({ dados: { ...aviso().dados, vaga: null } }) as any);
  conferir("pular" in montada, "sem a vaga: não manda", montada);

  // na fila: sai com os botões de resposta
  itens = [aviso()];
  enviados = [];
  marcas = [];
  await w.enviarWhatsappPendentes();
  const saiu = enviados.find((e) => e?.type === "template");
  const botoes = (saiu?.template?.components ?? []).filter((c: any) => c.type === "button");
  conferir(saiu?.template?.name === "publike_vaga_continua", "o aviso sai pelo modelo novo", saiu?.template?.name);
  conferir(
    botoes.length === 2 &&
      botoes.every((b: any) => b.sub_type === "quick_reply") &&
      botoes.map((b: any) => b.parameters?.[0]?.payload).join() === "v:77:sim,v:77:preenchi",
    "os botões voltam como v:<id>:sim e v:<id>:preenchi",
    botoes,
  );
  conferir(marcas.some((m) => m.p_situacao === "enviada"), "o aviso fica como enviado", marcas);

  // o modelo ainda em análise na Meta: o aviso espera na fila (o sino, o celular e o e-mail já saíram)
  modelos = { ...modelos, publike_vaga_continua: { status: "PENDING", categoria: "UTILITY" } };
  itens = [aviso()];
  enviados = [];
  marcas = [];
  await w.enviarWhatsappPendentes();
  conferir(
    enviados.length === 0 && marcas.some((m) => m.p_situacao === "pendente" && m.p_tentar_em_minutos === 30),
    "modelo em análise: espera e tenta em 30 minutos",
    marcas,
  );

  // --- 3. O robô das filas ---------------------------------------------------------------------------------------
  pedidosDoRobo = [];
  respostaDoRobo = () => json(3);
  let robo = await filas.perguntarSeContinua();
  conferir(robo.perguntas === 3 && !robo.motivo, "o robô conta as perguntas", robo);
  conferir(
    pedidosDoRobo[0]?.p_chave === "c".repeat(40) && pedidosDoRobo[0]?.p_limite === 50 && !("p_agora" in (pedidosDoRobo[0] ?? {})),
    "com a chave do servidor, 50 por vez e no horário (8h às 20h)",
    pedidosDoRobo[0],
  );
  respostaDoRobo = () => json({ code: "PGRST202", details: null, hint: null, message: "Could not find the function" }, 404);
  robo = await filas.perguntarSeContinua();
  conferir(robo.perguntas === 0 && !robo.motivo, "sem a migração: nada, sem erro", robo);
  respostaDoRobo = () => json({ code: "XX000", details: null, hint: null, message: "falhou" }, 500);
  const erroAntes = console.error;
  console.error = () => {};
  robo = await filas.perguntarSeContinua();
  console.error = erroAntes;
  conferir(robo.perguntas === 0 && Boolean(robo.motivo), "com falha: o motivo vai para o resumo da fila", robo);

  // --- 4. A vaga sem resposta desce na linha ---------------------------------------------------------------------
  conferir(r.pontosDaConfirmacao(true) === -20 && r.pontosDaConfirmacao(false) === 0 && r.pontosDaConfirmacao(undefined) === 0, "−20 sem resposta");
  const base = {
    tipo: "vaga",
    titulo: "Auxiliar de inventário",
    categoria: "administrativo",
    bairro: "Setor Bueno",
    autor_id: CONTA,
    prioridade: 1,
    distancia_km: 3,
    minha_curtida: null,
  };
  const velha = { ...base, id: "velha", criado_em: new Date(AGORA - 28 * DIA).toISOString(), emAlta: { total: 38, ultima: new Date(AGORA - DIA).toISOString() } };
  const outra = { ...base, id: "outra", criado_em: new Date(AGORA - 20 * DIA).toISOString(), autor_id: "outro" };
  const notaCom = r.relevanciaParaVoce({ ...velha }, r.SEM_SINAIS, null, AGORA);
  const notaSem = r.relevanciaParaVoce({ ...velha, semResposta: true }, r.SEM_SINAIS, null, AGORA);
  conferir(notaCom - notaSem === 20, "a mesma vaga, sem resposta: 20 pontos a menos", { notaCom, notaSem });
  const ordem = r.ordenarPorRelevancia([{ ...velha, semResposta: true }, outra], r.SEM_SINAIS, new Map(), AGORA).map((a) => a.id);
  conferir(ordem.join() === "outra,velha", "a sem resposta fica atrás da outra", ordem);
  const ordemCom = r.ordenarPorRelevancia([outra, { ...velha }], r.SEM_SINAIS, new Map(), AGORA).map((a) => a.id);
  conferir(ordemCom[0] === "velha", "confirmada (ou sem pergunta), a com curtidas continua na frente", ordemCom);
  // o que não é vaga não muda
  const servico = { ...velha, tipo: "servico" };
  conferir(
    r.relevanciaParaVoce({ ...servico, semResposta: true }, r.SEM_SINAIS, null, AGORA) ===
      r.relevanciaParaVoce(servico, r.SEM_SINAIS, null, AGORA),
    "serviço não perde pontos",
  );

  console.log(`${total - falhas} de ${total} conferências passaram`);
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
