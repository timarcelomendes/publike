// "Quem você contratou?" com os nomes e um toque (migração 20271006120000; 26/11/2026, a cadeira de dono: 588 aceites
// em vaga e nenhum candidato em Contratados), sem banco e sem a Meta: o `fetch` é trocado por respostas prontas. Confere
// o e-mail com um botão por pessoa (só caminho do site, no HTML e no texto), a mensagem do WhatsApp com o link da
// página, o destino do aviso no sino, a leitura da página do link (o que vem do banco, a escolha do botão do e-mail e o
// "A vaga está completa"), as frases da resposta, a ação do servidor e o robô das filas. Roda com
// `npx tsx scripts/testar-quem-contratou.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
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
let respostaDoRobo: () => Response = () => json(2);
let qualidades: any[] = [];
let conferidosEm = new Date().toISOString();

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (u.includes("graph.facebook.com") && u.includes("/messages")) {
    enviados.push(corpo);
    return json({ messages: [{ id: "wamid.saida" }] });
  }
  // a nota do número (a conferência dos modelos, a cada meia hora)
  if (u.includes("graph.facebook.com") && u.includes("fields=")) return json({ quality_rating: "GREEN" });
  if (u.includes("graph.facebook.com") && u.includes("message_templates")) return json({ data: [] });
  if (u.includes("/rpc/servidor_whatsapp_config"))
    return json({ ativo: true, para_todos: true, conferidos_em: conferidosEm, modelos });
  if (u.includes("/rpc/servidor_whatsapp_pegar")) return json({ itens });
  if (u.includes("/rpc/servidor_whatsapp_marcar")) {
    marcas.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/servidor_guardar_qualidade_do_numero")) {
    qualidades.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/servidor_perguntar_quem_contratou")) {
    pedidosDoRobo.push(corpo);
    return respostaDoRobo();
  }
  if (u.includes("/rpc/")) return json(null);
  return json(null);
}) as typeof fetch;

const CONTA = "aaaaaaaa-1111-2222-3333-444444444444";
const VAGA = "bbbbbbbb-1111-2222-3333-444444444444";
const ANA = "cccccccc-1111-2222-3333-444444444441";
const BRUNO = "cccccccc-1111-2222-3333-444444444442";
const CODIGO = "ab".repeat(32);

const aviso = (x: any = {}) => ({
  id: 91,
  tipo: "quem_contratou",
  conta_id: CONTA,
  numero: "556282028335",
  quantos: 1,
  anuncio_id: VAGA,
  ator_id: null,
  tentativas: 1,
  aviso: { tipo: "quem_contratou", link: `/quem-contratou/${CODIGO}`, recado_id: null, texto: "" },
  dados: {
    nome: "Padaria Pão de Ouro",
    conta_tipo: "comercio",
    vaga: "Atendente de padaria",
    anuncio_tipo: "vaga",
    empresa: null,
    ator: null,
    esperando: 0,
    entrevista: null,
  },
  ...x,
});

async function main() {
  const m = await import("../src/lib/email/montar");
  const q = await import("../src/lib/quem-contratou");
  const w = await import("../src/lib/servidor/whatsapp");
  const t = await import("../src/lib/whatsapp-tipos");
  const d = await import("../src/lib/destino-aviso");
  const filas = await import("../src/lib/servidor/filas");
  modelos = Object.fromEntries(w.MODELOS.map((x) => [x.nome, { status: "APPROVED", categoria: x.categoria ?? "UTILITY" }]));

  // --- 1. O e-mail: um botão por pessoa, sem entrar -------------------------------------------------------------
  const opcoes = [
    { rotulo: "Contratei Ana S.", caminho: `/quem-contratou/${CODIGO}?p=${ANA}` },
    { rotulo: "Contratei Bruno C.", caminho: `/quem-contratou/${CODIGO}?p=${BRUNO}` },
    { rotulo: "Ainda não contratei", caminho: `/quem-contratou/${CODIGO}?r=ainda`, tom: "secundario" },
    { rotulo: "Não contratei ninguém daqui", caminho: `/quem-contratou/${CODIGO}?r=ninguem`, tom: "secundario" },
    // o que não é caminho do site não vira botão
    { rotulo: "Golpe", caminho: "https://outro.site/x" },
    { rotulo: "Golpe 2", caminho: "//outro.site/x" },
    { rotulo: "Aspas", caminho: '/x"onclick="y' },
    { rotulo: "  ", caminho: "/vazio" },
    "texto solto",
  ];
  const lidas = m.opcoesDoEmail({ opcoes }, "https://publike.org/");
  conferir(lidas.length === 4, "só as 4 opções do site viram botão", lidas);
  conferir(lidas[0].link === `https://publike.org/quem-contratou/${CODIGO}?p=${ANA}`, "o link completo do botão", lidas[0]);
  conferir(lidas[0].secundaria === false && lidas[2].secundaria && lidas[3].secundaria, "as secundárias com contorno", lidas);
  conferir(m.opcoesDoEmail({}, "https://publike.org").length === 0 && m.opcoesDoEmail(null, "x").length === 0, "sem opções: nada");
  conferir(
    m.opcoesDoEmail({ opcoes: Array.from({ length: 15 }, (_, i) => ({ rotulo: `Op ${i}`, caminho: `/a/${i}` })) }, "https://p.org")
      .length === 10,
    "no máximo 10 botões",
  );

  const modelo = {
    modelo: "quem_contratou",
    grupo: "usuarios",
    assunto: "Você contratou alguém para a vaga “{{titulo}}”?",
    corpo: "Oi, {{nome}}.\n\n{{motivo}}\n\nToque em quem você contratou. Não precisa entrar no Publike.",
    botao: "Ver todos e responder",
  };
  const email = m.montarEmail(
    modelo,
    {
      nome: "Padaria Pão de Ouro",
      titulo: "Atendente de padaria",
      motivo: "Você aceitou 2 pessoas na vaga “Atendente de padaria”, no Publike. Já contratou alguém?",
      caminho: `/quem-contratou/${CODIGO}`,
      opcoes,
    },
    "https://publike.org",
  );
  conferir(email.assunto === "Você contratou alguém para a vaga “Atendente de padaria”?", "o assunto", email.assunto);
  conferir(email.html.includes(">Contratei Ana S.</a>") && email.html.includes(">Contratei Bruno C.</a>"), "os nomes nos botões");
  conferir(email.html.includes(`href="https://publike.org/quem-contratou/${CODIGO}?p=${ANA}"`), "o botão da Ana leva a ela");
  conferir(!email.html.includes("outro.site") && !email.html.includes("onclick"), "nada de fora no HTML");
  conferir(
    email.html.indexOf("Contratei Ana S.") < email.html.indexOf("Ver todos e responder"),
    "os nomes vêm antes do botão de ver todos",
  );
  conferir(email.texto.includes(`Contratei Ana S.: https://publike.org/quem-contratou/${CODIGO}?p=${ANA}`), "o texto puro tem os links", email.texto);
  conferir(email.texto.includes(`Ver todos e responder: https://publike.org/quem-contratou/${CODIGO}`), "e o de ver todos");
  conferir(!email.texto.includes("[object Object]") && !email.html.includes("[object Object]"), "as opções não vazam no corpo");
  // o e-mail sem opções continua igual
  const semOpcoes = m.montarEmail(modelo, { nome: "Ana", titulo: "X", motivo: "Y", caminho: "/painel" }, "https://publike.org");
  conferir(!semOpcoes.html.includes('cellspacing="0" style="margin:4px 0 12px;"'), "sem opções, sem a lista");
  // a prévia do admin tem as opções de exemplo
  const previa = m.montarEmail(modelo, { ...m.EXEMPLOS_EMAIL, opcoes: m.EXEMPLOS_OPCOES_EMAIL.quem_contratou }, "https://publike.org");
  conferir(previa.html.includes("Contratei Ana S.") && previa.html.includes("Ainda não contratei"), "a prévia do admin");

  // --- 2. O WhatsApp: o modelo com o link da página -------------------------------------------------------------
  const def = w.MODELOS.find((x) => x.nome === "publike_quem_contratou");
  conferir(!!def && def.aviso === "quem_contratou" && !def.categoria, "o modelo existe e é de utilidade", def);
  conferir(def?.botoes.length === 1 && def.botoes[0].tipo === "link", "um botão de link (Responder)", def?.botoes);
  conferir(/^[^{}]*(\{\{nome\}\}|\{\{vaga\}\})/.test(def?.corpo ?? "") && (def?.corpo ?? "").includes("{{vaga}}"), "o texto com o nome e a vaga");
  const montada = w.montarMensagem(aviso() as any);
  conferir(
    "modelo" in montada && montada.modelo === "publike_quem_contratou" && montada.params.vaga === "Atendente de padaria",
    "o aviso vira o modelo",
    montada,
  );
  const semLink = w.montarMensagem(aviso({ aviso: { tipo: "quem_contratou", link: "/painel", recado_id: null, texto: "" } }) as any);
  conferir("pular" in semLink, "sem o link da pergunta, não sai", semLink);
  const semVaga = w.montarMensagem(aviso({ dados: { ...aviso().dados, vaga: null } }) as any);
  conferir("pular" in semVaga, "sem a vaga, não sai", semVaga);
  const fim = w.linkDoBotao(aviso() as any);
  conferir(fim.startsWith(`quem-contratou/${CODIGO}`) && fim.includes("whatsapp"), "o botão leva à página, com a origem", fim);

  // o envio de verdade (a fila): sai o modelo com o link, e a nota do número é guardada
  itens = [aviso()];
  enviados = [];
  marcas = [];
  qualidades = [];
  const r = await w.enviarWhatsappPendentes(10);
  conferir(r.enviadas === 1, "o aviso saiu", r);
  const corpo = enviados[0];
  conferir(corpo?.template?.name === "publike_quem_contratou", "pelo modelo novo", corpo?.template?.name);
  const botao = corpo?.template?.components?.find((c: any) => c.type === "button");
  conferir(String(botao?.parameters?.[0]?.text ?? "").includes(`quem-contratou/${CODIGO}`), "o link do botão", botao);
  conferir(marcas[0]?.p_situacao === "enviada", "marcada como enviada", marcas[0]);
  conferir(qualidades.length === 0, "modelos conferidos há pouco: a nota do número espera", qualidades);
  // meia hora depois da última conferência: os modelos e a nota do número (o freio do aviso de vaga nova)
  conferidosEm = new Date(Date.now() - 40 * 60_000).toISOString();
  itens = [];
  await w.enviarWhatsappPendentes(10);
  conferir(qualidades[0]?.p_qualidade === "GREEN", "a nota do número guardada", qualidades);
  conferidosEm = new Date().toISOString();

  // --- 3. O sino e os tipos do WhatsApp -----------------------------------------------------------------------
  conferir(
    d.destinoDoAviso({ tipo: "quem_contratou", anuncio_id: VAGA, ator_id: null, recado_id: null, link: `/quem-contratou/${CODIGO}` }, CONTA) ===
      `/quem-contratou/${CODIGO}`,
    "o sino abre a página do link",
  );
  conferir(
    d.destinoDoAviso({ tipo: "quem_contratou", anuncio_id: VAGA, ator_id: null, recado_id: null, link: "https://golpe.com" }, CONTA) ===
      `/painel/anuncio/${VAGA}/quadro`,
    "link estranho: o quadro da vaga",
  );
  conferir(t.TIPOS_WHATSAPP.some((x) => x.tipo === "quem_contratou" && x.para === "Quem contrata" && x.economico), "o tipo no Admin");
  const daEmpresa = t.avisosParaEscolher({ tipoConta: "comercio", temServicos: false, doPublikeDesligados: [] });
  const daPessoa = t.avisosParaEscolher({ tipoConta: "pessoa", temServicos: false, doPublikeDesligados: [] });
  conferir(daEmpresa.some((x) => x.tipo === "quem_contratou" && x.rotulo.includes("Quem você contratou")), "nas Preferências de quem contrata", daEmpresa);
  conferir(!daPessoa.some((x) => x.tipo === "quem_contratou"), "não nas de quem procura");
  conferir(t.nomeDoAvisoWhatsapp("quem_contratou", true) === "Quem você contratou?", "o nome curto");

  // --- 4. A página do link ----------------------------------------------------------------------------------------
  const doBanco = {
    anuncio_id: VAGA,
    titulo: "Atendente de padaria",
    vagas: 2,
    removida: false,
    no_ar: true,
    preenchida: false,
    empresa: "Padaria Pão de Ouro",
    empresa_foto: null,
    resposta: null,
    respondida_em: null,
    pessoas: [
      { id: ANA, nome: "Ana S.", foto: null, aceito_em: "2026-11-20T15:00:00Z", contratado: false },
      { id: BRUNO, nome: "Bruno C.", foto: "x/y.jpg", aceito_em: "2026-11-19T15:00:00Z", contratado: false },
      { nome: "sem id" },
      null,
    ],
  };
  const p = q.lerPergunta(doBanco);
  conferir(p?.pessoas.length === 2 && p.pessoas[1].foto === "x/y.jpg", "as pessoas do banco (sem as quebradas)", p);
  conferir(q.lerPergunta(null) === null && q.lerPergunta({ titulo: "x" }) === null && q.lerPergunta([]) === null, "o que não serve");
  conferir(q.lerPergunta({ ...doBanco, resposta: "inventada", vagas: 0 })?.resposta === null, "resposta desconhecida: nenhuma");
  conferir(q.lerPergunta({ ...doBanco, vagas: 0 })?.vagas === 1, "no mínimo 1 vaga");
  conferir(p?.contato_direto === false && q.lerPergunta({ ...doBanco, contato_direto: true })?.contato_direto === true, "o contato direto");

  conferir(q.escolhaDoLink({ p: ANA }, p!.pessoas).marcadas[0] === ANA, "o botão da Ana marca a Ana");
  conferir(q.escolhaDoLink({ p: "outra-pessoa" }, p!.pessoas).marcadas.length === 0, "quem não foi aceito não vem marcado");
  conferir(q.escolhaDoLink({ r: "ainda" }, p!.pessoas).parte === "ainda_nao", "o botão do Ainda não");
  conferir(q.escolhaDoLink({ r: ["ninguem", "x"] }, p!.pessoas).parte === "ninguem", "o botão do Ninguém (o primeiro valor)");
  conferir(q.escolhaDoLink({}, p!.pessoas).parte === null, "sem nada: a lista");

  conferir(q.completaPorPadrao(p!, [ANA]) === false, "2 vagas, 1 escolhida: não está completa");
  conferir(q.completaPorPadrao(p!, [ANA, BRUNO]) === true, "2 vagas, 2 escolhidas: completa");
  const umaJa = { ...p!, pessoas: p!.pessoas.map((x, i) => ({ ...x, contratado: i === 1 })) };
  conferir(q.completaPorPadrao(umaJa, [ANA]) === true, "1 já em Contratados + 1 escolhida: completa");
  conferir(q.completaPorPadrao({ ...p!, no_ar: false }, [ANA, BRUNO]) === false, "fora do ar: não pergunta");

  // as frases da resposta
  const base = { contratados: 0, novos: 0, preenchida: false, avisados: 0, confirmou_aberta: false };
  conferir(
    q.fraseDaResposta({ ...base, resposta: "contratei", contratados: 1, novos: 1 }) ===
      "A pessoa que você contratou está em Contratados e recebe os parabéns. Daqui a 7 dias, a gente pergunta se começou e se você chamaria de novo.",
    "contratei uma",
  );
  conferir(
    q.fraseDaResposta({ ...base, resposta: "contratei", contratados: 2, novos: 2, preenchida: true, avisados: 3 }) ===
      "As 2 pessoas que você contratou estão em Contratados e recebem os parabéns. A vaga saiu do ar e 3 pessoas que esperavam recebem o retorno. Daqui a 7 dias, a gente pergunta se começou e se você chamaria de novo.",
    "contratei duas, com a vaga completa",
    q.fraseDaResposta({ ...base, resposta: "contratei", contratados: 2, novos: 2, preenchida: true, avisados: 3 }),
  );
  conferir(
    q.fraseDaResposta({ ...base, resposta: "ainda_nao", confirmou_aberta: true }).includes("aparece como confirmada"),
    "ainda não, com a vaga no ar",
  );
  conferir(q.fraseDaResposta({ ...base, resposta: "ainda_nao" }) === "Tudo bem. A gente pergunta de novo em uma semana.", "ainda não, fora do ar");
  conferir(
    q.fraseDaResposta({ ...base, resposta: "ninguem", preenchida: true, avisados: 1 }) ===
      "Obrigado por contar. A vaga saiu do ar e 1 pessoa que esperava recebe o retorno.",
    "ninguém, vaga preenchida",
  );
  conferir(q.quemFoiEscolhido(["Ana S."]) === "Ana S." && q.quemFoiEscolhido(["Ana S.", "Bruno C."]) === "Ana S. e Bruno C.", "os nomes");
  conferir(q.quemFoiEscolhido(["a", "b", "c"]) === "3 pessoas" && q.quemFoiEscolhido([]) === "", "muitos ou nenhum");

  // --- 5. O robô das filas ----------------------------------------------------------------------------------------
  pedidosDoRobo = [];
  respostaDoRobo = () => json(3);
  let robo = await filas.perguntarQuemContratou();
  conferir(robo.perguntas === 3 && !robo.motivo, "o robô perguntou 3", robo);
  conferir(pedidosDoRobo[0]?.p_limite === 30 && pedidosDoRobo[0]?.p_agora === false, "o limite e a janela", pedidosDoRobo[0]);
  respostaDoRobo = () => json({ code: "PGRST202", message: "não existe" }, 404);
  robo = await filas.perguntarQuemContratou();
  conferir(robo.perguntas === 0 && !robo.motivo, "sem a migração: nada, sem problema", robo);
  respostaDoRobo = () => json({ code: "42501", message: "Chave do servidor inválida." }, 403);
  robo = await filas.perguntarQuemContratou();
  conferir(robo.perguntas === 0 && !!robo.motivo, "o erro vira problema da fila", robo);

  console.log(`${total - falhas} de ${total} conferências passaram`);
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
