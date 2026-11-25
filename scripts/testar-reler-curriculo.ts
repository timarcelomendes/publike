// O robô das filas relendo o arquivo de quem ouviu "por aqui eu não consigo abrir" (src/lib/servidor/atendimento-whatsapp.ts,
// `enviarLembretesWhatsapp`; migrações 20270921120000 e 20270930120000), sem banco, sem a Meta e sem a IA: o `fetch` é
// trocado por respostas prontas. Confere que quem procura trabalho e mandou um arquivo que não é currículo (a Arlete
// mandou a Carteira de Trabalho Digital) recebe o porquê de verdade, com Montar meu currículo e Agora não, e que quem
// ainda não disse o que quer não recebe nada. Roda com `npx tsx scripts/testar-reler-curriculo.ts`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.OPENAI_API_KEY = "sk-falsa";
process.env.ANTHROPIC_API_KEY = "sk-ant-falsa";
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

let perfil: string | null = "trabalho";
let respostaIA: any = {};
let enviados: any[] = [];
let relidos: any[] = [];
const guardadas: any[] = [];
const json = (x: unknown, status = 200) =>
  new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  const corpo = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  if (u.includes("graph.facebook.com") && u.includes("/messages")) {
    enviados.push(corpo);
    return json({ messages: [{ id: "wamid.saida" }] });
  }
  if (u.includes("graph.facebook.com") && u.includes("midia-pdf"))
    return json({ url: "https://lookaside.fbsbx.com/pdf-1", mime_type: "application/pdf", file_size: 5000 });
  if (u.includes("lookaside.fbsbx.com/pdf-1"))
    return new Response(new Blob([Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(4000)])], { type: "application/pdf" }));
  if (u.includes("/responses"))
    return json({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(respostaIA) }] }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  if (u.includes("anthropic.com"))
    return json({ content: [{ type: "text", text: JSON.stringify(respostaIA) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
  if (u.includes("/rpc/servidor_curriculos_sem_abrir"))
    return json([
      {
        conversa: "556295535283",
        numero: "556295535283",
        nome: "Arlete",
        perfil,
        midias: [{ wamid: "wpdf", tipo: "pdf", midia: "midia-pdf", mime: "application/pdf" }],
      },
    ]);
  if (u.includes("/rpc/servidor_curriculo_relido")) {
    relidos.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/servidor_curriculo_whatsapp_ligado")) return json(true);
  if (u.includes("/rpc/servidor_whatsapp_conversa_saida")) {
    guardadas.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/config_publica"))
    return json([{ ia_melhorar_texto: true, ia_modelo: "gpt-6-luna", ia_modelos: {}, ia_apelido: null }]);
  // o resto das filas (os outros lembretes): nada a fazer
  if (u.includes("/rpc/")) return json([]);
  return json(null);
}) as typeof fetch;

async function main() {
  const a = await import("../src/lib/servidor/atendimento-whatsapp");
  const naoECurriculo = {
    e_curriculo: false,
    o_que_e: "uma Carteira de Trabalho Digital com dados pessoais e contra",
    titulo: "",
    habilidades: [],
    escolaridade: "",
    curso: "",
    outros_estudos: [],
    experiencias: [],
    cursos: [],
    cnh: "",
    disponibilidade: [],
  };

  // a Arlete: procura trabalho e mandou a Carteira de Trabalho Digital
  respostaIA = naoECurriculo;
  await a.enviarLembretesWhatsapp();
  const msgs = enviados.filter((e) => e.type);
  const texto = msgs[0]?.interactive?.body?.text ?? msgs[0]?.text?.body ?? "";
  const botoes = msgs[0]?.interactive?.action?.buttons?.map((b: any) => b.reply.id) ?? [];
  conferir(msgs.length === 1, "a Arlete: uma mensagem", msgs);
  conferir(
    texto.startsWith("Oi, Arlete! Corrigindo o que eu disse mais cedo: abri o arquivo, mas ele parece ser uma Carteira de Trabalho Digital, e não um currículo."),
    "o porquê de verdade, com o nome do documento (sem a descrição cortada)",
    texto,
  );
  conferir(botoes.join("|") === "a:cv-montar|a:cv-nao", "com Montar meu currículo e Agora não", botoes);
  conferir(guardadas.length === 1 && String(guardadas[0].p_texto).includes("[Botões: Montar meu currículo · Agora não]"), "a mensagem fica na conversa, com os botões", guardadas);
  conferir(relidos.at(-1)?.p_resultado?.startsWith("porquê mandado: a IA disse que não é currículo: uma Carteira de Trabalho Digital"), "o relido registra o porquê mandado", relidos);
  console.log(`\n--- a correção para a Arlete ---\n${texto}\n---`);

  // quem ainda não disse o que quer (pode ser uma vaga): nada sai
  perfil = null;
  enviados = [];
  relidos = [];
  await a.enviarLembretesWhatsapp();
  conferir(enviados.filter((e) => e.type).length === 0, "sem perfil: nada sai", enviados);
  conferir(relidos.at(-1)?.p_resultado?.startsWith("não deu: a IA disse que não é currículo"), "sem perfil: só o registro", relidos);

  console.log(falhas ? `\n${falhas} de ${total} conferências falharam.` : `\n${total} conferências, todas certas.`);
  if (falhas) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
