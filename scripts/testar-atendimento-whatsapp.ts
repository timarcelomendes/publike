// O atendimento pelo WhatsApp (src/lib/servidor/atendimento-whatsapp.ts, claude/plano-whatsapp-atendimento.md), sem
// banco, sem a Meta e sem a IA: o `fetch` é trocado por respostas prontas e o banco é um objeto. Confere as respostas
// prontas, a espera das mensagens seguidas, os botões, as vagas, o áudio, a localização, a equipe e o pedido que vai
// para a IA. Roda com `npx tsx scripts/testar-atendimento-whatsapp.ts` (sai com erro se algo mudou).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

// fora do Next, o pacote "server-only" dá erro de propósito: aqui ele vira um módulo vazio, antes de importar o
// atendimento (que é "server-only")
const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.OPENAI_API_KEY = "sk-falsa";
process.env.ANTHROPIC_API_KEY = "sk-ant-falsa";
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";

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

let enviados: any[] = [];
let pedidosIA: any[] = [];
let pedidosClaude: any[] = [];
let buscas: any[] = [];
let transcricoes = 0;
let respostaIA: any = {};
let falharInterativo = false;
let falharArquivo = false;
let falaTranscrita = "Oi, tudo bem? Queria saber como funciona";
let modeloEscolhido = "gpt-6-luna";
const vagaCozinheira = {
  id: "11111111-1111-1111-1111-111111111111",
  titulo: "Cozinheira",
  bairro: "Setor Bueno",
  cidade: "Goiânia",
  pagamento_valor: 2200,
  pagamento_unidade: "mes",
  tipo: "vaga",
};

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (u.includes("graph.facebook.com") && u.includes("/messages")) {
    enviados.push(corpo);
    if (falharInterativo && corpo.type === "interactive")
      return json({ error: { message: "interativo recusado", code: 131009 } }, 400);
    return json({ messages: [{ id: "wamid.saida" }] });
  }
  // o áudio: a Meta dá o endereço pelo id, e o arquivo vem desse endereço
  if (u.includes("graph.facebook.com") && u.includes("midia-1"))
    return falharArquivo
      ? json({ error: { message: "não achou", code: 100 } }, 404)
      : json({ url: "https://lookaside.fbsbx.com/arquivo-1", mime_type: "audio/ogg; codecs=opus", file_size: 9000 });
  if (u.includes("lookaside.fbsbx.com")) return new Response(new Blob([new Uint8Array(9000)], { type: "audio/ogg" }));
  if (u.includes("/audio/transcriptions")) {
    transcricoes++;
    return json({ text: falaTranscrita, usage: { input_tokens: 10, output_tokens: 10 } });
  }
  if (u.includes("/responses")) {
    pedidosIA.push(corpo);
    return json({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(respostaIA) }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  }
  if (u.includes("anthropic.com")) {
    pedidosClaude.push(corpo);
    return json({
      content: [{ type: "text", text: JSON.stringify(respostaIA) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 20000 },
    });
  }
  if (u.includes("/rpc/config_publica"))
    return json([{ ia_melhorar_texto: true, ia_modelo: modeloEscolhido, ia_modelos: {}, ia_apelido: null }]);
  if (u.includes("/rpc/ia_reserva")) return json(false);
  if (u.includes("/rpc/buscar_anuncios")) {
    buscas.push(corpo);
    if (corpo.p_texto === "motori")
      return json([{ ...vagaCozinheira, id: "22222222-2222-2222-2222-222222222222", titulo: "Motorista entregador" }]);
    return json(/cozinh/.test(corpo.p_texto ?? "") || corpo.p_por_distancia ? [vagaCozinheira] : []);
  }
  return json(null);
}) as typeof fetch;

async function main() {
  const a = await import("../src/lib/servidor/atendimento-whatsapp");

  // --- Ler a mensagem -------------------------------------------------------------------------------------------
  conferir(a.soCumprimento("Oi"), "Oi é cumprimento");
  conferir(a.soCumprimento("Boa tarde, tudo bem?"), "Boa tarde, tudo bem? é cumprimento");
  conferir(a.soCumprimento("Oi, beleza?"), "Oi, beleza? é cumprimento");
  conferir(!a.soCumprimento("beleza"), "beleza sozinho não é cumprimento");
  conferir(a.soConfirmacao("ok"), "ok é confirmação");
  conferir(a.soConfirmacao("Beleza, vou dar uma olhada"), "vou dar uma olhada é confirmação");
  conferir(!a.soConfirmacao("valeu"), "valeu é agradecimento, não confirmação");
  conferir(!a.soConfirmacao("sim"), "sim responde uma pergunta: não é confirmação");
  conferir(a.soAgradecimento("Muito obrigada pela ajuda!"), "obrigada pela ajuda é agradecimento");
  conferir(!a.soAgradecimento("obrigado, mas tem vaga de motorista?"), "obrigado com pergunta não é só agradecimento");
  conferir(a.pedidoGeral("Olá! Posso ter mais informações sobre isso?"), "o texto do anúncio é pedido geral");
  conferir(!a.pedidoGeral("tenho interesse na vaga de motorista"), "a vaga de motorista não é pedido geral");
  conferir(a.codigoDaMeta("79680 é seu código do Instagram. Não compartilhe."), "o código da Meta");
  conferir(a.primeiroNome("~Raphael") === "Raphael", "~Raphael vira Raphael");
  conferir(a.primeiroNome("Loja do Zé") === null, "Loja do Zé não é nome de gente");
  const bueno = a.lugarDaBusca("", "Setor Bueno");
  conferir(bueno?.cidade === "Goiânia" && bueno.regiao === "Sul", "Setor Bueno fica na Região Sul de Goiânia", bueno);
  conferir(a.lugarDaBusca("Anápolis", "Jundiaí")?.cidade === "Anápolis", "a cidade dita vale");
  conferir(a.lugarDaBusca("", "") === null, "sem cidade nem bairro, sem lugar");

  // quando a equipe responde (o horário de Brasília é UTC-3)
  const em = (iso: string) => a.quandoAEquipeResponde(new Date(iso));
  conferir(em("2026-11-18T17:00:00Z") === "em breve", "quarta, 14h: em breve");
  conferir(em("2026-11-18T10:00:00Z") === "hoje de manhã", "quarta, 7h: hoje de manhã");
  conferir(em("2026-11-18T23:00:00Z") === "amanhã de manhã", "quarta, 20h: amanhã de manhã");
  conferir(em("2026-11-20T22:00:00Z") === "na segunda de manhã", "sexta, 19h: na segunda de manhã");
  conferir(em("2026-11-21T13:00:00Z") === "na segunda de manhã", "sábado, 10h: na segunda de manhã");
  conferir(em("2026-11-23T09:00:00Z") === "hoje de manhã", "segunda, 6h: hoje de manhã");

  // --- A conversa -------------------------------------------------------------------------------------------------
  let saidas: any[] = [];
  let vagasJaEnviadas = 0;
  let entrada: any = {};
  let ultima: any = null; // null: a mesma mensagem e a conversa da entrada
  let entradas: any[] = [];
  let wamidAtual = "w1";
  const base = (x: any) => ({
    chave: "557799255259",
    nova: false,
    nome: "~Raphael",
    perfil: null,
    situacao: "robo",
    pediu_equipe: false,
    respostas_hoje: 0,
    limite: 30,
    ligado: true,
    origem: null,
    conta: null,
    historico: [],
    ...x,
  });
  const banco: any = {
    rpc: async (nome: string, args: any) => {
      if (nome === "servidor_whatsapp_conversa_entrada") {
        entradas.push(args);
        return { data: entrada, error: null };
      }
      if (nome === "servidor_whatsapp_conversa_ultima")
        return {
          data: ultima ?? {
            wamid: wamidAtual,
            situacao: entrada.situacao,
            perfil: entrada.perfil,
            historico: entrada.historico,
          },
          error: null,
        };
      // o Publicar pelo WhatsApp (migração 20270806120000) fica desligado nesta bateria: não é uma saída
      if (nome === "servidor_whatsapp_vagas_config") return { data: { ligado: false }, error: null };
      // as vagas do dia (migração 20270807120000): quantas já foram hoje
      if (nome === "servidor_whatsapp_vagas_enviadas") return { data: vagasJaEnviadas, error: null };
      saidas.push({ nome, ...args });
      return { data: null, error: null };
    },
  };
  const cfg: any = { base: "https://graph.facebook.com/v24.0", token: "t", phoneId: "1" };
  const quarta14h = new Date("2026-11-18T17:00:00Z");
  const rodar = async (texto: string, x: any, extra: any = {}) => {
    enviados = [];
    saidas = [];
    pedidosIA = [];
    pedidosClaude = [];
    buscas = [];
    entradas = [];
    wamidAtual = extra.wamid ?? "w1";
    entrada = base(x);
    await a.atenderConversa(
      cfg,
      banco,
      "k",
      {
        wamid: extra.wamid ?? "w1",
        numero: "5577999255259",
        texto,
        payload: extra.payload ?? null,
        nome: "~Raphael",
        origem: null,
        audio: extra.audio ?? null,
        local: extra.local ?? null,
      },
      { espera: { texto: 0, botao: 0 }, agora: extra.agora ?? quarta14h },
    );
    return { msgs: enviados.filter((e) => e.type), lidas: enviados.filter((e) => e.status === "read") };
  };
  const corpo = (e: any) => e?.text?.body ?? e?.interactive?.body?.text ?? "";
  const botao = (e: any) => e?.interactive?.action?.parameters?.display_text ?? null;
  const ia = (resposta: string, x: Partial<Record<string, unknown>> = {}) => ({
    resposta,
    perfil: "indefinido",
    acao: "responder",
    link: "nenhum",
    busca: { texto: "", categoria: "todas", cidade: "", bairro: "" },
    ...x,
  });
  const comBotoes = (t: string) => `${t}\n\n[Botões: Procuro trabalho · Quero contratar · Falar com a equipe]`;
  const comeco = [
    { de: "pessoa", texto: "Olá" },
    { de: "robo", texto: comBotoes("Oi, Raphael! 👋 Aqui é o Marcelo, do Publike.") },
  ];
  const procurando = [
    ...comeco,
    { de: "pessoa", texto: "Procuro trabalho" },
    { de: "robo", texto: "Que bom! Para quem procura trabalho, funciona assim: ...\n\n[Botão: Ver vagas]" },
  ];

  // 1. o "Posso ter mais informações?" do anúncio: as boas-vindas prontas, com os 3 botões, sem IA
  let r = await rodar("Olá! Posso ter mais informações sobre isso?", {
    historico: [{ de: "pessoa", texto: "Olá! Posso ter mais informações sobre isso?" }],
  });
  conferir(r.msgs[0]?.interactive?.action?.buttons?.length === 3, "boas-vindas com os 3 botões", r.msgs);
  conferir(pedidosIA.length === 0, "boas-vindas sem IA");
  conferir(
    corpo(r.msgs[0]).startsWith("Oi, Raphael! 👋 Aqui é o Marcelo, do Publike."),
    "chama pelo nome e é o Marcelo",
  );
  conferir(
    saidas[0]?.p_texto.endsWith("[Botões: Procuro trabalho · Quero contratar · Falar com a equipe]"),
    "guarda os botões",
  );

  // 2. dois "Oi" seguidos: uma resposta só
  r = await rodar("Oi", {
    historico: [
      { de: "pessoa", texto: "Oi" },
      { de: "pessoa", texto: "Oi" },
    ],
  });
  conferir(r.msgs.length === 1 && corpo(r.msgs[0]).includes("Aqui é o Marcelo"), "dois Oi: uma resposta");

  // 3. chegou outra mensagem durante a espera: esta deixa a resposta para a mais nova
  ultima = { wamid: "w2", situacao: "robo", perfil: null, historico: [{ de: "pessoa", texto: "Oi" }] };
  r = await rodar("Oi", { historico: [{ de: "pessoa", texto: "Oi" }] });
  conferir(r.msgs.length === 0 && saidas.length === 0, "a mais antiga não responde");
  // a equipe pegou a conversa durante a espera
  ultima = { wamid: "w1", situacao: "equipe", perfil: null, historico: [] };
  r = await rodar("Oi", { historico: [{ de: "pessoa", texto: "Oi" }] });
  conferir(r.msgs.length === 0, "com a equipe no meio, não responde");
  ultima = null;

  // 4. os botões do começo, com o passo a passo e o botão do site
  r = await rodar(
    "Procuro trabalho",
    { perfil: "trabalho", historico: [...comeco, { de: "pessoa", texto: "Procuro trabalho" }] },
    { payload: "a:trabalho" },
  );
  conferir(botao(r.msgs[0]) === "Ver vagas" && saidas[0]?.p_perfil === "trabalho", "Procuro trabalho: Ver vagas");
  conferir(
    r.msgs[0]?.interactive?.action?.parameters?.url.includes("utm_campaign=atendimento"),
    "o botão leva a origem",
  );
  r = await rodar(
    "Quero contratar",
    { perfil: "contratar", historico: [...comeco, { de: "pessoa", texto: "Quero contratar" }] },
    { payload: "a:contratar" },
  );
  conferir(botao(r.msgs[0]) === "Publicar vaga grátis", "Quero contratar: Publicar vaga grátis");

  // 5. "Oi" de novo
  r = await rodar("oi", { perfil: "trabalho", historico: [...procurando, { de: "pessoa", texto: "oi" }] });
  conferir(
    corpo(r.msgs[0]) === "Oi, Raphael! Em que posso te ajudar?",
    "Oi de novo, sabendo o que quer",
    corpo(r.msgs[0]),
  );
  r = await rodar("Oi", { historico: [...comeco, { de: "pessoa", texto: "Oi" }] });
  conferir(
    r.msgs[0]?.interactive?.type === "button" && corpo(r.msgs[0]).startsWith("Estou por aqui"),
    "Oi logo depois das boas-vindas",
  );

  // 6. "ok", "👍" e "beleza" depois de conversar: nada, e "lida" sem o "digitando"
  for (const t of ["👍", "ok", "beleza, vou dar uma olhada"]) {
    r = await rodar(t, {
      perfil: "trabalho",
      historico: [
        ...procurando.slice(0, -1),
        { de: "robo", texto: "Pronto, a vaga está no botão abaixo." },
        { de: "pessoa", texto: t },
      ],
    });
    conferir(r.msgs.length === 0 && r.lidas.length === 1 && !r.lidas[0].typing_indicator, `${t}: sem resposta`, r.msgs);
  }
  // 7. "ok" depois de uma pergunta: a IA responde
  respostaIA = ia("Então me conta o que você faz e o bairro onde mora.", { perfil: "trabalho" });
  r = await rodar("ok", {
    perfil: "trabalho",
    historico: [
      ...procurando.slice(0, -1),
      { de: "robo", texto: "Quer que eu procure vagas para você?" },
      { de: "pessoa", texto: "ok" },
    ],
  });
  conferir(pedidosIA.length === 1 && r.msgs.length === 1, "ok depois de pergunta vai para a IA");

  // 8. "obrigado": a despedida pronta, uma vez
  r = await rodar("Muito obrigado!", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "Muito obrigado!" }],
  });
  conferir(corpo(r.msgs[0]).startsWith("Por nada!") && pedidosIA.length === 0, "obrigado: Por nada");
  r = await rodar("valeu", {
    perfil: "trabalho",
    historico: [
      ...procurando,
      { de: "robo", texto: "Por nada! 😊 Qualquer coisa, é só chamar." },
      { de: "pessoa", texto: "valeu" },
    ],
  });
  conferir(r.msgs.length === 0, "o segundo obrigado: sem resposta");

  // 9. o código da Meta: guardado, sem resposta e sem "lida"
  r = await rodar("79680 é seu código do Instagram. Não compartilhe.", {
    historico: [{ de: "pessoa", texto: "79680 é seu código do Instagram. Não compartilhe." }],
  });
  conferir(r.msgs.length === 0 && r.lidas.length === 0 && saidas.length === 0, "código da Meta: sem resposta");

  // 10. o áudio vira texto e segue como se fosse escrito
  falaTranscrita = "Oi, tudo bem? Queria saber como funciona";
  entrada = base({});
  r = await rodar(
    "[a pessoa mandou um áudio]",
    { historico: [{ de: "pessoa", texto: "🎤 Oi, tudo bem? Queria saber como funciona" }] },
    { audio: { id: "midia-1", tipo: "audio/ogg" } },
  );
  conferir(
    entradas[0]?.p_texto === "🎤 Oi, tudo bem? Queria saber como funciona",
    "o áudio entra como texto",
    entradas[0]?.p_texto,
  );
  conferir(transcricoes > 0 && corpo(r.msgs[0]).includes("Aqui é o Marcelo"), "o áudio de oi recebe as boas-vindas");
  // o áudio que não baixa: pede para escrever
  falharArquivo = true;
  r = await rodar(
    "[a pessoa mandou um áudio]",
    { perfil: "trabalho", historico: [...procurando, { de: "pessoa", texto: "[a pessoa mandou um áudio]" }] },
    { audio: { id: "midia-1", tipo: "audio/ogg" } },
  );
  conferir(
    corpo(r.msgs[0]).startsWith("Não consegui ouvir esse áudio"),
    "áudio sem arquivo: pede para escrever",
    corpo(r.msgs[0]),
  );
  falharArquivo = false;

  // 11. foto e arquivo
  r = await rodar("[a pessoa mandou uma foto]", {
    perfil: "contratar",
    historico: [...comeco, { de: "pessoa", texto: "[a pessoa mandou uma foto]" }],
  });
  conferir(botao(r.msgs[0]) === "Publicar vaga grátis", "foto de quem contrata: Publicar");
  r = await rodar("[a pessoa mandou um arquivo]", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "[a pessoa mandou um arquivo]" }],
  });
  conferir(botao(r.msgs[0]) === "Fazer meu currículo", "arquivo de quem procura: currículo");

  // 12. a localização: as vagas perto dela
  r = await rodar(
    "[a pessoa mandou uma localização]",
    { perfil: "trabalho", historico: [...procurando, { de: "pessoa", texto: "[a pessoa mandou uma localização]" }] },
    { local: { lat: -16.71, lng: -49.27 } },
  );
  conferir(
    buscas[0]?.p_lat === -16.71 && buscas[0]?.p_por_distancia === true,
    "busca do ponto que a pessoa mandou",
    buscas[0],
  );
  conferir(corpo(r.msgs[0]).startsWith("Olha as vagas no ar mais perto desse lugar"), "as vagas perto da localização");

  // 13. a IA procura vagas perto do bairro que a pessoa disse
  respostaIA = ia("Olha as vagas de cozinheira perto do Setor Bueno:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "cozinheira", categoria: "todas", cidade: "", bairro: "Setor Bueno" },
  });
  r = await rodar("sou cozinheira, moro no setor bueno", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou cozinheira, moro no setor bueno" }],
  });
  conferir(
    buscas[0]?.p_cidade === "Goiânia" && buscas[0]?.p_bairro === "Setor Bueno" && buscas[0]?.p_ordem === "perto",
    "busca perto do bairro",
    buscas[0],
  );
  conferir(
    corpo(r.msgs[0]).includes("*Cozinheira*") && corpo(r.msgs[0]).includes("/anuncio/1111"),
    "a vaga com o link",
  );

  // 13b. até 3 vagas por dia (migração 20270807120000): já foram 2, vai 1 e o aviso; já foram 3, nenhuma busca
  vagasJaEnviadas = 2;
  r = await rodar("sou cozinheira, moro no setor bueno", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou cozinheira, moro no setor bueno" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Cozinheira*") &&
      corpo(r.msgs[0]).includes("Por hoje são essas") &&
      botao(r.msgs[0]) === "Ver vagas",
    "a última vaga do dia, com Ver vagas",
    corpo(r.msgs[0]),
  );
  vagasJaEnviadas = 3;
  r = await rodar("tem de auxiliar de cozinha também?", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "tem de auxiliar de cozinha também?" }],
  });
  conferir(
    buscas.length === 0 && corpo(r.msgs[0]).startsWith("Hoje eu já te mandei 3 vagas") && botao(r.msgs[0]) === "Ver vagas",
    "passou de 3 no dia: amanhã tem mais, e o site",
    corpo(r.msgs[0]),
  );
  vagasJaEnviadas = 0;

  // 14. o pedido à IA: as instruções iguais sempre (para o cache), e a conversa na mensagem
  respostaIA = ia("Publicar a vaga é grátis.", { perfil: "contratar", link: "publicar" });
  r = await rodar("quanto custa publicar uma vaga?", {
    historico: [{ de: "pessoa", texto: "quanto custa publicar uma vaga?" }],
  });
  const primeiro = pedidosIA[0];
  conferir(
    primeiro?.input?.includes?.("Esta é a sua primeira mensagem") ||
      JSON.stringify(primeiro?.input).includes("Esta é a sua primeira mensagem"),
    "a mensagem diz que é a primeira",
  );
  conferir(JSON.stringify(primeiro?.input).includes("A pessoa se chama Raphael"), "a mensagem leva o nome");
  conferir(!String(primeiro?.instructions).includes("Raphael"), "as instruções não têm nada da conversa");
  conferir(botao(r.msgs[0]) === "Publicar vaga grátis", "o botão que a IA escolheu vai junto");
  respostaIA = ia("O Publike funciona em Goiânia, Anápolis e região.");
  await rodar("vocês são de onde?", {
    nome: "Outra Pessoa",
    historico: [{ de: "pessoa", texto: "vocês são de onde?" }],
  });
  conferir(pedidosIA[0]?.instructions === primeiro?.instructions, "as instruções são as mesmas em outra conversa");

  // 15. os botões do começo vão uma vez só
  r = await rodar("vocês são de onde?", { historico: [{ de: "pessoa", texto: "vocês são de onde?" }] });
  conferir(r.msgs[0]?.interactive?.type === "button", "sem saber o que quer: os botões, a primeira vez");
  r = await rodar("vocês são de onde?", { historico: [...comeco, { de: "pessoa", texto: "vocês são de onde?" }] });
  conferir(r.msgs[0]?.type === "text", "os botões não se repetem");

  // 16. o Claude guarda as instruções (o cache)
  modeloEscolhido = "claude-haiku-5-5";
  r = await rodar("vocês são de onde?", { historico: [...comeco, { de: "pessoa", texto: "vocês são de onde?" }] });
  const sistema = pedidosClaude[0]?.system;
  conferir(
    Array.isArray(sistema) && sistema[0]?.cache_control?.type === "ephemeral",
    "o Claude recebe as instruções para guardar",
    sistema?.[0]?.cache_control,
  );
  conferir(r.msgs.length === 1, "o Claude responde");
  modeloEscolhido = "gpt-6-luna";

  // 17. a equipe: pelo botão, de noite, e quando a IA passa
  r = await rodar(
    "Falar com a equipe",
    { pediu_equipe: true, historico: [...comeco, { de: "pessoa", texto: "Falar com a equipe" }] },
    { payload: "a:equipe", agora: new Date("2026-11-18T23:30:00Z") },
  );
  conferir(
    saidas[0]?.p_equipe === true && corpo(r.msgs[0]).includes("amanhã de manhã"),
    "Falar com a equipe, de noite",
    corpo(r.msgs[0]),
  );
  respostaIA = ia(
    "O Publike nunca cobra de quem procura trabalho: não pague nada. Vou pedir para alguém da equipe te responder por aqui.",
    { perfil: "trabalho", acao: "equipe" },
  );
  r = await rodar("me pediram 50 reais para a vaga", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "me pediram 50 reais para a vaga" }],
  });
  conferir(
    saidas[0]?.p_equipe === true && corpo(r.msgs[0]).includes("não pague"),
    "golpe: responde e passa para a equipe",
  );
  conferir(
    JSON.stringify(pedidosIA[0]?.input).includes("alguém responde por aqui em breve"),
    "a IA sabe quando a equipe responde",
  );
  r = await rodar("oi?", {
    perfil: "trabalho",
    respostas_hoje: 30,
    historico: [...procurando, { de: "pessoa", texto: "oi?" }],
  });
  conferir(
    saidas[0]?.p_equipe === true && corpo(r.msgs[0]).startsWith("Para continuar, vou pedir"),
    "passou do limite do dia",
    corpo(r.msgs[0]),
  );

  // 18. a mensagem com botão recusada: vai o texto com o link escrito
  falharInterativo = true;
  r = await rodar(
    "Procuro trabalho",
    { perfil: "trabalho", historico: [...comeco, { de: "pessoa", texto: "Procuro trabalho" }] },
    { payload: "a:trabalho" },
  );
  const texto = r.msgs.find((e) => e.type === "text");
  conferir(corpo(texto).includes("Ver vagas: https://publike.org/?tipo=vaga"), "sem o botão, o link escrito");
  conferir(!String(saidas[0]?.p_texto).includes("[Botão"), "sem o botão, a conversa não marca o botão");
  falharInterativo = false;

  // 19. a IA em silêncio
  respostaIA = ia("", { perfil: "trabalho", acao: "silencio" });
  r = await rodar("hmm entendi agora", {
    perfil: "trabalho",
    historico: [
      ...procurando,
      { de: "robo", texto: "Que tal olhar as vagas?" },
      { de: "pessoa", texto: "hmm entendi agora" },
    ],
  });
  conferir(r.msgs.length === 0, "silêncio: sem resposta");

  // 20. o "Boa tarde" recebe "Boa tarde"
  r = await rodar("Boa tarde", { historico: [{ de: "pessoa", texto: "Boa tarde" }] });
  conferir(
    corpo(r.msgs[0]).startsWith("Boa tarde, Raphael! 👋 Aqui é o Marcelo"),
    "Boa tarde: Boa tarde",
    corpo(r.msgs[0]),
  );
  conferir(
    a.cumprimentoDe(["oi, bom dia!"]) === "Bom dia" && a.cumprimentoDe(["olá"]) === "Oi",
    "o cumprimento da pessoa",
  );

  // 21. a foto de quem ainda não disse o que quer: os botões do começo
  r = await rodar("[a pessoa mandou uma foto]", { historico: [{ de: "pessoa", texto: "[a pessoa mandou uma foto]" }] });
  conferir(
    r.msgs[0]?.interactive?.type === "button" && corpo(r.msgs[0]).startsWith("Oi, Raphael! 👋 Aqui é o Marcelo"),
    "foto sem saber o que quer: apresentação e os botões",
    corpo(r.msgs[0]),
  );

  // 22. sem a função inteira, as parecidas, ditas como parecidas
  respostaIA = ia("Olha as vagas de motorista de app:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "motorista de app", categoria: "todas", cidade: "", bairro: "" },
  });
  r = await rodar("sou motorista de app", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou motorista de app" }],
  });
  conferir(
    corpo(r.msgs[0]).startsWith("Agora não achei vaga de motorista de app no ar. Olha as que mais se parecem:") &&
      corpo(r.msgs[0]).includes("*Motorista entregador*"),
    "as parecidas, ditas como parecidas",
    corpo(r.msgs[0]),
  );
  // a primeira mensagem sem vaga nenhuma leva a apresentação
  respostaIA = ia("Oi, Raphael! Aqui é o Marcelo, do Publike. Olha as vagas de pedreiro:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "pedreiro", categoria: "todas", cidade: "Goiânia", bairro: "" },
  });
  r = await rodar("tem vaga de pedreiro?", { historico: [{ de: "pessoa", texto: "tem vaga de pedreiro?" }] });
  conferir(
    corpo(r.msgs[0]).startsWith(
      "Oi, Raphael! 👋 Aqui é o Marcelo, do Publike.\n\nAgora não achei vaga de pedreiro no ar nessa região.",
    ) && botao(r.msgs[0]) === "Ver vagas",
    "sem vaga na primeira mensagem: apresentação e Ver vagas",
    corpo(r.msgs[0]),
  );

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
