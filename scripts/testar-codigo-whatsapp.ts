// O código de entrar pelo WhatsApp (20/11/2026; migrações 20270817120000 e 20270818120000): a assinatura do gancho
// "Send SMS" do Supabase (Standard Webhooks), o envio só na janela de 24 horas, sem guardar o código na conversa, o
// celular do login (com o 9), o que a mensagem diz sobre a conta (o e-mail escondido, ou o aviso para quem cria conta
// com um número que está no cadastro de outra), a troca de celular pelo Auth recusada e a impressão do código de ligar.
// Roda com `npx tsx scripts/testar-codigo-whatsapp.ts` (sai com erro se algo mudou).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";
process.env.PUBLIKE_URL_PUBLICA = "https://publike.org";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SECRET_KEY = "segredo-falso";
process.env.WHATSAPP_TOKEN = "t";
process.env.WHATSAPP_PHONE_ID = "123456";
process.env.WHATSAPP_GRAPH_URL = "http://127.0.0.1:54400";
delete process.env.SUPABASE_SMS_HOOK_SECRET;

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}`, detalhe === undefined ? "" : JSON.stringify(detalhe));
}

let conversa: any = { conversa: "556282028335", numero: "556282028335", na_janela: true };
/** o que o banco responde sobre as contas do número; null: a função ainda não existe (404) */
let contas: any = { conta: null, declaradas: [] };
const meta: any[] = [];
const saidas: any[] = [];
const pedidosDeContas: any[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  const corpo = init?.body ? JSON.parse(String(init.body)) : null;
  if (u.includes("/rpc/servidor_whatsapp_codigo")) return new Response(JSON.stringify(conversa), { status: 200 });
  if (u.includes("/rpc/servidor_whatsapp_contas_do_numero")) {
    pedidosDeContas.push(corpo);
    if (contas === null) return new Response(JSON.stringify({ code: "PGRST202", message: "não existe" }), { status: 404 });
    return new Response(JSON.stringify(contas), { status: 200 });
  }
  if (u.includes("/rpc/servidor_whatsapp_conversa_saida")) {
    saidas.push(corpo);
    return new Response("null", { status: 200 });
  }
  if (u.includes("/messages")) {
    meta.push(corpo);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.codigo" }] }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

function zerar() {
  meta.length = 0;
  saidas.length = 0;
  pedidosDeContas.length = 0;
  conversa = { conversa: "556282028335", numero: "556282028335", na_janela: true };
  contas = { conta: null, declaradas: [] };
}

async function main() {
  const c = await import("../src/lib/servidor/codigo-whatsapp");
  const t = await import("../src/lib/telefone-login");

  // 1. o celular do login: sempre 55 e, no celular, o 9
  const formatos: [string, string | null][] = [
    ["(62) 8202-8335", "5562982028335"],
    ["556282028335", "5562982028335"],
    ["+55 62 98202-8335", "5562982028335"],
    ["62982028335", "5562982028335"],
    ["6232221234", "556232221234"],
    ["556232221234", "556232221234"],
    ["55999998888", "5555999998888"],
    ["123", null],
    ["", null],
    ["6212345678901", null],
    ["0682028335", null],
    ["62182028335", null],
  ];
  for (const [entrada, esperado] of formatos)
    conferir(t.telefoneDoLogin(entrada) === esperado, `formato: ${entrada || "(vazio)"}`, t.telefoneDoLogin(entrada));
  conferir(
    JSON.stringify(t.numerosDoWhatsapp("556282028335")) === JSON.stringify(["5562982028335", "556282028335"]),
    "variantes: com e sem o 9",
  );
  conferir(JSON.stringify(t.numerosDoWhatsapp("6232221234")) === JSON.stringify(["556232221234"]), "variantes: fixo, uma só");
  conferir(t.numerosDoWhatsapp("abc").length === 0, "variantes: inválido, nenhuma");

  // 2. a assinatura, como o Supabase manda
  const bytes = Buffer.from("um-segredo-de-teste-com-32-bytes!!");
  const segredo = `v1,whsec_${bytes.toString("base64")}`;
  const corpo = JSON.stringify({ user: { phone: "5562982028335" }, sms: { otp: "123456" } });
  const agora = 1_800_000_000;
  const assinar = (id: string, ts: number, b: string) =>
    `v1,${createHmac("sha256", bytes).update(`${id}.${ts}.${b}`).digest("base64")}`;
  const cab = { id: "msg_1", timestamp: String(agora), assinatura: assinar("msg_1", agora, corpo) };
  conferir(c.assinaturaDoGanchoValida(segredo, cab, corpo, agora), "assinatura certa passa");
  conferir(!c.assinaturaDoGanchoValida(segredo, cab, corpo.replace("123456", "654321"), agora), "corpo mexido não passa");
  conferir(!c.assinaturaDoGanchoValida(segredo, cab, corpo, agora + 600), "assinatura velha (10 min) não passa");
  conferir(!c.assinaturaDoGanchoValida("v1,whsec_outro", cab, corpo, agora), "outro segredo não passa");
  conferir(
    c.assinaturaDoGanchoValida(segredo, { ...cab, assinatura: `v1,xxxx ${cab.assinatura}` }, corpo, agora),
    "várias assinaturas: vale a que bate",
  );
  conferir(!c.assinaturaDoGanchoValida(segredo, { ...cab, id: null }, corpo, agora), "sem o id: não passa");

  // 3. na janela: manda pelo número da conversa (sem o 9) e guarda só a marca
  zerar();
  let r = await c.mandarCodigoPeloWhatsapp("5562982028335", "123456");
  conferir(r.ok && meta.length === 1 && meta[0].to === "556282028335", "na janela: o código sai para o número da conversa", { r, meta });
  conferir(meta[0]?.text?.body.includes("*123456*"), "a mensagem traz o código");
  conferir(
    saidas.length === 1 && saidas[0].p_texto === c.MARCA_DO_CODIGO && !JSON.stringify(saidas).includes("123456"),
    "a conversa guarda só a marca, sem o código",
    saidas,
  );
  conferir(pedidosDeContas.length === 0, "sem a conta do gancho: não pergunta das contas");

  // fora da janela: não manda, e o erro diz o que fazer
  zerar();
  conversa = { conversa: "556282028335", numero: "556282028335", na_janela: false };
  r = await c.mandarCodigoPeloWhatsapp("5562982028335", "123456");
  conferir(!r.ok && r.mensagem === c.FORA_DA_JANELA && meta.length === 0, "fora da janela: pede o oi antes, sem mandar", r);
  // o Auth não repassa a mensagem: o status só deste caso é o que a tela de entrar reconhece
  conferir(!r.ok && r.status === c.STATUS_FORA_DA_JANELA && c.STATUS_FORA_DA_JANELA === 403, "fora da janela: o status 403", r);
  conferir(c.FORA_DA_JANELA.includes("(62) 98477-1907"), "fora da janela: diz o número do Publike");
  // sem conversa nenhuma
  conversa = { conversa: null, numero: null, na_janela: false };
  r = await c.mandarCodigoPeloWhatsapp("5562999990000", "123456");
  conferir(!r.ok && meta.length === 0, "sem conversa: não manda", r);
  conferir(!(await c.mandarCodigoPeloWhatsapp("5562982028335", "abc")).ok, "código estranho: recusa");

  // 4. o gancho: a troca de celular pelo Auth é recusada, sem mandar nada
  zerar();
  r = await c.codigoDoGancho({ id: "u1", phone: "5562911112222", new_phone: "5562982028335", email: "a@b.com" }, "123456");
  conferir(!r.ok && r.mensagem === c.TROCA_PELO_PERFIL && meta.length === 0, "troca de celular (new_phone): recusada", r);
  r = await c.codigoDoGancho({ id: "u1", phone: "", new_phone: "5562982028335" }, "123456");
  conferir(!r.ok && meta.length === 0, "troca de celular sem celular antes: recusada", r);
  r = await c.codigoDoGancho({ id: "u1", phone: "" }, "123456");
  conferir(!r.ok && meta.length === 0 && pedidosDeContas.length === 0, "sem celular: recusa", r);

  // conta com e-mail que entra pelo WhatsApp: a mensagem diz em qual conta entra
  zerar();
  contas = { conta: "m•••@gmail.com", declaradas: ["x•••@gmail.com"] };
  r = await c.codigoDoGancho(
    { id: "u-com-email", phone: "5562982028335", email: "marcelo@gmail.com", phone_confirmed_at: "2026-11-20T10:00:00Z" },
    "654321",
  );
  const comEmail = meta[0]?.text?.body ?? "";
  conferir(r.ok && comEmail.includes("*654321*"), "com e-mail: manda o código", { r, comEmail });
  conferir(comEmail.includes("Ele entra na sua conta com o e-mail m•••@gmail.com."), "com e-mail: diz o e-mail escondido da conta", comEmail);
  conferir(!comEmail.includes("x•••") && !comEmail.includes("Atenção"), "com e-mail: não fala de outras contas", comEmail);
  conferir(!comEmail.includes("marcelo@gmail.com"), "com e-mail: o e-mail inteiro nunca vai", comEmail);
  conferir(
    pedidosDeContas.length === 1 && pedidosDeContas[0].p_usuario === "u-com-email" && pedidosDeContas[0].p_numero === "5562982028335",
    "com e-mail: pergunta pela conta do gancho",
    pedidosDeContas,
  );
  conferir(saidas.length === 1 && !JSON.stringify(saidas).includes("654321"), "com e-mail: a conversa guarda só a marca", saidas);

  // conta nova pelo celular, com o número no cadastro de outra conta: o aviso, só no WhatsApp
  zerar();
  contas = { conta: null, declaradas: ["m•••@gmail.com"] };
  r = await c.codigoDoGancho({ id: "u-nova", phone: "5562982028335" }, "111222");
  const nova = meta[0]?.text?.body ?? "";
  conferir(r.ok && nova.includes("*111222*"), "conta nova: manda o código", { r, nova });
  conferir(
    nova.includes("Atenção: este WhatsApp está no cadastro de uma conta com o e-mail m•••@gmail.com.") &&
      nova.includes("entre por ela com o e-mail") &&
      nova.includes("vincule este WhatsApp em Meu perfil") &&
      nova.includes("Com o código acima, você cria uma conta nova."),
    "conta nova: avisa da conta com o número no cadastro",
    nova,
  );
  conferir(nova.indexOf("*111222*") < nova.indexOf("Atenção"), "conta nova: o código vem antes do aviso", nova);
  conferir(saidas.length === 1 && !JSON.stringify(saidas).includes("m•••") && !JSON.stringify(saidas).includes("111222"), "conta nova: a conversa guarda só a marca", saidas);

  // duas contas no cadastro (o banco manda no máximo 2; aqui chegam 3 e vão 2)
  zerar();
  contas = { conta: null, declaradas: ["a•••@gmail.com", "b•••@hotmail.com", "c•••@yahoo.com"] };
  r = await c.codigoDoGancho({ id: "u-nova", phone: "5562982028335" }, "111222");
  const duas = meta[0]?.text?.body ?? "";
  conferir(
    r.ok && duas.includes("de contas com os e-mails a•••@gmail.com e b•••@hotmail.com.") && !duas.includes("c•••"),
    "conta nova: duas contas no aviso, no máximo",
    duas,
  );

  // conta nova sem nenhum cadastro com o número: só o código
  zerar();
  r = await c.codigoDoGancho({ id: "u-nova", phone: "5562982028335" }, "333444");
  const limpa = meta[0]?.text?.body ?? "";
  conferir(r.ok && limpa.includes("*333444*") && !limpa.includes("Atenção") && !limpa.includes("e-mail"), "conta nova sem cadastro: só o código", limpa);

  // conta só de celular, já confirmada (sem e-mail): só o código (a conta já é dela; o aviso é só para conta nova)
  zerar();
  contas = { conta: null, declaradas: ["m•••@gmail.com"], equipe: false };
  r = await c.codigoDoGancho({ id: "u-celular", phone: "5562982028335", phone_confirmed_at: "2026-11-01T10:00:00Z" }, "555666");
  const soCelular = meta[0]?.text?.body ?? "";
  conferir(r.ok && soCelular.includes("*555666*") && !soCelular.includes("Atenção") && !soCelular.includes("Ele entra"), "conta só de celular: só o código", soCelular);

  // conta da equipe do Publike ou da moderação: nunca recebe o código (entra só com o e-mail)
  zerar();
  contas = { conta: "m•••@p•••.org", declaradas: [], equipe: true };
  r = await c.codigoDoGancho({ id: "u-equipe", phone: "5562982028335", email: "marcelo@publike.org", phone_confirmed_at: "2026-11-01T10:00:00Z" }, "121212");
  conferir(!r.ok && r.status === 400 && r.mensagem === c.EQUIPE_SO_COM_EMAIL && meta.length === 0 && saidas.length === 0, "conta da equipe: não manda o código", r);
  zerar();
  contas = { conta: null, declaradas: [], equipe: true };
  r = await c.codigoDoGancho({ id: "u-equipe", phone: "5562982028335", phone_confirmed_at: "2026-11-01T10:00:00Z" }, "121212");
  conferir(!r.ok && meta.length === 0, "conta da equipe sem e-mail: também não manda", r);

  // sem a migração 20270818120000 (a função das contas não existe): manda só o código, sem quebrar
  zerar();
  contas = null;
  r = await c.codigoDoGancho({ id: "u-com-email", phone: "5562982028335", email: "marcelo@gmail.com" }, "777888");
  const semMigracao = meta[0]?.text?.body ?? "";
  conferir(r.ok && semMigracao.includes("*777888*") && !semMigracao.includes("Ele entra"), "sem a função das contas: só o código", semMigracao);

  // fora da janela, mesmo com conta: nada sai (nem o aviso)
  zerar();
  contas = { conta: null, declaradas: ["m•••@gmail.com"] };
  conversa = { conversa: "556282028335", numero: "556282028335", na_janela: false };
  r = await c.codigoDoGancho({ id: "u-nova", phone: "5562982028335" }, "999000");
  conferir(!r.ok && r.status === 403 && r.mensagem === c.FORA_DA_JANELA && meta.length === 0 && saidas.length === 0, "fora da janela: nada sai", r);

  // 5. a mensagem do código de ligar
  const ligar = c.textoDoCodigoDeLigar("246810");
  conferir(ligar.includes("*246810*") && ligar.includes("vincular este WhatsApp à sua conta") && ligar.includes("Não passe"), "código de ligar: o texto", ligar);

  // 6. a impressão do código de ligar: sem o segredo, null; com ele, muda com a pessoa, o número e o código
  conferir(c.impressaoDoCodigoDeLigar("u1", "5562982028335", "123456") === null, "impressão: sem o segredo, null");
  process.env.SUPABASE_SMS_HOOK_SECRET = segredo;
  const h = c.impressaoDoCodigoDeLigar("u1", "5562982028335", "123456");
  conferir(typeof h === "string" && /^[0-9a-f]{64}$/.test(h), "impressão: 64 letras hex (o que o banco aceita)", h);
  conferir(h === c.impressaoDoCodigoDeLigar("u1", "5562982028335", "123456"), "impressão: a mesma para o mesmo pedido");
  conferir(h !== c.impressaoDoCodigoDeLigar("u2", "5562982028335", "123456"), "impressão: outra pessoa, outra impressão");
  conferir(h !== c.impressaoDoCodigoDeLigar("u1", "5562911112222", "123456"), "impressão: outro número, outra impressão");
  conferir(h !== c.impressaoDoCodigoDeLigar("u1", "5562982028335", "123457"), "impressão: outro código, outra impressão");
  conferir(!String(h).includes("123456"), "impressão: não traz o código");

  if (falhas) {
    console.error(`\n${falhas} de ${total} conferências falharam.`);
    process.exit(1);
  }
  console.log(`${total} conferências, todas certas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
