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
let astronauta = false;
// sem vaga nenhuma no ar (para o "não achei"); e as mais novas, sem lugar
let semVagaNenhuma = false;
let recentes = false;
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

let semAprendiz = true;
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
    if (semVagaNenhuma) return json([]);
    if (recentes && !corpo.p_texto && corpo.p_ordem === "recentes") return json([vagaCozinheira]);
    // os programas vão pelo regime (21/11/2026): estágio tem, jovem aprendiz não
    if (corpo.p_regime === "estagio")
      return json([{ ...vagaCozinheira, id: "e".repeat(8) + vagaCozinheira.id.slice(8), titulo: "Estágio em Direito", regime: "estagio" }]);
    if (corpo.p_regime === "aprendiz" || corpo.p_regime === "trainee") return json(semAprendiz ? [] : [{ ...vagaCozinheira, id: "f".repeat(8) + vagaCozinheira.id.slice(8), titulo: "Auxiliar administrativo", regime: "aprendiz" }]);
    const t = corpo.p_texto ?? "";
    const vaga = (id: string, titulo: string, x: Record<string, unknown> = {}) => ({ ...vagaCozinheira, id: id.repeat(36).slice(0, 36), titulo, ...x });
    if (t === "motorista") return json([vaga("2", "Motorista entregador")]);
    // o mesmo trabalho com outro nome: assistente administrativo não tem, auxiliar administrativo tem
    if (t === "auxiliar administrativo") return json([vaga("8", "Auxiliar Administrativo")]);
    // serviços gerais só com carteira (o banco filtra o regime)
    if (t === "auxiliar de serviços gerais")
      return json(corpo.p_regime && corpo.p_regime !== "clt" ? [] : [vaga("9", "Auxiliar de Serviços Gerais", { regime: "clt" })]);
    // a mesma área: faxineira não tem; limpeza tem
    if (t === "limpeza") return json([vaga("a", "Auxiliar de limpeza")]);
    // a busca de texto também acha na descrição: o título de outra função não pode entrar
    if (t === "porteiro") return json([vaga("4", "Auxiliar de escritório"), vaga("3", "Porteiro noturno")]);
    // a área de um cargo de liderança: só o título de liderança entra
    if (t === "logística") return json([vaga("6", "Auxiliar de logística"), vaga("7", "Coordenador de Logística")]);
    // auxiliar de cozinha só longe (nas cidades em volta)
    if (t === "auxiliar de cozinha")
      return json(corpo.p_raio_km === 100 ? [vaga("5", "Auxiliar de cozinha", { cidade: "Trindade", bairro: "Centro", distancia_km: 24 })] : []);
    if (/cozinh/.test(t) || (!t && corpo.p_por_distancia && corpo.p_raio_km !== 100)) return json([vagaCozinheira]);
    // as mais perto de qualquer função, só para quem disse uma função que não existe aqui
    if (!t && astronauta) return json([vagaCozinheira]);
    return json([]);
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
  let teto: any = { teto: 5000, enviadas: 10, economico: false, respondida_hoje: false };
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
      // o teto do mês (migração 20270808120000)
      if (nome === "servidor_whatsapp_teto") return { data: teto, error: null };
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
      { espera: { texto: 0, botao: 0 }, agora: extra.agora ?? quarta14h, retomada: extra.retomada ?? false, comBotoes: extra.comBotoes ?? false },
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
  const comBotoes = (t: string) => `${t}\n\n[Botões: Procuro emprego · Tenho currículo · Quero contratar]`;
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
    saidas[0]?.p_texto.endsWith("[Botões: Procuro emprego · Tenho currículo · Quero contratar]"),
    "guarda os botões",
  );

  // 1b. quem veio do anúncio já recebeu a boas-vindas da Meta ("Oi! 👋 Aqui é o Marcelo, do Publike."): o robô não
  // cumprimenta nem se apresenta de novo (19/11/2026; Marcelo: "isso não pode ocorrer, traz desconfiança")
  const doAnuncio = { tipo: "ad", link: "https://www.instagram.com/reel/x", titulo: "Contratando?", texto: null };
  r = await rodar("Olá! Posso ter mais informações sobre isso?", {
    origem: doAnuncio,
    historico: [{ de: "pessoa", texto: "Olá! Posso ter mais informações sobre isso?" }],
  });
  conferir(
    r.msgs.length === 1 && !corpo(r.msgs[0]).includes("Aqui é o Marcelo") && corpo(r.msgs[0]).startsWith("O Publike é"),
    "do anúncio: as boas-vindas sem o Oi de novo",
    r.msgs,
  );
  // quem chega para publicar vaga (20/11/2026; 17 de 23 paravam na primeira resposta): o texto curto e os 3 botões,
  // sem IA; do anúncio, sem o Oi de novo
  r = await rodar("Olá! Quero publicar uma vaga pelo WhatsApp.", {
    origem: doAnuncio,
    historico: [{ de: "pessoa", texto: "Olá! Quero publicar uma vaga pelo WhatsApp." }],
  });
  conferir(
    r.msgs.length === 1 &&
      corpo(r.msgs[0]).startsWith("Raphael, vamos colocar sua vaga no ar, é grátis.") &&
      corpo(r.msgs[0]).includes("📸 Se a vaga já está escrita") &&
      JSON.stringify(r.msgs[0]?.interactive?.action?.buttons?.map((b: any) => b.reply.title)) ===
        JSON.stringify(["Mandar foto ou texto", "Montar a vaga comigo", "Procuro emprego"]),
    "publicar vaga: a entrada com os 3 botões, sem o Oi de novo",
    r.msgs,
  );
  conferir(pedidosIA.length + pedidosClaude.length === 0, "publicar vaga: a entrada sem IA");
  r = await rodar("Olá! Quero publicar uma vaga pelo WhatsApp.", {
    historico: [{ de: "pessoa", texto: "Olá! Quero publicar uma vaga pelo WhatsApp." }],
  });
  conferir(
    corpo(r.msgs[0]).startsWith("Oi, Raphael! 👋 Aqui é o Marcelo, do Publike. Vamos colocar sua vaga no ar"),
    "publicar vaga: sem anúncio, com o Oi e a apresentação",
    corpo(r.msgs[0]),
  );
  const entradaDaVaga = [
    { de: "pessoa", texto: "Olá! Quero publicar uma vaga pelo WhatsApp." },
    { de: "robo", texto: `Raphael, ${a.ENTRADA_DA_VAGA}\n\n[Botões: Mandar foto ou texto · Montar a vaga comigo · Procuro emprego]` },
  ];
  r = await rodar("Mandar foto ou texto", { historico: [...entradaDaVaga, { de: "pessoa", texto: "Mandar foto ou texto" }] }, { payload: "a:vaga-mandar" });
  conferir(corpo(r.msgs[0]) === a.MANDAR_A_VAGA && saidas[0]?.p_perfil === "contratar", "publicar vaga: o pode mandar", r.msgs);
  r = await rodar("Procuro emprego", { historico: [...entradaDaVaga, { de: "pessoa", texto: "Procuro emprego" }] }, { payload: "a:trabalho" });
  conferir(corpo(r.msgs[0]).includes("procura trabalho") || saidas[0]?.p_perfil === "trabalho", "publicar vaga: procuro emprego vai para a busca", r.msgs);
  r = await rodar("Montar a vaga comigo", { historico: [...entradaDaVaga, { de: "pessoa", texto: "Montar a vaga comigo" }] }, { payload: "a:vaga-montar" });
  conferir(corpo(r.msgs[0]) === a.PERGUNTAS_DA_VAGA[0], "publicar vaga: a pergunta 1", r.msgs);
  const montando = [
    ...entradaDaVaga,
    { de: "pessoa", texto: "Montar a vaga comigo" },
    { de: "robo", texto: a.PERGUNTAS_DA_VAGA[0] },
  ];
  r = await rodar("Auxiliar de cozinha", { historico: [...montando, { de: "pessoa", texto: "Auxiliar de cozinha" }] });
  conferir(corpo(r.msgs[0]) === a.PERGUNTAS_DA_VAGA[1] && pedidosIA.length + pedidosClaude.length === 0, "publicar vaga: a pergunta 2, sem IA", r.msgs);
  const montando2 = [
    ...montando,
    { de: "pessoa", texto: "Auxiliar de cozinha" },
    { de: "robo", texto: a.PERGUNTAS_DA_VAGA[1] },
    { de: "pessoa", texto: "1800" },
    { de: "robo", texto: a.PERGUNTAS_DA_VAGA[2] },
  ];
  r = await rodar("Setor Bueno, Goiânia", { historico: [...montando2, { de: "pessoa", texto: "Setor Bueno, Goiânia" }] });
  // nesta bateria o Publicar pelo WhatsApp fica desligado: vai o site, com o botão
  conferir(corpo(r.msgs[0]).startsWith("Anotei!") && botao(r.msgs[0]) === "Publicar vaga grátis", "publicar vaga: sem a leitura, o site", r.msgs);
  conferir(
    a.textoDaVagaMontada(a.respostasDaVaga(montando2 as any, ["Setor Bueno, Goiânia"])) ===
      "Vaga de emprego para Auxiliar de cozinha. Salário: 1800. Local de trabalho: Setor Bueno, Goiânia.",
    "publicar vaga: as 3 respostas viram o texto da vaga",
  );
  respostaIA = ia("É grátis, sim!");
  r = await rodar("É pago?", { historico: [...montando, { de: "pessoa", texto: "É pago?" }] });
  conferir(pedidosIA.length + pedidosClaude.length > 0, "publicar vaga: a dúvida no meio vai para a IA");
  // a resposta vaga ganha a pergunta de novo, uma vez (20/11/2026: "Por mês" e "Goiânia")
  const naPergunta2 = [...montando, { de: "pessoa", texto: "Operadora de caixa" }, { de: "robo", texto: a.PERGUNTAS_DA_VAGA[1] }];
  r = await rodar("Por mês", { historico: [...naPergunta2, { de: "pessoa", texto: "Por mês" }] });
  conferir(corpo(r.msgs[0]) === a.DE_NOVO_SALARIO, "publicar vaga: salário sem o valor pergunta de novo", r.msgs);
  r = await rodar("Por mês", {
    historico: [...naPergunta2, { de: "pessoa", texto: "Por mês" }, { de: "robo", texto: a.DE_NOVO_SALARIO }, { de: "pessoa", texto: "Por mês" }],
  });
  conferir(corpo(r.msgs[0]) === a.PERGUNTAS_DA_VAGA[2], "publicar vaga: a segunda vez segue", r.msgs);
  const naPergunta3 = [...naPergunta2, { de: "pessoa", texto: "A. Combinar" }, { de: "robo", texto: a.PERGUNTAS_DA_VAGA[2] }];
  r = await rodar("Goiânia", { historico: [...naPergunta3, { de: "pessoa", texto: "Goiânia" }] });
  conferir(corpo(r.msgs[0]) === a.DE_NOVO_LUGAR, "publicar vaga: só a cidade pergunta o bairro", r.msgs);
  conferir(
    !a.salarioVago("A. Combinar") && !a.salarioVago("1950") && a.salarioVago("Por mês") &&
      a.lugarVago("Sim. Pôde me dizer onde fica. Sou de. Goiânia") && a.lugarVago("goiania") &&
      !a.lugarVago("Setor Urias Magalhães") && !a.lugarVago("Campinas, Goiânia"),
    "publicar vaga: o que é resposta vaga",
  );
  const preparada = [
    ...naPergunta3,
    { de: "pessoa", texto: "Goiânia" },
    { de: "robo", texto: a.DE_NOVO_LUGAR },
    { de: "pessoa", texto: "Setor Urias Magalhães" },
    { de: "robo", texto: "Pronto! Preparei a sua vaga: *Operadora de caixa*\n\n[Botão: Conferir e publicar]" },
  ];
  const lida = a.textosDaVagaPreparada(preparada as any);
  conferir(
    lida?.texto === "Vaga de emprego para Operadora de caixa. Salário: A. Combinar. Local de trabalho: Goiânia Setor Urias Magalhães." &&
      lida.jaDisse.includes("o salário"),
    "publicar vaga: depois da vaga preparada, o texto para ler de novo",
    lida,
  );
  conferir(a.textosDaVagaPreparada(naPergunta3 as any) === null, "publicar vaga: sem a vaga preparada, nada");
  conferir(
    a.textosDaVagaPreparada([...preparada, { de: "equipe", texto: "Me diz o bairro que eu completo." }] as any)?.texto === lida?.texto,
    "publicar vaga: a mensagem da equipe depois da vaga preparada não atrapalha",
  );
  conferir(a.querPublicarVaga("Olá! Quero publicar uma vaga pelo WhatsApp.") && !a.querPublicarVaga("Quero uma vaga de auxiliar"), "publicar vaga: a mensagem pronta");
  // os links de quem veio do anúncio contam no anúncio do Instagram, não no atendimento (19/11/2026: "parece que as
  // campanhas do Instagram não apareceram aqui")
  r = await rodar(
    "Quero contratar",
    { origem: doAnuncio, historico: [{ de: "pessoa", texto: "Quero contratar" }] },
    { payload: "a:contratar" },
  );
  const doLink = JSON.stringify(r.msgs);
  conferir(
    doLink.includes("utm_source=meta-ads&utm_campaign=ig-whatsapp") && !doLink.includes("utm_campaign=atendimento"),
    "do anúncio: o link leva a campanha do anúncio do Instagram",
    doLink.slice(0, 400),
  );
  r = await rodar(
    "Quero contratar",
    { historico: [{ de: "pessoa", texto: "Quero contratar" }] },
    { payload: "a:contratar" },
  );
  conferir(JSON.stringify(r.msgs).includes("utm_campaign=atendimento"), "sem anúncio: o link segue com o atendimento");

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
  // curta, só a pergunta, sem botão que tire a pessoa da conversa (19/11/2026: "As pessoas estão parando aqui")
  // e a equipe num botão de resposta (21/11/2026: o menu ficou com 3, e a equipe veio para cá)
  conferir(
    r.msgs[0]?.interactive?.action?.buttons?.length === 1 &&
      r.msgs[0]?.interactive?.action?.buttons?.[0]?.reply?.title === "Falar com a equipe" &&
      corpo(r.msgs[0]).includes("*Me conta o que você faz e o bairro onde mora.*") &&
      corpo(r.msgs[0]).length < 220 &&
      saidas[0]?.p_perfil === "trabalho",
    "Procuro emprego: só a pergunta, curta, com o botão da equipe",
    r.msgs[0],
  );
  r = await rodar(
    "Tenho currículo",
    { historico: [...comeco, { de: "pessoa", texto: "Tenho currículo" }] },
    { payload: "a:curriculo" },
  );
  conferir(
    botao(r.msgs[0]) === "Enviar meu currículo" &&
      corpo(r.msgs[0]).includes("as empresas da região te acham pela função") &&
      corpo(r.msgs[0]).includes("escrever *equipe*") &&
      saidas[0]?.p_perfil === "trabalho" &&
      pedidosIA.length === 0,
    "Tenho currículo: o ganho, o botão do site e a equipe por escrito",
    corpo(r.msgs[0]),
  );
  r = await rodar(
    "Quero contratar",
    { perfil: "contratar", historico: [...comeco, { de: "pessoa", texto: "Quero contratar" }] },
    { payload: "a:contratar" },
  );
  conferir(botao(r.msgs[0]) === "Publicar vaga grátis", "Quero contratar: Publicar vaga grátis");
  conferir(corpo(r.msgs[0]).includes("escrever *equipe*"), "Quero contratar: a equipe por escrito");

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
    corpo(r.msgs[0]).includes("*Cozinheira*") && corpo(r.msgs[0]).includes("/w/11111111"),
    "a vaga com o link",
  );

  // 13b. até 3 vagas por dia (migração 20270807120000): já foram 2, vai 1 e o aviso; já foram 3, nenhuma busca
  vagasJaEnviadas = a.VAGAS_POR_DIA - 1;
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
  vagasJaEnviadas = a.VAGAS_POR_DIA;
  r = await rodar("tem de auxiliar de cozinha também?", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "tem de auxiliar de cozinha também?" }],
  });
  conferir(
    buscas.length === 0 &&
      corpo(r.msgs[0]).startsWith("Hoje eu já te mandei bastante vaga") &&
      botao(r.msgs[0]) === "Ver as vagas no site" &&
      JSON.stringify(r.msgs[0]).includes("q=cozinheira"),
    "passou de 3 no dia: amanhã tem mais, e o site já na busca do que ela pediu",
    JSON.stringify(r.msgs[0]).slice(0, 300),
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
  // quem escreve "equipe" (o menu não tem mais o botão; 21/11/2026)
  r = await rodar("Equipe", { perfil: "trabalho", historico: [...procurando, { de: "pessoa", texto: "Equipe" }] });
  conferir(saidas[0]?.p_equipe === true && pedidosIA.length === 0, "escreveu equipe: passa para a equipe, sem IA");
  for (const t of ["equipe", "Falar com atendente", "quero falar com alguém", "falar com uma pessoa"])
    conferir(a.pedeAEquipe(t), `pede a equipe: ${t}`);
  for (const t of ["sou atendente e moro no Centro", "tem vaga de atendente?", "a equipe é boa?"])
    conferir(!a.pedeAEquipe(t), `não pede a equipe: ${t}`);
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
    "Quero contratar",
    { perfil: "contratar", historico: [...comeco, { de: "pessoa", texto: "Quero contratar" }] },
    { payload: "a:contratar" },
  );
  conferir(
    r.msgs[0]?.interactive?.action?.parameters?.url.includes("utm_campaign=atendimento"),
    "o botão leva a origem",
  );
  const texto = r.msgs.find((e) => e.type === "text");
  conferir(corpo(texto).includes("Publicar vaga grátis: https://publike.org/"), "sem o botão, o link escrito", corpo(texto));
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
    corpo(r.msgs[0]).startsWith("Agora não achei vaga de motorista de app. Olha as vagas de motorista:") &&
      corpo(r.msgs[0]).includes("*Motorista entregador*"),
    "sem a função inteira, a função mais curta, dita assim",
    corpo(r.msgs[0]),
  );
  // a primeira mensagem sem vaga nenhuma leva a apresentação
  respostaIA = ia("Oi, Raphael! Aqui é o Marcelo, do Publike. Olha as vagas de pedreiro:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "pedreiro", categoria: "todas", cidade: "Goiânia", bairro: "" },
  });
  semVagaNenhuma = true;
  r = await rodar("tem vaga de pedreiro?", { historico: [{ de: "pessoa", texto: "tem vaga de pedreiro?" }] });
  semVagaNenhuma = false;
  conferir(
    corpo(r.msgs[0]).startsWith(
      "Oi, Raphael! 👋 Aqui é o Marcelo, do Publike.\n\nAgora não achei vaga de pedreiro no ar, nem perto de você nem nas cidades em volta.",
    ) &&
      botao(r.msgs[0]) === "Fazer meu currículo" &&
      corpo(r.msgs[0]).includes("deixe o seu *currículo*") &&
      corpo(r.msgs[0]).includes("Ver todas as vagas no ar: https://publike.org/?tipo=vaga&q=pedreiro"),
    "sem vaga na primeira mensagem: apresentação, o currículo e as vagas do site",
    corpo(r.msgs[0]),
  );

  // 22b. sem a função em lugar nenhum, as parecidas, ditas como oportunidades, só com o título da parecida
  respostaIA = ia("Olha as vagas de vigilante:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "vigilante patrimonial", funcoes: ["vigilante patrimonial"], parecidas: ["porteiro"], categoria: "todas", cidade: "Aparecida de Goiânia", bairro: "", fora: "" },
  });
  r = await rodar("sou vigilante patrimonial, moro em aparecida", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou vigilante patrimonial, moro em aparecida" }],
  });
  conferir(
    corpo(r.msgs[0]).startsWith("Agora não achei vaga de vigilante patrimonial no ar. Separei outras vagas que podem combinar com a sua experiência.") &&
      corpo(r.msgs[0]).includes("*Porteiro noturno*") &&
      !corpo(r.msgs[0]).includes("escritório"),
    "as parecidas, claras, sem a vaga de outra função",
    corpo(r.msgs[0]),
  );
  conferir(
    buscas.some((b) => b.p_texto === "vigilante patrimonial" && b.p_raio_km === 100) && buscas.some((b) => b.p_texto === "vigilante"),
    "antes das parecidas, a função longe e a função mais curta",
    buscas.map((b) => `${b.p_texto}/${b.p_raio_km}`),
  );
  // 22a3. o jeito de trabalho (20/11/2026; Marcelo: "entender melhor as nuances de vagas"): "primeiro emprego" e "PCD"
  // não são função; viram filtro
  conferir(
    JSON.stringify(a.jeitoDoTexto("Sou PCD em busca do primeiro emprego, o que der pra mim eu faço")) ===
      JSON.stringify(["sem_experiencia", "pcd", "qualquer"]) &&
      a.funcaoSemJeito("primeiro emprego") === null &&
      a.funcaoSemJeito("diária exatamente") === null &&
      a.funcaoSemJeito("atendimento home office") === "atendimento" &&
      a.funcaoSemJeito("auxiliar de cozinha") === "auxiliar de cozinha" &&
      a.vagaDoJeito({ experiencia: "sem", pcd: "tambem" }, ["sem_experiencia", "pcd"]) &&
      !a.vagaDoJeito({ experiencia: "1_ano" }, ["sem_experiencia"]) &&
      a.vagaDoJeito({ modelo: "remoto" }, ["remoto"]) &&
      !a.vagaDoJeito({ modelo: "presencial" }, ["remoto"]),
    "o jeito de trabalho: do texto, fora da função e o filtro da vaga",
    [a.jeitoDoTexto("Sou PCD em busca do primeiro emprego, o que der pra mim eu faço"), a.funcaoSemJeito("atendimento home office")],
  );
  // 22a4. mora fora e a IA não marcou: sem as vagas daqui (20/11/2026, revendo as conversas)
  conferir(
    a.lugarDeFora("auxiliar de cozinha e moro na Zn sp freguesia do ó") === "SP" &&
      a.lugarDeFora("Moro em natal rn rua coração de maria") === "RN" &&
      a.lugarDeFora("Sou Comprador, moro Santa Helena, Lages SC") === "SC" &&
      a.lugarDeFora("Desculpa eu moro no Rio de Janeiro") === "Rio de Janeiro" &&
      a.lugarDeFora("moro em Aparecida de Goiânia, vou a pé se for perto") === null &&
      a.lugarDeFora("sou de Minas mas moro em Goiânia") === null &&
      a.lugarDeFora("moro no setor bueno, se tiver vaga me avisa") === null &&
      a.lugarDeFora("sou cozinheira") === null,
    "o lugar de fora, depois de moro/sou de",
    [a.lugarDeFora("auxiliar de cozinha e moro na Zn sp freguesia do ó"), a.lugarDeFora("moro em Aparecida de Goiânia, vou a pé se for perto")],
  );
  respostaIA = ia("Olha as vagas de auxiliar de cozinha:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "auxiliar de cozinha", funcoes: ["auxiliar de cozinha"], parecidas: [], jeito: [], categoria: "todas", cidade: "", bairro: "", fora: "" },
  });
  r = await rodar("auxiliar de cozinha e moro na Zn sp freguesia do ó", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "auxiliar de cozinha e moro na Zn sp freguesia do ó" }],
  });
  conferir(corpo(r.msgs[0]).includes("ainda não está disponível em SP") && !corpo(r.msgs[0]).includes("/anuncio/"), "mora em SP: sem as vagas de Goiânia", corpo(r.msgs[0]));
  // 22a5. o anúncio para quem procura emprego: a pergunta direto, sem o menu (20/11/2026)
  conferir(
    a.anuncioDeVagas({ tipo: "ad", titulo: "publike.br", texto: "Procurando emprego? Pede vaga pelo WhatsApp." }) &&
      !a.anuncioDeVagas({ tipo: "ad", titulo: "publike.br", texto: "Contratando? Agora a vaga vai pro ar pelo WhatsApp." }) &&
      !a.anuncioDeVagas({ tipo: "ad", titulo: "publike.br", texto: null }),
    "o anúncio de vagas pelo texto",
  );
  r = await rodar("Olá! Posso ter mais informações sobre isso?", {
    origem: { tipo: "ad", titulo: "publike.br", texto: "Procurando emprego? Pede vaga pelo WhatsApp." },
    historico: [{ de: "pessoa", texto: "Olá! Posso ter mais informações sobre isso?" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Me conta o que você faz e o bairro onde mora.*") && !r.msgs[0]?.interactive?.action?.buttons,
    "anúncio de vagas: a pergunta direto, sem o menu",
    corpo(r.msgs[0]),
  );
  conferir(
    a.LEMBRETE_PERGUNTA.includes("o que você faz e o bairro") && a.LEMBRETE_PERGUNTA.slice(0, 24) !== a.LEMBRETE_SEMPRE.slice(0, 24),
    "os lembretes: a pergunta e o sempre, com começos diferentes",
  );
  // 22b1. a equipe devolveu com os botões: os três botões do começo de novo, sem a IA (19/11/2026: "dar uma opção pra
  // voltar pra IA com botões novamente")
  respostaIA = ia("não devia ser chamada", { perfil: null, acao: "responder" });
  r = await rodar("", {
    perfil: "trabalho",
    historico: [...procurando, { de: "equipe", texto: "Clique no botão Procuro trabalho." }, { de: "pessoa", texto: "Já cliquei" }],
  }, { retomada: true, comBotoes: true, wamid: "" });
  conferir(
    corpo(r.msgs[0]) === a.VOLTEI_COM_BOTOES &&
      r.msgs[0]?.interactive?.action?.buttons?.length === 3 &&
      pedidosClaude.length === 0 && pedidosIA.length === 0,
    "devolver com os botões: o menu de novo, sem a IA",
    JSON.stringify(r.msgs[0]).slice(0, 300),
  );
  // 22b2. cargo de liderança sem vaga: o mesmo cargo em outro nível da área, antes das parecidas da IA (19/11/2026:
  // "Tem vaga pra coordenador de logística")
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "gerente operacional / supervisor de logística", funcoes: ["gerente operacional", "supervisor de logística"], parecidas: ["porteiro"], categoria: "todas", cidade: "Aparecida de Goiânia", bairro: "", fora: "" },
  });
  r = await rodar("Sou gerente operacional / supervisor de logística moro na vila Maria", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "Sou gerente operacional / supervisor de logística moro na vila Maria" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Coordenador de Logística*") &&
      !corpo(r.msgs[0]).includes("Auxiliar de logística") &&
      !corpo(r.msgs[0]).includes("Porteiro") &&
      corpo(r.msgs[0]).includes("Separei outras vagas que podem combinar"),
    "liderança: o mesmo cargo em outro nível da área",
    corpo(r.msgs[0]),
  );
  conferir(
    a.areaDaLideranca("supervisor de logística") === "logística" &&
      a.areaDaLideranca("auxiliar de cozinha") === null &&
      a.tituloDeLideranca("Coordenador de Logística", "logística") &&
      !a.tituloDeLideranca("Auxiliar de logística", "logística"),
    "a área e o título de liderança",
  );
  // 22b3. "Tem mais vagas" (20/11/2026; Marcelo: "precisa responder melhor algumas perguntas"): as que já foram não vão
  // de novo; sem outra da função, diz que essas são todas, sem o "não achei"
  const jaFoi = `Olha as vagas de motorista perto de você:\n\n• *Motorista entregador* · Setor Bueno\nhttps://publike.org/anuncio/${"2".repeat(36)}`;
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "motorista", funcoes: ["motorista"], parecidas: [], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("Tem mais vagas", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou motorista e moro no setor bueno" }, { de: "robo", texto: jaFoi }, { de: "pessoa", texto: "Tem mais vagas" }],
  });
  conferir(
    !corpo(r.msgs[0]).includes("Motorista entregador") &&
      corpo(r.msgs[0]).includes("Essas que te mandei são todas as vagas de motorista") &&
      !corpo(r.msgs[0]).includes("Agora não achei"),
    "tem mais vagas: a que já foi não vai de novo, e diz que são todas",
    corpo(r.msgs[0]),
  );
  // com parecida: as outras, dizendo que as da função já foram
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "motorista", funcoes: ["motorista"], parecidas: ["porteiro"], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("Tem outras?", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou motorista e moro no setor bueno" }, { de: "robo", texto: jaFoi }, { de: "pessoa", texto: "Tem outras?" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Porteiro noturno*") &&
      !corpo(r.msgs[0]).includes("Motorista entregador") &&
      corpo(r.msgs[0]).includes("As vagas de motorista que estão no ar eu já te mandei"),
    "tem mais vagas: as parecidas, dizendo que as da função já foram",
    corpo(r.msgs[0]),
  );
  conferir(
    a.vagasJaMandadas([{ de: "robo", texto: jaFoi }, { de: "pessoa", texto: "/anuncio/" + "9".repeat(36) }]).size === 1,
    "as vagas já mandadas: só as das respostas do Publike",
  );
  conferir(
    a.repetiuVagas([{ de: "robo", texto: jaFoi }, { de: "pessoa", texto: "Tem mais vagas" }, { de: "robo", texto: jaFoi }]) &&
      !a.repetiuVagas([{ de: "pessoa", texto: "oi" }, { de: "robo", texto: jaFoi }]) &&
      !a.repetiuVagas([{ de: "robo", texto: jaFoi }, { de: "pessoa", texto: "Tem mais vagas" }]),
    "a resposta que repetiu vagas entra no procurar de novo",
  );
  // 22b4. assistente e auxiliar são o mesmo trabalho (20/11/2026: "tem auxiliar administrativo que é correlato de
  // assistente"): vem como a função, antes das parecidas da IA
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "assistente administrativo", funcoes: ["assistente financeiro", "assistente administrativo"], parecidas: ["porteiro"], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("sou assistente financeiro e administrativo, moro no setor bueno", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou assistente financeiro e administrativo, moro no setor bueno" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Auxiliar Administrativo*") &&
      !corpo(r.msgs[0]).includes("Porteiro") &&
      corpo(r.msgs[0]).includes("mesmo tipo de trabalho") &&
      !corpo(r.msgs[0]).includes("Separei outras vagas"),
    "assistente administrativo: as de auxiliar administrativo, como o mesmo trabalho",
    corpo(r.msgs[0]),
  );
  conferir(
    a.funcoesEquivalentes("assistente administrativo").join("|") === "auxiliar administrativo" &&
      a.funcoesEquivalentes("ajudante de cozinha").join("|") === "assistente de cozinha|auxiliar de cozinha" &&
      a.funcoesEquivalentes("motorista").length === 0 &&
      // o mesmo trabalho com outro nome (21/11/2026: "Empregada Doméstica" no ar e "diarista" sem resposta)
      a.funcoesEquivalentes("diarista").includes("empregada") &&
      a.funcoesEquivalentes("doméstica").includes("diarista") &&
      a.funcoesEquivalentes("cuidadora de idosos").includes("cuidador") &&
      a.tituloDaFuncao("Empregada Doméstica", "empregada") &&
      a.funcaoSemComplemento("auxiliar de limpeza doméstica") === "auxiliar de limpeza" &&
      a.tituloDaFuncao("Auxiliar de limpeza", "auxiliar de limpeza") &&
      a.funcaoSemComplemento("auxiliar de limpeza") === null &&
      a.funcaoSemComplemento("vigilante patrimonial noturno") === null &&
      a.separarPalavrasColadas("diarista.domestica cuido de idosa") === "diarista domestica cuido de idosa" &&
      a.separarPalavrasColadas("publike.org e ana.souza@gmail.com") === "publike.org e ana.souza@gmail.com",
    "os nomes do mesmo trabalho",
  );
  // 22b5. o jeito que não tem (20/11/2026: "Tem vagas de auxiliar de serviços gerais"): solta o jeito e diz
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "auxiliar de serviços gerais", funcoes: ["auxiliar de serviços gerais"], parecidas: [], jeito: ["diaria"], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("auxiliar de serviços gerais de diária", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "auxiliar de serviços gerais de diária, moro no setor bueno" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Auxiliar de Serviços Gerais*") &&
      corpo(r.msgs[0]).includes("Agora não achei vaga de auxiliar de serviços gerais de diária") &&
      !corpo(r.msgs[0]).includes("currículo"),
    "sem vaga de diária: as de serviços gerais com carteira, dizendo que de diária não tem",
    corpo(r.msgs[0]),
  );
  // 22b6. a mesma área, pela lista do Publike: faxineira vê limpeza
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "faxineira", funcoes: ["faxineira"], parecidas: [], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("sou faxineira", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou faxineira, moro no setor bueno" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Auxiliar de limpeza*") && corpo(r.msgs[0]).includes("Separei outras vagas"),
    "faxineira: as vagas da mesma área (limpeza)",
    corpo(r.msgs[0]),
  );
  conferir(
    a.termosDaArea("faxineira").includes("serviços gerais") && a.termosDaArea("astronauta").length === 0,
    "os termos da área",
  );
  // 22b7. nada da função nem parecido: as vagas mais perto, de outras funções, ditas assim
  astronauta = true;
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "astronauta", funcoes: ["astronauta"], parecidas: [], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("sou astronauta", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou astronauta, moro no setor bueno" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Cozinheira*") &&
      corpo(r.msgs[0]).includes("nem parecida. Olha as vagas no ar mais perto de você, de outras funções") &&
      corpo(r.msgs[0]).includes("currículo") &&
      botao(r.msgs[0]) === "Fazer meu currículo",
    "sem nada da função: as mais perto, de outras funções",
    corpo(r.msgs[0]),
  );
  astronauta = false;
  // 22b8. sem a função, com o bairro (20/11/2026: "precisa entender e enviar vagas genéricas mais próximas e ir
  // aumentando o raio"): as mais perto, de todas as funções, do raio menor para o maior, e o pedido da função depois
  respostaIA = ia("Olha as vagas perto do Parque Tremendão:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "", funcoes: [], parecidas: [], jeito: ["qualquer"], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  buscas.length = 0;
  r = await rodar("🎤 moro no setor bueno, não sei qual vaga tá disponível", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "🎤 moro no setor bueno, não sei qual vaga tá disponível" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("Olha as vagas no ar mais perto de você, de todas as funções:") &&
      corpo(r.msgs[0]).includes("*Cozinheira*") &&
      corpo(r.msgs[0]).includes(a.PEDIR_A_FUNCAO_DEPOIS) &&
      buscas[0]?.p_por_distancia === true && buscas[0]?.p_raio_km === 3,
    "sem a função: as vagas mais perto, de todas as funções, começando pelo raio menor",
    `${corpo(r.msgs[0])} ${JSON.stringify(buscas[0])}`,
  );
  // "Ok" depois de pedir a função com outras palavras (antes, ficava sem resposta): vai para a IA
  r = await rodar("Ok", {
    perfil: "trabalho",
    historico: [
      ...procurando,
      { de: "pessoa", texto: "🎤 moro no setor bueno, não sei qual vaga tá disponível" },
      { de: "robo", texto: "Beleza! Então me diz qual trabalho você faz ou procura, que eu já te mostro as vagas perto do Setor Bueno." },
      { de: "pessoa", texto: "Ok" },
    ],
  });
  conferir(
    pedidosClaude.length + pedidosIA.length > 0 && corpo(r.msgs[0]).includes("*Cozinheira*"),
    "ok depois de pedir a função: vai para a IA e manda as vagas",
    corpo(r.msgs[0]),
  );
  // a IA ia perguntar a função de novo (a conversa do ww, 20/11/2026): a rede de segurança manda as vagas mais perto
  respostaIA = ia("Beleza! Me diz só qual trabalho você faz ou procura, que eu já te mostro as vagas da região.", {
    perfil: "trabalho",
    acao: "responder",
    busca: { texto: "", funcoes: [], parecidas: [], jeito: [], categoria: "todas", cidade: "Goiânia", bairro: "Setor Bueno", fora: "" },
  });
  r = await rodar("Ok", {
    perfil: "trabalho",
    historico: [
      ...procurando,
      { de: "pessoa", texto: "🎤 moro no setor bueno, não sei qual vaga tá disponível" },
      { de: "robo", texto: "Entendi! Me fala só uma coisa: qual trabalho você faz ou procura? Aí eu já mostro as vagas da região." },
      { de: "pessoa", texto: "Sim" },
      { de: "robo", texto: "Beleza! Então me diz qual trabalho você faz ou procura, que eu já te mostro as vagas perto do Setor Bueno." },
      { de: "pessoa", texto: "Ok" },
    ],
  });
  conferir(
    corpo(r.msgs[0]).startsWith("Olha as vagas no ar mais perto de você, de todas as funções:") &&
      corpo(r.msgs[0]).includes("*Cozinheira*") &&
      !corpo(r.msgs[0]).includes("Me diz só qual trabalho"),
    "a IA ia perguntar a função de novo: vão as vagas mais perto",
    corpo(r.msgs[0]),
  );
  // o contexto diz que já perguntou
  conferir(
    JSON.stringify(pedidosClaude.concat(pedidosIA)).includes("Você já perguntou o que ela faz"),
    "o contexto avisa a IA que a função já foi perguntada",
  );
  conferir(
    a.perguntouAFuncao("Beleza! Então me diz qual trabalho você faz ou procura, que eu já te mostro as vagas.") &&
      !a.perguntouAFuncao(`Olha as vagas:\n\n• *Cozinheira*\nhttps://publike.org/anuncio/${"1".repeat(36)}\n\n${a.PEDIR_A_FUNCAO_DEPOIS}`) &&
      !a.perguntouAFuncao("Por nada! Qualquer coisa, é só chamar."),
    "pediu a função: só antes de mandar vaga",
  );

  // 22c. duas funções: a que não tem é dita; a outra, mesmo longe, vem antes de qualquer parecida
  respostaIA = ia("Olha as vagas:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "auxiliar de costura, auxiliar de cozinha", funcoes: ["auxiliar de costura", "auxiliar de cozinha"], parecidas: ["porteiro"], categoria: "todas", cidade: "", bairro: "Jardim América", fora: "" },
  });
  r = await rodar("Trabalho de auxiliar de costura, auxiliar de cozinha", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "Trabalho de auxiliar de costura, auxiliar de cozinha" }],
  });
  conferir(
    corpo(r.msgs[0]).startsWith(
      "Agora não achei vaga de auxiliar de costura. Perto de você não achei vaga de auxiliar de cozinha, mas tem em outras cidades da região:",
    ) &&
      corpo(r.msgs[0]).includes("Centro, Trindade (a 24 km)") &&
      !corpo(r.msgs[0]).includes("Porteiro"),
    "a função pedida longe, antes das parecidas",
    corpo(r.msgs[0]),
  );
  conferir(a.tituloDaFuncao("Costureiro(a)", "costureira") && !a.tituloDaFuncao("Auxiliar de escritório", "auxiliar de costura") && !a.tituloDaFuncao("Auxiliar de cozinha", "cozinheira"), "o título é da função");
  conferir(a.funcaoCurta("vigilante patrimonial") === "vigilante" && a.funcaoCurta("auxiliar de cozinha") === null, "a função mais curta");

  // 19b. a cidade fora de onde o Publike funciona: ainda não está disponível, sem buscar
  respostaIA = ia("Olha as vagas de cozinheira em Manaus:", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "cozinheira", categoria: "todas", cidade: "", bairro: "", fora: "Manaus" },
  });
  r = await rodar("sou cozinheira e moro em Manaus", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou cozinheira e moro em Manaus" }],
  });
  conferir(
    buscas.length === 0 && corpo(r.msgs[0]).startsWith("O Publike ainda não está disponível em Manaus."),
    "cidade fora: ainda não está disponível, sem vagas daqui",
    corpo(r.msgs[0]),
  );

  // 19c. a equipe devolveu a conversa: a última mensagem ("Procuro trabalho") é respondida agora, sem entrar de novo
  r = await rodar(
    "Procuro trabalho",
    {
      historico: [
        { de: "robo", texto: "Certo! Vou pedir para alguém da equipe do Publike te responder por aqui." },
        { de: "pessoa", texto: "Procuro trabalho" },
      ],
    },
    { payload: "a:trabalho", retomada: true },
  );
  conferir(
    entradas[0]?.p_texto === "" && entradas[0]?.p_wamid === null && r.msgs.length === 1 && corpo(r.msgs[0]).includes("Eu te mando as vagas por aqui"),
    "devolvida: responde a última da pessoa sem repetir a mensagem",
    `${JSON.stringify(entradas[0]?.p_texto)} ${corpo(r.msgs[0])}`,
  );

  // 19d. "Ok" depois do "me conta o que você faz e o bairro": a pergunta de novo, clara
  r = await rodar("Ok", {
    perfil: "trabalho",
    historico: [
      ...comeco,
      { de: "pessoa", texto: "Procuro trabalho" },
      { de: "robo", texto: "É grátis, sempre. *Me conta o que você faz e o bairro onde mora*, que eu te mando até 3 vagas por dia por aqui.\n\n[Botão: Ver vagas]" },
      { de: "pessoa", texto: "Ok" },
    ],
  });
  conferir(corpo(r.msgs[0]) === a.PEDIR_FUNCAO_E_BAIRRO, "ok de quem procura, sem vaga no ar: pergunta o que faz e o bairro", corpo(r.msgs[0]));
  // com vaga no ar (20/11/2026: "enviar vagas genéricas mais próximas"): as mais novas, e o pedido depois, sem perguntar
  recentes = true;
  r = await rodar("Ok", {
    perfil: "trabalho",
    historico: [
      ...comeco,
      { de: "pessoa", texto: "Procuro trabalho" },
      { de: "robo", texto: "Que bom! 😊 Eu te mando as vagas por aqui, de graça.\n\n*Me conta o que você faz e o bairro onde mora.*" },
      { de: "pessoa", texto: "Ok" },
    ],
  });
  recentes = false;
  conferir(
    corpo(r.msgs[0]).startsWith("Olha as vagas que entraram no ar agora há pouco, de todas as funções:") &&
      corpo(r.msgs[0]).includes("*Cozinheira*") &&
      corpo(r.msgs[0]).includes(a.PEDIR_FUNCAO_E_BAIRRO_DEPOIS),
    "ok de quem procura, com vaga no ar: as mais novas, e o pedido da função e do bairro depois",
    corpo(r.msgs[0]),
  );

  // 20. o teto do mês: quem procura trabalho, uma mensagem com o link; de novo no dia, nada; quem contrata, normal
  teto = { teto: 5000, enviadas: 5000, economico: true, respondida_hoje: false };
  r = await rodar("sou cozinheira, moro no setor bueno", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "sou cozinheira, moro no setor bueno" }],
  });
  conferir(
    r.msgs.length === 1 && corpo(r.msgs[0]) === a.ECONOMICO_TRABALHO && botao(r.msgs[0]) === "Ver vagas" && buscas.length === 0 && pedidosIA.length + pedidosClaude.length === 0,
    "teto: uma mensagem com Ver vagas, sem IA e sem busca",
    corpo(r.msgs[0]),
  );
  teto = { ...teto, respondida_hoje: true };
  r = await rodar("e de auxiliar?", { perfil: "trabalho", historico: [...procurando, { de: "pessoa", texto: "e de auxiliar?" }] });
  conferir(r.msgs.length === 0, "teto: a segunda no mesmo dia fica sem resposta", r.msgs.map(corpo));
  r = await rodar("Quero contratar", { historico: [{ de: "pessoa", texto: "Quero contratar" }] }, { payload: "a:contratar" });
  conferir(r.msgs.length === 1 && corpo(r.msgs[0]).includes("Para contratar"), "teto: quem contrata segue normal", corpo(r.msgs[0]));
  teto = { teto: 5000, enviadas: 10, economico: false, respondida_hoje: false };

  // jovem aprendiz (21/11/2026): sem vaga de aprendiz, as de estágio, ditas assim; com vaga de aprendiz, pelo regime
  respostaIA = ia("Vou ver as vagas de jovem aprendiz.", {
    perfil: "trabalho",
    acao: "buscar_vagas",
    busca: { texto: "jovem aprendiz", funcoes: ["jovem aprendiz"], jeito: ["sem_experiencia"], categoria: "todas", cidade: "", bairro: "" },
  });
  r = await rodar("Me interessei na vaga de jovem aprendiz", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "Me interessei na vaga de jovem aprendiz" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("Agora não tem vaga de jovem aprendiz no ar. Olha as de estágio, que também são para quem está começando") &&
      corpo(r.msgs[0]).includes("*Estágio em Direito*") && !corpo(r.msgs[0]).includes("sem experiência"),
    "jovem aprendiz sem vaga: as de estágio",
    corpo(r.msgs[0]),
  );
  semAprendiz = false;
  r = await rodar("Me interessei na vaga de jovem aprendiz", {
    perfil: "trabalho",
    historico: [...procurando, { de: "pessoa", texto: "Me interessei na vaga de jovem aprendiz" }],
  });
  conferir(
    corpo(r.msgs[0]).includes("*Auxiliar administrativo*") && !corpo(r.msgs[0]).includes("Estágio"),
    "jovem aprendiz: a vaga de aprendiz pelo regime, mesmo sem a palavra no título",
    corpo(r.msgs[0]),
  );
  semAprendiz = true;

  // o link curto de quem veio do anúncio: a letra da campanha antes do código (21/11/2026: no fim, ficava estranho)
  conferir(
    a.comCampanhaDoAnuncio("https://publike.org/w/3f9c2b1d\nhttps://publike.org/w/a71e0c44", "ig-whatsapp") ===
      "https://publike.org/i/3f9c2b1d\nhttps://publike.org/i/a71e0c44",
    "link curto do anúncio: /i/código",
  );
  conferir(
    [...a.vagasJaMandadas([{ de: "robo", texto: "publike.org/f/3f9c2b1d e publike.org/w/a71e0c44 e /anuncio/0c1d2e3f-0000-0000-0000-000000000000" }])].join(",") ===
      "3f9c2b1d,a71e0c44,0c1d2e3f",
    "as vagas que já foram, por todos os links",
  );

  // 21. o primeiro currículo de quem conversou nas últimas horas: as vagas que combinam, pelo WhatsApp (21/11/2026)
  const vagasDoCv = [
    { id: "v1", titulo: "Cozinheira", quem: "Restaurante Sabor", bairro: "Setor Bueno", cidade: "Goiânia", nota: 92 },
    { id: "v2", titulo: "Auxiliar de cozinha", quem: "Padaria Sol", bairro: "Jardim América", cidade: "Goiânia", nota: 81 },
    { id: "v3", titulo: "Chapeira", quem: "Lanchonete Boa", bairro: "Centro", cidade: "Goiânia", nota: 74 },
    { id: "v4", titulo: "Copeira", quem: "Hotel X", bairro: "Centro", cidade: "Goiânia", nota: 70 },
  ];
  let janela: any = { conversa: "c1", numero: "556299990000", na_janela: true };
  const bancoCv: any = {
    rpc: async (nome: string, args: any) => {
      if (nome === "servidor_whatsapp_codigo") return { data: janela, error: null };
      if (nome === "servidor_whatsapp_teto") return { data: teto, error: null };
      saidas.push({ nome, ...args });
      return { data: null, error: null };
    },
  };
  enviados = [];
  saidas = [];
  let rcv = await a.mandarVagasDoCurriculo(["62999990000", null], vagasDoCv, { cfg, banco: bancoCv, chave: "k" });
  const msgCv = corpo(enviados[0]);
  console.log("\n--- a mensagem das vagas do currículo ---\n" + msgCv + "\n---\n");
  conferir(
    rcv === "enviada" && enviados.length === 1 && msgCv.startsWith("Pronto, seu currículo está no Publike!") &&
      (msgCv.match(/\/w\//g) ?? []).length === 3 && saidas.some((x) => x.nome === "servidor_whatsapp_conversa_saida"),
    "currículo salvo: até 3 vagas no WhatsApp, guardadas na conversa",
    msgCv,
  );
  janela = { conversa: "c1", numero: "556299990000", na_janela: false };
  enviados = [];
  rcv = await a.mandarVagasDoCurriculo(["62999990000"], vagasDoCv, { cfg, banco: bancoCv, chave: "k" });
  conferir(rcv === "fora_da_janela" && enviados.length === 0, "currículo salvo fora das 24 horas: nada sai");
  rcv = await a.mandarVagasDoCurriculo(["62999990000"], [], { cfg, banco: bancoCv, chave: "k" });
  conferir(rcv === "sem_vaga", "currículo salvo sem vaga que combina: nada sai");
  janela = { conversa: "c1", numero: "556299990000", na_janela: true };
  teto = { teto: 5000, enviadas: 5000, economico: true, respondida_hoje: false };
  enviados = [];
  rcv = await a.mandarVagasDoCurriculo(["62999990000"], vagasDoCv, { cfg, banco: bancoCv, chave: "k" });
  conferir(rcv === "economico" && enviados.length === 0, "currículo salvo no modo econômico: nada sai");
  teto = { teto: 5000, enviadas: 10, economico: false, respondida_hoje: false };

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
