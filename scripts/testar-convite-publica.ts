// O convite pelo WhatsApp oficial publica com um toque e o e-mail da conta do WhatsApp (migração 20271012120000): o
// modelo com a vaga escrita e o "Publicar a vaga", o resumo numa linha, o e-mail escrito na conversa e os pedidos.
// Roda com `npx tsx scripts/testar-convite-publica.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.error(`✗ ${nome}${detalhe === undefined ? "" : `\n    ${JSON.stringify(detalhe)}`}`);
  }
}

async function main() {
  const w = await import("../src/lib/servidor/whatsapp");
  const cw = await import("../src/lib/servidor/convites-whatsapp");
  const v = await import("../src/lib/servidor/vaga-pelo-whatsapp");
  const l = await import("../src/lib/leitura-de-vagas");

  // o modelo
  const m = w.MODELOS.find((x) => x.nome === cw.MODELO_DO_CONVITE)!;
  conferir(Boolean(m) && m.categoria === "MARKETING", "o modelo do convite existe, de marketing");
  conferir(!w.MODELOS.some((x) => x.nome === "publike_vaga_pronta"), "o modelo antigo, só com o link, saiu");
  conferir(m.botoes[0].tipo === "resposta" && m.botoes[0].texto === "Publicar a vaga", "1º botão: Publicar a vaga");
  conferir(m.botoes[1].tipo === "link" && m.botoes[1].texto === "Conferir no site", "2º botão: Conferir no site");
  conferir(m.corpo.includes("criada com este WhatsApp"), "o corpo conta que a conta nasce com o número");
  const cad = w.cadastroDoModelo(m) as any;
  const botoes = cad.components.find((c: any) => c.type === "BUTTONS").buttons;
  conferir(botoes[0].type === "QUICK_REPLY" && botoes[1].type === "URL", "o cadastro na Meta", botoes);

  // o envio: o payload do toque e o link
  let corpo: any = null;
  globalThis.fetch = (async (_url: string, init: any) => {
    corpo = JSON.parse(init.body);
    return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }], contacts: [{ wa_id: "556288887777" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as any;
  const cfg = { token: "t", phoneId: "1", wabaId: "2", appSecret: "s", webhookToken: "x", base: "https://graph.facebook.com/v21.0" };
  process.env.PUBLIKE_URL_PUBLICA = "https://publike.org";
  const token = "a".repeat(64);
  const envio = await w.enviarModelo(
    cfg,
    "5562988887777",
    m,
    { empresa: "Padaria", vaga: "Atendente" },
    { link: "publicar?convite=b", respostas: [`a:publicar:${token}`] },
  );
  conferir(envio.ok && (envio as any).waId === "556288887777", "o envio devolve o wa_id", envio);
  const comps = corpo?.template?.components ?? [];
  const qr = comps.find((c: any) => c.sub_type === "quick_reply");
  const url = comps.find((c: any) => c.sub_type === "url");
  conferir(qr?.index === "0" && qr.parameters[0].payload === `a:publicar:${token}`, "o toque publica a vaga preparada", qr);
  conferir(url?.index === "1" && url.parameters[0].text === "publicar?convite=b", "o link do convite", url);

  // o resumo numa linha (a variável da Meta não aceita quebra de linha)
  const r = l.resumoNumaLinha({
    titulo: "Atendente de padaria",
    descricao: "",
    categoria: "",
    regime: "clt",
    salario: 1800,
    salario_ate: null,
    unidade: "mes",
    beneficios: ["vale_transporte"],
    cidade: "Goiânia",
    bairro: "Setor Bueno",
    quantidade: 2,
  });
  conferir(!/[\n*]/.test(r) && r.startsWith("Atendente de padaria") && r.includes("Setor Bueno"), "resumo numa linha", r);
  conferir(!/ {4}/.test(r) && r.length <= 300, "sem espaços seguidos, até 300 letras", r);
  conferir(cw.textoDoConviteDoModelo("Padaria", r, "publicar?convite=b", "https://publike.org").includes(r), "o texto guardado");

  // o e-mail escrito
  conferir(v.emailEscrito("ana@padaria.com.br") === "ana@padaria.com.br", "só o e-mail");
  conferir(v.emailEscrito("Meu email é Ana@Gamil.com") === "ana@gamil.com", "na frase, em minúsculas");
  conferir(v.emailEscrito("a@b.com ou c@d.com") === null, "dois e-mails: não");
  conferir(v.emailEscrito("quero publicar uma vaga") === null, "sem e-mail");
  const bt = v.botoesDoEmailCorrigido("ana@gmail.com", "ana@gamil.com");
  conferir(bt.every((b) => b.titulo.length <= 20 && b.id.length <= 256), "os botões cabem", bt);
  conferir(v.PAYLOAD_EMAIL.exec(bt[0].id)?.[1] === "ana@gmail.com", "o botão leva o e-mail certo");
  conferir(v.pedidoDoEmail().includes(v.MARCA_DO_EMAIL) && v.pedidoDoEmail(false).includes(v.MARCA_DO_EMAIL), "o pedido tem a marca");
  conferir(!v.pedidoDoEmail(false).includes("por aqui"), "sem os avisos pelo WhatsApp, não promete por aqui");

  // o motivo da vaga do lote que não saiu (26/11/2026: "nesses casos, o ideal é informar o motivo")
  const pw = await import("../src/lib/servidor/publicar-no-whatsapp");
  const mr = pw.motivoDoAcerto({ tipo: "regime", token: "t", titulo: "Secretária" });
  conferir(mr === "*Secretária*: falta dizer o tipo de contratação (CLT, PJ, freelancer…).", "motivo: o tipo", mr);
  const ms = pw.motivoDoAcerto({ tipo: "site", token: "t", erros: ["Escreva o salário."], titulo: "Vendedor" });
  conferir(ms === "*Vendedor*: escreva o salário.", "motivo: a regra do site", ms);
  const mf = pw.motivoDoAcerto({ tipo: "fora", token: "t", lugar: "Barueri, SP" });
  conferir(Boolean(mf?.startsWith("Uma vaga: é de Barueri, SP")), "motivo: fora da região, sem título", mf);
  conferir(pw.motivoDoAcerto({ tipo: "ja", anuncioId: null }) === null, "a que já está no ar não tem motivo");

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
