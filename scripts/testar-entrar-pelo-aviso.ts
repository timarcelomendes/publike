// Entrar pelo botão do aviso (migração 20271002120000; a Super Box publicou pelo WhatsApp e o "Ver a candidatura" caía
// no entrar do site), sem banco e sem a Meta: o `fetch` é trocado por respostas prontas. Confere que o botão do aviso
// vira o link de entrar com um toque para o mesmo destino (7 dias) só quando o banco cria o link, que a página do link
// manda direto quem já está dentro e reconhece o link vencido, e que o "entrar" escrito na conversa leva aonde o último
// link levava. Roda com `npx tsx scripts/testar-entrar-pelo-aviso.ts`.

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

const SEM_A_FUNCAO = "sem a função";
let modelos: Record<string, unknown> = {};
let itens: any[] = [];
let enviados: any[] = [];
let marcas: any[] = [];
let tokenDoAviso: string | null = null;
let pedidosDoAviso: any[] = [];
let verEntrada: any = null;
let destinoDaEntrada: any = null;
let pedidosDeVer = 0;
let ultimoDestino: string | null = null;
let criadas: any[] = [];

const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
const semFuncao = () => json({ code: "PGRST202", details: null, hint: null, message: "Could not find the function" }, 404);

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
  if (u.includes("/rpc/servidor_entrada_para_aviso")) {
    pedidosDoAviso.push(corpo);
    return tokenDoAviso === SEM_A_FUNCAO ? semFuncao() : json(tokenDoAviso);
  }
  if (u.includes("/rpc/servidor_ver_entrada_whatsapp")) {
    pedidosDeVer++;
    return json(verEntrada);
  }
  if (u.includes("/rpc/servidor_destino_da_entrada"))
    return destinoDaEntrada === SEM_A_FUNCAO ? semFuncao() : json(destinoDaEntrada);
  if (u.includes("/rpc/servidor_ultimo_destino_de_entrada")) return json(ultimoDestino);
  if (u.includes("/rpc/servidor_criar_entrada_whatsapp")) {
    criadas.push(corpo);
    return json("d".repeat(64));
  }
  if (u.includes("/rpc/config_publica"))
    return json([{ ia_melhorar_texto: true, ia_modelo: "gpt-6-luna", ia_modelos: {}, ia_apelido: null }]);
  if (u.includes("/rpc/")) return json(null);
  return json(null);
}) as typeof fetch;

const CONTA = "aaaaaaaa-1111-2222-3333-444444444444";
const VAGA = "bbbbbbbb-1111-2222-3333-444444444444";
const CANDIDATO = "cccccccc-1111-2222-3333-444444444444";
// o WhatsApp guarda o número sem o 9; o login é com o 9
const NUMERO = "556282028335";
const LOGIN = "5562982028335";

const aviso = (x: any = {}) => ({
  id: 1,
  tipo: "curtida",
  conta_id: CONTA,
  numero: NUMERO,
  quantos: 1,
  anuncio_id: VAGA,
  ator_id: CANDIDATO,
  tentativas: 1,
  aviso: { tipo: "curtida", link: null, recado_id: null, texto: "Ana S. se candidatou." },
  dados: {
    nome: "Super Box",
    conta_tipo: "empresa",
    vaga: "Vendedor",
    anuncio_tipo: "vaga",
    empresa: null,
    ator: "Ana S.",
    esperando: 1,
    entrevista: null,
  },
  ...x,
});

const botaoDoModelo = (corpo: any) =>
  corpo?.template?.components?.find((c: any) => c.type === "button" && c.sub_type === "url")?.parameters?.[0]?.text ?? null;

async function main() {
  const w = await import("../src/lib/servidor/whatsapp");
  const ent = await import("../src/lib/servidor/entrar-pelo-whatsapp");
  const a = await import("../src/lib/servidor/atendimento-whatsapp");
  modelos = Object.fromEntries(w.MODELOS.map((m) => [m.nome, { status: "APPROVED", categoria: m.categoria ?? "UTILITY" }]));

  const rodarFila = async (item: any) => {
    itens = [item];
    enviados = [];
    marcas = [];
    pedidosDoAviso = [];
    await w.enviarWhatsappPendentes();
    return enviados.find((e) => e?.type === "template");
  };

  // --- 1. O botão do aviso --------------------------------------------------------------------------------------
  const fim = w.linkDoBotao(aviso() as any);
  conferir(/^painel\//.test(fim) && fim.includes("utm_"), "o link de sempre: o painel, com a origem do WhatsApp", fim);

  // a conta entra por este número: o botão já entra, para o mesmo destino
  tokenDoAviso = "e".repeat(64);
  let saiu = await rodarFila(aviso());
  conferir(botaoDoModelo(saiu) === `entrar/whatsapp?t=${"e".repeat(64)}`, "o botão do aviso entra com um toque", botaoDoModelo(saiu));
  conferir(pedidosDoAviso.length === 1, "um link por aviso", pedidosDoAviso);
  const p = pedidosDoAviso[0] ?? {};
  conferir(p.p_destino === `/${fim}`, "o link de entrar leva aonde o botão levava", p);
  conferir(p.p_conta === CONTA && p.p_numero === NUMERO, "o link é da conta e do número do aviso", p);
  conferir(p.p_horas === ent.HORAS_DO_LINK_DO_AVISO && ent.HORAS_DO_LINK_DO_AVISO === 168, "vale 7 dias", p);
  conferir(marcas.some((m) => m.p_situacao === "enviada"), "o aviso sai", marcas);

  // o lembrete de 1 e 3 dias também (o link novo, para quem não abriu o primeiro)
  saiu = await rodarFila(aviso({ tipo: "lembrete_curtida", aviso: { tipo: "lembrete_curtida", link: null, recado_id: null, texto: "" } }));
  conferir(saiu?.template?.name === "publike_esperando_resposta_v3", "o lembrete sai pelo modelo dele", saiu?.template?.name);
  conferir(botaoDoModelo(saiu) === `entrar/whatsapp?t=${"e".repeat(64)}`, "o lembrete também entra com um toque", botaoDoModelo(saiu));

  // a conta entra de outro jeito (o e-mail com outro WhatsApp, a equipe): o link de sempre
  tokenDoAviso = null;
  saiu = await rodarFila(aviso());
  conferir(botaoDoModelo(saiu) === fim, "sem o link de entrar: o botão de sempre", botaoDoModelo(saiu));

  // sem a migração: o link de sempre, e o aviso sai
  tokenDoAviso = SEM_A_FUNCAO;
  saiu = await rodarFila(aviso());
  conferir(botaoDoModelo(saiu) === fim && marcas.some((m) => m.p_situacao === "enviada"), "sem a migração: o botão de sempre", botaoDoModelo(saiu));

  // o modelo sem link (as respostas do "te respondeu?"): nada de link de entrar
  tokenDoAviso = "e".repeat(64);
  saiu = await rodarFila(aviso({ tipo: "te_respondeu", aviso: { tipo: "te_respondeu", link: null, recado_id: null, texto: "" } }));
  conferir(saiu?.template?.name === "publike_te_respondeu" && pedidosDoAviso.length === 0, "modelo sem link: não cria link de entrar", pedidosDoAviso);

  // o destino que não é um caminho do site não vira link de entrar (nem chama o banco)
  const cliente: any = {
    rpc: async (nome: string, args: any) => {
      pedidosDoAviso.push({ nome, ...args });
      return { data: "e".repeat(64), error: null };
    },
  };
  pedidosDoAviso = [];
  conferir(
    (await ent.linkDoAvisoComEntrar({ cliente, chave: "k" }, { conta_id: CONTA, numero: NUMERO }, "painel?x=a+b")) === null &&
      pedidosDoAviso.length === 0,
    "destino com caractere fora do site: fica o de sempre",
    pedidosDoAviso,
  );
  conferir(
    (await ent.linkDoAvisoComEntrar({ cliente, chave: "k" }, { conta_id: CONTA, numero: NUMERO }, `painel/${"x".repeat(300)}`)) === null,
    "destino longo demais: fica o de sempre",
  );

  // --- 2. A página do link --------------------------------------------------------------------------------------
  conferir(ent.naContaDoNumero(LOGIN, NUMERO), "a sessão com o 9 é a conta do número sem o 9");
  conferir(ent.naContaDoNumero(`+${LOGIN}`, LOGIN), "com o + também");
  conferir(!ent.naContaDoNumero("5562999990000", NUMERO), "outra conta não vai direto");
  conferir(!ent.naContaDoNumero(null, NUMERO) && !ent.naContaDoNumero(undefined, NUMERO), "sem sessão não vai direto");

  pedidosDeVer = 0;
  conferir((await ent.verLinkDeEntrar("nao-e-token")) === null && pedidosDeVer === 0, "o token torto nem vai ao banco");

  const token = "f".repeat(64);
  verEntrada = { numero: NUMERO, destino: "/painel/caixa?c=1" };
  let visto = await ent.verLinkDeEntrar(token);
  conferir(visto?.vale === true && visto.link.destino === "/painel/caixa?c=1" && visto.link.numero === NUMERO, "o link valendo", visto);

  verEntrada = null;
  destinoDaEntrada = { numero: NUMERO, destino: "/painel/caixa?c=1" };
  visto = await ent.verLinkDeEntrar(token);
  conferir(visto?.vale === false && visto.link.destino === "/painel/caixa?c=1", "o link usado ou vencido: o número e o destino", visto);

  destinoDaEntrada = null;
  conferir((await ent.verLinkDeEntrar(token)) === null, "o link que não existe");

  destinoDaEntrada = SEM_A_FUNCAO;
  conferir((await ent.verLinkDeEntrar(token)) === null, "sem a migração: o link vencido de sempre");

  verEntrada = { numero: NUMERO, destino: "https://golpe.example" };
  visto = await ent.verLinkDeEntrar(token);
  conferir(visto?.link.destino === "/perfil/curriculo", "o destino de fora do site não vale", visto);

  conferir(
    (await import("../src/lib/whatsapp-oficial")).linkDoEntrar() === "https://wa.me/556284771907?text=entrar",
    "o pedido de outro link: o wa.me com entrar",
  );

  // --- 3. O "entrar" na conversa --------------------------------------------------------------------------------
  const entrada = (x: any = {}) => ({
    chave: NUMERO,
    nova: false,
    nome: "Super Box",
    perfil: "contratar",
    situacao: "robo",
    pediu_equipe: false,
    respostas_hoje: 0,
    limite: 30,
    ligado: true,
    origem: null,
    conta: CONTA,
    historico: [
      { de: "publike", texto: "Pronto! Sua vaga de Vendedor está no ar ✅", em: "2026-11-25T19:52:00Z" },
      { de: "pessoa", texto: "entrar", em: "2026-11-28T12:00:00Z" },
    ],
    ...x,
  });
  let e: any = entrada();
  const banco: any = {
    rpc: async (nome: string) => {
      if (nome === "servidor_whatsapp_conversa_entrada") return { data: e, error: null };
      if (nome === "servidor_whatsapp_conversa_ultima")
        return { data: { wamid: "w1", situacao: e.situacao, perfil: e.perfil, historico: e.historico }, error: null };
      if (nome === "servidor_whatsapp_vagas_config") return { data: { ligado: false }, error: null };
      return { data: null, error: null };
    },
  };
  const cfg: any = { base: "https://graph.facebook.com/v24.0", token: "t", phoneId: "1" };
  const falar = async (texto: string) => {
    enviados = [];
    criadas = [];
    await a.atenderConversa(
      cfg,
      banco,
      "k",
      { wamid: "w1", numero: NUMERO, texto, payload: null, nome: "Super Box", origem: null, audio: null, local: null } as any,
      { espera: { texto: 0, botao: 0 }, agora: new Date("2026-11-28T12:00:00Z") },
    );
    return enviados.find((x) => x?.type === "interactive" && x.interactive?.type === "cta_url");
  };

  // dias depois do aviso: o link novo leva à candidatura (o destino do último link do número)
  ultimoDestino = `/${fim}`;
  let resposta = await falar("entrar");
  conferir(criadas[0]?.p_destino === `/${fim}`, "o link novo leva aonde o aviso levava", criadas);
  conferir(
    String(resposta?.interactive?.action?.parameters?.url ?? "").startsWith(`https://publike.org/entrar/whatsapp?t=${"d".repeat(64)}`),
    "o botão Entrar no Publike, com o link novo",
    resposta?.interactive?.action,
  );

  // sem link nos últimos 7 dias: o painel de quem contrata
  ultimoDestino = null;
  resposta = await falar("Entrar");
  conferir(criadas[0]?.p_destino === "/painel" && Boolean(resposta), "sem link recente: o painel", criadas);

  // o destino que não é um caminho do site não vale: o de sempre
  ultimoDestino = "https://golpe.example";
  await falar("entrar");
  conferir(criadas[0]?.p_destino === "/painel", "o último destino de fora do site não vale", criadas);

  // quem procura trabalho: o currículo
  e = entrada({ perfil: "trabalho" });
  ultimoDestino = null;
  await falar("entrar");
  conferir(criadas[0]?.p_destino === "/perfil/curriculo", "quem procura trabalho: o currículo", criadas);

  // o texto da conta nova não fala mais do código
  const v = await import("../src/lib/servidor/vaga-pelo-whatsapp");
  conferir(
    v.CONTA_NOVA_PELO_WHATSAPP.includes("*entrar*") && !/c[óo]digo/i.test(v.CONTA_NOVA_PELO_WHATSAPP),
    "a conta nova: escreva entrar, sem código",
    v.CONTA_NOVA_PELO_WHATSAPP,
  );

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `\n${total} conferências, todas certas.`);
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
