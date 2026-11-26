// O aviso de vaga nova pelo WhatsApp (migração 20271005120000; Marcelo: "preciso avisar todos os usuários pelo
// whatsapp, quando entrar uma vaga que ele já procurou"), sem banco e sem a Meta: o `fetch` é trocado por respostas
// prontas. Confere os textos (a mensagem de dentro das 24 horas, o modelo de fora delas e o que fica na conversa), o
// "sim" escrito depois do aviso e o robô das filas: a mensagem com o botão "Quero me candidatar" na janela, o modelo
// fora dela, a espera enquanto a Meta não aprova, a recusa do número e o token com problema. As conversas (as vagas
// que não se repetem e a promessa) ficam em scripts/testar-atendimento-whatsapp.ts. Roda com
// `npx tsx scripts/testar-aviso-de-vaga.ts`.

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

const VAGA1 = "b41120a2-1111-4111-8111-111111111111";
const VAGA2 = "c52231b3-2222-4222-8222-222222222222";

let avisos: any[] = [];
let modelos: Record<string, unknown> = {};
let candidatarLigado = true;
let enviados: any[] = [];
let saidas: any[] = [];
let mandados: any[] = [];
let pedidosDoRobo: any[] = [];
let pagamentosPedidos: string[] = [];
// a resposta da Meta para cada número (o padrão: sai)
let metaPara: Record<string, () => Response> = {};

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
const erroDaMeta = (code: number, status = 400) => () => json({ error: { message: `erro ${code}`, code } }, status);

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (u.includes("graph.facebook.com") && u.includes("/messages")) {
    enviados.push(corpo);
    const r = metaPara[corpo?.to];
    return r ? r() : json({ messages: [{ id: `wamid.${enviados.length}` }] });
  }
  if (u.includes("/rpc/servidor_avisos_de_vaga_para_mandar")) {
    pedidosDoRobo.push(corpo);
    return json(avisos);
  }
  if (u.includes("/rpc/servidor_whatsapp_config"))
    return json({ ativo: true, para_todos: true, conferidos_em: new Date().toISOString(), modelos });
  if (u.includes("/rpc/servidor_whatsapp_candidatar_ligado")) return json(candidatarLigado);
  if (u.includes("/rpc/servidor_whatsapp_conversa_saida")) {
    saidas.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/servidor_aviso_de_vaga_mandado")) {
    mandados.push(corpo);
    return json(null);
  }
  if (u.includes("/rest/v1/anuncios")) {
    pagamentosPedidos.push(u);
    return json([
      { id: VAGA1, tipo: "vaga", pagamento_valor: 3200, pagamento_unidade: "mes", beneficios: null, pagamento_ate: null, comissao: false, ganhos_extras: [] },
      { id: VAGA2, tipo: "vaga", pagamento_valor: null, pagamento_unidade: null, beneficios: null, pagamento_ate: null, comissao: false, ganhos_extras: [] },
    ]);
  }
  if (u.includes("/rpc/")) return json(null);
  return json(null);
}) as typeof fetch;

const aviso = (x: any = {}) => ({
  conversa: "556282028335",
  numero: "556282028335",
  nome: "Cleiton Souza",
  anuncio_id: VAGA1,
  titulo: "Motorista de caminhão",
  funcao: "motorista",
  bairro: "Jardim Goiás",
  cidade: "Goiânia",
  outras: 0,
  na_janela: true,
  ...x,
});

function limpar() {
  enviados = [];
  saidas = [];
  mandados = [];
  pedidosDoRobo = [];
  pagamentosPedidos = [];
  metaPara = {};
}

async function main() {
  const a = await import("../src/lib/servidor/atendimento-whatsapp");
  const w = await import("../src/lib/servidor/whatsapp");
  const t = await import("../src/lib/whatsapp-tipos");
  const aprovados = Object.fromEntries(w.MODELOS.map((m) => [m.nome, { status: "APPROVED", categoria: m.categoria ?? "UTILITY" }]));

  // --- 1. O modelo e o tipo do aviso -------------------------------------------------------------------------------
  const modelo = w.MODELOS.find((m) => m.nome === a.MODELO_DO_AVISO_DE_VAGA);
  conferir(!!modelo && modelo.categoria === "MARKETING" && modelo.aviso === "aviso_de_vaga", "o modelo é de marketing, do aviso_de_vaga", modelo);
  conferir(
    modelo?.botoes.map((b) => `${b.tipo}:${b.texto}`).join(" · ") === "resposta:Quero me candidatar · link:Ver a vaga",
    "os botões do modelo: Quero me candidatar e Ver a vaga",
    modelo?.botoes,
  );
  conferir(w.variaveisDoModelo(modelo!).join(",") === "nome,vaga", "as variáveis do modelo", w.variaveisDoModelo(modelo!));
  conferir(!!modelo?.corpo.includes(a.MARCA_DO_AVISO_DE_VAGA), "o corpo do modelo tem a marca do aviso", modelo?.corpo);
  // a Meta recusa variável no começo ou no fim do corpo
  conferir(!/^\{\{|\}\}[.!?]?$/.test(modelo?.corpo ?? ""), "nenhuma variável no começo ou no fim do corpo");
  const cadastro = w.cadastroDoModelo(modelo!);
  conferir(
    cadastro.category === "MARKETING" && JSON.stringify(cadastro).includes("Responda PARAR para não receber mais"),
    "o cadastro na Meta: marketing, com o rodapé do PARAR",
    cadastro,
  );
  const tipo = t.TIPOS_WHATSAPP.find((x) => x.tipo === "aviso_de_vaga");
  conferir(tipo?.para === "Conversa" && tipo.economico === false, "o tipo no Admin: Conversa, fora do econômico", tipo);
  // não aparece nas Preferências de ninguém (não é aviso de conta)
  for (const tipoConta of ["pessoa", "empresa", "agencia"])
    conferir(
      !t.avisosParaEscolher({ tipoConta, temServicos: true, doPublikeDesligados: [] }).some((x) => x.tipo === "aviso_de_vaga"),
      `não aparece nas Preferências (${tipoConta})`,
    );

  // --- 2. Os textos ------------------------------------------------------------------------------------------------
  let texto = a.textoDoAvisoDeVaga(aviso(), "R$ 3.200 por mês", true);
  conferir(
    texto.startsWith("Oi, Cleiton! 🔔 Você procurou vaga de motorista aqui, e acabou de entrar uma nova:\n\n") &&
      texto.includes("• *Motorista de caminhão* · R$ 3.200 por mês · Jardim Goiás\nhttps://publike.org/w/b41120a2") &&
      texto.includes("Quer se candidatar? Toque em *Quero me candidatar*") &&
      texto.endsWith("_Para não receber estes avisos, é só escrever PARAR._"),
    "o aviso na janela: a vaga, o link, a pergunta e o PARAR",
    texto,
  );
  texto = a.textoDoAvisoDeVaga(aviso({ nome: "Loja do Zé", outras: 2, bairro: null, cidade: "Anápolis" }), null, false);
  conferir(
    texto.startsWith("Oi! 🔔") &&
      texto.includes("• *Motorista de caminhão* · Anápolis\n") &&
      texto.includes("Entrou também mais 2 de motorista: é só me pedir que eu mando.") &&
      !texto.includes("Quer se candidatar"),
    "sem nome de gente, sem valor, com as outras e sem a candidatura",
    texto,
  );
  texto = a.textoDoAvisoDeVaga(aviso({ outras: 1 }), null, true);
  conferir(texto.includes("Entrou também mais uma de motorista"), "uma outra: mais uma", texto);
  conferir(texto.length <= 1000, "cabe na mensagem com botões", texto.length);

  conferir(a.vagaDoModelo(aviso()) === "Motorista de caminhão (Jardim Goiás)", "a vaga do modelo, com o bairro", a.vagaDoModelo(aviso()));
  conferir(
    a.vagaDoModelo(aviso({ bairro: null, cidade: "Senador Canedo" })) === "Motorista de caminhão (Senador Canedo)",
    "a vaga do modelo, sem bairro: a cidade",
    a.vagaDoModelo(aviso({ bairro: null, cidade: "Senador Canedo" })),
  );
  conferir(
    a.vagaDoModelo(aviso({ bairro: null, cidade: null, titulo: "  Motorista\n de caminhão  " })) === "Motorista de caminhão",
    "a vaga do modelo, sem lugar, sem quebra de linha",
  );
  const daConversa = a.textoDoModeloDoAviso("Cleiton", "Motorista de caminhão (Jardim Goiás)", VAGA1);
  conferir(
    daConversa.startsWith("Oi, Cleiton! Você procurou vaga no WhatsApp do Publike, e entrou uma nova perto de você: Motorista de caminhão (Jardim Goiás).") &&
      daConversa.includes("Ver a vaga: https://publike.org/w/b41120a2") &&
      daConversa.endsWith("[Botões: Quero me candidatar · Ver a vaga]"),
    "o modelo na conversa: o texto, o link e os botões",
    daConversa,
  );

  // o "sim" escrito depois do aviso
  for (const s of ["sim", "Sim!", "quero", "Quero sim", "tenho interesse", "Quero me candidatar", "pode mandar"])
    conferir(a.querAVagaDoAviso(s), `"${s}" quer a vaga do aviso`);
  for (const s of ["não", "quanto paga?", "tem de motorista de ônibus?", "sim, mas é longe?", "ok"])
    conferir(!a.querAVagaDoAviso(s), `"${s}" não é o sim do aviso`);

  // a promessa
  conferir(
    a.prometerAviso(["cozinheira"]) ===
      "🔔 Quando entrar vaga nova de cozinheira perto de você, eu te aviso aqui. Para não receber, é só escrever PARAR.",
    "a promessa",
    a.prometerAviso(["cozinheira"]),
  );
  conferir(!a.prometerAviso(["cozinheira", "garçom"], false).includes("perto"), "a promessa sem lugar não diz perto");
  conferir(a.prometerAviso(["cozinheira", "garçom"]).includes("cozinheira e garçom"), "a promessa com duas funções");
  conferir(a.jaPrometeuAviso([{ de: "robo", texto: `Olha as vagas\n\n${a.prometerAviso(["x"])}` }]), "já prometeu");
  conferir(
    a.jaPrometeuAviso([{ de: "robo", texto: "Agora não achei vaga. Quando entrar vaga de pedreiro, eu te aviso aqui no WhatsApp." }]),
    "a promessa do sem vaga também conta",
  );
  conferir(!a.jaPrometeuAviso([{ de: "pessoa", texto: "Quando entrar vaga me avisa" }]), "o que a pessoa escreveu não conta");

  // --- 3. O robô das filas -----------------------------------------------------------------------------------------
  // nada na hora: nada sai (e nem lê o resto)
  limpar();
  avisos = [];
  modelos = aprovados;
  let r = await a.enviarAvisosDeVagaNova(15);
  conferir(r.enviados === 0 && !r.motivo && pedidosDoRobo[0]?.p_limite === 15 && pagamentosPedidos.length === 0, "nada na hora", { r, pedidosDoRobo });

  // na janela: a mensagem de sempre, com o botão; fora: o modelo, com os botões e o link
  limpar();
  avisos = [aviso(), aviso({ conversa: "556299990000", numero: "556299990000", nome: "Ana", anuncio_id: VAGA2, titulo: "Motorista entregador", na_janela: false })];
  r = await a.enviarAvisosDeVagaNova(15);
  const sessao = enviados.find((e) => e.to === "556282028335");
  const doModelo = enviados.find((e) => e.to === "556299990000");
  conferir(r.enviados === 2 && r.pelo_modelo === 1 && r.falhas === 0 && !r.motivo, "dois avisos: um pela janela e um pelo modelo", r);
  conferir(
    sessao?.type === "interactive" &&
      sessao.interactive.action.buttons.length === 1 &&
      sessao.interactive.action.buttons[0].reply.id === `c:quero:${VAGA1}` &&
      sessao.interactive.action.buttons[0].reply.title === "Quero me candidatar" &&
      /R\$\s3\.200/.test(sessao.interactive.body.text) &&
      sessao.interactive.body.text.includes("/w/b41120a2"),
    "na janela: a mensagem com o valor, o link e o botão da candidatura",
    sessao,
  );
  const comps = doModelo?.template?.components ?? [];
  const corpoDoModelo = comps.find((c: any) => c.type === "body");
  const quick = comps.find((c: any) => c.type === "button" && c.sub_type === "quick_reply");
  const link = comps.find((c: any) => c.type === "button" && c.sub_type === "url");
  conferir(
    doModelo?.type === "template" &&
      doModelo.template.name === "publike_vaga_que_procurou" &&
      corpoDoModelo?.parameters?.map((p: any) => `${p.parameter_name}=${p.text}`).join("|") ===
        "nome=Ana|vaga=Motorista entregador (Jardim Goiás)" &&
      quick?.index === "0" &&
      quick?.parameters?.[0]?.payload === `c:quero:${VAGA2}` &&
      link?.index === "1" &&
      link?.parameters?.[0]?.text === "w/c52231b3",
    "fora da janela: o modelo, com o nome, a vaga, o toque da candidatura e o link",
    doModelo,
  );
  conferir(
    saidas.length === 2 &&
      saidas.some((s) => s.p_conversa === "556282028335" && s.p_texto.includes("[Botões: Quero me candidatar]")) &&
      saidas.some((s) => s.p_conversa === "556299990000" && s.p_texto.includes("Você procurou vaga no WhatsApp do Publike") && s.p_wamid),
    "os dois ficam na conversa",
    saidas,
  );
  conferir(
    mandados.length === 2 &&
      mandados.some((m) => m.p_conversa === "556282028335" && m.p_anuncio === VAGA1 && m.p_pelo_modelo === false && !m.p_falhou) &&
      mandados.some((m) => m.p_conversa === "556299990000" && m.p_anuncio === VAGA2 && m.p_pelo_modelo === true && m.p_wamid && !m.p_falhou),
    "os dois ficam anotados (pela janela e pelo modelo)",
    mandados,
  );
  conferir(pagamentosPedidos.length === 1 && pagamentosPedidos[0].includes(VAGA1) && pagamentosPedidos[0].includes(VAGA2), "o valor das vagas, numa leitura só");

  // a candidatura desligada: na janela, o botão Ver a vaga
  limpar();
  candidatarLigado = false;
  avisos = [aviso()];
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(
    r.enviados === 1 &&
      enviados[0]?.type === "interactive" &&
      enviados[0].interactive.type === "cta_url" &&
      enviados[0].interactive.action.parameters.display_text === "Ver a vaga" &&
      enviados[0].interactive.action.parameters.url.includes("/w/b41120a2") &&
      !enviados[0].interactive.body.text.includes("Quer se candidatar"),
    "a candidatura desligada: o botão Ver a vaga",
    enviados[0],
  );
  candidatarLigado = true;

  // o modelo ainda na Meta: o de dentro da janela sai; o de fora espera (sem anotar e sem virar problema da fila)
  limpar();
  modelos = { ...aprovados, publike_vaga_que_procurou: { status: "PENDING", categoria: "MARKETING" } };
  avisos = [aviso(), aviso({ conversa: "556299990000", numero: "556299990000", anuncio_id: VAGA2, na_janela: false })];
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(
    r.enviados === 1 && r.esperando === 1 && !r.motivo && mandados.length === 1 && enviados.length === 1 && enviados[0].to === "556282028335",
    "o modelo em análise: o de fora da janela espera",
    { r, mandados, enviados },
  );
  // a Meta pôs o modelo em outra categoria (que não a de utilidade, mais barata): também espera
  limpar();
  modelos = { ...aprovados, publike_vaga_que_procurou: { status: "APPROVED", categoria: "AUTHENTICATION" } };
  avisos = [aviso({ na_janela: false })];
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(r.esperando === 1 && enviados.length === 0, "o modelo na categoria errada: espera", r);
  modelos = aprovados;

  // a mensagem da janela recusada (a janela fechou nesse meio-tempo): vai pelo modelo
  limpar();
  avisos = [aviso()];
  let tentativas = 0;
  metaPara["556282028335"] = () => (tentativas++ < 2 ? json({ error: { message: "fora da janela", code: 131047 } }, 400) : json({ messages: [{ id: "wamid.modelo" }] }));
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(
    r.enviados === 1 && r.pelo_modelo === 1 && enviados.at(-1)?.type === "template" && mandados[0]?.p_pelo_modelo === true,
    "a janela fechou: vai pelo modelo",
    { r, enviados: enviados.map((e) => e.type), mandados },
  );

  // o número que a Meta recusa: anota a falha (a conversa espera amanhã) e segue para o próximo
  limpar();
  avisos = [
    aviso({ na_janela: false }),
    aviso({ conversa: "556299990000", numero: "556299990000", anuncio_id: VAGA2, na_janela: false }),
  ];
  metaPara["556282028335"] = erroDaMeta(131026);
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(
    r.enviados === 1 && r.falhas === 1 && !r.motivo &&
      mandados.some((m) => m.p_conversa === "556282028335" && m.p_falhou && !m.p_wamid) &&
      mandados.some((m) => m.p_conversa === "556299990000" && !m.p_falhou),
    "o número recusado: anota a falha e segue",
    { r, mandados },
  );
  // fora do ar por um instante: não anota (tenta no próximo minuto)
  limpar();
  avisos = [aviso({ na_janela: false })];
  metaPara["556282028335"] = erroDaMeta(131000, 500);
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(r.falhas === 1 && mandados.length === 0 && !r.motivo, "a Meta fora do ar: tenta de novo depois", { r, mandados });
  // o token com problema: para a rodada e vira problema da fila
  limpar();
  avisos = [aviso({ na_janela: false }), aviso({ conversa: "556299990000", numero: "556299990000", anuncio_id: VAGA2, na_janela: false })];
  metaPara["556282028335"] = erroDaMeta(190, 401);
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(
    r.falhas === 1 && enviados.length === 1 && mandados.length === 0 && !!r.motivo?.includes("pararam"),
    "o token com problema: para tudo",
    { r, enviados: enviados.length },
  );

  // sem a migração: nada, sem erro
  limpar();
  const antes = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) =>
    String(url).includes("/rpc/servidor_avisos_de_vaga_para_mandar")
      ? json({ code: "PGRST202", message: "Could not find the function" }, 404)
      : antes(url, init)) as typeof fetch;
  r = await a.enviarAvisosDeVagaNova(15);
  conferir(r.enviados === 0 && !r.motivo, "sem a migração: nada", r);
  globalThis.fetch = antes;

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
