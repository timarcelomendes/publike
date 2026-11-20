// O código de entrar pelo WhatsApp (20/11/2026; migração 20270817120000): a assinatura do gancho "Send SMS" do
// Supabase (Standard Webhooks) e o envio só na janela de 24 horas, sem guardar o código na conversa. Roda com
// `npx tsx scripts/testar-codigo-whatsapp.ts` (sai com erro se algo mudou).

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

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}`, detalhe === undefined ? "" : JSON.stringify(detalhe));
}

let conversa: any = { conversa: "556282028335", numero: "556282028335", na_janela: true };
const meta: any[] = [];
const saidas: any[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url);
  const corpo = init?.body ? JSON.parse(String(init.body)) : null;
  if (u.includes("/rpc/servidor_whatsapp_codigo")) return new Response(JSON.stringify(conversa), { status: 200 });
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

async function main() {
  const c = await import("../src/lib/servidor/codigo-whatsapp");
  // a assinatura, como o Supabase manda
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

  // na janela: manda pelo número da conversa (sem o 9) e guarda só a marca
  let r = await c.mandarCodigoPeloWhatsapp("5562982028335", "123456");
  conferir(r.ok && meta.length === 1 && meta[0].to === "556282028335", "na janela: o código sai para o número da conversa", { r, meta });
  conferir(meta[0]?.text?.body.includes("*123456*"), "a mensagem traz o código");
  conferir(saidas.length === 1 && saidas[0].p_texto === c.MARCA_DO_CODIGO && !JSON.stringify(saidas).includes("123456"), "a conversa guarda só a marca, sem o código", saidas);

  // fora da janela: não manda, e o erro diz o que fazer
  conversa = { conversa: "556282028335", numero: "556282028335", na_janela: false };
  r = await c.mandarCodigoPeloWhatsapp("5562982028335", "123456");
  conferir(!r.ok && r.mensagem === c.FORA_DA_JANELA && meta.length === 1, "fora da janela: pede o oi antes, sem mandar", r);
  // sem conversa nenhuma
  conversa = { conversa: null, numero: null, na_janela: false };
  r = await c.mandarCodigoPeloWhatsapp("5562999990000", "123456");
  conferir(!r.ok && meta.length === 1, "sem conversa: não manda", r);
  conferir(!(await c.mandarCodigoPeloWhatsapp("5562982028335", "abc")).ok, "código estranho: recusa");

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
