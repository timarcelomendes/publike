// A função de novo, no lugar da pergunta do currículo (26/11/2026; Marcelo, com a conversa da Liz, que disse só o bairro
// e recebeu as vagas de todas as funções: "nesses casos, pergunte novamente"), pelo robô das filas
// (`enviarLembretesWhatsapp`), sem banco e sem a Meta. Roda com `npx tsx scripts/testar-funcao-de-novo.ts`.

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

let historico: any[] = [];
let enviados: any[] = [];
const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (u.includes("graph.facebook.com") && u.includes("/messages")) {
    enviados.push(corpo);
    return json({ messages: [{ id: "wamid.saida" }] });
  }
  if (u.includes("/rpc/servidor_whatsapp_pergunta_curriculo")) return json([{ chave: "556299994076", numero: "556299994076" }]);
  if (u.includes("/rpc/servidor_whatsapp_conversa_ultima"))
    return json({ wamid: "w1", situacao: "robo", perfil: "trabalho", historico });
  if (u.includes("/rpc/")) return json([]);
  return json(null);
}) as typeof fetch;

const corpo = (m: any) => m?.text?.body ?? m?.interactive?.body?.text ?? "";

async function main() {
  const a = await import("../src/lib/servidor/atendimento-whatsapp");

  // a Liz: disse só o bairro; as vagas de todas as funções pediam a função, e ela não respondeu
  historico = [
    { de: "pessoa", texto: "Olá! Tenho interesse nas vagas." },
    { de: "robo", texto: "Oi, Liz! *Me conta o que você faz e o bairro onde mora.*" },
    { de: "pessoa", texto: "Vila Brasília" },
    {
      de: "robo",
      texto: `Olha as vagas no ar mais perto de você, de todas as funções:\n\n• *Auxiliar comercial* https://publike.org/f/afebc94a\n\n${a.PEDIR_A_FUNCAO_DEPOIS}`,
    },
    { de: "robo", texto: "Quer se candidatar a alguma? Toque na vaga que eu mando a sua candidatura daqui mesmo." },
  ];
  conferir(a.vagasSemAFuncao(historico), "sem a função: reconhece");
  enviados = [];
  await a.enviarLembretesWhatsapp();
  conferir(enviados.length === 1 && corpo(enviados[0]) === a.PERGUNTAR_A_FUNCAO_DE_NOVO, "sem a função: pergunta de novo", enviados);
  conferir(!JSON.stringify(enviados).includes("Montar meu currículo"), "sem a função: sem a oferta do currículo ainda");

  // disse a função depois: as vagas dela (sem o pedido) e, depois, a pergunta do currículo
  historico = [
    ...historico,
    { de: "robo", texto: a.PERGUNTAR_A_FUNCAO_DE_NOVO },
    { de: "pessoa", texto: "sou vendedora" },
    { de: "robo", texto: "Olha as vagas de vendedora perto de você:\n\n• *Vendedora* https://publike.org/f/12345678" },
    { de: "robo", texto: "Quer se candidatar a alguma? Toque na vaga que eu mando a sua candidatura daqui mesmo." },
  ];
  conferir(!a.vagasSemAFuncao(historico), "com a função: não reconhece");
  enviados = [];
  await a.enviarLembretesWhatsapp();
  conferir(
    enviados.length === 1 && JSON.stringify(enviados[0]).includes("Montar meu currículo"),
    "com a função: a pergunta do currículo",
    enviados,
  );

  // sem saber o bairro: o pedido de função e bairro também conta
  conferir(
    a.vagasSemAFuncao([{ de: "pessoa", texto: "oi" }, { de: "robo", texto: `vagas...\n\n${a.PEDIR_FUNCAO_E_BAIRRO_DEPOIS}` }]),
    "função e bairro: reconhece",
  );

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
