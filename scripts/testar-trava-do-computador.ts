// A trava do computador (20/11/2026): sem endereço público (o site em localhost), nada sai pela Meta de verdade, porque
// os links chegariam quebrados (as 7 mensagens do "Procurar de novo" mandadas do Admin do computador, com links em
// localhost:3000). Com a Meta falsa dos testes, sai; ler (GET) também pode. Roda com
// `npx tsx scripts/testar-trava-do-computador.ts` (sai com erro se algo mudou).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
delete process.env.PUBLIKE_URL_PUBLICA;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (ok) return;
  falhas++;
  console.error(`✗ ${nome}`, detalhe === undefined ? "" : JSON.stringify(detalhe));
}

const chamadas: string[] = [];
globalThis.fetch = (async (url: string | URL | Request) => {
  chamadas.push(String(url));
  return new Response(JSON.stringify({ messages: [{ id: "wamid.teste" }], data: [] }), { status: 200 });
}) as typeof fetch;

async function main() {
  const w = await import("../src/lib/servidor/whatsapp");
  const real = { token: "t", phoneId: "123456", wabaId: "", appSecret: "", webhookToken: "", base: "https://graph.facebook.com/v24.0" };
  const falsa = { ...real, base: "http://127.0.0.1:54400/v24.0" };

  const r1 = await w.enviarTexto(real, "5562999999999", "oi");
  conferir(!r1.ok && chamadas.length === 0, "no computador, a Meta de verdade não recebe a mensagem", r1);
  conferir(!r1.ok && /Admin no ar/.test(r1.erro ?? ""), "o motivo diz para mandar pelo Admin no ar", r1);

  const r2 = await w.enviarTexto(falsa, "5562999999999", "oi");
  conferir(r2.ok && chamadas.length === 1, "com a Meta falsa dos testes, sai", r2);

  conferir(w.bloqueioDaMeta(real) !== null && w.bloqueioDaMeta(falsa) === null, "a trava só vale para a Meta de verdade");

  // com o endereço público no computador, libera
  process.env.PUBLIKE_URL_PUBLICA = "https://publike.org";
  conferir(w.bloqueioDaMeta(real) === null, "com PUBLIKE_URL_PUBLICA, libera");

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
