"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { camposLidos } from "@/lib/ia/curriculo-do-arquivo";
import { montarCurriculoDaConversa, proximaPergunta, type PerguntaComOpcoes } from "@/lib/ia/curriculo-pelo-whatsapp";
import { modeloPara } from "@/lib/ia/funcionalidades";
import { iaConfigurada } from "@/lib/ia/openai";
import { perguntasGuardadasDoTexto } from "@/lib/servidor/curriculo-pelo-whatsapp";
import { registrarFalha, textoDoErro } from "@/lib/servidor/falhas";
import { dentroDoLimite } from "@/lib/servidor/limite";
import { modeloComCota, type LeituraDoArquivo } from "@/lib/servidor/ler-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// "Montar conversando" em Meu currículo (22/11/2026; claude/plano-curriculo-otimizado.md, fase 2; Marcelo: "vamos
// lá"): o mesmo jeito do currículo pelo WhatsApp, no site. A pessoa conta o que procura e onde trabalhou, responde 3
// perguntas de recrutador (uma de cada vez, com opções quando cabem), depois estudo, cursos, CNH e horário, escrevendo
// ou falando; a IA monta o currículo só com o que ela disse e o formulário vem preenchido para conferir. Nada é salvo
// até ela salvar. As perguntas não gastam a cota da ajuda da IA (o limite é por hora); montar gasta uma.

export type FalaDaConversa = { de: "publike" | "pessoa"; texto: string };

/** A conversa em texto para a IA ("Publike: …" e "Pessoa: …"), com os tamanhos conferidos. */
function transcricaoDe(conversa: FalaDaConversa[]) {
  if (!Array.isArray(conversa) || conversa.length > 16) return null;
  const linhas: string[] = [];
  for (const f of conversa) {
    if (!f || (f.de !== "publike" && f.de !== "pessoa") || typeof f.texto !== "string") return null;
    const t = f.texto.replace(/\s+/g, " ").trim().slice(0, 3000);
    if (t) linhas.push(`${f.de === "pessoa" ? "Pessoa" : "Publike"}: ${t}`);
  }
  return linhas.join("\n\n");
}

async function podeConversar() {
  if (MODO_DEMO) return { ok: false as const, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false as const, erro: "Montar conversando não está disponível agora." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false as const, erro: "Entre na sua conta para continuar." };
  return { ok: true as const, usuario };
}

/** A pergunta `n` (1 a 3) do recrutador, pela conversa até aqui. Sem a IA, a de sempre. */
export async function perguntaParaMontar(
  conversa: FalaDaConversa[],
  n: 1 | 2 | 3,
): Promise<{ ok: true; pergunta: PerguntaComOpcoes } | { ok: false; erro: string }> {
  const pode = await podeConversar();
  if (!pode.ok) return pode;
  if (![1, 2, 3].includes(n)) return { ok: false, erro: "Pedido inválido." };
  const texto = transcricaoDe(conversa);
  if (texto === null) return { ok: false, erro: "Pedido inválido." };
  if (!dentroDoLimite(`conversando:${pode.usuario.id}`, 40, 60 * 60_000))
    return { ok: false, erro: "Muitas perguntas seguidas. Espere um pouco e tente de novo." };
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("config_publica");
  const modelo = modeloPara(data?.[0], "ler");
  const daPessoa = conversa
    .filter((f) => f.de === "pessoa")
    .map((f) => f.texto)
    .join(" ");
  const guardadas = await perguntasGuardadasDoTexto(daPessoa);
  return { ok: true, pergunta: await proximaPergunta(n, texto, modelo, guardadas) };
}

/** O currículo da conversa toda: os campos do formulário (e o resumo), para conferir. Gasta uma da cota da IA. */
export async function montarDaConversa(conversa: FalaDaConversa[]): Promise<LeituraDoArquivo> {
  const pode = await podeConversar();
  if (!pode.ok) return pode;
  const texto = transcricaoDe(conversa);
  if (!texto) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const cota = await modeloComCota(supabase);
  if (!cota.ok) return cota;
  try {
    const montado = await montarCurriculoDaConversa(texto, cota.modelo, new Date().toISOString().slice(0, 7));
    if (!montado || !camposLidos(montado))
      return {
        ok: false,
        erro: "Não entendemos o seu trabalho nessa conversa. Comece de novo e conte o trabalho que procura e onde já trabalhou.",
      };
    return { ok: true, curriculo: montado };
  } catch (e) {
    const erro = "Não deu para montar agora. Tente de novo ou preencha aqui embaixo.";
    await registrarFalha({ onde: "curriculo", etapa: "leitura", mensagem: erro, detalhe: `conversando · ${textoDoErro(e)}` });
    return { ok: false, erro };
  }
}
